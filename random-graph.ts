/**
 * @fileoverview Random graph utilities.
 *
 * These are for randomly generating graphs for testing layout algorithms and
 * loadtesting DOM rendering, event handling, and monte-carlo simulation.
 */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {Holiday} from './dates';
import {Estimate} from './estimate';
import {mainGraph} from './graph';
import {byValue} from './np';
import {Task} from './task';

function randomTasks(n: number) {
  const rand = (lb: number, ub: number) =>
    Math.floor(Math.random() * (ub - lb) + lb);

  const tasks = [];
  for (let i = 0; i < n; i++) {
    const name = [
      randFrom([
        'Add',
        'Set up',
        'Request',
        'Wait for',
        'Implement',
        'Test',
        'Get approval for',
        'Send',
        'Implement',
        'Review',
        'Design',
        'Approve',
        'Qualify',
      ]),
    ].concat(lorems(0.5));
    const estimate = [rand(0, 12), rand(0, 12)];
    estimate.sort(byValue); // stupid javascript
    const task = new Task(name.join(' '));
    task.estimate = new Estimate(estimate[0], 'd', estimate[1], 'd');
    tasks.push(task);
  }
  return tasks;
}

function rand(lb: number, ub: number) {
  return Math.floor(Math.random() * (ub - lb) + lb);
}

function randFrom(a: string[]) {
  return a[rand(0, a.length)];
}

const lorem =
  'client server backend dependency release continuous-build authorization pipeline recovery factory integration CL tests audit protos design'.split(
    ' ',
  );

function lorems(prob: number) {
  const words = [];
  do {
    words.push(randFrom(lorem));
  } while (Math.random() < prob);
  return words;
}

/* Simulate some development tasks.

   We approach it like a git repo:
   1. there's a list of tips you can grow from
   2. with some small probability you can start a new tip
   3. otherwise pick one (or more, with small probability) as parent
   4. with some small probability, keep the parent(s) as growable tips
*/

function randomGraph(tasks: Task[]): {V: Map<number, Task>, E: Map<Task, Task[]>} {
  let now = new Date();
  now.setDate(now.getDate() - tasks.length);
  const E = tasks.length;
  const edges = new Map<Task, Task[]>();
  const tips: Task[] = [];
  tasks.forEach((t) => edges.set(t, []));
  tasks.forEach((t, i) => {
    now.setDate(now.getDate() + 1);
    if (tips.length == 0 || Math.random() < 0.1) {
      tips.push(t);
      if (Math.random() < 0.75) {
        t.started = new Date(now);
        if (Math.random() < 0.75) {
          t.finished = new Date(now);
          t.finished.setDate(t.finished.getDate() + 1);
        }
      } else if (Math.random() < 0.1) {
        t.estimate = undefined;
      }
      return;
    }
    let parents = [];
    do {
      const pi = rand(0, tips.length);
      const parent = tips[pi];
      if (!parent) debugger;
      if (Math.random() < 0.9) {
        tips.splice(pi, 1);
      }
      if (edges.get(t)!.indexOf(parent) >= 0) continue;
      edges.get(t)!.push(parent);
      parents.push(parent);
    } while (Math.random() < 0.2 && tips.length > 0);
    if (parents.every((p) => p.finished != null) && Math.random() < 0.75) {
      t.started = new Date(now);
      if (Math.random() < 0.75) {
        t.finished = new Date(now);
        t.finished.setDate(t.finished.getDate() + 1);
      }
    }
    if (Math.random() < 0.05) {
      t.type = 'milestone';
    }
    if (Math.random() < 0.95) {
      tips.push(t);
    } else {
      t.type = 'milestone';
    }
  });
  tips.forEach((t) => (t.type = 'milestone'));

  return {
    V: new Map(tasks.map((t) => [t.id, t])),
    E: edges,
  };
}

export function makeRandomGraph(n: number) {
  const tasks = randomTasks(n);
  const G = randomGraph(tasks);
  return mainGraph(G);
}

export function makeRandomHolidays(n: number): Holiday[] {
  const today = new Date();
  const year = today.getUTCFullYear();

  return [
    new Holiday('Fixit week', new Date(year, 11, 15), new Date(year + 1, 0, 6)),
    new Holiday(
      'Code Freeze',
      new Date(year, 11, 15),
      new Date(year + 1, 0, 6),
    ),
    new Holiday('Christmas', new Date(year, 11, 21), new Date(year, 11, 26)),
    new Holiday('New Year', new Date(year, 11, 30), new Date(year, 0, 2)),
  ];
}
