import * as React from 'react';
import * as Fmt from '../../shared/format/format';
import { LibraryDataProvider, LibraryDefinition, LibraryItemInfo, LibraryDefinitionState } from '../../shared/data/libraryDataProvider';
import Expression, { ExpressionInteractionHandler } from './Expression';
import CachedPromise from '../../shared/data/cachedPromise';
import renderPromise from './PromiseHelper';

export interface LibraryItemProps {
  libraryDataProvider: LibraryDataProvider;
  definition: CachedPromise<LibraryDefinition>;
  templates: Fmt.File;
  itemInfo?: CachedPromise<LibraryItemInfo>;
  includeLabel: boolean;
  includeExtras: boolean;
  includeProofs: boolean;
  includeRemarks: boolean;
  interactionHandler?: ExpressionInteractionHandler;
}

export function renderLibraryItem(props: LibraryItemProps): React.ReactNode {
  let logic = props.libraryDataProvider.logic;
  let logicDisplay = logic.getDisplay();

  let render = props.definition.then((definition: LibraryDefinition) => {
    let renderer = logicDisplay.getDefinitionEditor(definition.definition, props.includeProofs, props.libraryDataProvider, props.templates, definition.state === LibraryDefinitionState.Editing);
    let expression = renderer.renderDefinition(props.itemInfo, props.includeLabel, props.includeExtras, props.includeRemarks);
    if (expression) {
      return <Expression expression={expression} interactionHandler={props.interactionHandler}/>;
    } else {
      return null;
    }
  });

  return renderPromise(render);
}

class LibraryItem extends React.Component<LibraryItemProps> {
  componentDidMount(): void {
    if (this.props.interactionHandler) {
      this.props.interactionHandler.registerExpressionChangeListener(this.onExpressionChanged);
    }
  }

  componentWillUnmount(): void {
    if (this.props.interactionHandler) {
      this.props.interactionHandler.unregisterExpressionChangeListener(this.onExpressionChanged);
    }
  }

  componentWillReceiveProps(props: LibraryItemProps): void {
    if (props.interactionHandler !== this.props.interactionHandler) {
      if (this.props.interactionHandler) {
        this.props.interactionHandler.unregisterExpressionChangeListener(this.onExpressionChanged);
      }
      if (props.interactionHandler) {
        props.interactionHandler.registerExpressionChangeListener(this.onExpressionChanged);
      }
    }
  }

  render(): React.ReactNode {
    return renderLibraryItem(this.props);
  }

  private onExpressionChanged = (editorUpdateRequired: boolean) => {
    if (editorUpdateRequired) {
      this.forceUpdate();
    }
  }
}

export default LibraryItem;
