// Generated from data/logics/library.slate by generateMetaDeclarations.ts.
// tslint:disable:class-name
// tslint:disable:variable-name

import * as Fmt from '../format/format';

export class ObjectContents_Section extends Fmt.ObjectContents {
  logic: string;
  items?: Fmt.Expression;

  fromArgumentList(argumentList: Fmt.ArgumentList): void {
    let logicRaw = argumentList.getValue('logic', 0);
    if (logicRaw instanceof Fmt.StringExpression) {
      this.logic = logicRaw.value;
    } else {
      throw new Error('logic: String expected');
    }
    this.items = argumentList.getOptionalValue('items', 1);
  }

  toArgumentList(argumentList: Fmt.ArgumentList): void {
    argumentList.length = 0;
    let logicExpr = new Fmt.StringExpression;
    logicExpr.value = this.logic;
    argumentList.add(logicExpr, 'logic');
    if (this.items !== undefined) {
      argumentList.add(this.items, 'items');
    }
  }

  clone(replacedParameters: Fmt.ReplacedParameter[] = []): ObjectContents_Section {
    let result = new ObjectContents_Section;
    this.substituteExpression(undefined, result, replacedParameters);
    return result;
  }

  substituteExpression(fn: Fmt.ExpressionSubstitutionFn, result: ObjectContents_Section, replacedParameters: Fmt.ReplacedParameter[] = []): boolean {
    let changed = false;
    result.logic = this.logic;
    if (this.items) {
      result.items = this.items.substitute(fn, replacedParameters);
      if (result.items !== this.items) {
        changed = true;
      }
    }
    return changed;
  }
}

export class MetaRefExpression_Section extends Fmt.MetaRefExpression {
  getName(): string {
    return 'Section';
  }

  fromArgumentList(argumentList: Fmt.ArgumentList): void {
  }

  toArgumentList(argumentList: Fmt.ArgumentList): void {
    argumentList.length = 0;
  }

  substitute(fn: Fmt.ExpressionSubstitutionFn, replacedParameters: Fmt.ReplacedParameter[] = []): Fmt.Expression {
    if (fn) {
      return fn(this);
    } else {
      return new MetaRefExpression_Section;
    }
  }

  createDefinitionContents(): Fmt.ObjectContents | undefined {
    return new ObjectContents_Section;
  }
}

export class ObjectContents_Library extends ObjectContents_Section {
  fromArgumentList(argumentList: Fmt.ArgumentList): void {
    super.fromArgumentList(argumentList);
  }

  toArgumentList(argumentList: Fmt.ArgumentList): void {
    super.toArgumentList(argumentList);
  }

  clone(replacedParameters: Fmt.ReplacedParameter[] = []): ObjectContents_Library {
    let result = new ObjectContents_Library;
    this.substituteExpression(undefined, result, replacedParameters);
    return result;
  }

  substituteExpression(fn: Fmt.ExpressionSubstitutionFn, result: ObjectContents_Library, replacedParameters: Fmt.ReplacedParameter[] = []): boolean {
    let changed = super.substituteExpression(fn, result, replacedParameters);
    return changed;
  }
}

export class MetaRefExpression_Library extends Fmt.MetaRefExpression {
  getName(): string {
    return 'Library';
  }

  fromArgumentList(argumentList: Fmt.ArgumentList): void {
  }

  toArgumentList(argumentList: Fmt.ArgumentList): void {
    argumentList.length = 0;
  }

  substitute(fn: Fmt.ExpressionSubstitutionFn, replacedParameters: Fmt.ReplacedParameter[] = []): Fmt.Expression {
    if (fn) {
      return fn(this);
    } else {
      return new MetaRefExpression_Library;
    }
  }

  createDefinitionContents(): Fmt.ObjectContents | undefined {
    return new ObjectContents_Library;
  }
}

export class MetaRefExpression_item extends Fmt.MetaRefExpression {
  ref: Fmt.Expression;
  type?: string;
  title?: string;

  getName(): string {
    return 'item';
  }

  fromArgumentList(argumentList: Fmt.ArgumentList): void {
    this.ref = argumentList.getValue('ref', 0);
    let typeRaw = argumentList.getOptionalValue('type', 1);
    if (typeRaw !== undefined) {
      if (typeRaw instanceof Fmt.StringExpression) {
        this.type = typeRaw.value;
      } else {
        throw new Error('type: String expected');
      }
    }
    let titleRaw = argumentList.getOptionalValue('title', 2);
    if (titleRaw !== undefined) {
      if (titleRaw instanceof Fmt.StringExpression) {
        this.title = titleRaw.value;
      } else {
        throw new Error('title: String expected');
      }
    }
  }

  toArgumentList(argumentList: Fmt.ArgumentList): void {
    argumentList.length = 0;
    argumentList.add(this.ref);
    if (this.type !== undefined) {
      let typeExpr = new Fmt.StringExpression;
      typeExpr.value = this.type;
      argumentList.add(typeExpr, 'type');
    }
    if (this.title !== undefined) {
      let titleExpr = new Fmt.StringExpression;
      titleExpr.value = this.title;
      argumentList.add(titleExpr, 'title');
    }
  }

