/**
 * @fileoverview Unit tests for dates.ts
 *
 * Run with nodejs --experimental_default_type=module dates_test.ts
 */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {_dateAdd, Calendar} from './dates';

function full(d: any) {
  if (d && d['toLocaleDateString']) {
    return d.toLocaleString(undefined, {dateStyle: 'full', timeStyle: 'full'});
  } else if (d) {
    return d.toString();
  } else {
    return 'undefined';
  }
}

function expectEq<T>(e: T, a: T) {
  // a != e or a == e doesn't work for Date objects.
  if (
    typeof a !== typeof e ||
    a < e ||
    a > e ||
    a === undefined ||
    e === undefined
  ) {
    console.trace();
    throw `Mismatch:\n` + `  Expected ${full(e)}.\n` + `  Actual   ${full(a)}`;
  } else {
    console.log('ok');
  }
}

class Tests {
  monday = new Date(2024, 1, 5);
  friday = _dateAdd(this.monday, 4);
  saturday = _dateAdd(this.friday, 1);
  nextMonday = _dateAdd(this.monday, 7);
  nextTuesday = _dateAdd(this.nextMonday, 1);
  nextWednesday = _dateAdd(this.nextTuesday, 1);

  lastSunday = _dateAdd(this.monday, -1);
  lastSaturday = _dateAdd(this.lastSunday, -1);
  lastFriday = _dateAdd(this.lastSaturday, -1);
  lastThursday = _dateAdd(this.lastFriday, -1);
  lastWednesday = _dateAdd(this.lastThursday, -1);
  calendar = new Calendar(this.monday, [this.nextTuesday, this.lastThursday]);
  workDay(date: Date) {
    return this.calendar.workDay(date);
  }
  testWorkdaysUntilNextWeek() {
    expectEq(0, this.workDay(this.monday));
    expectEq(4, this.workDay(this.friday));
    expectEq(4, this.workDay(this.saturday));
    expectEq(5, this.workDay(this.nextMonday));
    expectEq(5, this.workDay(this.nextTuesday)); // tuesday is a holiday
    expectEq(6, this.workDay(this.nextWednesday)); // tuesday is a holiday
  }
  testWorkdaysNotInOrder() {
    expectEq(5, this.workDay(this.nextMonday));
    expectEq(4, this.workDay(this.friday));
  }
  testNegativeWorkday() {
    expectEq(-1, this.workDay(this.lastSunday)); // sunday always a holiday
    expectEq(-1, this.workDay(this.lastSaturday)); // saturday always a holiday
    expectEq(-2, this.workDay(this.lastFriday));
    expectEq(-2, this.workDay(this.lastThursday)); // last thursday is a
    // holiday
    expectEq(-3, this.workDay(this.lastWednesday));
  }
  testNegativeWorkdayNotInOrder() {
    expectEq(-3, this.workDay(this.lastWednesday));
    expectEq(-1, this.workDay(this.lastSunday)); // sunday always a holiday
  }
  date(workday: number) {
    return this.calendar.date(workday);
  }
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
      if (
        prop == 'constructor' ||
        !prop.match(/^test/) ||
        typeof (Tests.prototype as any)[prop] != 'function'
      ) {
        continue;
      }
      console.log(prop);
      (new Tests() as any)[prop]();
    }
  }
}

class Tests2 {
  monday = new Date(2024, 1, 5);
  tuesday = new Date(2024, 1, 6);
  calendar = new Calendar(this.tuesday, []);
  testBackwardDate() {
    expectEq(this.monday, this.calendar.date(-1));
  }
  static run() {
    for (let prop of Object.getOwnPropertyNames(Tests2.prototype)) {
      if (
        prop == 'constructor' ||
        !prop.match(/^test/) ||
        typeof (Tests2.prototype as any)[prop] != 'function'
      ) {
        continue;
      }
      console.log(prop);
      (new Tests2() as any)[prop]();
    }
  }
}

if (typeof window === 'undefined') {
  // Tests.run();
  Tests2.run();
}
