import * as Fmt from './format';
import * as Ctx from './context';
import * as Meta from './metaModel';
import { isWhitespaceCharacter, isSpecialCharacter, isNumericalCharacter } from './common';

export interface Location {
  line: number;
  col: number;
}

export interface Range {
  start: Location;
  end: Location;
}

function fixRange(range: Range): Range {
  if (range.start.line > range.end.line || (range.start.line === range.end.line && range.start.col > range.end.col)) {
    return {
      start: range.end,
      end: range.start
    };
  } else {
    return range;
  }
}

export interface InputStream {
  readChar(): string;
  peekChar(): string;
  getLocation(): Location;
  fork(): InputStream;
}

export class StringInputStream implements InputStream {
  private pos: number;
  private endPos: number;

  line: number = 0;
  col: number = 0;

  constructor(private str: string) {
    this.pos = 0;
    this.endPos = str.length;
  }

  readChar(): string {
    if (this.pos < this.endPos) {
      let c = this.str.charAt(this.pos);
      this.pos += c.length;
      if (c === '\n') {
        this.line++;
        this.col = 0;
      } else {
        this.col += c.length;
      }
      return c;
    } else {
      return '';
    }
  }

  peekChar(): string {
    if (this.pos < this.endPos) {
      return this.str.charAt(this.pos);
    } else {
      return '';
    }
  }

  getLocation(): Location {
    return {
      line: this.line,
      col: this.col
    };
  }

  fork(): InputStream {
    let result = new StringInputStream(this.str);
    result.pos = this.pos;
    result.endPos = this.endPos;
    result.line = this.line;
    result.col = this.col;
    return result;
  }
}

export interface ErrorHandler {
  error(msg: string, range: Range): void;
  unfilledPlaceholder(range: Range): void;
  checkMarkdownCode: boolean;
}

export interface ObjectRangeInfo {
  object: Object;
  context?: Ctx.Context;
  metaDefinitions?: Fmt.MetaDefinitionFactory;
  range: Range;
  nameRange?: Range;
  linkRange?: Range;
  signatureRange?: Range;
  pathAlias?: Fmt.PathAlias;
}

export interface RangeHandler {
  reportRange(info: ObjectRangeInfo): void;
  reportConversion?(raw: Fmt.Expression, converted: Fmt.ObjectContents): void;
}

export class EmptyExpression extends Fmt.Expression {
  substitute(fn: Fmt.ExpressionSubstitutionFn, replacedParameters?: Fmt.ReplacedParameter[]): Fmt.Expression {
    return this;
  }

  protected matches(expression: Fmt.Expression, fn: Fmt.ExpressionUnificationFn, replacedParameters: Fmt.ReplacedParameter[]): boolean {
    return expression instanceof EmptyExpression;
  }
}

interface RawDocumentationComment {
  items: RawDocumentationItem[];
  range: Range;
}

interface RawDocumentationItem {
  kind?: string;
  parameterName?: string;
  text: string;
  range: Range;
  nameRange?: Range;
}

export class Reader {
  private markedStart?: Location;
  private markedEnd?: Location;
  private triedChars: string[] = [];
  private atError = false;
  private metaModel: Meta.MetaModel | undefined;
  private pathAliases = new Map<string, Fmt.PathAlias>();
  private lastDocumentationComment?: RawDocumentationComment;

  constructor(private stream: InputStream, private errorHandler: ErrorHandler, private getMetaModel: Meta.MetaModelGetter, private rangeHandler?: RangeHandler) {}

  readFile(): Fmt.File {
    let file = this.readPartialFile();
    if (this.peekChar()) {
      this.error('Definition or end of file expected');
    }
    return file;
  }

  readPartialFile(): Fmt.File {
    let fileStart = this.markStart();
    this.readChar('%');
    let metaModelPath = this.readPath(undefined);
    this.readChar('%');
    try {
      this.metaModel = this.getMetaModel(metaModelPath);
    } catch (error) {
      this.error(error.message, this.markEnd(fileStart));
      this.metaModel = new Meta.DummyMetaModel(metaModelPath.name);
    }
    try {
      let file = new Fmt.File(metaModelPath);
      let context = this.metaModel.getRootContext();
      this.readFileContents(file, this.metaModel.definitionTypes, context);
      this.markEnd(fileStart, file, context);
      return file;
    } finally {
      this.pathAliases.clear();
      this.metaModel = undefined;
    }
  }

