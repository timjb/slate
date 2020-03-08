import * as React from 'react';
import * as FmtWriter from '../../shared/format/write';
import * as SourceCodeDisplay from '../../shared/display/sourceCodeDisplay';
import Expression from './Expression';
import { LibraryItemBase } from './LibraryItem';

class SourceCodeView extends LibraryItemBase {
  private timer: any;

  render(): React.ReactNode {
    let renderer = this.getRenderer();
    let stream = new SourceCodeDisplay.SourceCodeStream(renderer);
    let writer = new FmtWriter.Writer(stream, true);
    let indent = {
      indent: '',
      outerIndent: ''
    };
    writer.writeDefinition(this.props.definition.definition, indent);
    return <Expression expression={stream.result} interactionHandler={this.props.interactionHandler} tooltipPosition="top"/>;
  }

  protected onExpressionChanged = () => {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    let update = () => {
      let renderer = this.getRenderer();
      if (renderer) {
        renderer.updateEditorState().then(() => this.forceUpdate());
      } else {
        this.forceUpdate();
      }
    };
    this.timer = setTimeout(update, 500);
  }
}

export default SourceCodeView;
