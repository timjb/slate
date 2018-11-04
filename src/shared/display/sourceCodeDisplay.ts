import * as Fmt from '../format/format';
import * as FmtWriter from '../format/write';
import * as Display from './display';

interface StackItem {
  range: Display.RowExpression;
  isMathematical: boolean;
}

export class SourceCodeStream implements FmtWriter.OutputStream {
  private stack: StackItem[];
  result: Display.RenderedExpression;

  constructor() {
    let root = new Display.RowExpression([]);
    root.styleClasses = ['source-code'];
    this.stack = [{
      range: root,
      isMathematical: true
    }];
    this.result = root;
  }

  write(str: string): void {
    let back = this.stack[this.stack.length - 1];
    let text = new Display.TextExpression(str);
    back.range.items.push(text);
  }

  startRange(object: Object, name: boolean, link: boolean, tag: boolean, signature: boolean): void {
    let back = this.stack[this.stack.length - 1];
    let isMathematical = back.isMathematical;
    if (object instanceof Fmt.Argument && object.name === 'display') {
      isMathematical = false;
    }
    let range = new Display.RowExpression([]);
    range.styleClasses = ['source-code'];
    if (((object instanceof Fmt.Expression || object instanceof Fmt.Definition || object instanceof Fmt.Argument || object instanceof Fmt.DocumentationComment) && !tag && !link && !tag && !signature) || (object instanceof Fmt.DocumentationItem && tag)) {
      range.semanticLinks = [new Display.SemanticLink(object, false, isMathematical)];
    }
    if (object instanceof Fmt.MetaRefExpression && tag) {
      range.styleClasses.push('meta-ref');
    } else if (object instanceof Fmt.VariableRefExpression && name) {
      range.styleClasses.push('var');
      range.semanticLinks = [new Display.SemanticLink(object.variable)];
    } else if (object instanceof Fmt.Parameter && name) {
      range.styleClasses.push('var');
      range.semanticLinks = [new Display.SemanticLink(object, true)];
    } else if (object instanceof Fmt.Argument && name) {
      range.styleClasses.push('arg');
      range.styleClasses.push('var');
    } else if (object instanceof Fmt.DocumentationComment) {
      range.styleClasses.push('comment');
    } else if (object instanceof Fmt.DocumentationItem && tag) {
      range.styleClasses.push('keyword');
    } else if (object instanceof Fmt.StringExpression) {
      range.styleClasses.push('string');
    }
    back.range.items.push(range);
    this.stack.push({
      range: range,
      isMathematical: isMathematical
    });
  }

  endRange(): void {
    this.stack.pop();
  }
}
