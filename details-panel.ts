/**
 * @fileoverview Details panel with completion date statistics.
 */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as d3 from 'd3';
import {LitElement, css, html, nothing} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {DateObserver} from './date-observer';
import type {Calendar} from './dates';
import {Graph} from './graph';
import * as np from './np';
import {Task} from './task';

@customElement('details-panel')
export class DetailsPanel extends LitElement {
  @property() activeTask?: Task;
  @property() visible: boolean = false;
  @property() graph?: Graph;
  @property() calendar?: Calendar;

  get g() {
    return this.graph!;
  }

  dateObserver = new DateObserver(this);

  override render() {
    if (!this.visible) return nothing;
    if (!this.activeTask) return html`No task selected`;
    const d = this.activeTask.endDates;
    if (d.type == 'error') {
      return html`<div id="completion-date-error">${d.message}</div>`;
    }
    if (d.type == 'scalar') {
      return html`
        <div id="completion-date-finished">
          Finished<br />
          ${this.calendar!.date(d.scalar)}
        </div>
      `;
    }

    let s0 = [...d.array];
    s0.sort(np.byValue);
    const s: Date[] = s0.map((d) => this.calendar!.date(d));
    const ptiles = [50, 500, 950].map((i) => s[i]);
    const x = d3
      .scaleTime()
      .domain(d3.extent(s) as [Date, Date])
      .range([0, 150]);
    const y = d3.scaleLinear().domain([0, s.length]).range([150, 0]);
    // TODO(williasr): the d3 typings are broken.
    type Line<T> = {
      x(cb: (t: T, idx: number) => number): Line<T>;
      y(cb: (t: T, idx: number) => number): Line<T>;
      (s: T[]): Line<T>;
    };
    const graphLine = d3.line() as unknown as Line<Date>;
    const graphPath = graphLine.x((d) => x(d)).y((d, i) => y(i))(s);
    //
    this.updateComplete.then(() => {
      const axisBottom = this.shadowRoot?.querySelector(
        '#axisBottom',
      ) as SVGGElement;
      const axisLeft = this.shadowRoot?.querySelector(
        '#axisLeft',
      ) as SVGGElement;
      if (axisBottom && axisLeft) {
        d3.select(axisBottom)
          .call(
            d3
              .axisBottom(x)
              .ticks(3)
              .tickValues(ptiles)
              // .tickFormat(d3.timeFormat('%b %d'))
              .tickSize(-150),
          )
          .selectAll('text')
          .style('text-anchor', 'end')
          .attr('dx', '-.8em')
          .attr('dy', '.15em')
          .attr('transform', 'rotate(-65)')
          .style('font-size', '10px');
        d3.select(axisLeft)
          .call(
            d3.axisLeft(y).tickValues([50, 500, 950]).tickSize(-150),
            // .tickFormat((d: number) => (d / 10).toFixed(0) + '%')
          )
          .selectAll('text')
          .style('font-size', '10px');
      }
    });
    return html` <div class="details-header">Completion date</div>
      <svg id="completion-date" width="200" height="200" viewBox="0 0 200 200">
        <g transform="translate(25, 2)">
          <g id="axisBottom" transform="translate(0, 150)"></g>
          <g id="axisLeft"></g>
          <path
            fill="none"
            stroke="steelblue"
            stroke-width="1.5"
            d=${graphPath}></path>
        </g>
      </svg>`;
  }
}