  substitute(fn: Fmt.ExpressionSubstitutionFn, replacedParameters: Fmt.ReplacedParameter[] = []): Fmt.Expression {
    let result = new MetaRefExpression_item;
    let changed = false;
    if (this.ref) {
      result.ref = this.ref.substitute(fn, replacedParameters);
      if (result.ref !== this.ref) {
        changed = true;
      }
    }
    result.type = this.type;
    result.title = this.title;
    return this.getSubstitutionResult(fn, result, changed);
  }
}

export class MetaRefExpression_subsection extends Fmt.MetaRefExpression {
  ref: Fmt.Expression;
  title: string;

  getName(): string {
    return 'subsection';
  }

  fromArgumentList(argumentList: Fmt.ArgumentList): void {
    this.ref = argumentList.getValue('ref', 0);
    let titleRaw = argumentList.getValue('title', 1);
    if (titleRaw instanceof Fmt.StringExpression) {
      this.title = titleRaw.value;
    } else {
      throw new Error('title: String expected');
    }
  }

  toArgumentList(argumentList: Fmt.ArgumentList): void {
    argumentList.length = 0;
    argumentList.add(this.ref);
    let titleExpr = new Fmt.StringExpression;
    titleExpr.value = this.title;
    argumentList.add(titleExpr);
  }

  substitute(fn: Fmt.ExpressionSubstitutionFn, replacedParameters: Fmt.ReplacedParameter[] = []): Fmt.Expression {
    let result = new MetaRefExpression_subsection;
    let changed = false;
    if (this.ref) {
      result.ref = this.ref.substitute(fn, replacedParameters);
      if (result.ref !== this.ref) {
        changed = true;
      }
    }
    result.title = this.title;
    return this.getSubstitutionResult(fn, result, changed);
  }
}

class DefinitionContentsContext extends Fmt.DerivedContext {
  constructor(public definition: Fmt.Definition, parentContext: Fmt.Context) {
    super(parentContext);
  }
}

class ParameterTypeContext extends Fmt.DerivedContext {
  constructor(public parameter: Fmt.Parameter, parentContext: Fmt.Context) {
    super(parentContext);
  }
}

class ArgumentTypeContext extends Fmt.DerivedContext {
  constructor(public objectContentsClass: {new(): Fmt.ObjectContents}, parentContext: Fmt.Context) {
    super(parentContext);
  }
}

const definitionTypes: Fmt.MetaDefinitionList = {'Library': MetaRefExpression_Library, 'Section': MetaRefExpression_Section};
const expressionTypes: Fmt.MetaDefinitionList = {};
const functions: Fmt.MetaDefinitionList = {'item': MetaRefExpression_item, 'subsection': MetaRefExpression_subsection, '': Fmt.GenericMetaRefExpression};

export class MetaModel extends Fmt.MetaModel {
  constructor() {
    super('library',
          new Fmt.StandardMetaDefinitionFactory(definitionTypes),
          new Fmt.StandardMetaDefinitionFactory(expressionTypes),
          new Fmt.StandardMetaDefinitionFactory(functions));
  }

  getDefinitionContentsContext(definition: Fmt.Definition, parentContext: Fmt.Context): Fmt.Context {
    return new DefinitionContentsContext(definition, super.getDefinitionContentsContext(definition, parentContext));
  }

  getParameterTypeContext(parameter: Fmt.Parameter, parentContext: Fmt.Context): Fmt.Context {
    return new ParameterTypeContext(parameter, parentContext);
  }

  getNextArgumentContext(argument: Fmt.Argument, argumentIndex: number, previousContext: Fmt.Context): Fmt.Context {
    let parent = previousContext.parentObject;
    if (parent instanceof Fmt.Definition) {
      let type = parent.type.expression;
      if (type instanceof Fmt.MetaRefExpression) {
        if (type instanceof MetaRefExpression_Library
            || type instanceof MetaRefExpression_Section) {
          return previousContext;
        }
      }
    }
    if (parent instanceof Fmt.CompoundExpression) {
      for (let currentContext = previousContext; currentContext instanceof Fmt.DerivedContext; currentContext = currentContext.parentContext) {
        if (currentContext instanceof ArgumentTypeContext) {
          return previousContext;
        } else if (currentContext.parentObject !== parent && !(currentContext.parentObject instanceof Fmt.ArrayExpression)) {
          break;
        }
      }
    }
    if (parent instanceof Fmt.MetaRefExpression) {
      return previousContext;
    }
    return super.getNextArgumentContext(argument, argumentIndex, previousContext);
  }

  getArgumentValueContext(argument: Fmt.Argument, argumentIndex: number, previousArguments: Fmt.ArgumentList, parentContext: Fmt.Context): Fmt.Context {
    let context = parentContext;
    let parent = context.parentObject;
    if (parent instanceof Fmt.CompoundExpression) {
      for (let currentContext = context; currentContext instanceof Fmt.DerivedContext; currentContext = currentContext.parentContext) {
        if (currentContext instanceof ArgumentTypeContext) {
          break;
        } else if (currentContext.parentObject !== parent && !(currentContext.parentObject instanceof Fmt.ArrayExpression)) {
          break;
        }
      }
    }
    return context;
  }
}

export const metaModel = new MetaModel;

export function getMetaModel(path: Fmt.Path) {
  if (path.name !== 'library') {
    throw new Error('File of type "library" expected');
  }
  return metaModel;
}