  private readPathOrItem(context: Ctx.Context | undefined, readPathItem: boolean): Fmt.PathItem {
    let pathStart = this.markStart();
    let linkStart = pathStart;
    let parentPath: Fmt.PathItem | undefined = undefined;
    for (;;) {
      this.skipWhitespace(false);
      let itemStart = this.markStart();
      let identifier: string;
      let pathAlias: Fmt.PathAlias | undefined = undefined;
      if (!parentPath && this.tryReadChar('~')) {
        let aliasName = this.readIdentifier();
        pathAlias = this.pathAliases.get(aliasName);
        if (pathAlias) {
          let pathAliasPath = pathAlias.path;
          if (pathAliasPath instanceof Fmt.NamedPathItem) {
            if (this.tryReadChar('/')) {
              parentPath = pathAliasPath;
              continue;
            } else {
              parentPath = pathAliasPath.parentPath;
              identifier = pathAliasPath.name;
            }
          } else {
            parentPath = pathAliasPath;
            this.readChar('/');
            continue;
          }
        } else {
          this.error(`Path alias "${aliasName}" not found`, this.markEnd(linkStart));
          identifier = '';
        }
      } else if (this.tryReadChar('.')) {
        let item: Fmt.PathItem = this.tryReadChar('.') ? new Fmt.ParentPathItem(parentPath) : new Fmt.IdentityPathItem(parentPath);
        let itemRange = this.markEnd(itemStart);
        this.markEnd(pathStart, item, context, undefined, itemRange);
        parentPath = item;
        this.readChar('/');
        continue;
      } else {
        identifier = this.readIdentifier();
      }
      this.skipWhitespace(false);
      let continued = (this.peekChar() === '/');
      if (readPathItem || continued) {
        let item: Fmt.PathItem = new Fmt.NamedPathItem(identifier, parentPath);
        let itemRange = this.markEnd(itemStart);
        this.markEnd(pathStart, item, context, undefined, itemRange, undefined, undefined, pathAlias);
        if (readPathItem && !continued) {
          return item;
        }
        parentPath = item;
        this.readChar('/');
      } else {
        for (;;) {
          let nameRange = this.markEnd(itemStart);
          let linkRange = this.markEnd(linkStart);
          let path = new Fmt.Path(identifier, undefined, parentPath);
          if (context) {
            this.readOptionalArgumentList(path.arguments, context);
          }
          this.markEnd(pathStart, path, context, undefined, nameRange, linkRange, undefined, pathAlias);
          if (!this.tryReadChar('.')) {
            return path;
          }
          parentPath = path;
          this.skipWhitespace(false);
          itemStart = linkStart = this.markStart();
          identifier = this.readIdentifier();
        }
      }
    }
  }

  private readPath(context: Ctx.Context | undefined): Fmt.Path {
    return this.readPathOrItem(context, false) as Fmt.Path;
  }

  readFileContents(file: Fmt.File, metaDefinitions: Fmt.MetaDefinitionFactory, context: Ctx.Context): void {
    this.readPathAliases(context);
    this.readDefinitions(file.definitions, metaDefinitions, context);
  }

  readPathAliases(context: Ctx.Context): void {
    this.skipWhitespace(true, true);
    if (this.tryReadChar('[')) {
      this.skipWhitespace();
      let pathAlias = this.tryReadPathAlias(context);
      if (pathAlias) {
        this.pathAliases.set(pathAlias.name, pathAlias);
        while (this.tryReadChar(',')) {
          pathAlias = this.readPathAlias(context);
          this.pathAliases.set(pathAlias.name, pathAlias);
          this.skipWhitespace();
        }
      }
      this.readChar(']');
    }
  }

  tryReadPathAlias(context: Ctx.Context): Fmt.PathAlias | undefined {
    let aliasStart = this.markStart();
    if (!this.tryReadChar('$')) {
      return undefined;
    }
    this.readChar('~');
    let nameStart = this.markStart();
    let name = this.readIdentifier();
    let nameRange = this.markEnd(nameStart);
    this.readChar('=');
    this.readChar('$');
    let path = this.readPathOrItem(context, true);
    let pathAlias = new Fmt.PathAlias(name, path);
    this.markEnd(aliasStart, pathAlias, context, undefined, nameRange);
    return pathAlias;
  }

  readPathAlias(context: Ctx.Context): Fmt.PathAlias {
    this.skipWhitespace();
    return this.tryReadPathAlias(context) || this.error('Path alias expected') || new Fmt.PathAlias('', new Fmt.IdentityPathItem);
  }

  readDefinitions(definitions: Fmt.Definition[], metaDefinitions: Fmt.MetaDefinitionFactory, context: Ctx.Context): void {
    let definitionsStart = this.markStart();
    for (;;) {
      this.skipWhitespace(true, true);
      let definition = this.tryReadDefinition(metaDefinitions, context);
      if (definition) {
        definitions.push(definition);
      } else {
        break;
      }
    }
    this.markEnd(definitionsStart, definitions, context, metaDefinitions);
  }

