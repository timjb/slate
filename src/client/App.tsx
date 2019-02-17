import * as React from 'react';
import './App.css';
import SplitPane from 'react-split-pane';
import { withAlert, InjectedAlertProp } from 'react-alert';
import StartPage from './components/StartPage';
import LibraryTree from './components/LibraryTree';
import LibraryItem from './components/LibraryItem';
import SourceCodeView from './components/SourceCodeView';
import Button from './components/Button';
import { LibraryItemInteractionHandler } from './components/InteractionHandler';
import CachedPromise from '../shared/data/cachedPromise';
import * as Fmt from '../shared/format/format';
import * as FmtReader from '../shared/format/read';
import * as FmtLibrary from '../shared/logics/library';
import * as FmtDisplay from '../shared/display/meta';
import { ButtonType, getButtonIcon } from './utils/icons';
import { FileAccessor, FileContents } from '../shared/data/fileAccessor';
import { WebFileAccessor } from './data/webFileAccessor';
import { GitHubFileAccessor } from './data/gitHubFileAccessor';
import * as GitHub from './data/gitHubAPIHandler';
import { LibraryDataProvider, LibraryItemInfo } from '../shared/data/libraryDataProvider';
import * as Logic from '../shared/logics/logic';
import * as Logics from '../shared/logics/logics';

const Loading = require('react-loading-animation');

const Libraries = require('../../data/libraries/libraries.json');

interface AppProps {
  alert: InjectedAlertProp;
}

interface SelectionState {
  selectedItemPath?: Fmt.Path;
  selectedItemProvider?: LibraryDataProvider;
  selectedItemDefinition?: CachedPromise<Fmt.Definition>;
  selectedItemInfo?: CachedPromise<LibraryItemInfo>;
  interactionHandler?: LibraryItemInteractionHandler;
  editedDefinition?: Fmt.Definition;
  submitting: boolean;
}

interface GitHubState {
  gitHubClientID?: string;
  gitHubAccessRequest?: Promise<string>;
  gitHubAccessToken?: string;
  gitHubUser?: string;
}

interface AppState extends SelectionState, GitHubState {
  verticalLayout: boolean;
  error?: string;
  templates?: Fmt.File;
  rootInteractionHandler?: LibraryItemInteractionHandler;
  extraContentsVisible: boolean;
}

class App extends React.Component<AppProps, AppState> {
  private runningLocally: boolean;
  private fileAccessor: FileAccessor;
  private logic: Logic.Logic;
  private libraryDataProvider: LibraryDataProvider;
  private library: CachedPromise<Fmt.Definition>;
  private treePaneNode: HTMLElement | null = null;
  private mainContentsPaneNode: HTMLElement | null = null;
  private extraContentsPaneNode: HTMLElement | null = null;

  constructor(props: AppProps) {
    super(props);

    this.runningLocally = (process.env.NODE_ENV === 'development');

    let librariesURIPrefix = '/libraries/';

    if (this.runningLocally) {
      this.fileAccessor = new WebFileAccessor;
    } else {
      let fileAccessor = new GitHubFileAccessor;
      for (let libraryName of Object.keys(Libraries)) {
        let uriPrefix = librariesURIPrefix + libraryName;
        let library = Libraries[libraryName];
        fileAccessor.setTarget(uriPrefix, library.repository, library.branch);
      }
      this.fileAccessor = fileAccessor;
    }

    this.logic = Logics.hlm;
    let libraryURI = librariesURIPrefix + 'hlm';
    this.libraryDataProvider = new LibraryDataProvider(this.logic, this.fileAccessor, libraryURI, undefined, 'Library');

    this.library = this.libraryDataProvider.fetchLocalSection();

    let state: AppState = {
      verticalLayout: window.innerHeight > window.innerWidth,
      submitting: false,
      extraContentsVisible: false
    };

    let selectionURI = window.location.pathname;

    let queryString = window.location.search;
    if (queryString) {
      let gitHubQueryStringResult = GitHub.parseGitHubQueryString(queryString);
      if (gitHubQueryStringResult.path) {
        selectionURI = gitHubQueryStringResult.path;
      }
      if (gitHubQueryStringResult.token) {
        state.gitHubAccessRequest = gitHubQueryStringResult.token;
      }
    }

    this.updateSelectionState(state, selectionURI);
    this.state = state;
    let title = this.updateTitle(state);

    if (queryString) {
      window.history.pushState(null, title, selectionURI);
    }
  }

  private updateSelectionState(state: SelectionState, uri: string): boolean {
    let path = this.libraryDataProvider.uriToPath(uri);
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
      /* Explicitly set members to undefined; otherwise the back button cannot be used to return to an empty selection. */
      let state: SelectionState = {
        selectedItemPath: undefined,
        selectedItemProvider: undefined,
        selectedItemDefinition: undefined,
        selectedItemInfo: undefined,
        interactionHandler: undefined,
        submitting: false
      };
      this.updateSelectionState(state, window.location.pathname);
      this.setState(state);
    };

