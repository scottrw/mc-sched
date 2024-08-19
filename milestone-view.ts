/**
 * @fileoverview Shows milestones on a timeline view.
 */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as d3 from 'd3';
import {LitElement, css, html, nothing, svg} from 'lit';
import {TemplateResult} from 'lit-html';
import {customElement, property, state} from 'lit/decorators.js';
import {DateObserver} from './date-observer';
import type {Graph} from './graph';
import {NPPercentile, NPPercentileOrError} from './np';
import {Task} from './task';
import {assertIsDefined} from './util';
import {FONTSIZE, PAD} from './view-constants';

type DateMap = (date: Date) => number;

/* Keep labels, whiskers, and error bars from colliding.
 *
 * Working from right to left, assign a vertical lane to each so that it doesn't
 * overlap any that come to the right of it. */
class LaneAssignment {
  // Lanes are constructed right-to-left, highest X-coordinate first.
  // Somehow it just looks better. So lanes[i] is the lowest used
  // X-coordinate in lane i.
  lanes: number[] = [];
  ys: number;
  sep: number;
  constructor(ys: number, sep: number) {
    this.ys = ys;
    this.sep = sep;
  }
  // We're looking for the first lane with space at <end>.
  queryLane(start: number, end: number) {
    const idx = this.lanes.findIndex((l) => end < l);
    if (idx >= 0) return idx;
    return this.lanes.length;
  }
  // We're looking for the first lane with space at <end>.
  getLane(start: number, end: number) {
    const idx = this.lanes.findIndex((l) => end < l);
    if (idx >= 0) {
      this.lanes[idx] = start;
      return idx;
    }
    this.lanes.push(start);
    return this.lanes.length - 1;
  }
  getY(start: number, end: number) {
    return Math.floor(this.ys + this.sep * this.getLane(start, end));
  }
}