  tryReadDefinition(metaDefinitions: Fmt.MetaDefinitionFactory, context: Ctx.Context): Fmt.Definition | undefined {
    let documentationComment = this.lastDocumentationComment;
    let definitionStart = this.markStart();
    if (!this.tryReadChar('$')) {
      return undefined;
    }
    let nameStart = this.markStart();
    let name = this.readIdentifier();
    let nameRange = this.markEnd(nameStart);
    let definition = new Fmt.Definition(name, new EmptyExpression, new Fmt.ParameterList);
    context = new Ctx.ParentInfoContext(definition, context);
    this.readOptionalParameterList(definition.parameters, context);
    let typeContext = context.metaModel.getDefinitionTypeContext(definition, context);
    definition.type = this.readType(metaDefinitions, typeContext);
    let signatureRange = this.markEnd(definitionStart);
    if (documentationComment) {
      let documentationItems = documentationComment.items.map((item) => {
        let itemParameter: Fmt.Parameter | undefined = undefined;
        if (item.parameterName) {
          try {
            itemParameter = definition.parameters.getParameter(item.parameterName);
          } catch (error) {
            this.error(error.message, item.nameRange);
          }
        }
        let result = new Fmt.DocumentationItem(item.kind, itemParameter, item.text);
        this.rangeHandler?.reportRange({
          object: result,
          context: context,
          metaDefinitions: metaDefinitions,
          range: item.range,
          nameRange: item.nameRange,
          linkRange: item.nameRange
        });
        return result;
      });
      definition.documentation = new Fmt.DocumentationComment(documentationItems);
      this.rangeHandler?.reportRange({
        object: definition.documentation,
        context: context,
        metaDefinitions: metaDefinitions,
        range: documentationComment.range
      });
    }
    this.readChar('{');
    let metaInnerDefinitionTypes: Fmt.MetaDefinitionFactory | undefined = undefined;
    let contents: Fmt.ObjectContents | undefined;
    let type = definition.type;
    if (type instanceof Fmt.MetaRefExpression) {
      metaInnerDefinitionTypes = type.getMetaInnerDefinitionTypes();
      contents = type.createDefinitionContents();
    } else {
      contents = new Fmt.GenericObjectContents;
    }
    let contentsContext = context.metaModel.getDefinitionContentsContext(definition, context);
    if (metaInnerDefinitionTypes) {
      this.readDefinitions(definition.innerDefinitions, metaInnerDefinitionTypes, contentsContext);
    }
    if (contents) {
      let args = new Fmt.ArgumentList;
      let argumentsStart = this.markStart();
      this.readArguments(args, contentsContext);
      try {
        let reportFn = this.rangeHandler?.reportConversion?.bind(this.rangeHandler);
        contents.fromArgumentList(args, reportFn);
      } catch (error) {
        this.error(error.message, this.markEnd(argumentsStart));
      }
      definition.contents = contents;
    }
    this.readChar('}');
    this.markEnd(definitionStart, definition, context, metaDefinitions, nameRange, undefined, signatureRange);
    return definition;
  }

  tryReadParameterList(parameters: Fmt.ParameterList, context: Ctx.Context): boolean {
    let result = false;
    let parameterListStart = this.markStart();
    if (this.tryReadChar('(')) {
      this.readParameters(parameters, context);
      this.readChar(')');
      result = true;
    }
    this.markEnd(parameterListStart, parameters, context);
    return result;
  }

  readParameterList(parameters: Fmt.ParameterList, context: Ctx.Context): void {
    this.skipWhitespace();
    if (!this.tryReadParameterList(parameters, context)) {
      this.error('Parameter list expected');
    }
  }

  readOptionalParameterList(parameters: Fmt.ParameterList, context: Ctx.Context): void {
    this.skipWhitespace();
    this.tryReadParameterList(parameters, context);
  }

  readParameters(parameters: Fmt.ParameterList, context: Ctx.Context): void {
    this.skipWhitespace();
    let group = this.tryReadParameterGroup(context);
    if (group) {
      parameters.push(...group);
      this.skipWhitespace();
      while (this.tryReadChar(',')) {
        for (let parameter of group) {
          context = context.metaModel.getNextParameterContext(parameter, context);
        }
        group = this.readParameterGroup(context);
        parameters.push(...group);
        this.skipWhitespace();
      }
    }
  }

  tryReadParameterGroup(context: Ctx.Context): Fmt.Parameter[] | undefined {
    let group: Fmt.Parameter[] = [];
    let groupStart = this.markStart();
    let nameStart = groupStart;
    let name = this.tryReadIdentifier();
    if (!name) {
      return undefined;
    }
    let nameRanges: Range[] = [this.markEnd(nameStart)];
    for (;;) {
      let parameter = new Fmt.Parameter(name, new EmptyExpression);
      this.skipWhitespace();
      if (this.tryReadChar('[')) {
        parameter.dependencies = this.readExpressions(context);
        this.readChar(']');
        this.skipWhitespace();
      }
      if ((parameter.list = this.tryReadChar('.'))) {
        this.readChar('.');
        this.readChar('.');
        this.skipWhitespace();
      }
      parameter.optional = this.tryReadChar('?');
      group.push(parameter);
      this.skipWhitespace();
      if (!this.tryReadChar(',')) {
        break;
      }
      this.skipWhitespace();
      nameStart = this.markStart();
      name = this.readIdentifier();
      nameRanges.push(this.markEnd(nameStart));
    }
    let typeContext = context.metaModel.getParameterTypeContext(group[0], context);
    let type = this.readType(typeContext.metaModel.expressionTypes, typeContext);
    for (let parameter of group) {
      parameter.type = type;
    }
    this.skipWhitespace();
    if (this.tryReadChar('=')) {
      let defaultValue = this.readExpression(false, context.metaModel.functions, context);
      for (let parameter of group) {
        parameter.defaultValue = defaultValue;
      }
    }
    for (let index = 0; index < group.length; index++) {
      this.markEnd(groupStart, group[index], context, undefined, nameRanges[index]);
    }
    return group;
  }

