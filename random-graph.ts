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
import {Graph} from './graph';
import {byValue} from './np';
import {Task} from './task';

function getRandomTaskName() {
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
  return name.join(' ');
}

function randEst() {
  const estimate = [rand(0, 12), rand(0, 12)];
  estimate.sort(byValue); // argh javascript
  const [lb, ub] = estimate;
  return new Estimate(lb, 'd', ub, 'd');
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

// TODO: this should just create an empty graph and modify it, rather than
// doing all this work...
export function makeRandomGraph(n: number): Graph {
  let now = new Date();
  now.setDate(now.getDate() - n);

  const g = Graph.create();
  const tips: Task[] = [];
  for (let i = 0; i < n; i++) {
    now.setDate(now.getDate() + 1);

    const task = g.appendTask(getRandomTaskName());
    task.calEstimate = randEst();
    task.engEstimate = randEst();

    if (tips.length == 0 || Math.random() < 0.1) {
      tips.push(task);
      if (Math.random() < 0.75) {
        task.started = new Date(now);
        if (Math.random() < 0.75) {
          task.finished = new Date(now);
          task.finished.setDate(task.finished.getDate() + 1);
        }
      } else if (Math.random() < 0.1) {
        task.engEstimate = undefined;
        task.calEstimate = undefined;
      }
      break;
    }

    let parents = [];
    do {
      const pi = rand(0, tips.length);
      const parent = tips[pi];
      if (!parent) debugger;
      if (Math.random() < 0.9) {
        tips.splice(pi, 1);
      }
      if (g.edges(task)!.indexOf(parent) >= 0) continue;
      g.addEdge(task, parent);
      parents.push(parent);
    } while (Math.random() < 0.2 && tips.length > 0);
    if (parents.every((p) => p.finished != null) && Math.random() < 0.75) {
      task.started = new Date(now);
      if (Math.random() < 0.75) {
        task.finished = new Date(now);
        task.finished.setDate(task.finished.getDate() + 1);
      }
    }
    if (Math.random() < 0.05) {
      task.type = 'milestone';
    }
    if (Math.random() < 0.95) {
      tips.push(task);
    } else {
      task.type = 'milestone';
    }
  }
  tips.forEach((t) => (t.type = 'milestone'));
  return g;
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
