import * as React from 'react';
import './ExpressionMenu.css';
import * as Display from '../../shared/display/display';
import * as Menu from '../../shared/display/menu';
import Expression from './Expression';

interface ExpressionMenuProps {
  menu: Menu.ExpressionMenu;
  onItemClicked: (action: Menu.ExpressionMenuAction) => void;
}

interface ExpressionMenuState {
  openSubMenu?: Menu.ExpressionMenuRow;
}

class ExpressionMenu extends React.Component<ExpressionMenuProps, ExpressionMenuState> {
  constructor(props: ExpressionMenuProps) {
    super(props);
    this.state = {};
  }

  render(): any {
    let rows = [];
    let index = 0;
    let separated = false;
    for (let row of this.props.menu.rows) {
      if (row instanceof Menu.ExpressionMenuSeparator) {
        if (index) {
          separated = true;
        }
      } else {
        let onEnter = (openSubMenu: boolean = false) => this.setState({openSubMenu: openSubMenu ? row : undefined});
        let subMenuOpen = (this.state.openSubMenu === row);
        rows.push(<ExpressionMenuRow row={row} separated={separated} key={index++} onItemClicked={this.props.onItemClicked} onEnter={onEnter} subMenuOpen={subMenuOpen}/>);
        separated = false;
      }
    }
    // TODO adjust position to fit in window
    return (
      <div className={'open-menu'}>
        <table className={'open-menu-table'} onMouseDown={(event) => event.stopPropagation()}>
          <tbody>
            {rows}
          </tbody>
        </table>
      </div>
    );
  }
}

interface ExpressionMenuRowProps {
  row: Menu.ExpressionMenuRow;
  separated: boolean;
  onItemClicked: (action: Menu.ExpressionMenuAction) => void;
  onEnter?: (openSubMenu?: boolean) => void;
  onLeave?: () => void;
  subMenuOpen: boolean;
}

interface ExpressionMenuRowState {
  titleHovered: boolean;
  contentsHovered: boolean;
}

interface ExpressionMenuInputRefHolder {
  inputRef?: HTMLElement;
}

class ExpressionMenuRow extends React.Component<ExpressionMenuRowProps, ExpressionMenuRowState> {
  inputRefHolder: ExpressionMenuInputRefHolder = {};

  constructor(props: ExpressionMenuRowProps) {
    super(props);

    this.state = {
      titleHovered: false,
      contentsHovered: false
    };
  }