  readParameterGroup(context: Ctx.Context): Fmt.Parameter[] {
    this.skipWhitespace();
    return this.tryReadParameterGroup(context) || this.error('Parameter expected') || [];
  }

  tryReadArgumentList(args: Fmt.ArgumentList, context: Ctx.Context): boolean {
    let result = false;
    let argumentListStart = this.markStart();
    if (this.tryReadChar('(')) {
      this.readArguments(args, context);
      this.readChar(')');
      result = true;
    }
    this.markEnd(argumentListStart, args, context);
    return result;
  }

  readOptionalArgumentList(args: Fmt.ArgumentList, context: Ctx.Context): void {
    this.skipWhitespace();
    this.tryReadArgumentList(args, context);
  }

  readArguments(args: Fmt.ArgumentList, context: Ctx.Context): void {
    this.skipWhitespace();
    let argIndex = 0;
    let arg = this.tryReadArgument(argIndex, args, context);
    if (arg) {
      args.push(arg);
      this.skipWhitespace();
      while (this.tryReadChar(',')) {
        context = context.metaModel.getNextArgumentContext(arg, argIndex, context);
        argIndex++;
        arg = this.readArgument(argIndex, args, context);
        args.push(arg);
        this.skipWhitespace();
      }
    }
  }

  tryReadArgument(argIndex: number, previousArgs: Fmt.ArgumentList, context: Ctx.Context): Fmt.Argument | undefined {
    let argStart = this.markStart();
    let arg = new Fmt.Argument(undefined, new EmptyExpression);
    let nameRange: Range | undefined = undefined;
    let identifier = this.tryReadIdentifier();
    if (identifier) {
      let identifierRange = this.markEnd(argStart);
      this.skipWhitespace();
      if (this.tryReadChar('=')) {
        arg.name = identifier;
        nameRange = identifierRange;
        let valueContext = context.metaModel.getArgumentValueContext(arg, argIndex, previousArgs, context);
        arg.value = this.readExpression(false, valueContext.metaModel.functions, valueContext);
      } else {
        let valueContext = context.metaModel.getArgumentValueContext(arg, argIndex, previousArgs, context);
        let [expression, indexParameterLists] = this.readExpressionAfterIdentifier(identifier, identifierRange, valueContext);
        this.markEnd(argStart, expression, valueContext, valueContext.metaModel.functions, identifierRange);
        expression = this.readExpressionIndices(expression, indexParameterLists, argStart, valueContext);
        arg.value = expression;
      }
    } else {
      let valueContext = context.metaModel.getArgumentValueContext(arg, argIndex, previousArgs, context);
      let value = this.tryReadExpression(false, valueContext.metaModel.functions, valueContext);
      if (!value) {
        return undefined;
      }
      arg.value = value;
    }
    this.markEnd(argStart, arg, context, undefined, nameRange);
    return arg;
  }

  readArgument(argIndex: number, previousArguments: Fmt.ArgumentList, context: Ctx.Context): Fmt.Argument {
    this.skipWhitespace();
    return this.tryReadArgument(argIndex, previousArguments, context) || this.error('Argument expected') || new Fmt.Argument(undefined, new EmptyExpression);
  }

  readType(metaDefinitions: Fmt.MetaDefinitionFactory, context: Ctx.Context): Fmt.Expression {
    this.readChar(':');
    return this.readExpression(true, metaDefinitions, context);
  }

  readExpressions(context: Ctx.Context): Fmt.Expression[] {
    let expressions: Fmt.Expression[] = [];
    this.skipWhitespace();
    let expression = this.tryReadExpression(false, context.metaModel.functions, context);
    if (expression) {
      expressions.push(expression);
      this.skipWhitespace();
      while (this.tryReadChar(',')) {
        expressions.push(this.readExpression(false, context.metaModel.functions, context));
        this.skipWhitespace();
      }
    }
    return expressions;
  }

