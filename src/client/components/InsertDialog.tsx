import * as React from 'react';

import StandardDialog from './StandardDialog';
import ValidationMessage from './ValidationMessage';
import { SectionItemList } from './LibraryTree';

import * as Dialog from '../../shared/notation/dialog';
import * as Logic from '../../shared/logics/logic';


export interface InsertDialogProps {
  dialog: Dialog.InsertDialog;
  onOK: (result: Dialog.InsertDialogResult) => void;
  onCancel: () => void;
}

export interface InsertDialogState {
  okEnabled: boolean;
  name: string;
  nameError?: Error;
  title: string;
  titleError?: Error;
  position?: number;
}

class InsertDialog extends React.Component<InsertDialogProps, InsertDialogState> {
  private nameInputNode: HTMLInputElement | null = null;
  private focusTimer: any;

  constructor(props: InsertDialogProps) {
    super(props);

    this.state = {
      okEnabled: false,
      name: '',
      title: ''
    };
  }

  componentDidMount(): void {
    // Work around a bug in react-responsive-modal (I think) which breaks the autoFocus attribute on (our?) inputs.
    if (this.nameInputNode) {
      let focusNode = () => {
        this.nameInputNode?.focus();
      };
      this.focusTimer = setTimeout(focusNode, 100);
    }
  }

  componentWillUnmount(): void {
    if (this.focusTimer) {
      clearTimeout(this.focusTimer);
    }
  }

  render(): React.ReactNode {
    let definitionType = this.props.dialog.definitionType;
    let titleRow: React.ReactNode = null;
    if (!definitionType) {
      let titleClassName = this.state.titleError ? 'input-error' : undefined;
      titleRow = (
        <tr className={'dialog-row separated-below'}>
          <td className={'dialog-cell'}>Title:</td>
          <td className={'dialog-cell'}>
            <ValidationMessage error={this.state.titleError}>
              <input type={'text'} className={titleClassName} value={this.state.title} onChange={this.onChangeTitle} key="title"/>
            </ValidationMessage>
          </td>
        </tr>
      );
    }
    let nameClassName = this.state.nameError ? 'input-error' : undefined;
    let nameRow = (
      <tr className={'dialog-row separated-above' + (titleRow ? '' : ' dialog-row separated-below')}>
        <td className={'dialog-cell'}>Name:</td>
        <td className={'dialog-cell'}>
          <ValidationMessage error={this.state.nameError}>
            <input type={'text'} className={nameClassName} value={this.state.name} onChange={this.onChangeName} onBlur={this.onBlurName} autoFocus={true} ref={(node) => (this.nameInputNode = node)} key="name"/>
          </ValidationMessage>
        </td>
      </tr>
    );
    let positionRow: React.ReactNode = null;
    if (this.props.dialog.section) {
      let title = this.state.title || this.state.name;
      positionRow = (
        <tr className={'dialog-row separated-above separated-below'}>
          <td className={'dialog-cell dialog-position-list-cell'} colSpan={2}>
            <SectionItemList libraryDataProvider={this.props.dialog.libraryDataProvider} section={this.props.dialog.section} sectionItemNumber={this.props.dialog.sectionItemNumber!} templates={this.props.dialog.templates} positionSelectionMode={true} newItemType={this.props.dialog.definitionType} newItemTitle={title} newItemPosition={this.state.position} onChangeNewItemPosition={(newPosition) => this.setState({position: newPosition})}/>
          </td>
        </tr>
      );
    }
    return (
      <StandardDialog onOK={this.onOK} onCancel={this.props.onCancel} okVisible={true} okEnabled={this.state.okEnabled}>
        <table className={'dialog-contents'}>
          <tbody>
            {nameRow}
            {titleRow}
            {positionRow}
          </tbody>
        </table>
      </StandardDialog>
    );
  }

  private onChangeName = (event: React.ChangeEvent<HTMLInputElement>): void => {
    let newName = event.target.value;
    let nameError = this.checkName(newName);
    this.setState((prevState) => ({
      name: newName,
      nameError: nameError,
      okEnabled: !(nameError || this.checkTitle(prevState.title))
    }));
  };

  private onBlurName = (event: React.ChangeEvent<HTMLInputElement>): void => {
    let newName = event.target.value;
    if (newName && !this.props.dialog.definitionType && !this.state.title) {
      let titleError = this.checkTitle(newName);
      this.setState((prevState) => ({
        title: newName,
        titleError: titleError,
        okEnabled: !(prevState.nameError || titleError)
      }));
    }
  };

  private onChangeTitle = (event: React.ChangeEvent<HTMLInputElement>): void => {
    let newTitle = event.target.value;
    let titleError = this.checkTitle(newTitle);
    this.setState((prevState) => ({
      title: newTitle,
      titleError: titleError,
      okEnabled: !(prevState.nameError || titleError)
    }));
  };

  private checkName(name: string): Error | undefined {
    if (!name) {
      return new Error('Name is required');
    }
    for (let c of name) {
      if (!((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c === ' ' || c === '-' || c === '(' || c === ')')) {
        return new Error('Name can only contain alphanumeric characters, spaces, dashes, and parentheses');
      }
    }
    let firstChar = name[0];
    let definitionType = this.props.dialog.definitionType;
    if (definitionType && (definitionType.definitionType === Logic.LogicDefinitionType.Constructor || definitionType.definitionType === Logic.LogicDefinitionType.Operator || definitionType.definitionType === Logic.LogicDefinitionType.Predicate)) {
      if (!(firstChar >= 'a' && firstChar <= 'z')) {
        return new Error(`${this.getDefinitionTypeName()} name must start with a lowercase letter`);
      }
    } else {
      if (!(firstChar >= 'A' && firstChar <= 'Z')) {
        return new Error(`${this.getDefinitionTypeName()} name must start with an uppercase letter`);
      }
    }
    if (this.props.dialog.onCheckNameInUse(name)) {
      return new Error('An object with this name already exists');
    }
    return undefined;
  }

  private checkTitle(title: string): Error | undefined {
    title = InsertDialog.trimString(title);
    if (!this.props.dialog.definitionType && !title) {
      return new Error('Title is required');
    }
    return undefined;
  }

  private static trimString(s: string): string {
    while (s.startsWith(' ')) {
      s = s.substring(1);
    }
    while (s.endsWith(' ')) {
      s = s.substring(0, s.length - 1);
    }
    return s;
  }

  private getDefinitionTypeName(): string {
    let definitionType = this.props.dialog.definitionType;
    if (definitionType) {
      let name = definitionType.name.toLowerCase();
      return name[0].toUpperCase() + name.substring(1);
    } else {
      return 'Section';
    }
  }

  private onOK = (): void => {
    let title = InsertDialog.trimString(this.state.title);
    let result: Dialog.InsertDialogResult = {
      name: InsertDialog.trimString(this.state.name),
      title: title || undefined,
      position: this.state.position
    };
    this.props.onOK(result);
  };
}

export default InsertDialog;
