/**
 * @fileoverview Graph classes
 */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {computed, type Signal, signal, type WritableSignal} from '@angular/core';

import {Calendar, dateFormats} from './dates';
import * as np from './np';
import {byValue, NPError, NPPercentile, NPPercentileOrError, NPValue, undef,} from './np';
import {SerializedTask, Task} from './task';

export type EData = {
  from: number; to: number[];
};

export type GraphData = {
  tasks: SerializedTask[];
  E: EData[];
  nextTaskId: number;
};

export class Graph {
  tasksById = new Map<number, Task>();
  readonly topo: WritableSignal<Task[]> = signal([]);
  readonly taskIndex: Signal<Map<Task, number>> = computed(() => {
    const result = new Map<Task, number>();
    this.topo().forEach((t, i) => result.set(t, i));
    return result;
  });
  inTopoOrder = (a: Task, b: Task) =>
      this.taskIndex().get(a)! - this.taskIndex().get(b)!;
  nextTaskId: number = 0;

  hasTask(t: Task) {
    return this.tasksById.has(t.id) && this.tasksById.get(t.id) === t;
  }

  totalEng: NPValue = undef;
  completedEng: NPValue = undef;
  percentCompleted: NPValue = undef;

  static create(): Graph {
    return new Graph();
  }

  static deserialize(data: GraphData): Graph {
    const g = new Graph();
    for (const task of data.tasks) {
      const t = Task.deserialize(task);
      g._appendTask(t);
    }
    for (const {from, to} of data.E) {
      to.forEach(t => g.addEdge(g.task(from), g.task(t)));
    }
    g.nextTaskId = data.nextTaskId;
    return g;
  }

  serialize(): GraphData {
    const tasks: SerializedTask[] = this.topo().map(v => v.serialize());
    const edges: EData[] = [];
    for (const t of this.topo()) {
      edges.push({from: t.id, to: [...t.edges()].map((v) => v.id)});
    }
    const data = {tasks, E: edges, nextTaskId: this.nextTaskId} as GraphData;
    return data;
  }

  removeEdge(from: Task, to: Task) {
    if (!this.hasTask(from) || !this.hasTask(to)) {
      throw new Error('removeEdge called on task from another graph!');
    }
    from.removeEdge(to);
    to.removeInvEdge(from);
    this.layoutX();
  }

  task(id: number): Task {
    const t = this.tasksById.get(id);
    if (t === undefined) {
      throw new Error('unknown task id ' + id);
    } else {
      return t;
    }
  }

  insertTask(name: string, at: number): Task {
    const t = new Task(this.nextTaskId++, name);
    this._registerTask(t);
    this.topo.update(topo => {
      topo.splice(at, 0, t);
      return [...topo];
    });
    return t;
  }

  appendTask(name: string): Task {
    const t = new Task(this.nextTaskId++, name);
    return this._appendTask(t);
  }

  _registerTask(task: Task) {
    this.tasksById.set(task.id, task);
  }

  _appendTask(task: Task): Task {
    this._registerTask(task);
    this.topo.update(topo => {
      return [...topo, task];
    });
    return task;
  }

  addEdge(from: Task, to: Task) {
    if (!this.hasTask(to)) {
      console.log(
        'Trying to add an edge to',
        to.id,
        'which is not in the graph',
      );
      debugger;
    }
    if (!this.hasTask(from)) {
      console.log(
        'Trying to add an edge from',
        from.id,
        'which is not in the graph',
      );
      debugger;
    }
    let [fidx, tidx] = [from, to].map((t) => this.taskIndex().get(t)!);
    if (fidx < tidx) {
      console.log(
        'Trying to add an edge from',
        from.id,
        '@',
        fidx,
        'to',
        to.id,
        '@',
        tidx,
      );
      debugger;
    }
    from.addEdge(to);
    to.addInvEdge(from);
    this.layoutX();
  }

  insertBefore(t: Task, b: Task) {
    if (!this.hasTask(t) || !this.hasTask(b)) {
      throw new Error('insertBefore called on task from another graph!');
    }
    if (!b) {
      this.topo.update(topo => [t, ...topo]);
    } else {
      this.topo.update(topo => {
        topo.splice(this.taskIndex().get(b)!, 0, t);
        return [...topo];
      });
    }
    this.tasksById.set(t.id, t);
  }

  insertAfter(t: Task, a: Task) {
    if (!this.hasTask(t) || !this.hasTask(a)) {
      throw new Error('insertAfter called on task from another graph!');
    }
    if (!a) this.topo.update(topo => [t, ...topo]);
    this.topo.update(topo => {
      topo.splice(this.taskIndex().get(a)! + 1, 0, t);
      return [...topo];
    });
    this.tasksById.set(t.id, t);
  }

  next(t: Task) {
    if (!this.hasTask(t)) {
      throw new Error('next called on task from another graph!');
    }
    if (!t) {
      return this.topo()[0];
    }
    let idx = this.taskIndex().get(t)!;
    idx = (idx + 1) % this.topo().length;
    return this.topo()[idx];
  }