    window.onresize = () => {
      if (!(this.state.interactionHandler && this.state.interactionHandler.isBlocked())) {
        if (window.innerHeight > window.innerWidth * 1.25) {
          if (!this.state.verticalLayout) {
            this.setState({verticalLayout: true});
          }
        } else if (window.innerHeight * 1.25 < window.innerWidth) {
          if (this.state.verticalLayout) {
            this.setState({verticalLayout: false});
          }
        }
      }
    };

    GitHub.getGitHubClientID()
      .then((clientID) => this.setState({gitHubClientID: clientID}))
      .catch(() => {});

    if (this.state.gitHubAccessRequest) {
      this.state.gitHubAccessRequest
        .then((token) => {
          this.setState({
            gitHubAccessRequest: undefined,
            gitHubAccessToken: token
          });
          GitHub.getGitHubUser(token)
            .then((user) => this.setState({gitHubUser: user}))
            .catch(() => {});
        })
        .catch((error) => {
          this.setState({
            gitHubAccessRequest: undefined,
            gitHubAccessToken: undefined
          });
          this.props.alert.error('GitHub login failed: ' + error.message);
        });
    }

    let templateUri = '/display/templates.slate';
    this.fileAccessor.readFile(templateUri)
      .then((contents: FileContents) => {
        let templates = FmtReader.readString(contents.text, templateUri, FmtDisplay.getMetaModel);
        contents.close();
        this.setState({
          templates: templates,
          rootInteractionHandler: new LibraryItemInteractionHandler(this.libraryDataProvider, templates, this.state.selectedItemDefinition, this.linkClicked)
        });
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
    if (this.state.selectedItemDefinition) {
      if (this.state.templates && this.state.selectedItemProvider) {
        let definition = this.state.editedDefinition ? CachedPromise.resolve(this.state.editedDefinition) : this.state.selectedItemDefinition;
        mainContents = <LibraryItem libraryDataProvider={this.state.selectedItemProvider} definition={definition} templates={this.state.templates} itemInfo={this.state.selectedItemInfo} includeLabel={true} includeExtras={true} includeProofs={true} includeRemarks={true} editing={this.state.editedDefinition !== undefined} interactionHandler={this.state.interactionHandler}/>;
        extraContents = <SourceCodeView definition={definition} interactionHandler={this.state.interactionHandler}/>;
      }
    } else {
      mainContents = <StartPage libraryDataProvider={this.libraryDataProvider} templates={this.state.templates} interactionHandler={this.state.rootInteractionHandler} onLinkClicked={this.linkClicked}/>;
    }

    let windowSize = this.state.verticalLayout ? window.innerHeight : window.innerWidth;
    let defaultItemHeight = this.state.verticalLayout ? window.innerHeight / 3 : window.innerHeight / 2;

    let buttons: any[] = [];

    if (this.state.gitHubAccessToken) {
      if (this.state.gitHubUser) {
        buttons.push(this.state.gitHubUser);
        buttons.push(' ');
      }
      buttons.push(
        <Button toolTipText={'Logout (Warning: Does not log out of GitHub.)'} onClick={this.logoutOfGitHub} key={'Logout'}>
          {getButtonIcon(ButtonType.Logout)}
        </Button>
      );
      buttons.push(' ');
    } else if (this.state.gitHubAccessRequest) {
      buttons.push(<div className={'submitting'} key={'Submitting'}><Loading width={'1em'} height={'1em'}/></div>);
      buttons.push('  Logging in... ');
    } else if (this.state.gitHubClientID) {
      buttons.push(
        <Button toolTipText={'Login with GitHub'} onClick={this.loginWithGitHub} key={'Login'}>
          {getButtonIcon(ButtonType.Login)}
        </Button>
      );
      buttons.push(' ');
    }

    if (this.state.selectedItemDefinition) {
      if (this.state.submitting) {
        buttons.push(<div className={'submitting'} key={'Submitting'}><Loading width={'1em'} height={'1em'}/></div>);
        buttons.push(' ');
      } else if (this.state.editedDefinition) {
        buttons.push(
          <Button toolTipText={this.runningLocally ? 'Save' : 'Submit'} onClick={this.submit} key={'Submit'}>
            {getButtonIcon(this.runningLocally ? ButtonType.Save : ButtonType.Submit)}
          </Button>
        );
        buttons.push(
          <Button toolTipText={'Cancel'} onClick={() => this.setState({editedDefinition: undefined})} key={'Cancel'}>
            {getButtonIcon(ButtonType.Cancel)}
          </Button>
        );
        buttons.push(' ');
      } else {
        buttons.push(
          <Button toolTipText={'Edit'} onClick={this.edit} key={'Edit'}>
            {getButtonIcon(ButtonType.Edit)}
          </Button>
        );
        if (this.runningLocally) {
          buttons.push(
            <Button toolTipText={'Open in Visual Studio Code'} onClick={this.openLocally} key={'OpenLocally'}>
              {getButtonIcon(ButtonType.OpenLocally)}
            </Button>
          );
        }
      }
    }
    if (extraContents) {
      buttons.push(
        <Button toolTipText={'View Source'} selected={this.state.extraContentsVisible} onClick={() => this.setState((prevState) => ({extraContentsVisible: !prevState.extraContentsVisible}))} key={'ViewSource'}>
          {getButtonIcon(ButtonType.ViewSource)}
        </Button>
      );
    }
    let contentsPane = (
      <div className={'bottom-toolbar-container'}>
        <div className={'app-pane'} ref={(htmlNode) => (this.mainContentsPaneNode = htmlNode)}>
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
          <div className={'app-pane'} ref={(htmlNode) => (this.extraContentsPaneNode = htmlNode)}>
            <div className={'app-contents'}>
              {extraContents}
            </div>
          </div>
        </SplitPane>
      );
    } else {
      this.extraContentsPaneNode = null;
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
    this.navigate({
      selectedItemPath: libraryDataProvider.getAbsolutePath(path),
      selectedItemProvider: libraryDataProvider,
      selectedItemDefinition: definitionPromise,
      selectedItemInfo: CachedPromise.resolve(itemInfo),
      interactionHandler: this.state.templates ? new LibraryItemInteractionHandler(libraryDataProvider, this.state.templates, definitionPromise, this.linkClicked) : undefined,
      editedDefinition: undefined,
      submitting: false
    });
  }

  private linkClicked = (libraryDataProvider: LibraryDataProvider, path: Fmt.Path): void => {
    let state: SelectionState = {
      editedDefinition: undefined,
      submitting: false
    };
    this.fillSelectionState(state, libraryDataProvider.getAbsolutePath(path));
    this.navigate(state);
  }

  private navigate(state: SelectionState): void {
    this.setState(state);
    let uri = '/';
    if (state.selectedItemPath) {
      uri = this.libraryDataProvider.pathToURI(state.selectedItemPath);
    }
    let title = this.updateTitle(state);
    window.history.pushState(null, title, uri);
    if (this.mainContentsPaneNode) {
      this.mainContentsPaneNode.scrollTo({left: 0, top: 0, behavior: 'auto'});
    }
    if (this.extraContentsPaneNode) {
      this.extraContentsPaneNode.scrollTo({left: 0, top: 0, behavior: 'auto'});
    }
  }

  private updateTitle(state: SelectionState): string {
    let appName = 'Slate';
    let title = appName;
    if (state.selectedItemPath) {
      title = `${appName}: ${state.selectedItemPath.name}`;
    }
    document.title = title;
    if (state.selectedItemInfo) {
      state.selectedItemInfo.then((info: LibraryItemInfo) => {
        if (info.title) {
          document.title = `${appName}: ${info.title}`;
        }
      });
    }
    return title;
  }

  private edit = (): void => {
    if (this.state.selectedItemDefinition) {
      this.state.selectedItemDefinition.then((definition: Fmt.Definition) => this.setState({
        editedDefinition: definition.clone()
      }));
    }
  }

  private submit = (): void => {
    let libraryDataProvider = this.state.selectedItemProvider;
    let path = this.state.selectedItemPath;
    if (this.state.editedDefinition && libraryDataProvider && path) {
      this.setState({
        selectedItemDefinition: CachedPromise.resolve(this.state.editedDefinition),
        editedDefinition: undefined,
        submitting: true
      });
      libraryDataProvider.submitLocalItem(path.name, this.state.editedDefinition)
        .then((appliedImmediately: boolean) => {
          this.setState({submitting: false});
          if (!appliedImmediately) {
            this.props.alert.info('Changes successfully submitted for review. You can continue to work with the changed version until the page is reloaded.');
          }
        })
        .catch((error) => {
          this.setState({submitting: false});
          this.props.alert.error('Error submitting changes: ' + error.message);
        });
      this.forceUpdate();
    }
  }

  private openLocally = (): void => {
    let libraryDataProvider = this.state.selectedItemProvider;
    let path = this.state.selectedItemPath;
    if (libraryDataProvider && path) {
      libraryDataProvider.openLocalItem(path.name)
        .catch((error) => {
          this.props.alert.error('Error opening file: ' + error.message);
        });
    }
  }

  private loginWithGitHub = (): void => {
    if (this.state.gitHubClientID) {
      let location = window.location;
      let baseURI = 'https://' + location.hostname + '/';
      location.href = GitHub.getGitHubLoginURI(this.state.gitHubClientID, baseURI, location.pathname);
    }
  }

  private logoutOfGitHub = (): void => {
    this.setState({
      gitHubAccessToken: undefined,
      gitHubUser: undefined
    });
  }
}

export default withAlert(App);