@customElement('milestone-view')
export class MilestoneView extends LitElement {
  height = 1024;
  barH = 30;
  halfBarH = Math.floor(this.barH / 2);
  timelineY = Math.floor(this.height / 3);
  width = 1024;
  margin = 20;
  @property() graph: Graph = {} as Graph;
  get g(): Graph {
    assertIsDefined(this.graph);
    return this.graph;
  }
  static override styles = css`
    svg {
      background-color: white;
      margin: 10px;
      border-radius: 4px;
    }
  `;
  dateObserver = new DateObserver(this);
  getMonths(minDate: Date, maxDate: Date) {
    const months = [];
    for (
      let currentDate = new Date(minDate);
      currentDate < maxDate;
      currentDate.setMonth(currentDate.getMonth() + 1)
    ) {
      months.push(new Date(currentDate));
    }
    return months;
  }
  override render() {
    // TODO: multiple rows
    // TODO: put the timeline in a group, so we can reposition it on the
    // Y-axis after we figure out how much room we need for the label lanes
    // TODO: measure all the labels, then figure out how far the first and
    // last label start and end are apart. There's a linear inequality, where
    // the x-translated end of the timeline has to be _beyond_ the end of the
    // last label (and ditto the start of the first).
    const {minDate, maxDate} = this.g.getDateRange();
    if (isNaN(minDate.valueOf()) || isNaN(maxDate.valueOf())) {
      return nothing;
    }
    const months = this.getMonths(minDate, maxDate);
    // Generate timeline
    // TODO(williasr): d3 typings are broken
    const scaleTime = d3.scaleTime as any as (
      domain: Date[],
      range: number[],
    ) => DateMap;
    let x = scaleTime(
      [minDate, maxDate],
      [this.margin, this.width - 2 * this.margin],
    );
    const milestones = this.g.topo.filter(
      (t) => t.type == 'milestone' && t.endDateP.type === 'percentile',
    );
    // go in reverse order because the timelines look more natural
    const pct = (p: NPPercentileOrError<Date>): NPPercentile<Date> => {
      if (p.type === 'error') throw new Error('error');
      return p;
    };
    // NB: reverse sort order, because it looks better.
    milestones.sort(
      (a, b) => pct(b.endDateP).lb.valueOf() - pct(a.endDateP).lb.valueOf(),
    );
    const barskip = 4;
    const upper_uncertainty = new LaneAssignment(-this.halfBarH, -barskip);
    const lower_uncertainty = new LaneAssignment(this.halfBarH, barskip);
    // The worst case scenario is that half the labels end up stacked in
    // one area of the graph. So we reserve enough room for this to be
    // the case.
    const labelStart =
      this.halfBarH + barskip * Math.ceil(milestones.length / 2) + 2 * FONTSIZE;
    const label_skip = FONTSIZE + 2 * PAD;
    const upper_labels = new LaneAssignment(-labelStart, -label_skip);
    const lower_labels = new LaneAssignment(labelStart, label_skip);
    const labels: TemplateResult[] = [];
    const errorbars: TemplateResult[] = [];
    const whiskers: TemplateResult[] = [];
    function getYs(uxs: number, uxe: number, lxs: number, lxe: number) {
      const upperUncertaintyIdx = upper_uncertainty.queryLane(uxs, uxe);
      const lowerUncertaintyIdx = lower_uncertainty.queryLane(uxs, uxe);
      if (upperUncertaintyIdx <= lowerUncertaintyIdx) {
        const uy = upper_uncertainty.getY(uxs, uxe);
        const wy = upper_labels.getY(lxs, lxe);
        const ly = wy - label_skip;
        return {uy, wy, ly};
      }
      const uy = lower_uncertainty.getY(uxs, uxe);
      const wy = lower_labels.getY(lxs, lxe);
      const ly = wy;
      return {uy, wy, ly};
    }
    milestones.forEach((t) => {
      if (t.endDateP.type === 'error') return;
      // Just an estimate
      const lw = 2 * PAD + t.name.length * 0.6 * FONTSIZE;
      const {lb, med, ub} = t.endDateP;
      const [xs, xm, xe] = [x(lb), x(med), x(ub)];
      const [lxs, lxe] = [xm - 0.5 * lw, xm + 0.5 * lw];
      const {uy, wy, ly} = getYs(xs, xe, lxs, lxe);
      labels.push(
        svg`
            <rect x=${lxs} y=${ly}
                width=${lw} height=${label_skip} fill=white opacity=.5></rect>
            <text x=${xm} y=${ly + PAD + 0.5 * FONTSIZE}
                text-anchor=middle
                  dominant-baseline=central>${t.name}</text>`,
      );
      if (t.finished) {
        // TODO: maybe a star instead??
        errorbars.push(
          svg`
            <circle cx=${xm} cy=${uy} r=3 fill=black stroke=none>
            </circle>`,
        );
      } else {
        errorbars.push(
          svg`
            <line x1=${xs} x2=${xe} y1=${uy} y2=${uy} stroke=black>
            </line>
            <circle cx=${xm} cy=${uy} r=4 fill=white stroke=black>
            </circle>`,
        );
      }
      whiskers.push(
        svg`<line x1=${xm} x2=${xm} y1=${uy} y2=${wy} stroke=black>`,
      );
    });
    /* TODO: change timeline translation so the labels all fit */
    return html` <svg width="1024" height="1024" viewBox="0 0 1024 1024">
      <g transform="translate(0, ${this.timelineY})">
        <g class="months">${months.map((m) => this.renderMonth(x, m))}</g>
        ${whiskers} ${labels} ${errorbars}
      </g>
    </svg>`;
  }
  renderMonth(x: (d: Date) => number, m: Date) {
    const nextMonth = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    const monthStart = Math.floor(x(m));
    const monthWidth = Math.ceil(x(nextMonth) - x(m));
    return svg`
      <g class=month
          transform="translate(${monthStart}, -${this.halfBarH})">
        <rect x=0 y=0 width=${monthWidth} height=${this.barH}
              fill=${['#F6F6FF', '#DFDFFF'][m.getMonth() % 2]}>
        </rect>
        <text x=${monthWidth / 2}
              y=${this.halfBarH}
              dominant-baseline=central
              text-anchor=middle
              font-weight=bold
              opacity=.55>
          ${m.toLocaleDateString(undefined, {month: 'short'})}
        </text>
      </g>`;
  }
}
