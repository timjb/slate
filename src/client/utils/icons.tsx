import * as Logic from '../../shared/logics/logic';
import { LibraryItemInfo } from '../../shared/data/libraryDataAccessor';
import * as React from 'react';

export enum ButtonType {
  OK,
  Submit,
  Cancel,
  Edit,
  OpenLocally,
  ViewSource
}

export function getButtonIcon(buttonType: ButtonType, enabled: boolean = true): any {
  switch (buttonType) {
  case ButtonType.OK:
    return <span className="ok">✓</span>;
  case ButtonType.Submit:
    return <span className="submit">⌲</span>;
  case ButtonType.Cancel:
    return <span className="cancel">✗</span>;
  case ButtonType.Edit:
    return (
      <svg height="1em" width="1.5em" viewBox="-8 -8 16 16">
        <path d="M -7 7 L -6 4 L 5 -7 L 7 -5 L -4 6 z" fill={enabled ? 'red' : 'none'} stroke={enabled ? 'black' : 'gray'} strokeWidth="1"/>
        <path d="M -6 4 L -4 6" stroke={enabled ? 'black' : 'gray'} strokeWidth="1"/>
      </svg>
    );
  case ButtonType.OpenLocally:
    return (
      <svg height="1em" width="1.5em" viewBox="0 0 260 260">
        <path d="M 195.47461 -0.005859375 L 195.47461 223.29688 L 0.49609375 194.33789 L 195.47461 259.99219 L 260.47461 232.95312 L 260.47461 31.064453 L 260.49609 31.054688 L 260.47461 31.011719 L 260.47461 27.035156 L 195.47461 -0.005859375 z" fill={enabled ? '#007acc' : 'gray'}/>
        <path d="M 127.24219 38.037109 L 67.521484 97.070312 L 31.566406 69.992188 L 16.748047 74.941406 L 53.328125 111.10156 L 16.748047 147.25977 L 31.566406 152.21094 L 67.521484 125.13086 L 67.523438 125.13086 L 127.24023 184.16016 L 163.00781 168.96289 L 163.00781 53.234375 L 127.24219 38.037109 z M 127.24023 80.158203 L 127.24023 142.03711 L 86.154297 111.09766 L 127.24023 80.158203 z" fill={enabled ? '#007acc' : 'gray'}/>
      </svg>
    );
  case ButtonType.ViewSource:
    return '{⋯}';
  default:
    return null;
  }
}

export function getDefinitionIcon(definitionType: Logic.LogicDefinitionType, itemInfo: LibraryItemInfo): any {
  switch (definitionType) {
  case Logic.LogicDefinitionType.Construction:
    return (
      <svg height="1em" width="1em" viewBox="-8 -8 16 16">
        <circle cx="0" cy="0" r="7" fill="green" stroke="black" strokeWidth="1"/>
        <rect x="-4" y="-4" width="8" height="8" fill="red" stroke="black" strokeWidth="1"/>
      </svg>
    );
  case Logic.LogicDefinitionType.SetOperator:
    return (
      <svg height="1em" width="1em" viewBox="-8 -8 16 16">
        <circle cx="0" cy="0" r="7" fill="green" stroke="black" strokeWidth="1"/>
      </svg>
    );
  case Logic.LogicDefinitionType.Operator:
  case Logic.LogicDefinitionType.Constructor:
    return (
      <svg height="1em" width="1em" viewBox="-8 -8 16 16">
        <rect x="-4" y="-4" width="8" height="8" fill="red" stroke="black" strokeWidth="1"/>
      </svg>
    );
  case Logic.LogicDefinitionType.Predicate:
    return (
      <svg height="1em" width="1em" viewBox="-8 -8 16 16">
        <rect x="-5" y="-5" width="10" height="10" fill="blue" stroke="black" strokeWidth="1" transform="rotate(45)"/>
      </svg>
    );
  case Logic.LogicDefinitionType.Theorem:
    let viewBox = '-8 -8 16 16';
    if (itemInfo.type === 'lemma' || itemInfo.type === 'corollary' || itemInfo.type === 'example') {
      viewBox = '-10 -10 20 20';
    }
    let contents = [
      <circle cx="0" cy="-2" r="5" fill="yellow" stroke="black" strokeWidth="1" key="circle"/>,
      <rect x="-2" y="3" width="4" height="4" fill="gray" stroke="black" strokeWidth="1" key="rect"/>
    ];
    if (itemInfo.type === 'theorem') {
      contents.unshift(<line x1="-7" y1="-6" x2="7" y2="2" stroke="gray" strokeWidth="1" key="line1"/>);
      contents.unshift(<line x1="-8" y1="-2" x2="8" y2="-2" stroke="gray" strokeWidth="1" key="line2"/>);
      contents.unshift(<line x1="-7" y1="2" x2="7" y2="-6" stroke="gray" strokeWidth="1" key="line3"/>);
    }
    return (
      <svg height="1em" width="1em" viewBox={viewBox}>
        {contents}
      </svg>
    );
  default:
    return null;
  }
}
