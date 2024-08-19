/**
 * @fileoverview Graph classes
 */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {DateObserver} from './date-observer';
import {Calendar, dateFormats} from './dates';
import * as np from './np';
import {
  NPError,
  NPPercentile,
  NPPercentileOrError,
  NPValue,
  byValue,
  undef,
} from './np';
import type {Task} from './task';

function invertEdges(V: Set<Task>, E: Map<Task, Task[]>) {
  const E_inv = new Map<Task, Task[]>();
  V.forEach((v) => E_inv.set(v, []));
  E.forEach((dependsOn, requiredBy) =>
    dependsOn.forEach((preReq) => E_inv.get(preReq)!.push(requiredBy)),
  );
  return E_inv;
}

// The json is supposed to be stored topologically sorted, but we can't count on
// it.
function topoSort(V: Set<Task>, E: Map<Task, Task[]>) {
  const UNVISITED = 1;
  const DISCOVERED = 2;
  const FINISHED = 3;

  const discovery = new Map();
  V.forEach((v) => discovery.set(v, UNVISITED));
  const discoveryPath = new Map<Task, Task[]>();
  const topo: Task[] = [];
  function dfs(v: Task, path: Task[], prefix: string) {
    if (discovery.get(v) != UNVISITED) return;
    discovery.set(v, DISCOVERED);
    discoveryPath.set(v, path);
    E.get(v)!.forEach((u, i) => {
      if (discovery.get(u) == DISCOVERED) {
        const msg = `Not a DAG: ${v.id}->${discoveryPath
          .get(u)!
          .map((v) => v.id)
          .join('->')}, ${path.map((v) => v.id).join('->')}`;
        alert(msg);
        console.log(msg);
      }
      if (discovery.get(u) == FINISHED) return;
      dfs(u, [...path, u], prefix + ' ');
    });
    discovery.set(v, FINISHED);
    topo.push(v);
  }
  V.forEach((v) => dfs(v, [v], ''));
  return topo;
}

function setPop<T>(s: Set<T>): T {
  const val = s.values().next().value;
  s.delete(val);
  return val;
}

export class Graph {
  V = new Set<Task>();
  E = new Map<Task, Task[]>();
  E_inv = new Map<Task, Task[]>();
  topo: Task[] = [];
  allEdges: [Task, Task][] = [];

  constructor(
    V: Set<Task>,
    E: Map<Task, Task[]>,
    E_inv: Map<Task, Task[]>,
    topo: Task[],
  ) {
    this.V = V;
    this.E = E;
    this.E_inv = E_inv;
    this.topo = topo;
    this.allEdges = [];
    this.E.forEach((vs, k) => vs.forEach((v) => this.allEdges.push([k, v])));
  }

  removeEdge(from: Task, to: Task) {
    const edges = this.edges(from);
    const i = edges.indexOf(to);
    if (i >= 0) {
      edges.splice(i, 1);
    }
    const invEdges = this.invEdges(to);
    const j = invEdges.indexOf(from);
    if (j >= 0) {
      invEdges.splice(j, 1);
    }
    for (let i = 0; i < this.allEdges.length; i++) {
      if (this.allEdges[i][0] == from && this.allEdges[i][1] == to) {
        this.allEdges.splice(i, 1);
        break;
      }
    }
  }

  addEdge(from: Task, to: Task) {
    if (!this.V.has(to)) {
      console.log(
        'Trying to add an edge to',
        to.id,
        'which is not in the graph',
      );
      debugger;
    }
    if (!this.V.has(from)) {
      console.log(
        'Trying to add an edge from',
        from.id,
        'which is not in the graph',
      );
      debugger;
    }
    let [fidx, tidx] = [from, to].map((t) => this.topo.indexOf(t));
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
    let edges: Task[] = [];
    if (this.E.has(from)) {
      edges = this.E.get(from)!;
    } else {
      edges = new Array();
      this.E.set(from, edges);
    }
    let isNew = false;
    if (edges.indexOf(to) < 0) {
      edges.push(to);
      isNew ||= true;
    }

    let invEdges = [];
    if (this.E_inv.has(to)) {
      invEdges = this.E_inv.get(to)!;
    } else {
      invEdges = new Array();
      this.E_inv.set(to, invEdges);
    }
    if (invEdges.indexOf(from) < 0) {
      invEdges.push(from);
      isNew ||= true;
    }

    if (isNew) {
      this.allEdges.push([from, to]);
    }
  }

