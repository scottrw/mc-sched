/**
 * @fileoverview Working-day-based fast math support.
 */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {NPPercentileOrError} from './np';

function _truncateToDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/* for testing */
export function _dateAdd(date: Date, days: number) {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

/** Converts integer counts of business days into calendar dates, taking into
 * account holidays and weekends. */
export class Calendar {
  holidays: Set<number>;
  day0: Date;
  forward: Date[];
  backward: Date[];
  constructor(day0: Date, holidays: Date[]) {
    day0 = _truncateToDay(day0);
    this.holidays = new Set(
      holidays.map(_truncateToDay).map((d) => d.valueOf()),
    );
    this.day0 = day0;
    this.forward = [day0]; // index 0 == this.day0
    this.backward = []; // index 0 == this.day0 - 1 working day
  }

  /** Returns the number of working days between day0 and the current date. */
  today(): number {
    return this.workDay(new Date());
  }

  /** Returns the number of working days between day0 and the given date. */
  workDay(date: Date): number {
    date = _truncateToDay(date);
    if (date.valueOf() >= this.day0.valueOf()) {
      let workdays = this.forward;
      let step = 1;
      for (let w = 0; w < workdays.length; w++) {
        if (workdays[w].valueOf() == date.valueOf()) {
          return w;
        }
      }
      let workday = workdays.length - 1;
      let last = workdays[workday];
      let next = last;
      while (last.valueOf() < date.valueOf()) {
        next = _dateAdd(next, step);
        if (
          next.getDay() == 0 ||
          next.getDay() == 6 ||
          this.holidays.has(next.valueOf())
        ) {
          continue;
        }
        if (last < date && date < next) {
          // holiday!
          return workday;
        }
        last = next;
        workday++;
        workdays.push(last);
      }
      return workday;
    } else {
      let workdays = this.backward;
      let step = -1;
      for (let w = 0; w < workdays.length; w++) {
        if (workdays[w].valueOf() == date.valueOf()) {
          return -(w + 1);
        }
      }
      let workday = 1;
      let last = this.day0;
      let prev = this.day0;
      if (workdays.length > 0) {
        let workday = workdays.length - 1;
        let last = workdays[workday];
        let prev = last;
      }
      while (last.valueOf() > date.valueOf()) {
        prev = _dateAdd(prev, step);
        if (
          prev.getDay() == 0 ||
          prev.getDay() == 6 ||
          this.holidays.has(prev.valueOf())
        ) {
          continue;
        }
        if (last > date && date > prev) {
          // holiday!
          return -workday;
        }
        last = prev;
        workday++;
        workdays.push(last);
      }
      return -workday;
    }
  }
  /** Return the Date object <workday> number of business days after day0. */
  date(workday: number) {
    if (typeof workday !== 'number') {
      console.log(workday);
      console.trace();
      throw 'wtf';
    }
    if (workday >= 0) {
      if (this.forward.length > workday) {
        return this.forward[workday];
      }
      let last = this.forward[this.forward.length - 1];
      let next = last;
      while (workday > this.forward.length - 1) {
        next = _dateAdd(next, 1);
        if (
          next.getDay() == 0 ||
          next.getDay() == 6 ||
          this.holidays.has(next.valueOf())
        ) {
          continue;
        }
        last = next;
        if (isNaN(last.valueOf())) debugger;
        this.forward.push(last);
      }
      return last;
    } else {
      workday = -workday - 1;
      if (this.backward.length > workday) {
        return this.backward[workday];
      }
      let last = this.backward[this.backward.length - 1];
      if (isNaN(last.valueOf())) debugger;
      let prev = last;
      while (workday > this.backward.length - 1) {
        prev = _dateAdd(prev, -1);
        if (
          prev.getDay() == 0 ||
          prev.getDay() == 6 ||
          this.holidays.has(prev.valueOf())
        ) {
          continue;
        }
        last = prev;
        if (isNaN(last.valueOf())) debugger;
        this.backward.push(last);
      }
      return last;
    }
  }
}

export const dateFormats = {
  ABSOLUTE: 'abs',
  RELATIVE: 'rel',
};

export function fmtDateAll(
  dateFormat: 'abs' | 'rel',
  a: Date | undefined,
  p: NPPercentileOrError<Date> | undefined,
) {
  if (p) {
    if (dateFormat == dateFormats.ABSOLUTE) {
      return fmtDateP(a, p);
    } else {
      return fmtRelDateP(a, p);
    }
  } else {
    return '';
  }
}
function fmtDateP(a: Date | undefined, p: NPPercentileOrError<Date>) {
  const today = new Date();
  if (a) {
    const o: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'short',
      year: undefined,
    };
    if (a.getFullYear() != today.getFullYear()) o.year = 'numeric';
    return a.toLocaleDateString(undefined, o);
  }
  if (p.type == 'error') {
    return p.message;
  }
  const lb = new Date(p.lb);
  const ub = new Date(p.ub);
  const ubo: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: undefined,
  };
  const lbo: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: undefined,
  };
  if (lb.getFullYear() != today.getFullYear()) lbo.year = 'numeric';
  if (ub.getFullYear() != today.getFullYear()) ubo.year = 'numeric';
  const lbs = lb.toLocaleDateString(undefined, lbo);
  const ubs = ub.toLocaleDateString(undefined, ubo);
  if (lb.getFullYear() == ub.getFullYear() && lb.getMonth() == ub.getMonth()) {
    const ds = lb.toLocaleDateString(undefined, {day: 'numeric'});
    const uds = ub.toLocaleDateString(undefined, {day: 'numeric'});
    return lbs.replace(ds, `${ds} - ${uds}`);
  }
  return `${lbs} - ${ubs}`;
}