  tryReadExpression(isType: boolean, metaDefinitions: Fmt.MetaDefinitionFactory, context: Ctx.Context): Fmt.Expression | undefined {
    let expressionStart = this.markStart();
    let expression: Fmt.Expression | undefined = undefined;
    let indexParameterLists: Fmt.ParameterList[] | undefined = undefined;
    let nameRange: Range | undefined = undefined;
    if (this.tryReadChar('%')) {
      let nameStart = this.markStart();
      let name = this.readIdentifier();
      nameRange = this.markEnd(nameStart);
      if (metaDefinitions && name) {
        try {
          expression = metaDefinitions.createMetaRefExpression(name);
        } catch (error) {
          this.error(error.message, this.markEnd(expressionStart));
        }
      }
      if (!expression) {
        expression = new Fmt.GenericMetaRefExpression(name, new Fmt.ArgumentList);
      }
      let argumentsContext = new Ctx.ParentInfoContext(expression, context);
      let args = new Fmt.ArgumentList;
      this.readOptionalArgumentList(args, argumentsContext);
      try {
        let reportFn = this.rangeHandler?.reportConversion?.bind(this.rangeHandler);
        (expression as Fmt.MetaRefExpression).fromArgumentList(args, reportFn);
      } catch (error) {
        this.error(error.message, this.markEnd(expressionStart));
      }
    } else if (metaDefinitions && !metaDefinitions.allowArbitraryReferences()) {
      // Other expressions not allowed in this case.
    } else if (this.tryReadChar('$')) {
      let definitionRefExpression = new Fmt.DefinitionRefExpression(new Fmt.Path(''));
      let pathContext = new Ctx.ParentInfoContext(definitionRefExpression, context);
      definitionRefExpression.path = this.readPath(pathContext);
      expression = definitionRefExpression;
    } else {
      let identifier = this.tryReadIdentifier();
      if (identifier) {
        nameRange = this.markEnd(expressionStart);
        [expression, indexParameterLists] = this.readExpressionAfterIdentifier(identifier, nameRange, context);
      } else if (isType) {
        // Other expressions not allowed in this case.
      } else if (this.tryReadChar('{')) {
        let compoundExpression = new Fmt.CompoundExpression(new Fmt.ArgumentList);
        let argumentsContext = new Ctx.ParentInfoContext(compoundExpression, context);
        this.readArguments(compoundExpression.arguments, argumentsContext);
        this.readChar('}');
        expression = compoundExpression;
      } else if (this.tryReadChar('#')) {
        let parameterExpression = new Fmt.ParameterExpression(new Fmt.ParameterList);
        let parametersContext = new Ctx.ParentInfoContext(parameterExpression, context);
        this.readParameterList(parameterExpression.parameters, parametersContext);
        expression = parameterExpression;
      } else if (this.tryReadChar('[')) {
        let items = this.readExpressions(context);
        this.readChar(']');
        expression = new Fmt.ArrayExpression(items);
      } else if (this.tryReadChar('?')) {
        let range = this.markEnd(expressionStart);
        let errorRange = this.getErrorRange(range);
        this.errorHandler.unfilledPlaceholder(errorRange);
        expression = new Fmt.PlaceholderExpression(undefined);
      } else {
        let str = this.tryReadString('\'');
        if (str !== undefined) {
          expression = new Fmt.StringExpression(str);
        } else {
          let num = this.tryReadInteger();
          if (num !== undefined) {
            expression = new Fmt.IntegerExpression(num);
          }
        }
      }
    }
    if (expression) {
      this.markEnd(expressionStart, expression, context, metaDefinitions, nameRange, nameRange);
      expression = this.readExpressionIndices(expression, indexParameterLists, expressionStart, context);
    }
    return expression;
  }

  private readExpressionAfterIdentifier(identifier: string, identifierRange: Range, context: Ctx.Context): [Fmt.Expression, Fmt.ParameterList[] | undefined] {
    try {
      let variableInfo = context.getVariable(identifier);
      let expression = new Fmt.VariableRefExpression(variableInfo.parameter);
      return [expression, variableInfo.indexParameterLists];
    } catch (error) {
      this.error(error.message, identifierRange);
      return [new EmptyExpression, undefined];
    }
  }

  private readExpressionIndices(expression: Fmt.Expression, indexParameterLists: Fmt.ParameterList[] | undefined, expressionStart: Location, context: Ctx.Context): Fmt.Expression {
    this.skipWhitespace();
    let indexIndex = 0;
    while (this.tryReadChar('[')) {
      let index: Fmt.Index = {
        arguments: new Fmt.ArgumentList
      };
      if (indexParameterLists && indexIndex < indexParameterLists.length) {
        index.parameters = indexParameterLists[indexIndex];
      }
      this.readArguments(index.arguments!, context);
      this.readChar(']');
      expression = new Fmt.IndexedExpression(expression, index);
      this.markEnd(expressionStart, expression, context);
      indexIndex++;
    }
    if (indexParameterLists) {
      for (; indexIndex < indexParameterLists.length; indexIndex++) {
        let index: Fmt.Index = {
          parameters: indexParameterLists[indexIndex]
        };
        expression = new Fmt.IndexedExpression(expression, index);
      }
    }
    return expression;
  }

