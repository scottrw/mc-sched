/**
 * @fileoverview Model for tasks.
 */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {signal, type WritableSignal} from '@angular/core';

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
  readonly edges: WritableSignal<Set<Task>> = signal(new Set<Task>());
  readonly inv_edges: WritableSignal<Set<Task>> = signal(new Set<Task>());
  readonly started: WritableSignal<Date|undefined> = signal(undefined);
  readonly finished: WritableSignal<Date|undefined> = signal(undefined);
  readonly endDates: WritableSignal<NPValue> = signal(undef);
  readonly startDates: WritableSignal<NPValue> = signal(undef);
  // XXX: replace with calculated()
  readonly endDateP: WritableSignal<NPPercentileOrError<Date>> = signal(undef);
  // XXX: replace with calculated()
  readonly startDateP: WritableSignal<NPPercentileOrError<Date>> =
      signal(undef);
  visible_paths: Array<[Task, Task]> = [];
  readonly doty: WritableSignal<number> = signal(0);
  readonly dotx: WritableSignal<number> = signal(0);
  readonly type: WritableSignal<TaskType> = signal('task');
  readonly calEstimate: WritableSignal<Estimate|undefined> = signal(undefined);
  readonly engEstimate: WritableSignal<Estimate|undefined> = signal(undefined);
  readonly name: WritableSignal<string> = signal('');
  id: number;  // XXX this probably _shouldn't_ be a signal.
  constructor(id: number, name: string, type: TaskType = 'task') {
    this.id = id;
    this.name.set(name);

    // model properties
    this.type.set(type);
  }
  toggleStatus(date: Date) {
    if (this.finished() !== undefined) {
      this.started.set(undefined);
      this.finished.set(undefined);
    } else if (this.started() !== undefined) {
      this.finished.set(date);
    } else {
      this.started.set(date);
    }
  }

  removeEdge(to: Task) {
    this.edges.update(edges => new Set([...edges].filter(v => v !== to)));
  }
  
  addEdge(to: Task) {
    this.edges.update(edges => new Set([...edges, to]));
  }

  removeInvEdge(from: Task) {
    this.inv_edges.update(edges => new Set([...edges].filter(v => v !== from)));
  }
  
  addInvEdge(from: Task) {
    this.inv_edges.update(edges => new Set([...edges, from]));
  }

  serialize(): SerializedTask {
    return {
      id: this.id,
      name: this.name(),
      type: this.type(),
      started: this.started()?.toISOString(),
      finished: this.finished()?.toISOString(),
      engEstimate: this.engEstimate()?.serialize(),
      calEstimate: this.calEstimate()?.serialize(),
    };
  }

  static deserialize(data: SerializedTask) {
    const t = new Task(data.id, data.name, data.type as TaskType);
    t.started.set(data.started ? new Date(data.started) : undefined);
    t.finished.set(data.finished ? new Date(data.finished) : undefined);
    t.engEstimate.set(
        data.engEstimate ? Estimate.deserialize(data.engEstimate) : undefined);
    t.calEstimate.set(
        data.calEstimate ? Estimate.deserialize(data.calEstimate) : undefined);
    return t;
  }
}
