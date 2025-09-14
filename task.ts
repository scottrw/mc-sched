/**
 * @fileoverview Model for tasks.
 */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {Estimate, SerializedEstimate} from './estimate';
import {NPArray, NPError, NPPercentileOrError, NPValue, undef} from './np';

export type TaskType = 'task' | 'milestone';


export type SerializedTask = {
  id: number;
  name: string; type: TaskType;
  started?: string;
  finished?: string;
  engEstimate?: SerializedEstimate;
  calEstimate?: SerializedEstimate;
};

export class Task {
  started?: Date;
  finished?: Date;
  endDates: NPValue = undef;
  startDates: NPValue = undef;
  endDateP: NPPercentileOrError<Date> = undef;
  startDateP: NPPercentileOrError<Date> = undef;
  visible_paths: Array<[Task, Task]> = [];
  doty: number = 0;
  dotx: number = 0;
  type: TaskType;
  calEstimate?: Estimate;
  engEstimate?: Estimate;
  name: string;
  id: number;
  constructor(id: number, name: string, type: TaskType = 'task') {
    this.id = id;
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

  serialize(): SerializedTask {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      started: this.started?.toISOString(),
      finished: this.finished?.toISOString(),
      engEstimate: this.engEstimate?.serialize(),
      calEstimate: this.calEstimate?.serialize(),
    };
  }

  static deserialize(data: SerializedTask) {
    const t = new Task(data.id, data.name, data.type as TaskType);
    t.started = data.started ? new Date(data.started) : undefined;
    t.finished = data.finished ? new Date(data.finished) : undefined;
    t.engEstimate =
        data.engEstimate ? Estimate.deserialize(data.engEstimate) : undefined;
    t.calEstimate =
        data.calEstimate ? Estimate.deserialize(data.calEstimate) : undefined;
    return t;
  }
}