  readExpression(isType: boolean, metaDefinitions: Fmt.MetaDefinitionFactory, context: Ctx.Context): Fmt.Expression {
    this.skipWhitespace();
    let expression = this.tryReadExpression(isType, metaDefinitions, context);
    if (!expression) {
      this.error('Expression expected');
      expression = new EmptyExpression;
      this.markEnd(this.markStart(), expression, context, metaDefinitions);
    }
    return expression;
  }

  tryReadString(quoteChar: string): string | undefined {
    let stringStart = this.markStart();
    if (!this.tryReadChar(quoteChar)) {
      return undefined;
    }
    let str = '';
    do {
      for (;;) {
        let c = this.readAnyChar();
        if (!c) {
          this.error('Unterminated string', this.markEnd(stringStart));
          break;
        } else if (c === quoteChar) {
          break;
        } else if (c === '\\') {
          c = this.peekChar();
          let escapedCharacter = this.getEscapedCharacter(c);
          if (escapedCharacter) {
            str += escapedCharacter;
          } else {
            this.error('Unknown escape sequence');
          }
          this.readAnyChar();
        } else {
          str += c;
        }
      }
      this.skipWhitespace(false);
    } while (this.tryReadChar(quoteChar));
    return str;
  }

  tryReadInteger(): Fmt.BN | undefined {
    let c = this.peekChar();
    if (isNumericalCharacter(c) || c === '+' || c === '-') {
      let numStr = '';
      do {
        numStr += this.readAnyChar();
        c = this.peekChar();
      } while (isNumericalCharacter(c));
      let num = new Fmt.BN(numStr, 10);
      return num;
    } else {
      return undefined;
    }
  }

  tryReadIdentifier(): string | undefined {
    let c = this.peekChar();
    if (c === '"') {
      return this.tryReadString('"');
    } else if (isSpecialCharacter(c) || isNumericalCharacter(c)) {
      if (this.triedChars.indexOf('') < 0) {
        this.triedChars.push('');
      }
      return undefined;
    } else {
      let identifier = '';
      do {
        identifier += this.readAnyChar();
        c = this.peekChar();
      } while (c && !isSpecialCharacter(c));
      return identifier;
    }
  }

  readIdentifier(): string {
    return this.tryReadIdentifier() || this.error('Identifier expected') || '';
  }

