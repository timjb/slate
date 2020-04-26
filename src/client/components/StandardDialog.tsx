import * as React from 'react';
import 'react-responsive-modal/styles.css';
import './StandardDialog.css';
import Modal from 'react-responsive-modal';
import Button from './Button';
import { getButtonIcon, ButtonType } from '../utils/icons';

interface StandardDialogProps {
  onOK: () => void;
  onCancel: () => void;
  okVisible: boolean;
  okEnabled: boolean;
}

const modalClassNames = {
  modal: 'dialog',
  overlay: 'dialog-overlay'
};

function StandardDialog(props: React.PropsWithChildren<StandardDialogProps>): React.ReactElement {
  let onOK = (event: React.FormEvent<HTMLFormElement>) => {
    if (props.okEnabled) {
      props.onOK();
    }
    event.stopPropagation();
    event.preventDefault();
  };
  let buttons: React.ReactNodeArray;
  if (props.okVisible) {
    buttons = [
      (
        <Button toolTipText={'OK'} onClick={props.onOK} enabled={props.okEnabled} key="ok">
          {getButtonIcon(ButtonType.OK, props.okEnabled)}
        </Button>
      ),
      (
        <Button toolTipText={'Cancel'} onClick={props.onCancel} key="cancel">
          {getButtonIcon(ButtonType.Cancel)}
        </Button>
      )
    ];
  } else {
    buttons = [
      (
        <Button toolTipText={'Close'} onClick={props.onCancel} key="close">
          {getButtonIcon(ButtonType.Close)}
        </Button>
      )
    ];
  }
  return (
    <Modal open={true} onClose={props.onCancel} showCloseIcon={false} classNames={modalClassNames} animationDuration={0} key="dialog">
      <form onSubmit={onOK}>
        {props.children}
        <div className={'dialog-button-row'} key="buttons">
          {buttons}
        </div>
        <input type="submit" value="OK" style={{'display': 'none'}} key="submit"/>
      </form>
    </Modal>
  );
}

export default StandardDialog;
