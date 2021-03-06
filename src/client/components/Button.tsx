import * as React from 'react';

import './Button.css';

import { eventHandled } from '../utils/event';


// TODO should we use an HTML button element for this?

const clickDelay = 500;

export interface ButtonProps {
  className?: string;
  toolTipText?: string;
  enabled?: boolean;
  selected?: boolean;
  isMenuItem?: boolean;
  onClick?: (wasTouched: boolean) => void;
}

export interface ButtonState {
  pressed: boolean;
}

class Button extends React.Component<ButtonProps, ButtonState> {
  private ready = false;

  constructor(props: ButtonProps) {
    super(props);
    this.state = {
      pressed: false
    };
  }

  componentDidMount(): void {
    this.ready = false;
    setTimeout(() => (this.ready = true), clickDelay);
  }

  render(): React.ReactNode {
    let className = 'button';
    if (this.props.className) {
      className += ' ' + this.props.className;
    }
    let onClick = undefined;
    let onMouseDown = undefined;
    let onMouseUp = undefined;
    let onMouseLeave = undefined;
    let onTouchStart = undefined;
    let onTouchEnd = undefined;
    let onTouchCancel = undefined;
    if (this.props.enabled === undefined || this.props.enabled) {
      className += ' hoverable';
      if (this.props.onClick) {
        let propsOnClick = this.props.onClick;
        onClick = (event: React.SyntheticEvent<HTMLElement>) => {
          eventHandled(event);
          if (this.ready && !this.props.isMenuItem) {
            propsOnClick(false);
          }
        };
      }
      onMouseDown = (event: React.SyntheticEvent<HTMLElement>) => {
        eventHandled(event);
        this.setState({pressed: true});
        this.ready = true;
      };
      onMouseUp = (event: React.SyntheticEvent<HTMLElement>) => {
        if (this.props.isMenuItem && this.ready && this.props.onClick) {
          this.props.onClick(false);
          event.preventDefault();
        } else {
          eventHandled(event);
        }
        this.setState({pressed: false});
      };
      onMouseLeave = (event: React.SyntheticEvent<HTMLElement>) => {
        this.setState({pressed: false});
      };
      onTouchStart = onMouseDown;
      onTouchEnd = (event: React.SyntheticEvent<HTMLElement>) => {
        if (this.props.isMenuItem) {
          event.preventDefault();
        } else {
          eventHandled(event);
        }
        if (this.ready && this.props.onClick) {
          this.props.onClick(true);
        }
      };
      onTouchCancel = (event: React.SyntheticEvent<HTMLElement>) => {
        eventHandled(event);
        this.setState({pressed: false});
      };
    } else {
      className += ' disabled';
    }
    if (this.state.pressed) {
      className += ' pressed';
    }
    if (this.props.selected) {
      className += ' selected';
    }
    return (
      <div className={className} title={this.props.toolTipText} onClick={onClick} onMouseDown={onMouseDown} onMouseUp={onMouseUp} onMouseLeave={onMouseLeave} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={onTouchCancel}>
        {this.props.children}
      </div>
    );
  }
}

export default Button;
