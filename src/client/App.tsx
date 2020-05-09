import * as React from 'react';
import './App.css';
import SplitPane from 'react-split-pane';
import { withAlert, AlertManager } from 'react-alert';
import ScrollPane from './components/ScrollPane';
import StartPage from './extras/StartPage';
import { TutorialState, addTutorial } from './extras/Tutorial';
import { startTutorial } from './extras/TutorialContents';
import LibraryTree, { LibraryItemListEntry, LibraryItemList } from './components/LibraryTree';
import LibraryItem from './components/LibraryItem';
import SourceCodeView from './components/SourceCodeView';
import Button from './components/Button';
import MenuButton from './components/MenuButton';
import Message from './components/Message';
import InsertDialog from './components/InsertDialog';
import { LibraryItemInteractionHandler } from './components/InteractionHandler';
import renderPromise from './components/PromiseHelper';
import CachedPromise from '../shared/data/cachedPromise';
import * as Fmt from '../shared/format/format';
import * as FmtReader from '../shared/format/read';
import * as FmtDisplay from '../shared/display/meta';
import * as FmtLibrary from '../shared/logics/library';
import * as Dialog from '../shared/display/dialog';
import config from './utils/config';
import { ButtonType, getButtonIcon } from './utils/icons';
import * as Embedding from '../shared/data/embedding';
import { FileAccessor, WriteFileResult } from '../shared/data/fileAccessor';
import { WebFileAccessor, WebWriteFileResult } from './data/webFileAccessor';
import { GitHubFileAccessor, GitHubConfig, GitHubWriteFileResult } from './data/gitHubFileAccessor';
import { VSCodeExtensionFileAccessor } from './data/vscodeExtensionFileAccessor';
import * as GitHub from './data/gitHubAPIHandler';
import { LibraryDataProvider, LibraryDefinition, LibraryDefinitionState, LibraryItemInfo, LibraryDataProviderConfig } from '../shared/data/libraryDataProvider';
import { MRUList } from '../shared/data/mostRecentlyUsedList';
import * as Logic from '../shared/logics/logic';
import * as Logics from '../shared/logics/logics';

const Loading = require('react-loading-animation');

const libraries = require('../../data/libraries/libraries.json');

const librariesURIPrefix = 'libraries/';

const appName = 'Slate';
const selectedLibraryName = 'hlm';

interface AppProps {
  alert: AlertManager;
}

interface SelectionState {
  selectedItemRepository?: GitHub.Repository;
  selectedItemAbsolutePath?: Fmt.Path;
  selectedItemProvider?: LibraryDataProvider;
  selectedItemLocalPath?: Fmt.Path;
  selectedItemDefinition?: CachedPromise<LibraryDefinition>;
  selectedItemInfo?: CachedPromise<LibraryItemInfo>;
  interactionHandler?: LibraryItemInteractionHandler;
}

interface GitHubState {
  gitHubClientID?: string;
  gitHubUserInfo?: CachedPromise<GitHub.UserInfo>;
}

interface InsertDialogState {
  insertDialogLibraryDataProvider?: LibraryDataProvider;
  insertDialogSection?: LibraryDefinition;
  insertDialogDefinitionType?: Logic.LogicDefinitionTypeDescription;
}

interface AppState extends SelectionState, GitHubState, InsertDialogState {
  verticalLayout: boolean;
  navigationPaneVisible: boolean;
  extraContentsVisible: boolean;
  error?: string;
  templates?: Fmt.File;
  rootInteractionHandler?: LibraryItemInteractionHandler;
  editedDefinitions?: LibraryItemListEntry[];
  tutorialState?: TutorialState;
}

class App extends React.Component<AppProps, AppState> {
  private static readonly gitHubAccessTokenStorageIdentifier = 'github_access_token';

  private static readonly renderedDefinitionOptions: Logic.FullRenderedDefinitionOptions = {
    includeProofs: true,
    includeLabel: true,
    includeExtras: true,
    includeRemarks: true
  };

  private gitHubConfig?: GitHubConfig;
  private fileAccessor: FileAccessor;
  private logic: Logic.Logic;
  private libraryDataProvider: LibraryDataProvider;
  private mruList = new MRUList;

