/**
 * @fileoverview Shared listener for date calculation updates.
 */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {LitElement} from 'lit';
import type {Task} from './task';

export class DateObserver {
  /* Options for reacting to date updates:
    - call requestUpdate() from calculateDates()
      - requires calculateDates to be able to find all the task-rows and
        interact with them
    - add a DateObserver controller to all the task-rows
      - if we embed it as a directive, we could use it to listen to end date
        changes for just the specific task
        - that means we only update tasks that changed, and further, if we
          broke calculateDates() into requestAnimationFrame-sized chunks, then
          the UI will reflow nicely.
    - requestUpdate on the table
      - this will cause all the rows to reassign their values (i think), which
        would do the trick if the date objects were immutable and fresh, but
        they aren't (that would be expensive). */
  /* This looks fairly generic, maybe it can be used for other things too */
  host;
  static observers = new Set<DateObserver>(); // DateObserver
  constructor(host: LitElement) {
    (this.host = host).addController(this);
    DateObserver.observers.add(this);
  }
  observe(task: Task) {
    DateObserver.observers.add(this);
  }
  hostConnected() {
    DateObserver.observers.add(this);
  }
  hostDisconnected() {
    DateObserver.observers.delete(this);
  }
  notify() {
    this.host.requestUpdate();
  }
  static notifyAll() {
    DateObserver.observers.forEach((o) => o.notify());
  }
}