  private skipWhitespace(allowComments: boolean = true, handleDocumentationComment: boolean = false): void {
    let c = this.stream.peekChar();
    if (isWhitespaceCharacter(c) || (allowComments && c === '/')) {
      this.markedEnd = this.stream.getLocation();
      do {
        if (allowComments && c === '/') {
          let commentStart = this.stream.getLocation();
          this.stream.readChar();
          c = this.stream.peekChar();
          switch (c) {
          case '/':
            this.stream.readChar();
            do {
              c = this.stream.readChar();
            } while (c && c !== '\r' && c !== '\n');
            break;
          case '*':
            this.stream.readChar();
            {
              let documentationItems: RawDocumentationItem[] | undefined = undefined;
              c = this.stream.peekChar();
              if (handleDocumentationComment && c === '*') {
                this.stream.readChar();
                documentationItems = [];
              }
              let atLineStart = false;
              let afterAsterisk = true;
              let atCommentLineStart = true;
              let inKind = false;
              let atNameStart = false;
              let inUnescapedName = false;
              let inEscapedName = false;
              let inEscapeSequence = false;
              let inMarkdownCode = '';
              let atMarkdownStart = false;
              let kind: string | undefined = undefined;
              let name: string | undefined = undefined;
              let text = '';
              let textStartCol = 0;
              let commentLineStart: Location | undefined = undefined;
              let itemStart: Location | undefined = undefined;
              let itemEnd: Location | undefined = undefined;
              let nameStart: Location | undefined = undefined;
              let nameEnd: Location | undefined = undefined;
              for (;;) {
                if (atLineStart || afterAsterisk) {
                  commentLineStart = this.stream.getLocation();
                }
                c = this.stream.readChar();
                if (!c) {
                  this.markedEnd = undefined;
                  this.error('Unterminated comment', this.markEnd(commentStart));
                  break;
                } else if (c === '*') {
                  if (this.stream.peekChar() === '/') {
                    this.stream.readChar();
                    break;
                  }
                  if (atLineStart) {
                    atLineStart = false;
                    afterAsterisk = true;
                    c = '';
                  } else {
                    afterAsterisk = false;
                  }
                } else if (c === '\r' || c === '\n') {
                  atLineStart = true;
                  afterAsterisk = false;
                } else if (isWhitespaceCharacter(c) && (atLineStart || afterAsterisk)) {
                  c = '';
                  afterAsterisk = false;
                } else {
                  atLineStart = false;
                  afterAsterisk = false;
                }
                if (documentationItems && c) {
                  if (c !== '`') {
                    atMarkdownStart = false;
                  }
                  if (c === '\r' || c === '\n') {
                    if (text) {
                      text += c;
                    }
                    atCommentLineStart = true;
                    inKind = false;
                    atNameStart = false;
                    inUnescapedName = false;
                    inEscapedName = false;
                    inEscapeSequence = false;
                  } else if (atCommentLineStart && c === '@') {
                    text = text.trimRight();
                    if (kind || text) {
                      if (!itemStart) {
                        itemStart = this.stream.getLocation();
                      }
                      if (!itemEnd) {
                        itemEnd = this.stream.getLocation();
                      }
                      documentationItems.push({
                        kind: kind,
                        parameterName: name,
                        text: text,
                        range: {
                          start: itemStart,
                          end: itemEnd
                        },
                        nameRange: nameStart && nameEnd ? {
                          start: nameStart,
                          end: nameEnd
                        } : undefined
                      });
                    }
                    kind = '';
                    name = undefined;
                    text = '';
                    atCommentLineStart = false;
                    inKind = true;
                    textStartCol = 0;
                    itemStart = commentLineStart;
                    itemEnd = undefined;
                    nameStart = undefined;
                    nameEnd = undefined;
                  } else if (inKind) {
                    if (isWhitespaceCharacter(c)) {
                      inKind = false;
                      if (kind === 'param') {
                        atNameStart = true;
                        nameStart = this.stream.getLocation();
                      }
                    } else {
                      kind += c;
                    }
                  } else if (atNameStart) {
                    if (isWhitespaceCharacter(c)) {
                      nameStart = this.stream.getLocation();
                    } else if (c === '"') {
                      name = '';
                      atNameStart = false;
                      inEscapedName = true;
                    } else {
                      atNameStart = false;
                      inUnescapedName = true;
                      name = c;
                      nameEnd = this.stream.getLocation();
                    }
                  } else if (inUnescapedName) {
                    if (isWhitespaceCharacter(c)) {
                      inUnescapedName = false;
                    } else {
                      name += c;
                      nameEnd = this.stream.getLocation();
                    }
                  } else if (inEscapedName) {
                    if (inEscapeSequence) {
                      let escapedCharacter = this.getEscapedCharacter(c);
                      if (escapedCharacter) {
                        name += escapedCharacter;
                      }
                      inEscapeSequence = false;
                    } else if (c === '\\') {
                      inEscapeSequence = true;
                    } else if (c === '"') {
                      inEscapedName = false;
                      nameEnd = this.stream.getLocation();
                    } else {
                      name += c;
                      itemEnd = this.stream.getLocation();
                    }
                  } else {
                    if (!text) {
                      textStartCol = this.stream.getLocation().col;
                    } else if (this.stream.getLocation().col >= textStartCol) {
                      atCommentLineStart = false;
                    }
                    if ((!text || atCommentLineStart) && isWhitespaceCharacter(c)) {
                      if (atCommentLineStart) {
                        commentLineStart = this.stream.getLocation();
                      }
                    } else {
                      text += c;
                      if (!itemStart) {
                        itemStart = commentLineStart;
                      }
                      itemEnd = this.stream.getLocation();
                      if (c === '`') {
                        if (inMarkdownCode) {
                          if (atMarkdownStart) {
                            inMarkdownCode += c;
                          } else if (text.endsWith(inMarkdownCode)) {
                            inMarkdownCode = '';
                          }
                        } else {
                          inMarkdownCode = c;
                          atMarkdownStart = true;
                        }
                        if (atMarkdownStart && this.errorHandler.checkMarkdownCode && this.stream.peekChar() !== '`') {
                          let origStream = this.stream;
                          this.stream = this.stream.fork();
                          try {
                            let dummyContext = new Ctx.DummyContext(this.metaModel!);
                            this.readExpression(false, this.metaModel!.functions, dummyContext);
                            this.skipWhitespace(false);
                            for (let endChar of inMarkdownCode) {
                              this.readChar(endChar);
                            }
                          } finally {
                            this.stream = origStream;
                          }
                        }
                      }
                    }
                  }
                }
              }
              if (documentationItems) {
                text = text.trimRight();
                if (kind || text) {
                  if (!itemStart) {
                    itemStart = this.stream.getLocation();
                  }
                  if (!itemEnd) {
                    itemEnd = this.stream.getLocation();
                  }
                  documentationItems.push({
                    kind: kind,
                    parameterName: name,
                    text: text,
                    range: {
                      start: itemStart,
                      end: itemEnd
                    },
                    nameRange: nameStart && nameEnd ? {
                      start: nameStart,
                      end: nameEnd
                    } : undefined
                  });
                }
                this.lastDocumentationComment = {
                  items: documentationItems,
                  range: {
                    start: commentStart,
                    end: this.stream.getLocation()
                  }
                };
              }
            }
            break;
          default:
            this.error(`'/' or '*' expected`);
          }
        } else {
          this.stream.readChar();
        }
        c = this.stream.peekChar();
      } while (isWhitespaceCharacter(c) || (allowComments && c === '/'));
      if (this.markedStart) {
        Object.assign(this.markedStart, this.stream.getLocation());
      }
    }
  }