  render(): any {
    let cells: any = undefined;
    let row = this.props.row;
    if (row instanceof Menu.ExpressionMenuItem) {
      cells = <ExpressionMenuItem item={row} colSpan={2} onItemClicked={this.props.onItemClicked} onEnter={this.props.onEnter} onLeave={this.props.onLeave} hoveredExternally={false}/>;
    } else if (row instanceof Menu.ExpressionMenuItemList) {
      cells = row.items.map((item: Menu.ExpressionMenuItem, index: number) => <ExpressionMenuItem item={item} key={index} onItemClicked={this.props.onItemClicked} onEnter={this.props.onEnter} onLeave={this.props.onLeave} hoveredExternally={false}/>);
    } else if (row instanceof Menu.StandardExpressionMenuRow) {
      let contentCell = undefined;
      let onClick = undefined;
      let subMenuMainRow: Menu.ExpressionMenuRow | undefined = undefined;
      if (row.subMenu instanceof Menu.ExpressionMenu && row.subMenu.rows.length) {
        subMenuMainRow = row.subMenu.rows[0];
        for (let subMenuRow of row.subMenu.rows) {
          if (subMenuRow.selected) {
            subMenuMainRow = subMenuRow;
            break;
          }
        }
      } else if (row.subMenu instanceof Menu.ExpressionMenuRow) {
        subMenuMainRow = row.subMenu;
      }
      if (subMenuMainRow) {
        let itemHovered = this.state.titleHovered && !row.titleAction;
        let onEnter = () => {
          this.setState({contentsHovered: true});
          if (this.props.onEnter) {
            this.props.onEnter(false);
          }
        };
        let onLeave = () => {
          this.setState({contentsHovered: false});
          if (this.props.onLeave) {
            this.props.onLeave();
          }
        };
        if (subMenuMainRow instanceof Menu.ExpressionMenuItem) {
          contentCell = <ExpressionMenuItem item={subMenuMainRow} key={'content'} onItemClicked={this.props.onItemClicked} onEnter={onEnter} onLeave={onLeave} hoveredExternally={itemHovered}/>;
        } else if (subMenuMainRow instanceof Menu.ExpressionMenuTextInput) {
          contentCell = <ExpressionMenuTextInput item={subMenuMainRow} key={'content'} onItemClicked={this.props.onItemClicked} onEnter={onEnter} onLeave={onLeave} hoveredExternally={itemHovered} inputRefHolder={this.inputRefHolder}/>;
          onClick = () => {
            let input = this.inputRefHolder.inputRef;
            if (input) {
              input.focus();
            }
          };
        } else {
          // TODO (low priority) support submenus in content cell
          contentCell = (
            <td className={'open-menu-content-cell'} key={'content'}>
              <table className={'open-menu-content-cell-table'}>
                <tbody>
                  <ExpressionMenuRow row={subMenuMainRow} separated={false} onItemClicked={this.props.onItemClicked} onEnter={onEnter} onLeave={onLeave} subMenuOpen={false}/>
                </tbody>
              </table>
            </td>
          );
        }
      }
      let title: any = row.title;
      if (title instanceof Display.RenderedExpression) {
        title = <Expression expression={title} key={'title'}/>;
      }
      let titleCellClassName = 'open-menu-title-cell';
      let titleAction: Menu.ExpressionMenuAction | undefined = undefined;
      if (row.titleAction) {
        titleAction = row.titleAction;
      } else if (subMenuMainRow instanceof Menu.ExpressionMenuItem) {
        titleAction = subMenuMainRow.action;
      }
      if (titleAction) {
        titleCellClassName += ' clickable';
        onClick = () => this.props.onItemClicked(titleAction!);
        if (titleAction instanceof Menu.DialogExpressionMenuAction) {
          title = [title, '...'];
        }
      }
      if (this.state.titleHovered || this.state.contentsHovered || this.props.subMenuOpen) {
        titleCellClassName += ' hover';
      }
      if (row.selected) {
        titleCellClassName += ' selected';
      }
      let hasSubMenu = false;
      if (row.subMenu instanceof Menu.ExpressionMenu && row.subMenu.rows.length > 1) {
        hasSubMenu = true;
        let arrow = (
          <span key={'arrow'}>&nbsp;&nbsp;&nbsp;&nbsp;<span className={'open-menu-arrow'}>&nbsp;▶&nbsp;</span></span>
        );
        if (this.props.subMenuOpen) {
          let subMenu = (
            <div className={'open-menu-wrapper'} key={'subMenu'}>
              <ExpressionMenu menu={row.subMenu} onItemClicked={this.props.onItemClicked}/>
            </div>
          );
          title = [title, arrow, subMenu];
        } else {
          title = [title, arrow];
        }
      }
      let onMouseEnter = () => {
        this.setState({titleHovered: true});
        if (this.props.onEnter) {
          this.props.onEnter(hasSubMenu);
        }
      };
      let onMouseLeave = () => {
        this.setState({titleHovered: false});
        if (this.props.onLeave) {
          this.props.onLeave();
        }
      };
      cells = <th className={titleCellClassName} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onMouseUp={onClick} key={'title'}>{title}</th>;
      if (contentCell) {
        cells = [cells, contentCell];
      }
    } else if (row instanceof Menu.ExpressionMenuTextInput) {
      cells = <ExpressionMenuTextInput item={row} colSpan={2} onItemClicked={this.props.onItemClicked} hoveredExternally={false} inputRefHolder={this.inputRefHolder}/>;
    }
    let className = 'open-menu-row';
    if (this.props.separated) {
      className += ' separated';
    }
    return (
      <tr className={className}>
        {cells}
      </tr>
    );
  }
}