  prev(t: Task) {
    if (!this.hasTask(t)) {
      throw new Error('prev called on task from another graph!');
    }
    if (!t) {
      return this.topo()[this.topo.length - 1];
    }
    let idx = this.taskIndex().get(t)! - 1;
    if (idx < 0) {
      idx = this.topo().length - 1;
    }
    if (idx < 0) {
      return t;
    }
    return this.topo()[idx];
  }

  /**
   * Create a snapshot copy of the Graph.
   *
   * The current values of signals are used as snapshots, rather than creating
   * computed() values from them. This is correct because we don't want updates
   * from the original graph to leak into the copied graph.
   */
  copy() {
    const g = new Graph();
    this.tasksById.forEach(
        (v, id) => g.tasksById.set(id, new Task(v.id, v.name(), v.type())));
    this.tasksById.forEach(original => {
      const other = g.tasksById.get(original.id)!;
      other.edges.set(new Set([...original.edges()].map(
          original => g.tasksById.get(original.id)!)));
      other.inv_edges.set(new Set([...original.inv_edges()].map(
          original => g.tasksById.get(original.id)!)));
    });
    g.nextTaskId = this.nextTaskId;
    return g;
  }

  removeNode(v: Task, healEdges: boolean) {
    if (!this.hasTask(v)) {
      throw new Error('removeNode called on task from another graph!');
    }
    this.topo.update(topo => {
      topo.splice(this.taskIndex().get(v)!, 1);
      return [...topo];
    });
    this.tasksById.delete(v.id);
    const requiredBy = v.inv_edges();
    const dependsOn = v.edges();
    // Remove incoming edges that depend on this node.
    requiredBy.forEach((r) => {
      r.removeEdge(v);
      if (healEdges) {
        dependsOn.forEach((d) => this.addEdge(r, d));
      }
    });
    // remove v from invEdges of nodes that this one depends on.
    dependsOn.forEach((d) => {
      d.removeInvEdge(v);
    });
    this.layoutX();
  }

  layoutX() {
    /* We need to assign each task to a column, then arrange the columns
       so they don't overlap. It helps to think about the task graph as though
       it were git commits.

       We start by keeping a list of growable tips. These represent nodes that
       have following work that depends on them. We have to keep this list
       up-to-date: when a tip no longer has any nodes that depend on it, we can
       remove it from this list and call its column "complete". To achieve this,
       we use reference counting. When a node is added as a tip, we look at how
       many other nodes depend on it, and set its initial reference count to
       that number. As we find nodes that depend on it, we decrease the
       reference count until it reaches zero, then we can remove the tip.
     */
    let unused = this.topo().map(t => [t.inv_edges(), t.edges()]);
    const unclaimed = this.copy();
    class Column {
      first: Task;
      last: Task;
      x: number;
      constructor(first: Task, x: number) {
        this.first = first;
        this.last = first;
        this.x = x;
      }
    }
    const columns: Column[] = [];
    let colid = 0;
    const freeCols: number[] = [];
    const freeCol = (parents: Task[], t: Task) => {
      const parentXs = parents.map((p) => columnOf.get(p)!.x);
      for (let i = 0; i < freeCols.length; i++) {
        if (parentXs.indexOf(freeCols[i]) >= 0) continue;
        const x: number = freeCols[i];
        if (crossesAny(t, x, parents, undefined)) continue;
        freeCols.splice(i, 1);
        return x;
      }
      return colid++;
    };
    const newColumn = (t: Task, parents: Task[]) => {
      let id = freeCol(parents, t);
      const col = new Column(t, id);
      columns.push(col);
      return col;
    };
    const order = new Map(this.topo().map((v, i) => [v, i]));
    const byOrder = (a: Task, b: Task) => order.get(a)! < order.get(b)!;
    const columnOf = new Map<Task, Column>();
    const crosses = (p: Task, t: Task, colId: number) => {
      for (let i = order.get(p)! + 1; i < order.get(t)!; i++) {
        const n = this.topo()[i];
        const c = columnOf.get(n)!;
        if (c.x == colId) {
          return true;
        }
      }
      return false;
    };
    const crossesAny = (
      t: Task,
      colId: number,
      parents: Task[],
      except?: Task,
    ) => {
      for (let p of parents) {
        if (p == except) continue;
        if (crosses(p, t, colId)) {
          return true;
        }
      }
      return false;
    };
    const endColumn = (col: Column, t: Task) => {
      // XXX: The following line does nothing, because freeCols was an array of
      // numbers, not columns, and so this never worked.
      // XXX: if (freeCols.indexOf(col) >= 0) throw 'wtf';
      if (freeCols.indexOf(col.x) >= 0) throw new Error('wtf');
      freeCols.push(col.x);
      freeCols.sort(byValue);
      columns.splice(columns.indexOf(col), 1);
    };
    const getColumn = (t: Task) => {
      const parents = [...t.edges()];
      const firstChildOf = parents.filter(
          (p) => [...p.inv_edges()].indexOf(t) == 0,
      );
      for (let p of firstChildOf) {
        const col = columnOf.get(p)!;
        if (crossesAny(t, col.x, parents, p)) {
          continue;
        }
        return col;
      }
      return newColumn(t, parents);
    };
    this.topo().forEach((t, i) => {
      const col = getColumn(t);
      col.last = t;
      columnOf.set(t, col);
      t.dotx.set(col.x);
      t.doty.set(i);
      col.last.edges().forEach(
          (p) =>
              unclaimed.removeEdge(unclaimed.task(t.id), unclaimed.task(p.id)));
      for (let c of columns) {
        if (unclaimed.task(c.last.id).inv_edges().size == 0) {
          endColumn(c, t);
        }
      }
    });

    // Calculate and store visible paths
    this.topo().forEach((t) => (t.visible_paths = []));

    for (let from of this.topo()) {
      for (let to of from.edges()) {
        let fromY = from.doty();
        let toY = to.doty();
        // The path from fromY to toY is visible on all tasks between them.
        for (let i = toY; i <= fromY; i++) {
          this.topo()[i].visible_paths.push([to, from]);
        }
      }
    }

    return colid;
  }

