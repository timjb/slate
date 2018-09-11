import * as Fmt from './format';
import { isWhitespaceCharacter, isSpecialCharacter, isNumericalCharacter } from './common';

export interface Location {
  line: number;
  col: number;
}

export interface Range {
  start: Location;
  end: Location;
}

export interface InputStream {
  readChar(): string;
  peekChar(): string;
  getLocation(): Location;
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
}

type ErrorHandler = (msg: string, range: Range) => void;

export class Reader {
  private markedStart?: Location;
  private markedEnd?: Location;
  private triedChars: string[] = [];
  private atError = false;

  constructor(private stream: InputStream, private reportError: ErrorHandler, private getMetaModel: Fmt.MetaModelGetter) {}

  readFile(): Fmt.File {
    let file = new Fmt.File;
    let metaModelStart = this.markStart();
    this.readChar('%');
    file.metaModelPath = this.readPath(undefined);
    this.readChar('%');
    let metaModelRange = this.markEnd(metaModelStart);
    let metaModel: Fmt.MetaModel | undefined;
    try {
      metaModel = this.getMetaModel(file.metaModelPath);
    } catch (error) {
      this.error(error.message, metaModelRange);
      metaModel = new Fmt.DummyMetaModel;
    }
    let context = metaModel.getRootContext();
    this.readDefinitions(file.definitions, metaModel.definitionTypes, context);
    if (this.peekChar()) {
      this.error('Definition or end of file expected');
    }
    return file;
  }

  readPath(context: Fmt.Context | undefined): Fmt.Path {
    let path: Fmt.PathItem | undefined = undefined;
    for (;;) {
      this.skipWhitespace();
      if (this.tryReadChar('.')) {
        let item = this.tryReadChar('.') ? new Fmt.ParentPathItem : new Fmt.IdentityPathItem;
        item.parentPath = path;
        path = item;
        this.readChar('/');
      } else {
        this.skipWhitespace();
        let identifier = this.readIdentifier();
        this.skipWhitespace();
        if (this.tryReadChar('/')) {
          let item = new Fmt.NamedPathItem;
          item.name = identifier;
          item.parentPath = path;
          path = item;
        } else {
          for (;;) {
            let item = new Fmt.Path;
            item.name = identifier;
            if (context) {
              this.readOptionalArgumentList(item.arguments, context);
            }
            item.parentPath = path;
            if (!this.tryReadChar('.')) {
              return item;
            }
            path = item;
            this.skipWhitespace();
            identifier = this.readIdentifier();
          }
        }
      }
    }
  }

  readDefinitions(definitions: Fmt.Definition[], metaDefinitions: Fmt.MetaDefinitionFactory, context: Fmt.Context): void {
    for (;;) {
      this.skipWhitespace();
      let definition = this.tryReadDefinition(metaDefinitions, context);
      if (definition) {
        definitions.push(definition);
      } else {
        break;
      }
    }
  }

