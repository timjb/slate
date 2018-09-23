// Generated from data/format/library.hlm by generateMetaDeclarations.ts.
// tslint:disable:class-name
// tslint:disable:variable-name

import * as Fmt from './format';

export class ObjectContents_Section extends Fmt.ObjectContents {
  items?: Fmt.Expression;

  fromArgumentList(argumentList: Fmt.ArgumentList): void {
    this.items = argumentList.getOptionalValue('items', 0);
  }

  toArgumentList(argumentList: Fmt.ArgumentList): void {
    argumentList.length = 0;
    if (this.items !== undefined) {
      argumentList.add(this.items, 'items');
    }
  }

  substituteExpression(fn: Fmt.ExpressionSubstitutionFn, result: ObjectContents_Section, replacedParameters: Fmt.ReplacedParameter[] = []): boolean {
    let changed = false;
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

  createDefinitionContents(): Fmt.ObjectContents | undefined {
    return new ObjectContents_Section;
  }
}

export class ObjectContents_Library extends ObjectContents_Section {
  logic: Fmt.Expression;

  fromArgumentList(argumentList: Fmt.ArgumentList): void {
    super.fromArgumentList(argumentList);
    this.logic = argumentList.getValue('logic', 1);
  }

  toArgumentList(argumentList: Fmt.ArgumentList): void {
    super.toArgumentList(argumentList);
    argumentList.add(this.logic, 'logic');
  }

  substituteExpression(fn: Fmt.ExpressionSubstitutionFn, result: ObjectContents_Library, replacedParameters: Fmt.ReplacedParameter[] = []): boolean {
    let changed = super.substituteExpression(fn, result, replacedParameters);
    if (this.logic) {
      result.logic = this.logic.substitute(fn, replacedParameters);
      if (result.logic !== this.logic) {
        changed = true;
      }
    }
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

  createDefinitionContents(): Fmt.ObjectContents | undefined {
    return new ObjectContents_Library;
  }
}

export class MetaRefExpression_item extends Fmt.MetaRefExpression {
  ref: Fmt.Expression;
  type?: string;
  title?: Fmt.Expression;

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
    this.title = argumentList.getOptionalValue('title', 2);
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
      argumentList.add(this.title, 'title');
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
    if (this.title) {
      result.title = this.title.substitute(fn, replacedParameters);
      if (result.title !== this.title) {
        changed = true;
      }
    }
    if (!changed) {
      result = this;
    }
    return fn(result);
  }
}

export class MetaRefExpression_subsection extends Fmt.MetaRefExpression {
  ref: Fmt.Expression;
  title?: Fmt.Expression;

  getName(): string {
    return 'subsection';
  }

  fromArgumentList(argumentList: Fmt.ArgumentList): void {
    this.ref = argumentList.getValue('ref', 0);
    this.title = argumentList.getOptionalValue('title', 1);
  }

  toArgumentList(argumentList: Fmt.ArgumentList): void {
    argumentList.length = 0;
    argumentList.add(this.ref);
    if (this.title !== undefined) {
      argumentList.add(this.title, 'title');
    }
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
    if (this.title) {
      result.title = this.title.substitute(fn, replacedParameters);
      if (result.title !== this.title) {
        changed = true;
      }
    }
    if (!changed) {
      result = this;
    }
    return fn(result);
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
const functions: Fmt.MetaDefinitionList = {'item': MetaRefExpression_item, 'subsection': MetaRefExpression_subsection};

export class MetaModel extends Fmt.MetaModel {
  constructor() {
    super(new Fmt.StandardMetaDefinitionFactory(definitionTypes),
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
