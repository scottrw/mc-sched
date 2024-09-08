/**
 * @fileoverview Owns the grid, details, and toolbar
 */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {LitElement, css, html, nothing} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import type {Calendar} from './dates';
import './details-panel';
import type {DetailsPanel} from './details-panel';
import type {Graph} from './graph';
import './task-grid';
import type {TaskGrid} from './task-grid';
import './tool-button';
import type {ToolButton} from './tool-button';
import {assertIsDefined} from './util';
import {ViewOptions, fireViewOptionsChanged} from './view-options';

@customElement('dag-view')
export class DagView extends LitElement {
  @property() detailsVisible: boolean = false;
  @property() selectedTasks: number = 0;

  @property() viewOptions?: ViewOptions;
  @property() graph?: Graph;
  get g(): Graph {
    assertIsDefined(this.graph);
    return this.graph;
  }
  @property() calendar?: Calendar;
  static override styles = css`
    html {
      font-family:
        Google Sans,
        Roboto,
        Arial,
        sans-serif;
    }
    svg text,
    svg input {
      cursor: default;
      user-select: none;
      font-family:
        Roboto,
        Google Sans,
        Arial,
        sans-serif;
      font-size: 14px;
      dominant-baseline: central;
    }
    #container {
      display: grid;
      min-height: 0;
      grid-template-rows: min-content auto;
      grid-template-columns: auto 15px 0px;
      grid-template-areas:
        'toolbar toolbar toolbar'
        'content grabber details';
    }
    #task-grid {
      grid-area: content;
      overflow: scroll;
    }
    #container.details-open {
      grid-template-columns: auto 15px 200px;
    }
    #grabber {
      grid-area: grabber;
      display: grid;
      align-items: center;
      border-left: 1px solid #e3e3e3;
      border-top: 1px solid #e3e3e3;
    }
    #grabber:hover {
      background-color: rgba(68, 71, 70, 0.08);
    }
    #details {
      grid-area: details;
      display: none;
      border-top: 1px solid #e3e3e3;
      border-left: 1px solid #e3e3e3;
      padding: 5px;
    }
    .details-open #details {
      display: block;
    }
    #toolbar-wrapper {
      background-color: #edf2fa;
      border-radius: 10px;
      margin: 3px;
      padding: 3px;
      user-select: none;
      font-size: 16px;
      grid-area: toolbar;
    }
    #toolbar-wrapper input {
      font-size: 16px;
    }
    #toolbar-wrapper div {
      display: inline-block;
      user-select: none;
      cursor: default;
    }
    #toolbar-wrapper .divider {
      background: rgba(68, 71, 70, 0.5);
      border-radius: 0px;
      margin: 6px;
      width: 1px;
    }
    #toolbar-wrapper .icon {
      margin: 6px;
      padding-block: 2px;
    }
    #toolbar-wrapper input {
      outline: none;
      border: none;
      border-radius: 6px;
      margin: 6px;
      margin-left: 0px;
      padding-inline: 6px;
      padding-block: 2px;
      width: 160px;
    }
    tool-button {
      display: inline-block;
    }
  `;
  override render() {
    return html`
      <div
        id="container"
        class=${classMap({'details-open': this.detailsVisible})}
        @calculate-dates=${this.calculateDates}>
        <div id="toolbar-wrapper"> ${this.renderTools()} </div>
        <task-grid
          .graph=${this.g}
          id="task-grid"
          .viewOptions=${this.viewOptions}
          @selection-changed=${this.handleSelectionChanged}></task-grid>
        <div
          id="grabber"
          @click=${() => (this.detailsVisible = !this.detailsVisible)}>
          ${this.detailsVisible ? '>' : '<'}
        </div>
        <details-panel
          id="details"
          .graph=${this.g}
          .calendar=${this.calendar}
          visible=${this.detailsVisible}
          class=${classMap({'details-open': this.detailsVisible})}>
        </details-panel>
      </div>
    `;
  }
  override firstUpdated() {
    this.calculateDates();
  }
  calculateDates() {
    setTimeout(() => this.g.calculateDates(this.calendar!), 0);
  }
  renderTools() {
    const divider = html`<div class="divider">&nbsp;</div>`;
    const o = this.viewOptions!;
    return html` <div class="icon">
        <svg width="18" height="18" viewBox="0 0 18 18">
          <line
            x1="40%"
            y1="40%"
            x2="18"
            y2="18"
            stroke="black"
            stroke-width="2"></line>
          <circle
            cx="45%"
            cy="45%"
            r="30%"
            fill="white"
            stroke="black"
            stroke-width="2"></circle>
        </svg>
      </div>
      <input
        type="search"
        @keyup=${this.updateSearchFilter}
        @change=${this.updateSearchFilter}
        @input=${this.updateSearchFilter}
        placeholder="Search tasks" />
      ${divider}
      <tool-button
        codicon="check-all"
        .state=${o.showFinished}
        type="toggle"
        activeTooltip="Hide finished tasks"
        inactiveTooltip="Show finished tasks"
        @change=${this.toggleFinished}></tool-button>
      <tool-button
        codicon="close-all"
        .state=${o.showBlocked}
        type="toggle"
        activeTooltip="Hide blocked tasks"
        inactiveTooltip="Show blocked tasks"
        @change=${this.toggleShowBlocked}></tool-button>
      <tool-button
        codicon="star-full"
        type="toggle"
        .state=${o.showOnlyMilestones}
        activeTooltip="Show all tasks"
        inactiveTooltip="Show only milestones"
        @change=${this.toggleShowOnlyMilestones}></tool-button>
      ${divider}
      <tool-button
        codicon="table"
        type="toggle"
        state=${o.dateFormat === 'abs'}
        activeTooltip="Show relative dates"
        inactiveTooltip="Show absolute dates"
        @change=${this.toggleDateFormat}>
      </tool-button>
      ${divider}
      <tool-button
        codicon="trash"
        type="action"
        .enabled=${this.selectedTasks > 0}
        tooltip="Delete selected tasks, leaving a hole"
        @click=${() => this.taskGrid.del({healEdges: false})}></tool-button>
      ${divider}
      <tool-button
        codicon="git-pull-request-create"
        type="action"
        .enabled=${this.selectedTasks > 1}
        tooltip="Add dependencies between selected tasks"
        @click=${() => this.taskGrid.addDeps()}></tool-button>
      <tool-button
        codicon="git-pull-request-closed"
        type="action"
        .enabled=${this.selectedTasks > 1}
        tooltip="Remove dependencies between selected tasks"
        @click=${() => this.taskGrid.removeDeps()}></tool-button>`;
  }
  toggleFinished(e: CustomEvent) {
    const toolbutton = e.target! as ToolButton;
    this.viewOptions = {...this.viewOptions!, showFinished: toolbutton.state};
    fireViewOptionsChanged(this, this.viewOptions);
  }
  toggleShowBlocked(e: CustomEvent) {
    const toolbutton = e.target! as ToolButton;
    this.viewOptions = {...this.viewOptions!, showBlocked: toolbutton.state};
    fireViewOptionsChanged(this, this.viewOptions);
  }
  toggleShowOnlyMilestones(e: CustomEvent) {
    const toolbutton = e.target! as ToolButton;
    this.viewOptions = {
      ...this.viewOptions!,
      showOnlyMilestones: toolbutton.state,
    };
    fireViewOptionsChanged(this, this.viewOptions);
  }
  toggleDateFormat(e: CustomEvent) {
    const toolbutton = e.target! as ToolButton;
    this.viewOptions = {
      ...this.viewOptions!,
      dateFormat: toolbutton.state ? 'abs' : 'rel',
    };
    fireViewOptionsChanged(this, this.viewOptions);
  }
  filterTimer?: number;
  updateSearchFilter(e: CustomEvent) {
    const target = e.target! as HTMLInputElement;
    if (this.filterTimer) clearTimeout(this.filterTimer);
    this.filterTimer = window.setTimeout(() => {
      this.viewOptions = {...this.viewOptions!, searchFilter: target.value};
      fireViewOptionsChanged(this, this.viewOptions);
    }, 100);
  }
  get taskGrid() {
    // TODO: createRef instead
    return this.renderRoot.querySelector('#task-grid')! as TaskGrid;
  }
  get details() {
    return this.renderRoot.querySelector('#details')! as DetailsPanel;
  }
  handleSelectionChanged(e: CustomEvent) {
    this.selectedTasks = Math.min(2, this.taskGrid.selectedTasks.size);
    // TODO: just make this a reactive property instead.
    this.details.activeTask = (e.target as TaskGrid).activeTask;
  }
}