  private tryReadChar(c: string): boolean {
    if (this.peekChar() === c) {
      this.readAnyChar();
      return true;
    } else {
      this.triedChars.push(c);
      return false;
    }
  }

  private readChar(c: string): void {
    this.markedStart = undefined;
    this.markedEnd = undefined;
    this.lastDocumentationComment = undefined;
    this.skipWhitespace(c !== '/');
    if (!this.tryReadChar(c)) {
      let expected = this.triedChars.map((tried: string, index: number) => (tried ? `'${tried}'` : index ? 'identifier' : 'Identifier'));
      this.error(`${expected.join(' or ')} expected`);
    }
  }

  private peekChar(): string {
    return this.stream.peekChar();
  }

  private readAnyChar(): string {
    this.markedStart = undefined;
    this.markedEnd = undefined;
    this.triedChars.length = 0;
    this.atError = false;
    this.lastDocumentationComment = undefined;
    return this.stream.readChar();
  }

  private getEscapedCharacter(escapeCharacter: string): string | undefined {
    switch (escapeCharacter) {
    case '\\':
    case '"':
    case '\'':
      return escapeCharacter;
    case 't':
      return '\t';
    case 'r':
      return '\r';
    case 'n':
      return '\n';
    default:
      return undefined;
    }
  }

  private markStart(): Location {
    if (!this.markedStart) {
      this.markedStart = this.stream.getLocation();
    }
    return this.markedStart;
  }

  private markEnd(start: Location, object?: Object, context?: Ctx.Context, metaDefinitions?: Fmt.MetaDefinitionFactory, nameRange?: Range, linkRange?: Range, signatureRange?: Range, pathAlias?: Fmt.PathAlias): Range {
    if (!this.markedEnd) {
      this.markedEnd = this.stream.getLocation();
    }
    let range = fixRange({
      start: start,
      end: this.markedEnd
    });
    if (object !== undefined && this.rangeHandler) {
      if (nameRange) {
        nameRange = fixRange(nameRange);
      }
      if (linkRange) {
        linkRange = fixRange(linkRange);
      }
      if (signatureRange) {
        signatureRange = fixRange(signatureRange);
      }
      this.rangeHandler.reportRange({
        object: object,
        context: context,
        metaDefinitions: metaDefinitions,
        range: range,
        nameRange: nameRange,
        linkRange: linkRange,
        signatureRange: signatureRange,
        pathAlias: pathAlias
      });
    }
    return range;
  }

  private getErrorRange(range?: Range): Range {
    if (range) {
      return fixRange(range);
    } else {
      let start = this.stream.getLocation();
      let end = start;
      let c = this.peekChar();
      if (c && c !== '\r' && c !== '\n') {
        end = {
          line: end.line,
          col: end.col + 1
        };
      }
      return {
        start: start,
        end: end
      };
    }
  }

  private error(msg: string, range?: Range): void {
    if (!this.atError) {
      let errorRange = this.getErrorRange(range);
      this.errorHandler.error(msg, errorRange);
      this.atError = true;
    }
  }
}


export class DefaultErrorHandler implements ErrorHandler {
  constructor(private fileName?: string, public checkMarkdownCode: boolean = false, private allowPlaceholders: boolean = false) {}

  error(msg: string, range: Range): void {
    let line = range.start.line + 1;
    let col = range.start.col + 1;
    msg = `${line}:${col}: ${msg}`;
    if (this.fileName) {
      msg = `${this.fileName}:${msg}`;
    }
    let error: any = new SyntaxError(msg);
    error.fileName = this.fileName;
    error.lineNumber = line;
    error.columnNumber = col;
    throw error;
  }

  unfilledPlaceholder(range: Range): void {
    if (!this.allowPlaceholders) {
      this.error('Unfilled placeholder', range);
    }
  }
}

export function readStream(stream: InputStream, errorHandler: ErrorHandler, getMetaModel: Meta.MetaModelGetter, rangeHandler?: RangeHandler): Fmt.File {
  let reader = new Reader(stream, errorHandler, getMetaModel, rangeHandler);
  return reader.readFile();
}

export function readString(str: string, fileName: string, getMetaModel: Meta.MetaModelGetter, rangeHandler?: RangeHandler): Fmt.File {
  let stream = new StringInputStream(str);
  let errorHandler = new DefaultErrorHandler(fileName);
  return readStream(stream, errorHandler, getMetaModel, rangeHandler);
}
