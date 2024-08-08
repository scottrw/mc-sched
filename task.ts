/**
 * @fileoverview Model for tasks.
 */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Estimate} from './estimate';
import {NPArray, NPError, NPPercentileOrError, NPValue, undef} from './np';

export type TaskType = 'task' | 'milestone';

export class Task {
  static count = 0; // TODO: replace with Firebase IDs

  started?: Date;
  finished?: Date;
  endDates: NPValue = undef;
  startDates: NPValue = undef;
  endDateP: NPPercentileOrError<Date> = undef;
  startDateP: NPPercentileOrError<Date> = undef;
  visible_paths: Array<[Task, Task]> = [];
  doty: number = 0;
  dotx: number = 0;
  type: string;
  estimate?: Estimate;
  name: string;
  id: number;
  constructor(name: string, type: TaskType = 'task') {
    this.id = Task.count++;
    this.name = name;

    // model properties
    this.type = type;
  }
  toggleStatus(date: Date) {
    if (this.finished !== undefined) {
      this.started = undefined;
      this.finished = undefined;
    } else if (this.started !== null) {
      this.finished = date;
    } else {
      this.started = date;
    }
  }
}
