import * as React from 'react';
import './App.css';
import SplitPane from 'react-split-pane';
import LibraryTree from './components/LibraryTree';
import LibraryItem from './components/LibraryItem';
import SourceCodeView from './components/SourceCodeView';
import Button from './components/Button';
import { LibraryItemInteractionHandler } from './components/InteractionHandler';
import CachedPromise from '../shared/data/cachedPromise';
import * as Fmt from '../shared/format/format';
import * as FmtReader from '../shared/format/read';
import * as FmtLibrary from '../shared/format/library';
import * as FmtDisplay from '../shared/display/meta';
import { ButtonType, getButtonIcon } from './utils/icons';
import { FileAccessor, FileContents } from '../shared/data/fileAccessor';
import { WebFileAccessor } from './data/webFileAccessor';
import { LibraryDataProvider, LibraryItemInfo } from '../shared/data/libraryDataProvider';
import * as Logic from '../shared/logics/logic';
import * as Logics from '../shared/logics/logics';

const Loading = require('react-loading-animation');

interface AppProps {
}

interface SelectionState {
  selectedItemPath?: Fmt.Path;
  selectedItemProvider?: LibraryDataProvider;
  selectedItemDefinition?: CachedPromise<Fmt.Definition>;
  selectedItemInfo?: CachedPromise<LibraryItemInfo>;
  interactionHandler?: LibraryItemInteractionHandler;
  editing: boolean;
  submitting: boolean;
}

interface AppState extends SelectionState {
  width: number;
  height: number;
  verticalLayout: boolean;
  error?: string;
  templates?: Fmt.File;
  extraContentsVisible: boolean;
}

class App extends React.Component<AppProps, AppState> {
  private logic: Logic.Logic;
  private fileAccessor: FileAccessor;
  private libraryDataProvider: LibraryDataProvider;
  private library: CachedPromise<Fmt.Definition>;
  private treePaneNode: HTMLElement | null = null;

  constructor(props: AppProps) {
    super(props);

    this.logic = Logics.hlm;
    this.fileAccessor = new WebFileAccessor;
    this.libraryDataProvider = new LibraryDataProvider(this.logic, this.fileAccessor, '/libraries/hlm', undefined, 'Library');

    this.library = this.libraryDataProvider.fetchLocalSection();

    let state: AppState = {
      width: window.innerWidth,
      height: window.innerHeight,
      verticalLayout: window.innerHeight > window.innerWidth,
      editing: false,
      submitting: false,
      extraContentsVisible: false
    };
    this.updateSelectionState(state);
    this.state = state;
  }

  private updateSelectionState(state: SelectionState): boolean {
    let path = this.libraryDataProvider.uriToPath(location.pathname);
    if (path) {
      this.fillSelectionState(state, path);
      return true;
    }
    return false;
  }

  private fillSelectionState(state: SelectionState, path: Fmt.Path): void {
    state.selectedItemPath = path;
    state.selectedItemProvider = this.libraryDataProvider.getProviderForSection(path.parentPath);
    state.selectedItemDefinition = state.selectedItemProvider.fetchLocalItem(path.name);
    state.selectedItemInfo = state.selectedItemProvider.getLocalItemInfo(path.name);
    if (this.state && this.state.templates) {
      state.interactionHandler = new LibraryItemInteractionHandler(state.selectedItemProvider, this.state.templates, state.selectedItemDefinition, this.linkClicked);
    }
  }

  componentDidMount(): void {
    window.onpopstate = () => {
      // Explicitly set members to undefined; otherwise the back button cannot be used to return to an empty selection.
      let state: SelectionState = {
        selectedItemPath: undefined,
        selectedItemProvider: undefined,
        selectedItemDefinition: undefined,
        selectedItemInfo: undefined,
        interactionHandler: undefined,
        editing: false,
        submitting: false
      };
      this.updateSelectionState(state);
      this.setState(state);
    };

    window.onresize = () => {
      this.setState({
        width: window.innerWidth,
        height: window.innerHeight
      });
      if (window.innerHeight > window.innerWidth * 1.25) {
        this.setState({
          verticalLayout: true
        });
      } else if (window.innerHeight * 1.25 < window.innerWidth) {
        this.setState({
          verticalLayout: false
        });
      }
    };

    let templateUri = '/display/templates.hlm';
    this.fileAccessor.readFile(templateUri)
      .then((contents: FileContents) => {
        let templates = FmtReader.readString(contents.text, templateUri, FmtDisplay.getMetaModel);
        contents.close();
        this.setState({templates: templates});
        if (this.state.selectedItemProvider && this.state.selectedItemDefinition) {
          this.setState({interactionHandler: new LibraryItemInteractionHandler(this.state.selectedItemProvider, templates, this.state.selectedItemDefinition, this.linkClicked)});
        }
      })
      .catch((error) => {
        this.setState({error: error.message});
        console.error(error);
      });
  }

  componentWillUnmount(): void {
    window.onresize = null;
    window.onpopstate = null;
  }