type DateDiff = {
  diffYears: number;
  diffMonths: number;
  diffDays: number;
  postfix: string;
};

function relDateCmp(today: Date, target: Date): DateDiff {
  if (target.valueOf() < today.valueOf()) {
    return {...relDateCmp(target, today), postfix: ' ago'};
  }
  let diffYears = target.getFullYear() - today.getFullYear();
  let diffMonths = target.getMonth() - today.getMonth();
  let diffDays = target.getDate() - today.getDate();
  if (diffDays < 0) {
    diffDays += 31;
    diffMonths--;
  }
  if (diffMonths < 0) {
    diffYears--;
    diffMonths += 12;
  }
  return {diffYears, diffMonths, diffDays, postfix: ''};
}

function relDateStrFmt({diffYears, diffMonths, diffDays, postfix}: DateDiff) {
  const components = [];
  if (diffYears > 0) components.push(`${diffYears}y`);
  if (diffMonths > 0) components.push(`${diffMonths}m`);
  if (diffDays > 0) components.push(`${diffDays}d`);
  if (components.length == 0) return 'today';
  return `${components.join(' ')}${postfix}`;
}
const relDateStr = (today: Date, target: Date) => {
  return relDateStrFmt(relDateCmp(today, target));
};
const fmtRelRange = (today: number, lb: number, ub: number) => {
  // Not leap year aware. Oh well.
  const DAY = 1000 * 60 * 60 * 24;
  const WEEK = DAY * 7;
  const MONTH = 31 * DAY;
  const YEAR = DAY * 365;

  const lbd = Math.abs(today - lb);
  const ubd = Math.abs(today - ub);
  // The lower bound establishes the units we use for
  // the diff.
  if (lbd < WEEK) {
    return `in ${Math.floor(lbd / DAY)}-${Math.floor(ubd / DAY)} days`;
  }
  if (lbd < 5 * MONTH) {
    return `in ${Math.floor(lbd / WEEK)}-${Math.floor(ubd / WEEK)} weeks`;
  }
  if (lbd < YEAR) {
    return `in ${(lbd / MONTH).toFixed(2)}-${(ubd / MONTH).toFixed(2)} months`;
  }
  return `in ${(lbd / YEAR).toFixed(2)}-${(ubd / YEAR).toFixed(2)} years`;
};
const fmtRelDateP = (a: Date | undefined, p: NPPercentileOrError<Date>) => {
  const today = new Date();
  if (a) {
    return relDateStr(today, a);
  }
  if (p.type == 'error') {
    return p.message;
  }
  const {lb, ub} = p;
  return fmtRelRange(today.valueOf(), lb.valueOf(), ub.valueOf());
};

export class Holiday {
  name: string = '';
  startDate!: Date;
  endDate!: Date;
  constructor(name: string, startDate: Date, endDate: Date) {
    Object.assign(this, {name, startDate, endDate});
  }
}