  constructor(props: AppProps) {
    super(props);

    let state: AppState = {
      verticalLayout: !config.embedded && window.innerHeight > window.innerWidth,
      navigationPaneVisible: true,
      extraContentsVisible: false
    };

    let canPreload = false;
    let selectionURI: string | undefined = undefined;
    let queryString: string | undefined = undefined;

    if (config.vsCodeAPI) {
      let fileAccessor = new VSCodeExtensionFileAccessor;
      window.onmessage = (event: MessageEvent) => {
        let message: Embedding.ResponseMessage = event.data;
        fileAccessor.messageReceived(message);
        this.processEmbeddingResponseMessage(message);
      };
      this.fileAccessor = fileAccessor;
      state.navigationPaneVisible = false;
    } else {
      let gitHubAPIAccess: CachedPromise<GitHub.APIAccess> | undefined = undefined;
      try {
        let gitHubAccessToken = window.localStorage.getItem(App.gitHubAccessTokenStorageIdentifier);
        if (gitHubAccessToken) {
          gitHubAPIAccess = CachedPromise.resolve(new GitHub.APIAccess(gitHubAccessToken));
        }
      } catch (error) {
        console.log(error);
      }

      selectionURI = window.location.pathname;
      queryString = window.location.search;

      if (queryString && !gitHubAPIAccess) {
        let gitHubQueryStringResult = GitHub.parseQueryString(queryString);
        if (gitHubQueryStringResult.path) {
          selectionURI = gitHubQueryStringResult.path;
        }
        if (gitHubQueryStringResult.token) {
          let apiAccessPromise = gitHubQueryStringResult.token.then((accessToken) => {
            try {
              window.localStorage.setItem(App.gitHubAccessTokenStorageIdentifier, accessToken);
            } catch (error) {
              console.log(error);
            }
            return new GitHub.APIAccess(accessToken);
          });
          gitHubAPIAccess = new CachedPromise<GitHub.APIAccess>(apiAccessPromise);
        }
      }

      if (config.runningLocally && !gitHubAPIAccess) {
        this.fileAccessor = new WebFileAccessor;
        canPreload = true;
      } else {
        this.initializeGitHubConfig(state, gitHubAPIAccess);
        // When running locally, preloading always returns local files. If the user has logged in to GitHub, we want to load from GitHub instead.
        // When not running locally, preloading is possible as long as there are no local modifications. (See GitHubFileAccessor.)
        canPreload = !config.runningLocally;
      }
    }

    this.logic = Logics.hlm;
    let selectedLibraryURI = librariesURIPrefix + selectedLibraryName;
    let libraryDataProviderConfig: LibraryDataProviderConfig = {
      canPreload: canPreload,
      watchForChanges: true,
      checkMarkdownCode: false,
      allowPlaceholders: config.embedded
    };
    this.libraryDataProvider = new LibraryDataProvider(this.logic, this.fileAccessor, selectedLibraryURI, libraryDataProviderConfig, 'Library');

    if (selectionURI) {
      this.updateSelectionState(state, selectionURI);
    }
    this.state = state;
    let title = this.getTitle(state);
    if (selectionURI && queryString) {
      window.history.pushState(null, title, selectionURI);
    }
    this.setDocumentTitle(state, title);
  }

  private updateSelectionState(state: SelectionState, uri: string): boolean {
    if (uri.startsWith('/')) {
      uri = uri.substring(1);
    }
    let path = this.libraryDataProvider.uriToPath(uri);
    if (path) {
      this.fillSelectionState(state, this.libraryDataProvider, path);
      return true;
    }
    return false;
  }

  private fillSelectionState(state: SelectionState, libraryDataProvider: LibraryDataProvider, path: Fmt.Path): void {
    state.selectedItemAbsolutePath = libraryDataProvider.getAbsolutePath(path);
    if (path.parentPath) {
      state.selectedItemProvider = this.libraryDataProvider.getProviderForSection(state.selectedItemAbsolutePath.parentPath);
      state.selectedItemLocalPath = state.selectedItemProvider.getRelativePath(state.selectedItemAbsolutePath);
    } else {
      // Optimization: path is already local.
      state.selectedItemProvider = libraryDataProvider;
      state.selectedItemLocalPath = path;
    }
    state.selectedItemDefinition = state.selectedItemProvider.fetchLocalItem(path.name, true);
    state.selectedItemInfo = state.selectedItemProvider.getLocalItemInfo(path.name);
  }

  private setNewInteractionHandler(state: SelectionState): void {
    state.interactionHandler = this.createInteractionHandler(state.selectedItemProvider, this.state.templates, state.selectedItemDefinition);
  }

  private createInteractionHandler(libraryDataProvider: LibraryDataProvider | undefined, templates: Fmt.File | undefined, selectedItemDefinition: CachedPromise<LibraryDefinition> | undefined): LibraryItemInteractionHandler | undefined {
    if (libraryDataProvider && selectedItemDefinition && templates) {
      return new LibraryItemInteractionHandler(libraryDataProvider, templates, selectedItemDefinition, this.linkClicked);
    } else {
      return undefined;
    }
  }

