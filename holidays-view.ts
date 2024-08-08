/**
 * @fileoverview Editable list of holidays.
 */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {LitElement, css, html, nothing} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import {Holiday} from './dates';
import './editors';
import {undef} from './np';
import {YSKIP} from './view-constants';

type SortedHoliday = {
  idx: number;
  holiday: Holiday;
};

// TODO:
// - Delete
// - Add holiday
@customElement('holidays-view')
export class HolidaysView extends LitElement {
  @property() holidays!: Holiday[];

  static override styles = css`
    div {
      background-color: white;
      border-top: 1px solid #e3e3e3;
    }
    table {
      table-layout: fixed;
      width: 30em;
      border-collapse: collapse;
    }
    th {
      text-align: left;
    }
  `;
  override render() {
    const holidays = this.holidays.map((holiday: Holiday, idx: number) => ({
      idx,
      holiday,
    }));
    holidays.sort(
      (a: SortedHoliday, b: SortedHoliday) =>
        a.holiday.startDate.valueOf() - b.holiday.startDate.valueOf(),
    );
    return html`
      <div>
        <table>
          <colgroup>
            <col />
            <col style="width: 10em" />
            <col style="width: 10em" />
          </colgroup>
          <thead>
            <th>Holiday</th>
            <th>Start date</th>
            <th>End date</th>
          </thead>
          <tbody @changed=${this.onChanged}>
            ${holidays.map(
              (h: SortedHoliday) =>
                html`<holiday-row .idx=${h.idx} .holiday=${h.holiday}>
                </holiday-row>`,
            )}
          </tbody>
        </table>
      </div>
    `;
  }
  onChanged(e: CustomEvent) {
    const newHoliday = e.detail.holiday;
    this.holidays[e.detail.idx] = e.detail.holiday;
    this.holidays = [...this.holidays];
    e.detail.holidays = this.holidays;
  }
}

@customElement('holiday-row')
export class HolidayRow extends LitElement {
  @property() holiday!: Holiday;
  @property() idx!: number;
  static override styles = css`
    :host {
      display: table-row;
      height: 24px;
    }
    td {
      padding: 0;
      align-content: center;
    }
  `;
  override render() {
    return html`
      <td
        ><editable-text
          @changed=${this.onNameChanged}
          .text=${this.holiday.name}>
        </editable-text>
      </td>
      <td
        ><editable-date
          @changed=${this.onStartChanged}
          .dateActual=${this.holiday.startDate}
          .dateCalculated=${undef}>
        </editable-date>
      </td>
      <td
        ><editable-date
          @changed=${this.onEndChanged}
          .dateActual=${this.holiday.endDate}
          .dateCalculated=${undef}>
        </editable-date>
      </td>
    `;
  }
  onNameChanged(e: CustomEvent) {
    this.holiday = {...this.holiday, name: e.detail.text};
    e.stopPropagation();
    this.fireChanged();
  }
  onStartChanged(e: CustomEvent) {
    this.holiday = {...this.holiday, startDate: new Date(e.detail.dateActual)};
    e.stopPropagation();
    this.fireChanged();
  }
  onEndChanged(e: CustomEvent) {
    this.holiday = {...this.holiday, endDate: new Date(e.detail.dateActual)};
    e.stopPropagation();
    this.fireChanged();
  }
  fireChanged() {
    this.dispatchEvent(
      new CustomEvent('changed', {
        detail: {idx: this.idx, holiday: this.holiday},
        bubbles: true,
        composed: true,
      }),
    );
  }
}