  tryReadDefinition(metaDefinitions: Fmt.MetaDefinitionFactory, context: Fmt.Context): Fmt.Definition | undefined {
    if (!this.tryReadChar('$')) {
      return undefined;
    }
    let definition = new Fmt.Definition;
    definition.name = this.readIdentifier();
    context = new Fmt.ParentInfoContext(definition, context);
    this.readOptionalParameterList(definition.parameters, context);
    let typeContext = context.metaModel.getDefinitionTypeContext(definition, context);
    definition.type = this.readType(metaDefinitions, typeContext);
    this.readChar('{');
    let metaInnerDefinitionTypes: Fmt.MetaDefinitionFactory | undefined = undefined;
    let contents: Fmt.ObjectContents | undefined;
    let type = definition.type.expression;
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
      let args: Fmt.ArgumentList = Object.create(Fmt.ArgumentList.prototype);
      let argumentsStart = this.markStart();
      this.readArguments(args, contentsContext);
      try {
        contents.fromArgumentList(args);
      } catch (error) {
        this.error(error.message, this.markEnd(argumentsStart));
      }
      definition.contents = contents;
    }
    this.readChar('}');
    return definition;
  }

  tryReadParameterList(parameters: Fmt.ParameterList, context: Fmt.Context): boolean {
    if (!this.tryReadChar('(')) {
      return false;
    }
    this.readParameters(parameters, context);
    this.readChar(')');
    return true;
  }

  readParameterList(parameters: Fmt.ParameterList, context: Fmt.Context): void {
    this.skipWhitespace();
    if (!this.tryReadParameterList(parameters, context)) {
      this.error('Parameter list expected');
    }
  }

  readOptionalParameterList(parameters: Fmt.ParameterList, context: Fmt.Context): void {
    this.skipWhitespace();
    this.tryReadParameterList(parameters, context);
  }

  readParameters(parameters: Fmt.ParameterList, context: Fmt.Context): void {
    this.skipWhitespace();
    let parameter = this.tryReadParameter(context);
    if (parameter) {
      parameters.push(parameter);
      this.skipWhitespace();
      while (this.tryReadChar(',')) {
        context = context.metaModel.getNextParameterContext(parameter, context);
        parameter = this.readParameter(context);
        parameters.push(parameter);
        this.skipWhitespace();
      }
    }
  }

  tryReadParameter(context: Fmt.Context): Fmt.Parameter | undefined {
    let parameter = new Fmt.Parameter;
    let name = this.tryReadIdentifier();
    if (!name) {
      return undefined;
    }
    parameter.name = name;
    this.skipWhitespace();
    if (this.tryReadChar('[')) {
      parameter.dependencies = this.readExpressions(context);
      this.readChar(']');
      this.skipWhitespace();
    }
    if (parameter.list = this.tryReadChar('.')) {
      this.readChar('.');
      this.readChar('.');
      this.skipWhitespace();
    }
    parameter.optional = this.tryReadChar('?');
    let typeContext = context.metaModel.getParameterTypeContext(parameter, context);
    parameter.type = this.readType(typeContext.metaModel.expressionTypes, typeContext);
    this.skipWhitespace();
    if (this.tryReadChar('=')) {
      parameter.defaultValue = this.readExpression(false, context.metaModel.functions, context);
    }
    return parameter;
  }

  readParameter(context: Fmt.Context): Fmt.Parameter {
    this.skipWhitespace();
    return this.tryReadParameter(context) || this.error('Parameter expected') || new Fmt.Parameter;
  }

  tryReadArgumentList(args: Fmt.ArgumentList, context: Fmt.Context): boolean {
    if (!this.tryReadChar('(')) {
      return false;
    }
    this.readArguments(args, context);
    this.readChar(')');
    return true;
  }

  readOptionalArgumentList(args: Fmt.ArgumentList, context: Fmt.Context): void {
    this.skipWhitespace();
    this.tryReadArgumentList(args, context);
  }

  readArguments(args: Fmt.ArgumentList, context: Fmt.Context): void {
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

  tryReadArgument(argIndex: number, previousArgs: Fmt.ArgumentList, context: Fmt.Context): Fmt.Argument | undefined {
    let arg = new Fmt.Argument;
    let identifierStart = this.markStart();
    let identifier = this.tryReadIdentifier();
    if (identifier) {
      let identifierRange = this.markEnd(identifierStart);
      this.skipWhitespace();
      if (this.tryReadChar('=')) {
        arg.name = identifier;
        let valueContext = context.metaModel.getArgumentValueContext(arg, argIndex, previousArgs, context);
        arg.value = this.readExpression(false, valueContext.metaModel.functions, valueContext);
      } else {
        let valueContext = context.metaModel.getArgumentValueContext(arg, argIndex, previousArgs, context);
        arg.value = this.readExpressionAfterIdentifier(identifier, identifierRange, valueContext);
      }
    } else {
      let valueContext = context.metaModel.getArgumentValueContext(arg, argIndex, previousArgs, context);
      let value = this.tryReadExpression(false, valueContext.metaModel.functions, valueContext);
      if (!value) {
        return undefined;
      }
      arg.value = value;
    }
    return arg;
  }

  readArgument(argIndex: number, previousArguments: Fmt.ArgumentList, context: Fmt.Context): Fmt.Argument {
    this.skipWhitespace();
    return this.tryReadArgument(argIndex, previousArguments, context) || this.error('Argument expected') || new Fmt.Argument;
  }

  tryReadType(metaDefinitions: Fmt.MetaDefinitionFactory, context: Fmt.Context): Fmt.Type | undefined {
    if (!this.tryReadChar(':')) {
      return undefined;
    }
    let type = new Fmt.Type;
    type.expression = this.readExpression(true, metaDefinitions, context) as Fmt.ObjectRefExpression;
    type.arrayDimensions = 0;
    this.skipWhitespace();
    if (this.tryReadChar('[')) {
      do {
        type.arrayDimensions++;
        this.skipWhitespace();
      } while (this.tryReadChar(','));
      this.readChar(']');
    }
    return type;
  }

  readType(metaDefinitions: Fmt.MetaDefinitionFactory, context: Fmt.Context): Fmt.Type {
    this.skipWhitespace();
    return this.tryReadType(metaDefinitions, context) || this.error('Type expected') || new Fmt.Type;
  }

  readExpressions(context: Fmt.Context): Fmt.Expression[] {
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

  tryReadExpression(isType: boolean, metaDefinitions: Fmt.MetaDefinitionFactory, context: Fmt.Context): Fmt.Expression | undefined {
    let expressionStart = this.markStart();
    if (this.tryReadChar('%')) {
      let name = this.readIdentifier();
      let expression: Fmt.MetaRefExpression | undefined = undefined;
      if (metaDefinitions && name) {
        try {
          expression = metaDefinitions.createMetaRefExpression(name);
        } catch (error) {
          this.error(error.message, this.markEnd(expressionStart));
        }
      }
      if (!expression) {
        let genericExpression = new Fmt.GenericMetaRefExpression;
        genericExpression.name = name;
        expression = genericExpression;
      }
      context = new Fmt.ParentInfoContext(expression, context);
      let args: Fmt.ArgumentList = Object.create(Fmt.ArgumentList.prototype);
      this.readOptionalArgumentList(args, context);
      try {
        expression!.fromArgumentList(args);
      } catch (error) {
        this.error(error.message, this.markEnd(expressionStart));
      }
      return expression;
    } else if (isType && metaDefinitions && !metaDefinitions.allowDefinitionRefs()) {
      return undefined;
    } else if (this.tryReadChar('$')) {
      let expression = new Fmt.DefinitionRefExpression;
      context = new Fmt.ParentInfoContext(expression, context);
      expression.path = this.readPath(context);
      return expression;
    } else {
      let identifier = this.tryReadIdentifier();
      if (identifier) {
        let identifierRange = this.markEnd(expressionStart);
        return this.readExpressionAfterIdentifier(identifier, identifierRange, context);
      } else if (isType) {
        return undefined;
      } else if (this.tryReadChar('{')) {
        let expression = new Fmt.CompoundExpression;
        context = new Fmt.ParentInfoContext(expression, context);
        this.readArguments(expression.arguments, context);
        this.readChar('}');
        return expression;
      } else if (this.tryReadChar('#')) {
        let expression = new Fmt.ParameterExpression;
        context = new Fmt.ParentInfoContext(expression, context);
        this.readParameterList(expression.parameters, context);
        return expression;
      } else if (this.tryReadChar('[')) {
        let expression = new Fmt.ArrayExpression;
        expression.items = this.readExpressions(context);
        this.readChar(']');
        return expression;
      } else {
        let str = this.tryReadString('\'');
        if (str !== undefined) {
          let expression = new Fmt.StringExpression;
          expression.value = str;
          return expression;
        } else {
          let num = this.tryReadInteger();
          if (num !== undefined) {
            let expression = new Fmt.IntegerExpression;
            expression.value = num;
            return expression;
          } else {
            return undefined;
          }
        }
      }
    }
  }

  private readExpressionAfterIdentifier(identifier: string, identifierRange: Range, context: Fmt.Context): Fmt.Expression {
    let expression = new Fmt.VariableRefExpression;
    try {
      expression.variable = context.getVariable(identifier);
    } catch (error) {
      this.error(error.message, identifierRange);
    }
    this.skipWhitespace();
    if (this.tryReadChar('[')) {
      expression.indices = this.readExpressions(context);
      this.readChar(']');
    }
    return expression;
  }

  readExpression(isType: boolean, metaDefinitions: Fmt.MetaDefinitionFactory, context: Fmt.Context): Fmt.Expression {
    this.skipWhitespace();
    return this.tryReadExpression(isType, metaDefinitions, context) || this.error('Expression expected') || new Fmt.StringExpression;
  }

  tryReadString(quoteChar: string): string | undefined {
    if (!this.tryReadChar(quoteChar)) {
      return undefined;
    }
    let str = '';
    do {
      for (;;) {
        let c = this.readAnyChar();
        if (!c) {
          this.error('Unterminated string');
          break;
        } else if (c === quoteChar) {
          break;
        } else if (c === '\\') {
          c = this.readAnyChar();
          switch (c) {
          case '\\':
          case '"':
          case '\'':
            str += c;
            break;
          case 't':
            str += '\t';
            break;
          case 'r':
            str += '\r';
            break;
          case 'n':
            str += '\n';
            break;
          default:
            this.error('Unknown escape sequence');
          }
        } else {
          str += c;
        }
      }
      this.skipWhitespace();
    } while (this.tryReadChar(quoteChar));
    return str;
  }

  tryReadInteger(): Fmt.BigInt | undefined {
    let c = this.peekChar();
    if (isNumericalCharacter(c) || c === '+' || c === '-') {
      let numStr = '';
      do {
        numStr += this.readAnyChar();
        c = this.peekChar();
      } while (isNumericalCharacter(c));
      return new Fmt.BN(numStr, 10);
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

  private skipWhitespace(): void {
    let c = this.stream.peekChar();
    if (isWhitespaceCharacter(c)) {
      this.markedEnd = this.stream.getLocation();
      do {
        this.stream.readChar();
        c = this.stream.peekChar();
      } while (isWhitespaceCharacter(c));
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
    this.skipWhitespace();
    if (!this.tryReadChar(c)) {
      let expected = '';
      let index = 0;
      for (let tried of this.triedChars) {
        if (index) {
          if (this.triedChars.length > 2) {
            expected += ',';
          }
          expected += ' ';
          if (index === this.triedChars.length - 1) {
            expected += 'or ';
          }
        }
        expected += tried ? `'${tried}'` : expected ? 'identifier' : 'Identifier';
        index++;
      }
      this.error(`${expected} expected`);
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
    return this.stream.readChar();
  }

  private markStart(): Location {
    if (!this.markedStart) {
      this.markedStart = this.stream.getLocation();
    }
    return this.markedStart;
  }

  private markEnd(start: Location): Range {
    if (!this.markedEnd) {
      this.markedEnd = this.stream.getLocation();
    }
    return {
      start: start,
      end: this.markedEnd
    };
  }

  private error(msg: string, range?: Range): void {
    if (!this.atError) {
      if (range) {
        if (range.start.line > range.end.line || (range.start.line === range.end.line && range.start.col > range.end.col)) {
          range = {
            start: range.end,
            end: range.start
          };
        }
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
        range = {
          start: start,
          end: end
        };
      }
      this.reportError(msg, range);
      this.atError = true;
    }
  }
}


export function readStream(stream: InputStream, fileName: string, getMetaModel: Fmt.MetaModelGetter): Fmt.File {
  let reportError = (msg: string, range: Range) => {
    let line = range.start.line + 1;
    let col = range.start.col + 1;
    let error: any = new SyntaxError(`${fileName}:${line}:${col}: ${msg}`);
    error.fileName = fileName;
    error.lineNumber = line;
    error.columnNumber = col;
    throw error;
  };
  let reader = new Reader(stream, reportError, getMetaModel);
  return reader.readFile();
}

export function readString(str: string, fileName: string, getMetaModel: Fmt.MetaModelGetter): Fmt.File {
  return readStream(new StringInputStream(str), fileName, getMetaModel);
}

interface TextResponse {
  url: string;
  text(): Promise<string>;
}

export function readResponse(response: TextResponse, metaModelGetter: Fmt.MetaModelGetter): Promise<Fmt.File> {
  return response.text().then((str: string) => readString(str, response.url, metaModelGetter));
}
