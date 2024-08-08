/**
 * @fileoverview Renders a single task in the gantt chart.
 */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {styleMap} from 'lit/directives/style-map.js';

@customElement('gantt-item')
export class GanttItem extends LitElement {
  static override styles = css`
    .gantt-item {
      height: 1em;
      position: relative;
    }
    .gantt-item-outer,
    .gantt-item-inner {
      top: 0;
      height: 1em;
      position: absolute;
      border-radius: 0.5em;
    }
    .gantt-item-outer {
      background-color: rgb(0, 0, 0, 0.08);
    }
    .gantt-item-inner {
      background-color: rgb(55, 115, 196);
    }
  `;

  @property({type: Date}) minStart = new Date();
  @property({type: Date}) start = new Date();
  @property({type: Date}) end = new Date();
  @property({type: Date}) maxEnd = new Date();
  @property({type: Date}) rangeMin = new Date();
  @property({type: Date}) rangeMax = new Date();
  @property({type: Number}) width = 1000;

  override render() {
    let outerLeft = this.scale(this.minStart);
    let outerRight = this.scale(this.maxEnd);
    let innerLeft = this.scale(this.start);
    let innerRight = this.scale(this.end);
    const frameStyles = {
      width: `${this.width}px`,
    };
    const outerStyles = {
      left: `${outerLeft}px`,
      width: `${outerRight - outerLeft}px`,
    };
    const innerStyles = {
      left: `${innerLeft}px`,
      width: `${innerRight - innerLeft}px`,
    };

    // TODO: Vary background depending on the month
    // TODO: Show current date as a line
    // TODO: Show exact times in a tooltip

    return html`
      <div class="gantt-item" style="${styleMap(frameStyles)}">
        <div class="gantt-item-outer" style="${styleMap(outerStyles)}"></div>
        <div class="gantt-item-inner" style="${styleMap(innerStyles)}"></div>
      </div>
    `;
  }

  scale(date: Date): number {
    return (
      ((date.getTime() - this.rangeMin.getTime()) /
        (this.rangeMax.getTime() - this.rangeMin.getTime())) *
      this.width
    );
  }
}
