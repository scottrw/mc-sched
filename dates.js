/**
 * @fileoverview Working-day-based fast math support.
 *
 * Copyright Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
function _truncateToDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function _dateAdd(date, days) {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

class Workday {
  constructor(day0, holidays) {
    day0 = _truncateToDay(day0);
    this.holidays = new Set(holidays.map(_truncateToDay).map(d => d.valueOf()));
    this.day0 = day0;
    this.forward = [day0];  // index 0 == this.day0
    this.backward = [];  // index 0 == this.day0 - 1 working day
  }
  today() {
    return this.workDay(new Date());
  }
  workDay(date) {
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
        if (next.getDay() == 0 || next.getDay() == 6 || this.holidays.has(next.valueOf())) {
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
        if (prev.getDay() == 0 || prev.getDay() == 6 || this.holidays.has(prev.valueOf())) {
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
  date(workday) {
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
        if (next.getDay() == 0 || next.getDay() == 6 || this.holidays.has(next.valueOf())) {
          continue;
        }
        last = next;
        this.forward.push(last);
      }
      return last;
    } else {
      workday = -workday - 1;
      if (this.backward.length > workday) {
        return this.backward[workday];
      }
      let last = this.backward[this.backward.length - 1];
      let prev = last;
      while (workday > this.backward.length - 1) {
        prev = _dateAdd(prev, -1);
        if (prev.getDay() == 0 || prev.getDay() == 6 || this.holidays.has(prev.valueOf())) {
          continue;
        }
        last = prev;
        this.backward.push(last);
      }
      return last;
    }
  }
}

function full(d) {
  if (d && d['toLocaleDateString']) {
    return d.toLocaleString(undefined, {dateStyle: 'full', timeStyle: 'full'});
  } else if (d) {
    return d.toString();
  } else {
    return 'undefined';
  }
}

function expectEq(e, a) {
  // a != e or a == e doesn't work for Date objects.
  if (typeof(a) !== typeof(e) ||
      a < e || a > e || a === undefined || e === undefined) {
    console.trace();
    throw `Mismatch:\n` +
          `  Expected ${full(e)}.\n` +
          `  Actual   ${full(a)}`;
  } else {
    console.log('ok');
  }
}

class Tests {
  constructor() {
    this.monday = new Date(2024, 1, 5);
    this.friday = _dateAdd(this.monday, 4);
    this.saturday = _dateAdd(this.friday, 1);
    this.nextMonday = _dateAdd(this.monday, 7);
    this.nextTuesday = _dateAdd(this.nextMonday, 1);
    this.nextWednesday = _dateAdd(this.nextTuesday, 1);

    this.lastSunday = _dateAdd(this.monday, -1);
    this.lastSaturday = _dateAdd(this.lastSunday, -1);
    this.lastFriday = _dateAdd(this.lastSaturday, -1);
    this.lastThursday = _dateAdd(this.lastFriday, -1);
    this.lastWednesday = _dateAdd(this.lastThursday, -1);
    this.w = new Workday(this.monday,
        [this.nextTuesday, this.lastThursday]);
  }
  workDay(date) { return this.w.workDay(date); }
  testWorkdaysUntilNextWeek() {
    expectEq(0, this.workDay(this.monday));
    expectEq(4, this.workDay(this.friday));
    expectEq(4, this.workDay(this.saturday));
    expectEq(5, this.workDay(this.nextMonday));
    expectEq(5, this.workDay(this.nextTuesday));  // tuesday is a holiday
    expectEq(6, this.workDay(this.nextWednesday));  // tuesday is a holiday
  }
  testWorkdaysNotInOrder() {
    expectEq(5, this.workDay(this.nextMonday));
    expectEq(4, this.workDay(this.friday));
  }
  testNegativeWorkday() {
    expectEq(-1, this.workDay(this.lastSunday));  // sunday always a holiday
    expectEq(-1, this.workDay(this.lastSaturday));  // saturday always a holiday
    expectEq(-2, this.workDay(this.lastFriday));
    expectEq(-2, this.workDay(this.lastThursday));  // last thursday is a
                                                    // holiday
    expectEq(-3, this.workDay(this.lastWednesday));
  }
  testNegativeWorkdayNotInOrder() {
    expectEq(-3, this.workDay(this.lastWednesday));
    expectEq(-1, this.workDay(this.lastSunday));  // sunday always a holiday
  }
  date(workday) { return this.w.date(workday); }
  testDateInFiveWorkingDays() {
    expectEq(this.monday, this.date(0));
    expectEq(this.friday, this.date(4));
    expectEq(this.nextMonday, this.date(5));
    expectEq(this.nextWednesday, this.date(6));
  }
  testDateInFiveWorkingDaysNotInOrder() {
    expectEq(this.nextWednesday, this.date(6));
    expectEq(this.friday, this.date(4));
  }
  testDateInNegativeWorkingDays() {
    expectEq(this.lastFriday, this.date(-1));
    expectEq(this.lastWednesday, this.date(-2));
  }
  static run() {
    for (let prop of Object.getOwnPropertyNames(Tests.prototype)) {
      if (prop == 'constructor' ||
          !prop.match(/^test/) ||
          typeof Tests.prototype[prop] != 'function') {
        continue;
      }
      console.log(prop);
      new Tests()[prop]();
    }
  }
}
if (typeof window === 'undefined') {
  Tests.run();
}

const dateFormats = {
  ABSOLUTE: 'abs',
  RELATIVE: 'rel'
}
const fmtDateAll = (displayOptions, a, p) => {
  if (p) {
    if (displayOptions.dateFormat == dateFormats.ABSOLUTE) {
      return fmtDateP(a, p);
    } else {
      return fmtRelDateP(a, p);
    }
  }
}
const fmtDateP = (a, p) => {
  const today = new Date();
  if (a !== null) {
    const o = {day: 'numeric', month:'short', year: undefined}
    if (a.getFullYear() != today.getFullYear()) o.year = 'numeric'
    return a.toLocaleDateString(undefined, o);
  }
  if (p.err) {
    return p.err;
  }
  const [lb, _, ub] = p.map(p => new Date(p));
  const ubo = {day: 'numeric', month:'short', year: undefined}
  const lbo = {day: 'numeric', month:'short', year: undefined}
  if (lb.getFullYear() != today.getFullYear()) lbo.year = 'numeric'
  if (ub.getFullYear() != today.getFullYear()) ubo.year = 'numeric'
  const lbs = lb.toLocaleDateString(undefined, lbo);
  const ubs = ub.toLocaleDateString(undefined, ubo);
  if (lb.getFullYear() == ub.getFullYear() &&
      lb.getMonth() == ub.getMonth()) {
    const ds = lb.toLocaleDateString(undefined, {day: 'numeric'});
    const uds = ub.toLocaleDateString(undefined, {day: 'numeric'});
    return lbs.replace(ds, `${ds} - ${uds}`);
  }
  return `${lbs} - ${ubs}`;
}
const relDateCmp = (today, target) => {
  if (target.valueOf() < today.valueOf()) {
    return {...relDateCmp(target, today), postfix:' ago'}
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
const relDateStrFmt = ({diffYears, diffMonths, diffDays, postfix}) => {
  const components = [];
  if (diffYears > 0) components.push(`${diffYears}y`);
  if (diffMonths > 0) components.push(`${diffMonths}m`);
  if (diffDays > 0) components.push(`${diffDays}d`);
  if (components.length == 0) return "today";
  return `${components.join(' ')}${postfix}`;
}
const relDateStr = (today, target) => {
  return relDateStrFmt(relDateCmp(today, target));
}
const fmtRelRange = (today, lb, ub) => {
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
    return `in ${Math.floor(lbd / DAY)}-${Math.floor(ubd / DAY)} days`
  }
  if (lbd < 5 * MONTH) {
    return `in ${Math.floor(lbd / WEEK)}-${Math.floor(ubd / WEEK)} weeks`
  }
  if (lbd < YEAR) {
    return `in ${(lbd / MONTH).toFixed(2)}-${(ubd / MONTH).toFixed(2)} months`;
  }
  return `in ${(lbd / YEAR).toFixed(2)}-${(ubd / YEAR).toFixed(2)} years`;
}
const fmtRelDateP = (a, p) => {
  const today = new Date();
  if (a !== null) {
    return relDateStr(today, a);
  }
  if (p.err) {
    return p.err;
  }
  const [lb, _, ub] = p;
  return fmtRelRange(today.valueOf(), lb, ub);
}