  componentDidMount(): void {
    if (!config.embedded) {
      window.onpopstate = () => {
        // Explicitly set members to undefined; otherwise the back button cannot be used to return to an empty selection.
        let state: SelectionState = {
          selectedItemAbsolutePath: undefined,
          selectedItemProvider: undefined,
          selectedItemLocalPath: undefined,
          selectedItemDefinition: undefined,
          selectedItemInfo: undefined,
          interactionHandler: undefined
        };
        this.updateSelectionState(state, window.location.pathname);
        this.setNewInteractionHandler(state);
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

      window.onbeforeunload = () => {
        if (this.state.editedDefinitions) {
          for (let editedDefinition of this.state.editedDefinitions) {
            if (editedDefinition.libraryDefinition.modified) {
              return 'Closing Slate will discard all unsubmitted edits. Are you sure?';
            }
          }
        }
        return null;
      };

      GitHub.getClientID()
        .then((clientID) => this.setState({gitHubClientID: clientID}))
        .catch(() => {});

      if (this.state.gitHubUserInfo) {
        this.state.gitHubUserInfo.catch((error) => {
          this.discardGitHubLogin();
          this.props.alert.error('GitHub login failed: ' + error.message);
        });
      }
    }

    let templateFile = this.fileAccessor.openFile('display/templates.slate', false);
    templateFile.read()
      .then((contents: string) => {
        let templates = FmtReader.readString(contents, templateFile.fileName, FmtDisplay.getMetaModel);
        this.setState({
          templates: templates,
          rootInteractionHandler: new LibraryItemInteractionHandler(this.libraryDataProvider, templates, undefined, this.linkClicked)
        });
        if (this.state.selectedItemProvider && this.state.selectedItemDefinition) {
          this.setState({interactionHandler: this.createInteractionHandler(this.state.selectedItemProvider, templates, this.state.selectedItemDefinition)});
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
    window.onbeforeunload = null;
    window.onmessage = null;
  }

  private initializeGitHubConfig(state: AppState, gitHubAPIAccess: CachedPromise<GitHub.APIAccess> | undefined): void {
    this.gitHubConfig = {
      targets: []
    };
    let repositories: GitHub.Repository[] = [];
    for (let libraryName of Object.keys(libraries)) {
      let repository = libraries[libraryName];
      this.gitHubConfig.targets.push({
        uriPrefix: librariesURIPrefix + libraryName,
        repository: repository
      });
      repositories.push(repository);
      if (libraryName === selectedLibraryName) {
        state.selectedItemRepository = repository;
      }
    }
    let gitHubConfigPromise: CachedPromise<GitHubConfig>;
    if (gitHubAPIAccess) {
      state.gitHubUserInfo = gitHubAPIAccess.then((apiAccess) => {
        this.gitHubConfig!.apiAccess = apiAccess;
        return apiAccess.getUserInfo(repositories);
      });
      gitHubConfigPromise = state.gitHubUserInfo
        .then(() => {
          let result: CachedPromise<void> = CachedPromise.resolve();
          if (this.gitHubConfig && this.gitHubConfig.apiAccess) {
            let apiAccess = this.gitHubConfig.apiAccess;
            for (let target of this.gitHubConfig.targets) {
              let repository = target.repository;
              if (repository.parentOwner && !repository.hasPullRequest) {
                result = result
                  .then(() => apiAccess.fastForward(repository, false))
                  .then(() => void (repository.pullRequestAllowed = true))
                  .catch(() => void (repository.hasLocalChanges = true));
              }
            }
          }
          return result;
        })
        .catch(() => {})
        .then(() => this.gitHubConfig!);
    } else {
      gitHubConfigPromise = CachedPromise.resolve(this.gitHubConfig);
    }
    this.fileAccessor = new GitHubFileAccessor(gitHubConfigPromise);
  }

  private discardGitHubLogin(): void {
    if (this.gitHubConfig) {
      this.gitHubConfig.apiAccess = undefined;
    }
    this.setState({gitHubUserInfo: undefined});
    try {
      window.localStorage.removeItem(App.gitHubAccessTokenStorageIdentifier);
    } catch (error) {
      console.log(error);
    }
  }

  private processEmbeddingResponseMessage(message: Embedding.ResponseMessage): void {
    switch (message.command) {
    case 'SELECT':
      let showNavigation = !(message.uri && this.navigateToURI(message.uri));
      if (this.state.navigationPaneVisible !== showNavigation) {
        this.setState({navigationPaneVisible: showNavigation});
      }
      break;
    case 'UPDATE':
      if (this.state.interactionHandler) {
        this.state.interactionHandler.expressionChanged(true, false);
      }
      this.forceUpdate();
      break;
    }
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return <div className={'error'}>Error: {this.state.error}</div>;
    }

    let windowSize = this.state.verticalLayout ? window.innerHeight : window.innerWidth;
    let defaultItemHeight = this.state.verticalLayout ? window.innerHeight / 3 : window.innerHeight / 2;

    let navigationPane: React.ReactNode = null;
    if (this.state.navigationPaneVisible) {
      let editListPane = <div className={'app-pane-placeholder'} key="edit-list"/>;
      if (this.state.editedDefinitions) {
        let editList: React.ReactNode;
        if (this.state.editedDefinitions.length) {
          editList = <LibraryItemList libraryDataProvider={this.libraryDataProvider} items={this.state.editedDefinitions} templates={this.state.templates} selectedItemPath={this.state.selectedItemAbsolutePath} interactionHandler={this.state.interactionHandler} onItemClicked={this.treeItemClicked}/>;
        } else {
          editList = (
            <div className={'empty-list'}>
              <Button toolTipText={'Close'} onClick={() => this.setState({editedDefinitions: undefined})}>
                {getButtonIcon(ButtonType.Close)}
              </Button>
            </div>
          );
        }
        editListPane = (
          <div className={'app-pane'} key="edit-list">
            {editList}
          </div>
        );
      }
      // TODO react to double-click in embedded mode by
      //      1. opening permanently in vscode
      //      2. hiding the navigation pane
      navigationPane = (
        <SplitPane split={'horizontal'} size={this.state.editedDefinitions ? undefined : 0} resizerStyle={this.state.editedDefinitions ? undefined : {'height': 0, 'margin': 0}} key="nav">
          {editListPane}
          <div className={'app-pane'} key="tree">
            <LibraryTree libraryDataProvider={this.libraryDataProvider} templates={this.state.templates} selectedItemPath={this.state.selectedItemAbsolutePath} interactionHandler={this.state.interactionHandler} onItemClicked={this.treeItemClicked} onInsertButtonClicked={this.insert}/>
          </div>
        </SplitPane>
      );
    }

    let mainContents: React.ReactNode = null;
    let extraContents: React.ReactNode = null;

    if (this.state.selectedItemProvider) {
      let definitionPromise = this.state.selectedItemDefinition;
      if (definitionPromise) {
        let mainContentsPromise = definitionPromise.then((definition: LibraryDefinition) => {
          if (this.state.selectedItemProvider && this.state.templates) {
            let editing = definition.state === LibraryDefinitionState.Editing || definition.state === LibraryDefinitionState.EditingNew;
            let itemInfo = this.state.selectedItemInfo;
            if (editing && this.state.selectedItemLocalPath) {
              // When editing, item info may change according to user input. Need to make sure to get the correct instance - the one where the changes happen.
              itemInfo = this.state.selectedItemProvider.getLocalItemInfo(this.state.selectedItemLocalPath.name);
            }
            let mainContentsResult: React.ReactNode = <LibraryItem libraryDataProvider={this.state.selectedItemProvider} definition={definition} templates={this.state.templates} itemInfo={itemInfo} options={App.renderedDefinitionOptions} interactionHandler={this.state.interactionHandler} mruList={this.mruList} key="library-item"/>;
            if (editing) {
              if (this.state.tutorialState) {
                mainContentsResult = [<Message type={'info'} key="message">You are currently in tutorial mode. No changes will be submitted. <Button className={'standalone'} onClick={this.endTutorial}>{getButtonIcon(ButtonType.Close)} Exit tutorial</Button></Message>, mainContentsResult];
              } else if (!this.state.gitHubUserInfo && !config.runningLocally) {
                mainContentsResult = [<Message type={'info'} key="message">You are currently contributing anonymously. By logging in with a <a href={'https://github.com/'}>GitHub</a> account, you can submit your contribution as a pull request instead.<br/>All contributed material is assumed to be in the public domain.</Message>, mainContentsResult];
              } else if (this.state.selectedItemRepository) {
                let repository = this.state.selectedItemRepository;
                if (!repository.hasWriteAccess) {
                  mainContentsResult = [<Message type={'info'} key="message">For your contribution, a personal fork of the <a href={GitHub.getRepositoryURL(repository)}>library repository</a> will be created on GitHub.<br/>All contributed material is assumed to be in the public domain.</Message>, mainContentsResult];
                } else if (repository.hasLocalChanges && !repository.hasPullRequest) {
                  mainContentsResult = [<Message type={'info'} key="message">Your <a href={GitHub.getRepositoryURL(repository)}>forked library repository</a> has local changes. No pull request will be created after editing.</Message>, mainContentsResult];
                }
              }
            }
            return mainContentsResult;
          } else {
            return null;
          }
        });
        mainContents = renderPromise(mainContentsPromise);

        if (!config.embedded) {
          if (this.state.extraContentsVisible) {
            let extraContentsPromise = definitionPromise.then((definition: LibraryDefinition) => {
              return <SourceCodeView libraryDataProvider={this.state.selectedItemProvider} definition={definition} templates={this.state.templates} options={App.renderedDefinitionOptions} interactionHandler={this.state.interactionHandler} mruList={this.mruList} key="source"/>;
            });
            extraContents = renderPromise(extraContentsPromise, 'source');
          } else {
            extraContents = <div key="source"/>;
          }
        }
      }
    } else {
      let localContent = config.embedded || (config.runningLocally && !this.state.gitHubUserInfo);
      if (!localContent) {
        mainContents = <StartPage isLoggedIn={this.state.gitHubUserInfo !== undefined} libraryDataProvider={this.libraryDataProvider} templates={this.state.templates} interactionHandler={this.state.rootInteractionHandler} onStartTutorial={this.startTutorial} onLinkClicked={this.linkClicked} key="start-page"/>;
        if (this.state.selectedItemRepository) {
          let repository = this.state.selectedItemRepository;
          if (repository.hasPullRequest) {
            mainContents = [<Message type={'info'} key="message">Your pull request has not been integrated yet. Therefore you may be seeing a slightly outdated version of the library. If necessary, you can manually merge upstream changes into your <a href={GitHub.getRepositoryURL(repository)}>personal fork</a> on GitHub.</Message>, mainContents];
          } else if (repository.hasLocalChanges) {
            mainContents = [<Message type={'info'} key="message">Your <a href={GitHub.getRepositoryURL(repository)}>forked library repository</a> has local changes but no pull request. It will not be updated automatically, and no pull request will be created after making further changes. To fix this, manually create a pull request or revert your local changes on GitHub.</Message>, mainContents];
          }
        }
      }
    }

    let leftButtons: React.ReactNode[] = [];
    if (config.embedded) {
      leftButtons.push(
        <Button toolTipText={'Table of Contents'} selected={this.state.navigationPaneVisible} onClick={() => this.setState((prevState) => ({navigationPaneVisible: !prevState.navigationPaneVisible}))} key="view-source">
          {getButtonIcon(ButtonType.TableOfContents)}
        </Button>
      );
    }
    if (this.state.gitHubUserInfo) {
      let loginInfoPromise = this.state.gitHubUserInfo.then((userInfo: GitHub.UserInfo) => {
        let userID: React.ReactNode[] = [];
        if (userInfo.avatarUrl) {
          userID.push(<img src={userInfo.avatarUrl} key="avatar"/>);
        }
        if (userInfo.login) {
          if (userID.length) {
            userID.push(' ');
          }
          userID.push(userInfo.login);
        }
        let userMenu: React.ReactNode[] = [
          (
            <Button toolTipText={'Log out (Warning: Does not sign out of GitHub.)'} isMenuItem={true} onClick={this.logOutOfGitHub} key="logout">
              {getButtonIcon(ButtonType.LogOut)}
            </Button>
          )
        ];
        return (
          <MenuButton menu={userMenu} menuOnTop={true} openOnHover={true} key="user-menu">
            {userID}
          </MenuButton>
        );
      });
      leftButtons.push(renderPromise(loginInfoPromise, 'user-info'));
    } else if (this.state.gitHubClientID) {
      leftButtons.push(
        <Button toolTipText={'Log in with GitHub'} onClick={this.logInWithGitHub} key="login">
          {getButtonIcon(ButtonType.LogIn)}
        </Button>
      );
    }

    let rightButtons: React.ReactNode[] = [];
    if (this.state.selectedItemDefinition) {
      let definition = this.state.selectedItemDefinition.getImmediateResult();
      if (definition && definition.state === LibraryDefinitionState.Submitting) {
        rightButtons.push(<div className={'submitting'} key="submitting"><Loading width={'1em'} height={'1em'}/></div>);
        rightButtons.push(' ');
      } else if (definition && (definition.state === LibraryDefinitionState.Editing || definition.state === LibraryDefinitionState.EditingNew)) {
        let willSubmit: boolean | undefined;
        let repository = this.state.selectedItemRepository;
        if (repository) {
          willSubmit = (repository.parentOwner && repository.pullRequestAllowed) || !repository.hasWriteAccess;
        } else {
          willSubmit = !config.runningLocally;
        }
        rightButtons.push(
          <Button toolTipText={willSubmit ? 'Submit' : 'Save'} onClick={this.submit} key="submit">
            {getButtonIcon(willSubmit ? ButtonType.Submit : ButtonType.Save)}
          </Button>
        );
        rightButtons.push(
          <Button toolTipText={'Cancel'} onClick={this.cancelEditing} key="cancel">
            {getButtonIcon(ButtonType.Cancel)}
          </Button>
        );
        rightButtons.push(' ');
      } else {
        let editButtonPromise = this.state.selectedItemDefinition.then(() => (
          <Button toolTipText={'Edit'} onClick={this.edit} key="edit">
            {getButtonIcon(ButtonType.Edit)}
          </Button>
        ));
        rightButtons.push(renderPromise(editButtonPromise, 'edit'));
        if (!config.embedded) {
          if (config.runningLocally) {
            rightButtons.push(
              <Button toolTipText={'Open in Visual Studio Code'} onClick={this.openLocally} key="open-locally">
                {getButtonIcon(ButtonType.OpenInVSCode)}
              </Button>
            );
          }
          if (this.fileAccessor instanceof GitHubFileAccessor) {
            rightButtons.push(
              <Button toolTipText={'View in GitHub'} onClick={this.openRemotely} key="view-in-github">
                {getButtonIcon(ButtonType.ViewInGitHub)}
              </Button>
            );
          }
        }
      }
    }
    if (extraContents) {
      rightButtons.push(
        <Button toolTipText={'View Source'} selected={this.state.extraContentsVisible} onClick={() => this.setState((prevState) => ({extraContentsVisible: !prevState.extraContentsVisible}))} key="view-source">
          {getButtonIcon(ButtonType.ViewSource)}
        </Button>
      );
    }

    let contentsPane = (
      <div className={'bottom-toolbar-container'} key="main-contents-with-toolbar">
        <div className={'app-pane'}>
          <ScrollPane object={this.state.selectedItemDefinition}>
            <div className={'app-contents'} key="main-contents">
              {mainContents}
            </div>
          </ScrollPane>
        </div>
        <div className={'bottom-toolbar'} key="toolbar">
          <div className={'left'}>
            {leftButtons}
          </div>
          <div className={'right'}>
            {rightButtons}
          </div>
        </div>
      </div>
    );
    if (extraContents && this.state.extraContentsVisible) {
      contentsPane = (
        <SplitPane split={'horizontal'} defaultSize={defaultItemHeight} key="contents">
          {contentsPane}
          <div className={'app-pane'}>
            <ScrollPane object={this.state.selectedItemDefinition}>
              <div className={'app-contents'} key="extra-contents">
                {extraContents}
              </div>
            </ScrollPane>
          </div>
        </SplitPane>
      );
    }

    let openDialog: React.ReactNode = null;
    if (this.state.insertDialogLibraryDataProvider) {
      let dialog = new Dialog.InsertDialog;
      dialog.definitionType = this.state.insertDialogDefinitionType;
      dialog.onCheckNameInUse = this.checkNameInUse;
      openDialog = (
        <InsertDialog dialog={dialog} onOK={this.finishInsert} onCancel={this.cancelInsert} key="insert-dialog"/>
      );
    }

    let result: React.ReactNode;
    if (navigationPane) {
      result = (
        <div className={'app'}>
          <SplitPane split={this.state.verticalLayout ? 'horizontal' : 'vertical'} minSize={windowSize / 5} maxSize={windowSize * 4 / 5} defaultSize={windowSize / 3} key="main">
            {navigationPane}
            {contentsPane}
          </SplitPane>
          {openDialog}
        </div>
      );
    } else {
      result = (
        <div className={'app'}>
          {contentsPane}
          {openDialog}
        </div>
      );
    }

    if (this.state.tutorialState) {
      result = addTutorial(result, this.state.tutorialState);
    }

    return result;
  }

  static getDerivedStateFromError(error: any) {
    return {
      error: error.message
    };
  }

  private navigateToURI(uri: string): boolean {
    let state: SelectionState = {};
    if (this.updateSelectionState(state, uri)) {
      this.navigate(state, false);
      return true;
    } else {
      return false;
    }
  }

  private treeItemClicked = (libraryDataProvider: LibraryDataProvider, path: Fmt.Path, definitionPromise: CachedPromise<LibraryDefinition>, itemInfo?: LibraryItemInfo): void => {
    let definition = definitionPromise.getImmediateResult();
    if (!definition || definition.state === LibraryDefinitionState.Preloaded) {
      definitionPromise = libraryDataProvider.fetchLocalItem(path.name, true);
    }
    this.navigate({
      selectedItemAbsolutePath: libraryDataProvider.getAbsolutePath(path),
      selectedItemProvider: libraryDataProvider,
      selectedItemLocalPath: path,
      selectedItemDefinition: definitionPromise,
      selectedItemInfo: itemInfo ? CachedPromise.resolve(itemInfo) : undefined
    });
  };

  private linkClicked = (libraryDataProvider: LibraryDataProvider, path: Fmt.Path): void => {
    let state: SelectionState = {};
    this.fillSelectionState(state, libraryDataProvider, path);
    this.navigate(state);
  };

  private navigate(state: SelectionState, notify: boolean = true): void {
    this.setNewInteractionHandler(state);
    this.setState(state);
    let uri = '/';
    if (state.selectedItemAbsolutePath) {
      if (state.selectedItemDefinition?.getImmediateResult()?.state !== LibraryDefinitionState.EditingNew) {
        this.mruList.add(state.selectedItemAbsolutePath);
      }
      uri = this.libraryDataProvider.pathToURI(state.selectedItemAbsolutePath);
    }
    let title = this.getTitle(state);
    if (notify) {
      if (config.embedded) {
        let libraryDataProvider = state.selectedItemProvider;
        let path = state.selectedItemLocalPath;
        if (libraryDataProvider && path) {
          libraryDataProvider.viewLocalItem(path.name, true)
            .catch(() => {});
        }
      } else {
        window.history.pushState(null, title, uri);
      }
    }
    this.setDocumentTitle(state, title);
  }

  private getTitle(state: SelectionState): string {
    let title = appName;
    if (state.selectedItemAbsolutePath) {
      title = `${appName}: ${state.selectedItemAbsolutePath.name}`;
    }
    return title;
  }

  private setDocumentTitle(state: SelectionState, title: string): void {
    this.setDocumentTitleInternal(title);
    if (state.selectedItemInfo) {
      state.selectedItemInfo.then((info: LibraryItemInfo) => {
        if (info.title) {
          this.setDocumentTitleInternal(`${appName}: ${info.title}`);
        }
      });
    }
  }

  private setDocumentTitleInternal(title: string): void {
    document.title = title;
    if (config.vsCodeAPI) {
      let message: Embedding.RequestMessage = {
        command: 'TITLE',
        text: title
      };
      config.vsCodeAPI.postMessage(message);
    }
  }

  private insert = (libraryDataProvider: LibraryDataProvider, section: LibraryDefinition, definitionType: Logic.LogicDefinitionTypeDescription | undefined): void => {
    this.setState({
      insertDialogLibraryDataProvider: libraryDataProvider,
      insertDialogSection: section,
      insertDialogDefinitionType: definitionType
    });
  };

  private finishInsert = (result: Dialog.InsertDialogResult): void => {
    let libraryDataProvider = this.state.insertDialogLibraryDataProvider;
    if (libraryDataProvider) {
      let definitionType = this.state.insertDialogDefinitionType;
      // TODO position
      if (definitionType) {
        libraryDataProvider.insertLocalItem(result.name, definitionType, result.title, undefined)
          .then((libraryDefinition: LibraryDefinition) => {
            let localPath = new Fmt.Path;
            localPath.name = result.name;
            let absolutePath = libraryDataProvider!.getAbsolutePath(localPath);
            let itemInfoPromise = libraryDataProvider!.getLocalItemInfo(result.name);
            this.navigate({
              selectedItemAbsolutePath: absolutePath,
              selectedItemProvider: libraryDataProvider,
              selectedItemLocalPath: localPath,
              selectedItemDefinition: CachedPromise.resolve(libraryDefinition),
              selectedItemInfo: itemInfoPromise
            });
            if (config.embedded) {
              this.setState({navigationPaneVisible: false});
            }
            return itemInfoPromise.then((itemInfo: LibraryItemInfo) => {
              let editedDefinition: LibraryItemListEntry = {
                libraryDataProvider: libraryDataProvider!,
                libraryDefinition: libraryDefinition,
                absolutePath: absolutePath,
                localPath: localPath,
                itemInfo: itemInfo
              };
              this.setState((prevState) => ({
                editedDefinitions: prevState.editedDefinitions ? prevState.editedDefinitions.concat(editedDefinition) : [editedDefinition]
              }));
              this.cancelInsert();
            });
          })
          .catch((error) => {
            this.props.alert.error(`Error adding ${definitionType!.name.toLowerCase()}: ` + error.message);
            this.forceUpdate();
          });
      } else {
        libraryDataProvider.insertLocalSubsection(result.name, result.title || '')
          .then(this.cancelInsert)
          .catch((error) => {
            this.props.alert.error('Error adding section: ' + error.message);
            this.forceUpdate();
          });
      }
    }
  };

  private cancelInsert = (): void => {
    this.setState({
      insertDialogLibraryDataProvider: undefined,
      insertDialogSection: undefined,
      insertDialogDefinitionType: undefined
    });
  };

  private checkNameInUse = (name: string): boolean => {
    if (this.state.insertDialogSection) {
      let nameLower = name.toLowerCase();
      let sectionContents = this.state.insertDialogSection.definition.contents as FmtLibrary.ObjectContents_Section;
      for (let item of sectionContents.items) {
        if ((item instanceof FmtLibrary.MetaRefExpression_item || item instanceof FmtLibrary.MetaRefExpression_subsection)
            && item.ref instanceof Fmt.DefinitionRefExpression
            && nameLower === item.ref.path.name.toLowerCase()) {
          return true;
        }
      }
    }
    return false;
  };

  private edit = (): void => {
    let libraryDataProvider = this.state.selectedItemProvider;
    let definitionPromise = this.state.selectedItemDefinition;
    let absolutePath = this.state.selectedItemAbsolutePath;
    let localPath = this.state.selectedItemLocalPath;
    let itemInfoPromise = this.state.selectedItemInfo;
    if (libraryDataProvider && definitionPromise && absolutePath && localPath && itemInfoPromise) {
      definitionPromise.then((definition: LibraryDefinition) => {
        itemInfoPromise!.then((itemInfo: LibraryItemInfo) => {
          let clonedDefinition = libraryDataProvider!.editLocalItem(definition, itemInfo);
          let clonedDefinitionPromise = CachedPromise.resolve(clonedDefinition);
          let editedDefinition: LibraryItemListEntry = {
            libraryDataProvider: libraryDataProvider!,
            libraryDefinition: clonedDefinition,
            absolutePath: absolutePath!,
            localPath: localPath!,
            itemInfo: itemInfo
          };
          this.setState((prevState) => ({
            selectedItemDefinition: clonedDefinitionPromise,
            interactionHandler: this.createInteractionHandler(libraryDataProvider!, this.state.templates, clonedDefinitionPromise),
            editedDefinitions: prevState.editedDefinitions ? prevState.editedDefinitions.concat(editedDefinition) : [editedDefinition]
          }));
        });
      });
    }
  };

  private submit = (): void => {
    let libraryDataProvider = this.state.selectedItemProvider;
    let definitionPromise = this.state.selectedItemDefinition;
    if (libraryDataProvider && definitionPromise) {
      let definition = definitionPromise.getImmediateResult();
      if (definition) {
        if (this.state.tutorialState) {
          this.removeEditedDefinition(definition);
          libraryDataProvider.replaceLocalItem(definition);
        } else {
          libraryDataProvider.submitLocalItem(definition)
            .then((writeFileResult: WriteFileResult) => {
              this.removeEditedDefinition(definition!);
              if (writeFileResult instanceof GitHubWriteFileResult) {
                if (writeFileResult.pullRequestState !== undefined) {
                  let action = writeFileResult.pullRequestState === GitHub.PullRequestState.Updated ? 'updated' : 'created';
                  this.props.alert.info(`GitHub pull request ${action} successfully.`);
                }
              } else if (writeFileResult instanceof WebWriteFileResult) {
                if (!writeFileResult.writtenDirectly) {
                  this.props.alert.info('Changes successfully submitted for review. You can continue to work with the changed version as long as the application remains open.');
                }
              }
            })
            .catch((error) => {
              this.props.alert.error('Error submitting changes: ' + error.message);
              this.forceUpdate();
            });
        }
        this.forceUpdate();
      }
    }
  };

  private cancelEditing = (): void => {
    let libraryDataProvider = this.state.selectedItemProvider;
    let definitionPromise = this.state.selectedItemDefinition;
    if (libraryDataProvider && definitionPromise) {
      let definition = definitionPromise.getImmediateResult();
      if (definition) {
        libraryDataProvider.cancelEditing(definition);
        this.removeEditedDefinition(definition);
        if (definition.state === LibraryDefinitionState.EditingNew) {
          this.navigate({
            selectedItemAbsolutePath: undefined,
            selectedItemProvider: libraryDataProvider,
            selectedItemLocalPath: undefined,
            selectedItemDefinition: undefined,
            selectedItemInfo: undefined,
            interactionHandler: undefined
          });
        } else {
          let oldDefinition = libraryDataProvider.fetchLocalItem(definition!.definition.name, true);
          this.setState({selectedItemDefinition: oldDefinition});
        }
      }
    }
  };

  private removeEditedDefinition(definition: LibraryDefinition): void {
    this.setState((prevState) => {
      if (prevState.editedDefinitions) {
        let index = prevState.editedDefinitions.findIndex((entry: LibraryItemListEntry) => (entry.libraryDefinition === definition));
        if (index >= 0) {
          return {
            editedDefinitions: prevState.editedDefinitions.slice(0, index).concat(prevState.editedDefinitions.slice(index + 1))
          };
        }
      }
      return {};
    });
  }

  private openLocally = (): void => {
    this.viewFile(true);
  };

  private openRemotely = (): void => {
    this.viewFile(false);
  };

  private viewFile(openLocally: boolean): void {
    let libraryDataProvider = this.state.selectedItemProvider;
    let path = this.state.selectedItemLocalPath;
    if (libraryDataProvider && path) {
      libraryDataProvider.viewLocalItem(path.name, openLocally)
        .catch((error) => {
          this.props.alert.error('Error opening file: ' + error.message);
        });
    }
  }

  private logInWithGitHub = (): void => {
    if (this.state.gitHubClientID) {
      let location = window.location;
      let protocol = location.protocol;
      let host = location.host;
      if (location.hostname !== 'localhost') {
        protocol = 'https:';
        host = location.hostname;
      }
      let baseURL = protocol + '//' + host + '/';
      location.href = GitHub.getLoginURL(this.state.gitHubClientID, baseURL, location.pathname);
    }
  };

  private logOutOfGitHub = (): void => {
    this.discardGitHubLogin();
    window.location.reload();
  };

  private startTutorial = (withTouchWarning: boolean): void => {
    let onChangeTutorialState = (newTutorialState: TutorialState | undefined) => this.setState({tutorialState: newTutorialState});
    startTutorial(onChangeTutorialState, withTouchWarning);
  };

  private endTutorial = (): void => {
    this.setState({tutorialState: undefined});
  };
}

export default withAlert()(App);