  render(): any {
    if (this.state.error) {
      return <div className={'error'}>Error: {this.state.error}</div>;
    }

    let mainContents: any = undefined;
    let extraContents: any = undefined;
    if (this.state.templates && this.state.selectedItemProvider && this.state.selectedItemDefinition) {
      mainContents = <LibraryItem libraryDataProvider={this.state.selectedItemProvider} definition={this.state.selectedItemDefinition} templates={this.state.templates} itemInfo={this.state.selectedItemInfo} includeLabel={true} includeExtras={true} includeProofs={true} includeRemarks={true} editing={this.state.editing} interactionHandler={this.state.interactionHandler}/>;
      extraContents = <SourceCodeView definition={this.state.selectedItemDefinition} interactionHandler={this.state.interactionHandler}/>;
    } else {
      mainContents = 'Please select an item from the tree.';
    }

    let windowSize = this.state.verticalLayout ? this.state.height : this.state.width;
    let defaultItemHeight = this.state.verticalLayout ? this.state.height / 3 : this.state.height / 2;

    let buttons: any[] = [];
    if (this.state.selectedItemDefinition) {
      if (this.state.submitting) {
        buttons.push(<div className="submitting" key="Submitting"><Loading width={'1em'} height={'1em'}/></div>);
        buttons.push(' ');
      } else if (this.state.editing) {
        buttons.push(
          <Button toolTipText="Submit" onClick={this.submit} key="Submit">
            {getButtonIcon(ButtonType.Submit)}
          </Button>
        );
        // TODO
        /*buttons.push(
          <Button toolTipText="Cancel" onClick={() => this.setState({editing: false})} key="Cancel">
            {getButtonIcon(ButtonType.Cancel)}
          </Button>
        );*/
        buttons.push(' ');
      } else {
        buttons.push(
          <Button toolTipText="Edit" onClick={() => this.setState({editing: true})} key="Edit">
            {getButtonIcon(ButtonType.Edit)}
          </Button>
        );
      }
    }
    if (extraContents) {
      buttons.push(
        <Button toolTipText="View Source" selected={this.state.extraContentsVisible} onClick={() => this.setState((prevState) => ({extraContentsVisible: !prevState.extraContentsVisible}))} key="ViewSource">
          {getButtonIcon(ButtonType.ViewSource)}
        </Button>
      );
    }
    let contentsPane = (
      <div className={'bottom-toolbar-container'}>
        <div className={'app-pane'}>
          <div className={'app-contents'}>
            {mainContents}
          </div>
        </div>
        <div className={'bottom-toolbar'}>
          {buttons}
        </div>
      </div>
    );
    if (extraContents && this.state.extraContentsVisible) {
      contentsPane = (
        <SplitPane split={'horizontal'} defaultSize={defaultItemHeight}>
          {contentsPane}
          <div className={'app-pane'}>
            <div className={'app-contents'}>
              {extraContents}
            </div>
          </div>
        </SplitPane>
      );
    }

    return (
      <div className={'app'}>
        <SplitPane split={this.state.verticalLayout ? 'horizontal' : 'vertical'} minSize={windowSize / 5} maxSize={windowSize * 4 / 5} defaultSize={windowSize / 3}>
          <div className={'app-pane'} ref={(htmlNode) => (this.treePaneNode = htmlNode)}>
            <div className={'app-tree'}>
              <LibraryTree libraryDataProvider={this.libraryDataProvider} section={this.library} itemNumber={[]} templates={this.state.templates} parentScrollPane={this.treePaneNode} isLast={true} selectedItemPath={this.state.selectedItemPath} onItemClicked={this.treeItemClicked}/>
            </div>
          </div>
          {contentsPane}
        </SplitPane>
      </div>
    );
  }

  private treeItemClicked = (item: FmtLibrary.MetaRefExpression_item, libraryDataProvider: LibraryDataProvider, path: Fmt.Path, definitionPromise: CachedPromise<Fmt.Definition>, itemInfo: LibraryItemInfo): void => {
    this.setState({
      selectedItemPath: libraryDataProvider.getAbsolutePath(path),
      selectedItemProvider: libraryDataProvider,
      selectedItemDefinition: definitionPromise,
      selectedItemInfo: CachedPromise.resolve(itemInfo),
      interactionHandler: this.state.templates ? new LibraryItemInteractionHandler(libraryDataProvider, this.state.templates, definitionPromise, this.linkClicked) : undefined,
      editing: false
    });

    let uri = libraryDataProvider.pathToURI(path);
    history.pushState(null, 'HLM', uri);
  }

  private linkClicked = (libraryDataProvider: LibraryDataProvider, path: Fmt.Path): void => {
    let state: SelectionState = {
      editing: false,
      submitting: false
    };
    this.fillSelectionState(state, libraryDataProvider.getAbsolutePath(path));
    this.setState(state);

    let uri = libraryDataProvider.pathToURI(path);
    history.pushState(null, 'HLM', uri);
  }

  private submit = (): void => {
    let libraryDataProvider = this.state.selectedItemProvider;
    let path = this.state.selectedItemPath;
    let definitionPromise = this.state.selectedItemDefinition;
    if (libraryDataProvider && path && definitionPromise) {
      this.setState({
        editing: false,
        submitting: true
      });
      definitionPromise.then((definition: Fmt.Definition) => {
        if (libraryDataProvider && path) {
          libraryDataProvider.submitLocalItem(path.name, definition)
            .then(() => this.setState({submitting: false}))
            .catch((error) => {
              this.setState({submitting: false});
              alert(error.message);
            });
        }
      });
    }
  }
}

export default App;