interface ExpressionMenuItemProps {
  item: Menu.ExpressionMenuItem;
  colSpan?: number;
  onItemClicked: (action: Menu.ExpressionMenuAction) => void;
  onEnter?: () => void;
  onLeave?: () => void;
  hoveredExternally: boolean;
}

interface ExpressionMenuItemState {
  hovered: boolean;
}

class ExpressionMenuItem extends React.Component<ExpressionMenuItemProps, ExpressionMenuItemState> {
  constructor(props: ExpressionMenuItemProps) {
    super(props);

    this.state = {
      hovered: false
    };
  }

  render(): any {
    let className = 'open-menu-item clickable';
    if (this.state.hovered || this.props.hoveredExternally) {
      className += ' hover';
    }
    if (this.props.item.selected) {
      className += ' selected';
    }
    let onMouseEnter = () => {
      this.setState({hovered: true});
      if (this.props.onEnter) {
        this.props.onEnter();
      }
    };
    let onMouseLeave = () => {
      this.setState({hovered: false});
      if (this.props.onLeave) {
        this.props.onLeave();
      }
    };
    let onClick = () => this.props.onItemClicked(this.props.item.action);
    return (
      <td colSpan={this.props.colSpan} className={className} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onMouseUp={onClick}>
        <Expression expression={this.props.item.expression} tooltipPosition={'right'}/>
      </td>
    );
  }
}

interface ExpressionMenuTextInputProps {
  item: Menu.ExpressionMenuTextInput;
  colSpan?: number;
  onItemClicked: (action: Menu.ExpressionMenuAction) => void;
  onEnter?: () => void;
  onLeave?: () => void;
  hoveredExternally: boolean;
  inputRefHolder: ExpressionMenuInputRefHolder;
}

interface ExpressionMenuTextInputState {
  hovered: boolean;
  editing: boolean;
  text: string;
}

class ExpressionMenuTextInput extends React.Component<ExpressionMenuTextInputProps, ExpressionMenuTextInputState> {
  constructor(props: ExpressionMenuTextInputProps) {
    super(props);

    this.state = {
      hovered: false,
      editing: false,
      text: props.item.text
    };
  }

  componentWillReceiveProps(props: ExpressionMenuTextInputProps) {
    if (props.item !== this.props.item) {
      this.setState({text: props.item.text});
    }
  }

  render(): any {
    let className = 'open-menu-item';
    if (this.state.hovered || this.state.editing || this.props.hoveredExternally) {
      className += ' hover';
    }
    if (this.props.item.selected) {
      className += ' selected';
    }
    let onChange = (event: React.ChangeEvent<HTMLInputElement>) => this.setState({text: event.target.value});
    let onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
      this.props.item.text = this.state.text;
      this.props.onItemClicked(this.props.item.action);
      event.preventDefault();
    };
    let onMouseEnter = () => {
      this.setState({hovered: true});
      if (this.props.onEnter) {
        this.props.onEnter();
      }
    };
    let onMouseLeave = () => {
      this.setState({hovered: false});
      if (this.props.onLeave && !this.state.editing) {
        this.props.onLeave();
      }
    };
    let onFocus = () => {
      this.setState({editing: true});
      if (this.props.onEnter) {
        this.props.onEnter();
      }
    };
    let onBlur = () => {
      this.setState({editing: false});
      if (this.props.onLeave && !this.state.hovered) {
        this.props.onLeave();
      }
    };
    let onClick = () => {
      let input = this.props.inputRefHolder.inputRef;
      if (input) {
        input.focus();
      }
    };
    return (
      <td colSpan={this.props.colSpan} className={className} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onMouseUp={onClick}>
        <form onSubmit={onSubmit}>
          <input type={'text'} value={this.state.text} size={4} onChange={onChange} onFocus={onFocus} onBlur={onBlur} ref={(element: HTMLInputElement) => (this.props.inputRefHolder.inputRef = element)}/>
        </form>
      </td>
    );
  }
}

export default ExpressionMenu;
