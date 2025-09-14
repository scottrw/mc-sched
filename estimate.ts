/**
 * @fileoverview Estimates.
 */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {NPValue} from './np';
import * as np from './np';

const HOURS = 1/8;
const DAYS = 1;
const WEEKS = DAYS * 5;
const MONTHS = WEEKS * 4; // close enough

export type Unit = 'h' | 'd' | 'w' | 'm';
const unit = {'h': HOURS, 'd': DAYS, 'w': WEEKS, 'm': MONTHS};

export type SerializedEstimate = {
  lb: number; ub: number; lb_unit: string; ub_unit: string;
};

export class Estimate {
  readonly lb: number;
  readonly ub: number;
  readonly lb_unit: string;
  readonly ub_unit: string;
  readonly lb_days: number;
  readonly ub_days: number;
  dist_?: NPValue;
  get dist(): NPValue {
    // This is lazy because it can be expensive, especially on document load
    // when we're constructing a lot of estimates all at once. So we delay
    // constructing the samples until we're computing end dates.
    if (this.dist_) {
      return this.dist_;
    }
    return (this.dist_ = np.rand_norm90(this.lb_days, this.ub_days));
  }
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

  static check(text: string): Estimate | false {
    const m = text.match(
      /^ *([0-9]+(?:\.[0-9]+)?) *([hdwm]?) *- *([0-9]+(?:\.[0-9]+)?) *([hdwm]) *$/,
    );
    if (!m) {
      return false;
    }
    const lb = parseFloat(m[1]);
    const ub = parseFloat(m[3]);
    const ub_unit = m[4];
    const lb_unit = m[2] || ub_unit;
    if (!isNaN(lb) && !isNaN(ub) && lb >= 0 &&
        unit[ub_unit as Unit] * ub >= unit[lb_unit as Unit] * lb) {
      return new Estimate(lb, lb_unit as Unit, ub, ub_unit as Unit);
    } else {
      return false;
    }
  }

  serialize(): SerializedEstimate {
    return {
      lb: this.lb,
      ub: this.ub,
      lb_unit: this.lb_unit,
      ub_unit: this.ub_unit,
    };
  }

  static deserialize(data: SerializedEstimate) {
    return new Estimate(
        data.lb,
        data.lb_unit as Unit,
        data.ub,
        data.ub_unit as Unit,
    );
  }
}
