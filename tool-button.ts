/**
 * @fileoverview Toolbar buttons.
 */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {LitElement, css, html, nothing} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';

@customElement('tool-button')
export class ToolButton extends LitElement {
  @property() codicon?: string;
  @property() override title: string = '';
  @state() state: boolean = false;
  @property() tooltip?: string;
  @property() type?: string;
  @property() inactiveTooltip?: string;
  @property() activeTooltip?: string;
  @property() enabled?: boolean;
  constructor() {
    super();
    this.enabled = true;
  }
  static override styles = css`
    div {
      display: inline-block;
      user-select: none;
      cursor: default;
      border-radius: 5px;
      margin: 2px;
      padding-inline: 6px;
      padding-block: 2px;
    }
    div:hover {
      background-color: rgba(68, 71, 70, 0.08);
    }
    div:active {
      background-color: rgba(68, 71, 70, 0.25);
    }
    div.disabled,
    div.disabled:hover,
    div.disabled:active {
      background-color: inherit;
      color: rgba(68, 71, 70, 0.18);
    }
    .disabled img {
      opacity: 25%;
    }
    div.selected {
      background-color: rgba(68, 71, 70, 0.15);
    }
    div.selected:hover {
      background-color: rgba(68, 71, 70, 0.25);
    }
    div.selected:active {
      background-color: rgba(68, 71, 70, 0.35);
    }
  `;
  override render() {
    let classes: {[key: string]: boolean} = {
      selected: this.type == 'toggle' && this.state,
      disabled: this.type == 'action' && !this.enabled,
    };
    return html`
      <div class="${classMap(classes)}"
           title=${this.get_tooltip()}
           @click=${this.onClick}>
        <img src=../node_modules/@vscode/codicons/src/icons/${this.codicon}.svg>
      </div>
    `;
  }
  get_tooltip(): string {
    if (this.tooltip) return this.tooltip;
    return (this.state ? this.activeTooltip : this.inactiveTooltip) || '';
  }
  onClick(e: Event) {
    e.stopPropagation();
    if (!this.enabled) return;
    if (this.type == 'toggle') {
      this.state = !this.state;
      this.dispatchEvent(new Event('change'));
    }
    this.dispatchEvent(new Event('click'));
  }
}
