/**
 * @fileoverview A single grid row, representing a single task.
 */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import '@lit-labs/virtualizer';
import './editors';
import './gantt-item';

import * as d3 from 'd3';
import {css, html, LitElement, nothing, svg} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';

import type {Editable, EditableDate, EditableEst} from './editors';
import type {Graph} from './graph';
import {NPPercentile} from './np';
import {fireOps, OpEventDetail, PatchEventDetail} from './op';
import {Task} from './task';
import {assertIsDefined} from './util';
import {displayDotX, RADIUS, YSKIP} from './view-constants';
import {SignalWatcher} from './watcher';

const STAR = (d3.symbol as any)(d3.symbolStar).size(40)();

// NOTE: The HTML shrinker eats the 'px' suffix if you specify it outside the
// format string placeholder. But typescript complains if you assign a string
// to the height style
const YSKIP3 = css`
  ${YSKIP * 3}px
`;

@customElement('task-row') export class TaskRow extends SignalWatcher
(LitElement) {
  static override styles = css`
    div {
      overflow: hidden;
      white-space: nowrap;
    }
    div.selected.active {
      height: ${YSKIP3};
    }
    svg {
      display: block;
    }
    .selected {
      background-color: #dcecff;
    }
    .selected.active {
      background-color: #b8d9ff;
    }
    div * {
      align-content: center;
    }
    circle {
      fill: white;
      stroke: black;
      stroke-width: 1px;
    }
    .node-path {
      stroke: black;
      stroke-width: 1px;
      fill: none;
    }
    .star {
      fill: black;
      stroke: white;
      stroke-width: 1px;
    }
    .add-icon {
      opacity: 0.25;
      cursor:
        url(https://static.corp.google.com/tasksight-team/codicons/edit.svg) 0 16,
        cell;
    }
    .add-icon:hover {
      opacity: 1;
    }
  `;

  @property() task?: Task;
  get _task(): Task {
    assertIsDefined(this.task);
    return this.task;
  }
  get height(): number {
    if (this.active) return YSKIP * 3;
    return YSKIP;
  }
  get radius(): number {
    if (this.active) return RADIUS * 2;
    return RADIUS;
  }

  @property() headers: {[key: string]: {width: number}} = {};
  @property() active: boolean = false;
  @property() selected: boolean = false;
  @property() dateFormat: 'abs' | 'rel' = 'abs';
  @property() minDate: Date = new Date();
  @property() maxDate: Date = new Date();

  width(kind: string): number {
    if (this.headers) {
      return this.headers[kind]?.width || 0;
    }
    return 0;
  }
  override render() {
    const startDateP = this._task.startDateP();
    const endDateP = this._task.endDateP();
    const columns = `${this.headers['circles'].width}px
            ${this.headers['status'].width}px
            ${this.headers['name'].width}px
            ${this.headers['cal_est'].width}px
            ${this.headers['eng_est'].width}px
            ${this.headers['start'].width}px
            ${this.headers['end'].width}px
            ${this.headers['gantt'].width}px`;
    return html`
      <div
        @click=${this.handleClick}
        class=${classMap({
      active: this.active,
      selected: this.selected
    })}
        style="display: grid; grid-template-columns:${columns};">
        ${this.renderSvg()} ${this.renderStatus()}
        <editable-text
          id="name"
          .text=${this._task.name()}
          @patch=${this.handleNameChanged}
          @tab=${() => this.edit('est')}></editable-text>
        <editable-est
          id="est"
          .estimate=${this._task.calEstimate()}
          @patch=${this.handleCalEstChanged}
          @tab=${() => this.edit('eng_est')}>
        </editable-est>
        <editable-est
          id="eng_est"
          .estimate=${this._task.engEstimate()}
          @patch=${this.handleEngEstChanged}
          @tab=${() => this.edit('start')}>
        </editable-est>
        <editable-date
          id="start"
          .dateActual=${this._task.started()}
          .dateFormat=${this.dateFormat}
          .dateCalculated=${this._task.startDateP()}
          @patch=${this.handleStartChanged}
          @tab=${() => this.edit('end')}>
        </editable-date>
        <editable-date
          id="end"
          .dateActual=${this._task.finished()}
          .dateFormat=${this.dateFormat}
          .dateCalculated=${this._task.endDateP()}
          @patch=${this.handleEndChanged}>
        </editable-date>
        <gantt-item
          .minStart=${
        startDateP.type === 'percentile' ? startDateP.lb : new Date()}
          .start=${
        startDateP.type === 'percentile' ? startDateP.med : new Date()}
          .end=${endDateP.type === 'percentile' ? endDateP.med : new Date()}
          .maxEnd=${endDateP.type === 'percentile' ? endDateP.ub : new Date()}
          .rangeMin=${this.minDate}
          .rangeMax=${this.maxDate}
          .width=${this.headers['gantt'].width}>
        </gantt-item>
      </div>
    `;
  }

  edit(field_name: string) {
    /* NOTE: This is called before the children are rendered. */
    this.updateComplete.then(() => {
      let e = this.renderRoot.querySelector('#' + field_name) as Editable;
      e._startEditing();
    });
  }
  handleClick(e: MouseEvent) {
    // the original click event needs to propagate because the editors need to
    // hide themselves when a click occurs outside them. Stopping propagation
    // would silence that event.
    this.dispatchEvent(
      new CustomEvent('select', {
        detail: {
          toggle: e.ctrlKey || e.metaKey,
          range: e.shiftKey,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }
  handleNameChanged(e: CustomEvent) {
    e.stopPropagation();
    fireOps(this, 'edit-name', [() => {
              this._task.name.set(e.detail.text);
            }]);
  }
  fireCalculateDates() {
    this.dispatchEvent(
      new CustomEvent('calculate-dates', {bubbles: true, composed: true}),
    );
  }
  handleCalEstChanged(e: CustomEvent<PatchEventDetail>) {
    e.stopPropagation();
    fireOps(this, 'edit-cal-est', [() => {
              this._task.calEstimate.set(e.detail.estimate);
              this.updateComplete.then(() => {
                this.fireCalculateDates();
              });
            }]);
  }
  handleEngEstChanged(e: CustomEvent<PatchEventDetail>) {
    e.stopPropagation();
    fireOps(this, 'edit-eng-est', [() => {
              this._task.engEstimate.set(e.detail.estimate);
              this.updateComplete.then(() => {
                this.fireCalculateDates();
              });
            }]);
  }
  handleStartChanged(e: CustomEvent<PatchEventDetail>) {
    e.stopPropagation();
    fireOps(this, 'edit-start', [() => {
              this._task.started.set(e.detail.date);
              this.updateComplete.then(() => {
                this.fireCalculateDates();
              });
            }]);
  }
  handleEndChanged(e: CustomEvent<PatchEventDetail>) {
    e.stopPropagation();
    fireOps(this, 'edit-end', [() => {
              this._task.finished.set(e.detail.date);
              this.updateComplete.then(() => {
                this.fireCalculateDates();
              });
            }]);
  }
  renderSvg() {
    const w = this.width('circles');
    return html`
      <svg width=${w} height=${this.height} viewBox="0 0 ${w} ${this.height}">
        ${this.renderPaths()} ${this.renderNodeIcon()}
      </svg>
    `;
  }
  addNodeIcon(
    x: number,
    y: number,
    hotkey: string,
    callback: (e: MouseEvent) => void,
  ) {
    const arm = this.radius - 2;
    const arm2 = arm * 2 - 4;
    return svg`<g transform="translate(${x} ${y})" class=add-icon
                @click=${callback}>
        <circle cx=0 cy=0 r=${this.radius}
                  stroke-dasharray="2 2">
          <title>Click to add a node here or press ${hotkey}</title>
        </circle>
        <path d="M0 ${-arm} V ${arm2} M${-arm} 0 H ${arm2}"
              fill=none stroke=black></path>
      </g>`;
  }
  addAbove(e: MouseEvent) {
    e.stopPropagation(); // otherwise the grid will re-select the current item.
    this.fireCreateTask({before: true, branch: false});
  }
  addBelow(e: MouseEvent) {
    e.stopPropagation(); // otherwise the grid will re-select the current item.
    this.fireCreateTask({before: false, branch: false});
  }
  fireCreateTask(detail: any) {
    this.dispatchEvent(
      new CustomEvent('create-task', {detail, bubbles: true, composed: true}),
    );
  }
  renderNodeIcon() {
    const mid = Math.round(this.height / 2);
    const x = displayDotX(this._task.dotx());
    const circles = [];
    if (this.active) {
      circles.push(
        this.addNodeIcon(x, mid - YSKIP, 'Ctrl-Shift-Enter', this.addAbove),
      );
      circles.push(
        this.addNodeIcon(x, mid + this.radius * 2, 'Ctrl-Enter', this.addBelow),
      );
    }
    if (this._task.type() == 'task') {
      circles.push(
        svg`<circle class=node-icon
                    cx=${x}
                    cy=${mid - this.radius}
                    r=${this.radius}></circle>`,
      );
    } else {
      circles.push(
        svg`<g transform="translate(${x}, ${mid - 4})">
              <path class=star d=${STAR}></path>
            </g>`,
      );
    }
    return circles;
  }
  renderPaths() {
    return this._task.visible_paths.map(
      ([s, e]) => svg`<path class=node-path d=${this.path(s, e)}></path>`,
    );
  }
  path(p0: Task, p1: Task) {
    // p0 is assumed to have a lower y position than p1
    const mid = Math.round(this.height / 2);
    const p0y = p0 === this._task ? mid : 0;
    const p1y = p1 === this._task ? mid : this.height;
    const p1x = displayDotX(p1.dotx());
    const p0x = p0 == this._task ? displayDotX(p0.dotx()) : p1x;

    if (p0x == p1x) {
      return `M ${p0x} ${p0y} V ${p1y}`;
    } else {
      const dy = this.active ? YSKIP : 0;
      const curve = Math.round((YSKIP / 2 - RADIUS) / 2);
      const xcurve = p1x > p0x ? curve : -curve;
      const tsweep = p1x > p0x ? 0 : 1;
      // XXX: when selected, we need vertical space before `a`.
      return (
        `M ${p0x} ${p0y} ` +
        `v ${dy} ` +
        `a ${xcurve} ${curve} 0 0 ${tsweep}     ${xcurve} ${curve}` +
        `H ${p1x - xcurve}` +
        `a ${xcurve} ${curve} 0 0 ${1 - tsweep} ${xcurve} ${curve}` +
        `V ${p1y}`
      );
    }
  }
  renderStatus() {
    return html` <svg
      width=${YSKIP}
      height=${this.height}
      viewBox="0 0 ${YSKIP} ${this.height}"
      @click=${this.handleClickStatus}>
      <use y=${this.active ? YSKIP : 0} href="https://static.corp.google.com/tasksight-team/icons.svg#${this.statusIcon()}">
        <title>${this.statusTitle()}</title>
      </use>
    </svg>`;
  }
  handleClickStatus() {
    this._task?.toggleStatus(new Date());
    this.requestUpdate();
    this.updateComplete.then(() => {
      this.fireCalculateDates();
    });
  }
  statusIcon() {
    if (this._task.finished()) {
      return 'finished';
    }  // finished
    if (this._task.started()) {
      return 'started';
    }  // in progress
    if ([...this._task.edges()].every((p) => p.finished() !== null)) {
      return 'ready'; // startable
    }
    return 'blocked'; // blocked
  }

  statusTitle() {
    if (this._task.finished()) {
      return 'Finished';
    }  // finished
    if (this._task.started()) {
      return 'Started, click to finish';
    }  // in progress
    if ([...this._task.edges()].every((p) => p.finished() !== null)) {
      return 'Unblocked, click to start'; // startable
    }
    return 'Blocked, click to start anyway'; // blocked
  }
}