  insertBefore(t: Task, b: Task) {
    if (!b) this.topo.splice(0, 0, t);
    let idx = this.topo.indexOf(b);
    this.topo.splice(idx, 0, t);
    this.V.add(t);
  }

  insertAfter(t: Task, a: Task) {
    if (!a) this.topo.splice(0, 0, t);
    let idx = this.topo.indexOf(a) + 1;
    this.topo.splice(idx, 0, t);
    this.V.add(t);
  }

  next(t: Task) {
    if (!t) {
      return this.topo[0];
    }
    let idx = this.topo.indexOf(t);
    idx = (idx + 1) % this.topo.length;
    return this.topo[idx];
  }

  prev(t: Task) {
    if (!t) {
      return this.topo[this.topo.length - 1];
    }
    let idx = this.topo.indexOf(t) - 1;
    if (idx < 0) {
      idx = this.topo.length - 1;
    }
    return this.topo[idx];
  }

  edges(v: Task): Task[] {
    return this.E.get(v) || [];
  }

  invEdges(v: Task): Task[] {
    return this.E_inv.get(v) || [];
  }

  subGraph(vs: Set<Task>) {
    const E_new = new Map<Task, Task[]>();
    const E_inv_new = new Map<Task, Task[]>();
    // Only edges from an element of V to an element of V.
    vs.forEach((v) => {
      E_new.set(
        v,
        this.edges(v).filter((u) => vs.has(u)),
      );
      E_inv_new.set(
        v,
        this.invEdges(v).filter((u) => vs.has(u)),
      );
    });
    const topo = this.topo.filter((v) => vs.has(v));
    return new Graph(vs, E_new, E_inv_new, topo);
  }

  copy() {
    const V = new Set(this.V);
    const E_new = new Map<Task, Task[]>();
    this.E.forEach((vs, k) => E_new.set(k, [...vs]));
    const E_inv_new = new Map<Task, Task[]>();
    this.E_inv.forEach((vs, k) => E_inv_new.set(k, [...vs]));
    return new Graph(V, E_new, E_inv_new, [...this.topo]);
  }

  removeSubComponent(vs: Set<Task>) {
    const g = this.subGraph(vs);
    vs.forEach((v) => this.removeNode(v, false));
    this.topo = this.topo.filter((v) => this.V.has(v));
    return g;
  }

