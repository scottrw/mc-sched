/**
 * @fileoverview Estimates.
 */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {NPValue} from './np';

const DAYS = 1;
const WEEKS = DAYS * 5;
const MONTHS = WEEKS * 4; // close enough

export type Unit = 'd' | 'w' | 'm';
const unit = {'d': DAYS, 'w': WEEKS, 'm': MONTHS};

export class Estimate {
  lb: number;
  ub: number;
  lb_unit: string;
  ub_unit: string;
  lb_days: number;
  ub_days: number;
  dist?: NPValue;
  constructor(lb: number, lb_unit: Unit, ub: number, ub_unit: Unit) {
    this.lb = lb;
    this.ub = ub;
    this.lb_unit = lb_unit;
    this.ub_unit = ub_unit;
    this.lb_days = this.lb * unit[lb_unit];
    this.ub_days = this.ub * unit[ub_unit];
  }
  displayString() {
    if (this.lb_unit == this.ub_unit) {
      return `${this.lb}-${this.ub} ${this.lb_unit}`;
    }
    return `${this.lb}${this.lb_unit} - ${this.ub}${this.ub_unit}`;
  }

  static check(text: string) {
    const m = text.match(
      /^ *([0-9]+(?:\.[0-9]+)?) *([dwm]?) *- *([0-9]+(?:\.[0-9]+)?) *([dwm]) *$/,
    );
    if (!m) {
      return false;
    }
    const lb = parseFloat(m[1]);
    const ub = parseFloat(m[3]);
    const ub_unit = m[4];
    const lb_unit = m[2] || ub_unit;
    if (!isNaN(lb) && !isNaN(ub) && lb >= 0 && ub >= lb) {
      return new Estimate(lb, lb_unit as Unit, ub, ub_unit as Unit);
    } else {
      return false;
    }
  }
}