  blocked(t: Task) {
    if (!this.hasTask(t)) {
      throw new Error('blocked called on task from another graph!');
    }
    if (t.finished !== null) {
      return false;
    } // finished
    if (t.started !== null) {
      return false;
    } // in progress
    // XXX: make this computed()
    if ([...t.edges()].every((p) => p.finished !== null)) {
      return false; // startable
    }
    return true; // blocked
  }

  calculateDates(calendar: Calendar) {
    const durations = new Map<Task, NPValue>();
    const engTime = new Map<Task, NPValue>();
    console.log('calculate dates');
    const today = calendar.today();
    const defaultStart: NPValue = np.rand_norm90(today, 10);
    // TODO: this probably belongs on the Estimate, which would have the
    // side-effect of keeping it stable and decreasing the cost of
    // calculateDates by 1/3.
    const doCalEst = (t: Task): NPValue => {
      if (t.calEstimate() !== undefined) {
        return t.calEstimate()!.dist;
      }
      return {type: 'error', message: `No calendar estimate for ${t.id}`, range: ''};
    };
    const doEngEst = (t: Task): NPValue => {
      if (t.engEstimate() !== undefined) {
        return t.engEstimate()!.dist;
      }
      return {type: 'error', message: `No eng estimate for ${t.id}`, range: ''};
    };
    // TODO: this is just here to make it obvious if we've violated a
    // topological ordering constraint, or an edge to a deleted task has been
    // retained. In normal operation, endDates are always set before they are
    // read.
    this.topo().forEach((t) => (t.endDates.set(undef)));
    this.topo().filter((t) => !t.finished()).forEach((t) => {
      durations.set(t, doCalEst(t));
      engTime.set(t, doEngEst(t));
    });

    const toDates = (days: NPValue): NPPercentileOrError<Date> => {
      const checkDate = (wd: number) => {
        const date = calendar.date(wd);
        if (isNaN(date.valueOf())) debugger;
        return date;
      };
      const pct = np.percentile90(days);
      if (pct.type === 'error') return pct;
      return {
        type: 'percentile',
        lb: checkDate(pct.lb),
        med: checkDate(pct.med),
        ub: checkDate(pct.ub),
      };
    };

    this.totalEng = np.add(this.topo()
                               .filter(t => t.engEstimate() !== undefined)
                               .map(t => t.engEstimate()!.dist));

    this.completedEng = np.add(this.topo()
                                   .filter(
                                       t => t.engEstimate() !== undefined &&
                                           t.finished() !== undefined)
                                   .map(t => t.engEstimate()!.dist));

    this.percentCompleted = np.mul([np.scalar(100), np.div(this.completedEng, this.totalEng)]);

    this.topo().forEach((t) => {
      const parents: Task[] = [...t.edges()];
      const start: NPValue = t.started() ?
          {
            type: 'scalar',
            scalar: calendar.workDay(t.started()!),
            range: t.started.toString()
          } :
          parents.length == 0 ?
          defaultStart :
          np.max(parents.map((p) => p.endDates()).concat([defaultStart]));
      t.startDates.set(start);
      t.startDateP.set(toDates(start));
      const end: NPValue = t.finished() ? {
        type: 'scalar',
        scalar: calendar.workDay(t.finished()!),
        range: t.finished.toString()
      } :
                                          np.add([start, durations.get(t)!]);
      t.endDates.set(end);
      t.endDateP.set(toDates(end));
    });
  }

  minDate = computed(() => {
    const minDate = new Date(
        Math.min(
            ...(this.topo()
                    .map((t) => t.startDateP())
                    .filter((a) => a.type === 'percentile') as
                NPPercentile<Date>[])
                .map((a) => a.lb.valueOf()),
            ),
    );
    minDate.setDate(1);
    return minDate;
  });

  maxDate = computed(() => {
    const maxDate = new Date(
        Math.max(
            ...(this.topo()
                    .map((t) => t.endDateP())
                    .filter((a) => a.type === 'percentile') as
                NPPercentile<Date>[])
                .map((a) => a.ub.valueOf()),
            ),
    );
    maxDate.setDate(0);
    maxDate.setMonth(maxDate.getMonth() + 1);
    return maxDate;
  });
}