  removeNode(v: Task, healEdges: boolean) {
    this.topo.splice(this.topo.indexOf(v), 1);
    this.V.delete(v);
    const requiredBy = this.invEdges(v);
    const dependsOn = this.edges(v);
    this.E.delete(v);
    this.E_inv.delete(v);
    // Remove incoming edges that depend on this node.
    requiredBy.forEach((r) => {
      const incoming = this.edges(r);
      if (!incoming) return;
      const i = incoming.indexOf(v);
      if (i < 0) return;
      incoming.splice(i, 1);
      if (healEdges) {
        dependsOn.forEach((d) => this.addEdge(r, d));
      }
    });
    // remove v from invEdges of nodes that this one depends on.
    dependsOn.forEach((d) => {
      const outgoing = this.invEdges(d);
      if (!outgoing) return;
      const i = outgoing.indexOf(v);
      if (i < 0) return;
      outgoing.splice(i, 1);
    });
    this.allEdges = this.allEdges.filter(([from, to]) => from != v && to != v);
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
    const order = new Map(this.topo.map((v, i) => [v, i]));
    const byOrder = (a: Task, b: Task) => order.get(a)! < order.get(b)!;
    const columnOf = new Map<Task, Column>();
    const crosses = (p: Task, t: Task, colId: number) => {
      for (let i = order.get(p)! + 1; i < order.get(t)!; i++) {
        const n = this.topo[i];
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
      const parents = this.edges(t);
      const firstChildOf = parents.filter(
        (p) => this.invEdges(p).indexOf(t) == 0,
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
    this.topo.forEach((t, i) => {
      const col = getColumn(t);
      col.last = t;
      columnOf.set(t, col);
      t.dotx = col.x;
      t.doty = i;
      this.edges(col.last).forEach((p) => unclaimed.removeEdge(t, p));
      for (let c of columns) {
        if (unclaimed.invEdges(c.last).length == 0) {
          endColumn(c, t);
        }
      }
    });

    // Calculate and store visible paths
    this.topo.forEach((t) => (t.visible_paths = []));

    for (let [from, tos] of this.E) {
      for (let to of tos) {
        let fromY = from.doty;
        let toY = to.doty;
        // The path from fromY to toY is visible on all tasks between them.
        for (let i = toY; i <= fromY; i++) {
          this.topo[i].visible_paths.push([to, from]);
        }
      }
    }

    return colid;
  }

  blocked(t: Task) {
    if (t.finished !== null) {
      return false;
    } // finished
    if (t.started !== null) {
      return false;
    } // in progress
    if (this.edges(t).every((p) => p.finished !== null)) {
      return false; // startable
    }
    return true; // blocked
  }

  calculateDates(calendar: Calendar) {
    const durations = new Map<Task, NPValue>();
    console.log('calculate dates');
    const today = calendar.today();
    const defaultStart: NPValue = np.rand_norm90(today, 10);
    // TODO: this probably belongs on the Estimate, which would have the
    // side-effect of keeping it stable and decreasing the cost of
    // calculateDates by 1/3.
    const doEst = (t: Task): NPValue => {
      if (t.estimate !== undefined) {
        if (!t.estimate.dist) {
          return (t.estimate.dist = np.rand_norm90(
            t.estimate.lb_days,
            t.estimate.ub_days,
          ));
        }
        return t.estimate.dist;
      }
      return {type: 'error', message: `No estimate for ${t.id}`};
    };
    // TODO: this is just here to make it obvious if we've violated a
    // topological ordering constraint, or an edge to a deleted task has been
    // retained. In normal operation, endDates are always set before they are
    // read.
    this.topo.forEach((t) => (t.endDates = undef));
    this.topo
      .filter((t) => !t.finished)
      .forEach((t) => durations.set(t, doEst(t)));

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

    this.topo.forEach((t) => {
      const parents = this.edges(t);
      const start: NPValue = t.started
        ? {type: 'scalar', scalar: calendar.workDay(t.started)}
        : parents.length == 0
          ? defaultStart
          : np.max(parents.map((p) => p.endDates).concat([defaultStart]));
      t.startDates = start;
      t.startDateP = toDates(start);
      const end: NPValue = t.finished
        ? {type: 'scalar', scalar: calendar.workDay(t.finished)}
        : np.add([start, durations.get(t)!]);
      t.endDates = end;
      t.endDateP = toDates(end);
    });
    DateObserver.notifyAll();
  }

  getDateRange() {
    const minDate = new Date(
      Math.min(
        ...(
          this.topo
            .map((t) => t.startDateP)
            .filter((a) => a.type === 'percentile') as NPPercentile<Date>[]
        ).map((a) => a.lb.valueOf()),
      ),
    );
    minDate.setDate(1);
    const maxDate = new Date(
      Math.max(
        ...(
          this.topo
            .map((t) => t.endDateP)
            .filter((a) => a.type === 'percentile') as NPPercentile<Date>[]
        ).map((a) => a.ub.valueOf()),
      ),
    );
    maxDate.setDate(0);
    maxDate.setMonth(maxDate.getMonth() + 1);
    return {minDate, maxDate};
  }
}

export function mainGraph(G: {V: Map<number, Task>; E: Map<Task, Task[]>}) {
  const V = new Set<Task>(G.V.values());
  const E = new Map<Task, Task[]>();
  G.E.forEach((dependsOn, v) => E.set(v, [...dependsOn]));
  const E_inv = invertEdges(V, E);
  const topo = topoSort(V, E);
  const order = new Map(topo.map((v, i) => [v, i]));
  const byOrder = (a: Task, b: Task) => order.get(a)! - order.get(b)!;
  E.forEach((vs) => vs.sort(byOrder));
  E_inv.forEach((vs) => vs.sort(byOrder));
  return new Graph(V, E, E_inv, topo);
}
