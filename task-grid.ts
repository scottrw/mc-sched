/**
 * @fileoverview Virtualizer-based scrolling container for task rows.
 */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import '@lit-labs/virtualizer';
import './task-row';

import type {LitVirtualizer} from '@lit-labs/virtualizer';
import {virtualizerRef} from '@lit-labs/virtualizer/virtualize.js';
import {css, html, LitElement, noChange, nothing, svg, TemplateResult,} from 'lit';
import {Directive, directive, ElementPart, Part} from 'lit/async-directive.js';
import {customElement, property, query} from 'lit/decorators.js';
import {createRef, ref} from 'lit/directives/ref.js';

import {Graph} from './graph';
import * as np from './np';
import {fireOps} from './op';
import {Task} from './task';
import type {TaskRow} from './task-row';
import {assertIsDefined} from './util';
import {displayDotX, FONTSIZE, PAD, YSKIP} from './view-constants';
import {ViewOptions} from './view-options';
import {SignalWatcher} from './watcher';

/*
   Virtualizer doesn't expose a convenient Promise we can use for determining
   when a brand new TaskRow has been created. So we have to catch it in the
   act using a directive.

   This is a mess. I can see easily leaking memory here.
 */
export class TaskMapDirective extends Directive {
  override update(part: ElementPart, [task]: Task[]) {
    const p = TaskMapDirective.map.get(task);
    if (p) {
      TaskMapDirective.map.delete(task);
      p(part.element as TaskRow);
    }
    return noChange;
  }
  render(...props: Array<unknown>) {}
  static map = new Map<Task, (taskRow: TaskRow) => void>();
  static row(task: Task): Promise<TaskRow> {
    const p = new Promise<TaskRow>((resolve, reject) => {
      TaskMapDirective.map.set(task, resolve);
    });
    return p;
  }
}

@customElement('task-grid') export class TaskGrid extends SignalWatcher
(LitElement) {
  @property() graph?: Graph;
  get g(): Graph {
    assertIsDefined(this.graph);
    return this.graph;
  }
  @property() selectedTasks: Set<Task> = new Set();
  @property() activeTask?: Task;
  get activeOrTop() {
    if (this.activeTask) {
      return this.activeTask;
    }
    return this.g.topo()[0];
  }

  @property() viewOptions?: ViewOptions;
  /* The fact that these are read here and set in DagView probably means the
     toolbar belongs here too?

     Or else, TaskGrid should take a .filter property instead? The question is
     how to decide when to set it. */
  get searchFilter() {
    return this.viewOptions!.searchFilter;
  }
  get showFinished() {
    return this.viewOptions!.showFinished;
  }
  get showBlocked() {
    return this.viewOptions!.showBlocked;
  }
  get showOnlyMilestones() {
    return this.viewOptions!.showOnlyMilestones;
  }
  get dateFormat() {
    return this.viewOptions!.dateFormat;
  }

  taskMap = directive(TaskMapDirective);

  @query('lit-virtualizer') virtualizer?: any;

  static override styles = css`
    :host {
      display: grid;
      grid-template-rows: min-content auto;
      grid-template-areas:
        'header'
        'content';
    }
    #column-headers-wrapper {
      width: 100%;
      min-height: 24px;
      overflow: scroll;
      grid-area: header;
    }
    #column-headers-wrapper::-webkit-scrollbar {
      display: none;
    }
    #column-headers {
      border-bottom: 1px solid #e3e3e3;
      border-top: 1px solid #e3e3e3;
      background-color: white;
      white-space: nowrap;
      user-select: none;
    }
    #content {
      overflow: scroll;
      background-color: white;
      border-top: 1px solid #c4c7c5;
      grid-area: content;
      scroll-margin: 2;
    }
    #content::-webkit-scrollbar {
      -webkit-appearance: none;
    }
    #content::-webkit-scrollbar:vertical {
      width: 11px;
    }
    #content::-webkit-scrollbar:horizontal {
      height: 11px;
    }
    #content::-webkit-scrollbar-thumb {
      border-radius: 8px;
      border: 2px solid white;
      background-color: rgba(0, 0, 0, 0.5);
      border-right: 1px solid #e3e3e3;
    }
    td,
    th {
      padding: 0;
      font-size: 14px;
      border-collapse: collapse;
      border-spacing: 0;
      display: inline-block;
    }
    tr {
      border-bottom: 1px solid #dddbdb;
    }
    table {
      table-layout: fixed;
      border-collapse: collapse;
      border-spacing: 0;
    }
    .omitted {
      min-height: 1px;
      background-color: grey;
      width: 100%;
    }
  `;
  headersWrapperRef = createRef();
  // NOTE: this is a useful way to figure out what's causing the task grid
  // to re-render. For example, if a click event reaches the task grid, it will
  // trigger the click event handler, and the requestUpdate stack will include
  // the click handler.
  // override requestUpdate(name?: string, value?: any) {
  //   super.requestUpdate(name, value);
  //   console.trace('task-grid requestUpdate');
  // }
  //
  // TODO: fix this. When scrolling full right, the column headers stop moving
  // because the content has a vertical scroll-bar in the way. The fix is probably
  // to stick a DIV in the column header container to eat that space so the scroll
  // matches.
  override render() {
    // TODO: This is getting called for every cell selection and keyboard
    // motion event.
    console.log('TaskGrid render');
    // TODO: we probably don't want to re layout on every render, do we?
    const colid = displayDotX(this.g.layoutX());

    let curX = 0;
    const allHeaders: {width: number; title: string}[] = [];
    const headers: {[key: string]: {width: number; title: string}} = {};
    // uses box-sizing model (width includes padding)
    const _hdr = (varname: string, title: string, width: number) => {
      curX++;
      curX += 2 * PAD + width - 2;
      headers[varname] = {width, title};
      allHeaders.push(headers[varname]);
    };

    _hdr('circles', '', colid);
    _hdr('status', '', YSKIP);
    _hdr('name', 'Task name', FONTSIZE * 20);
    _hdr('cal_est', 'Cal Est', FONTSIZE * 5);
    _hdr('eng_est', 'Eng Est', FONTSIZE * 5);
    _hdr('start', 'Start', FONTSIZE * 10);
    _hdr('end', 'End', FONTSIZE * 10);
    _hdr('gantt', '', 1000);
    const shouldShow = (t: Task) => {
      let result = true;
      if (this.searchFilter && t.name().indexOf(this.searchFilter) < 0) {
        result = false;
      }
      if (!this.showFinished && t.finished()) {
        result = false;
      }
      if (!this.showBlocked && this.g.blocked(t)) {
        result = false;
      }
      if (this.showOnlyMilestones && t.type() != 'milestone') {
        result = false;
      }
      return result;
    };
    // TODO: the typing for lit-virtualizer is pretty weird.
    const renderItem = (t: Task): any => {
      if (t === undefined) {
        console.log('rendered an undefined task');
        return nothing;
      }
      if (shouldShow(t)) {
        return html`<task-row
          .task=${t}
          .minDate=${this.g.minDate()}
          .maxDate=${this.g.maxDate()}
          id="task-${t.id}"
          ${this.taskMap(t)}
          .dateFormat=${this.dateFormat}
          .headers=${headers}
          .selected=${this.selectedTasks.has(t)}
          .active=${this.activeTask === t}>
        </task-row>`;
      } else {
        return html`<div class="omitted"></div>`;
      }
    };

    // TODO: should set min-width instead of width, so that it expands to fill
    // the parent when it can. Otherwise it looks silly.
    return html`<div
        id="column-headers-wrapper"
        ${ref(this.headersWrapperRef)}>
        <table id="column-headers" style="width: ${curX + 12 + 'px'}">
          <tr id="column-headers-row">
            ${
        allHeaders.map(
            (h) => html`<td style="width: ${h.width + 'px'}">${h.title}</td>`,
            )}
          </tr
        ></table
      ></div
      ><div
        id="content"
        @scroll=${this.syncScroll}
        @create-task=${this.handleCreateTask}
        >${this.createFirstTask()}<div
          id="table-content"
          style="width: ${curX + 'px'}"
          @select=${this.handleSelect}>
          <lit-virtualizer
            .items=${this.g.topo() as Task[]}
            .renderItem=${
        renderItem as (
            t: unknown,
            idx: number,
            ) => TemplateResult}
            }}></lit-virtualizer
        ></div
      ></div>`;
  }
  createFirstTask() {
    if (this.g.topo().length == 0) {
      return html`<div
        @click=${this.handleCreateFirstTask}
        >Create your first task!</div>`;
    } else {
      return nothing;
    }
  }
  handleCreateFirstTask() {
    fireOps(this, 'create-first-task', [() => {
              this.createTask({before: true, branch: false});
            }]);
  }
  handleSelect(e: CustomEvent) {
    const task = (e.target as unknown as TaskRow).task;
    if (!task) return;
    const {toggle, range} = e.detail as {toggle: boolean; range: boolean};
    if (!toggle && !range) {
      this.set(task);
    } else if (!toggle && range) {
      this.addRange(task);
    } else if (toggle && !range) {
      this.add(task); // TODO: toggle
    }
    e.stopPropagation();
    this.fireSelectionChanged();
  }
  syncScroll(e: Event) {
    if (this.headersWrapperRef.value)
      this.headersWrapperRef.value.scrollLeft = (
        e.target as HTMLElement
      )?.scrollLeft;
  }
  fireCalculateDates() {
    this.dispatchEvent(
        new CustomEvent('calculate-dates', {bubbles: true, composed: true}),
    );
  }
  toggleType() {
    fireOps(this, 'toggle-type', [() => {
              this.selectedTasks.forEach((t) => {
                t.type.update(type => type == 'task' ? 'milestone' : 'task');
              });
            }]);
  }
  setTypeTask() {
    fireOps(this, 'set-type-task', [() => {
              this.selectedTasks.forEach((t) => (t.type.set('task')));
              this.updateComplete.then(() => {
                this.fireCalculateDates();
              });
            }]);
  }
  setTypeMilestone() {
    fireOps(this, 'set-type-milestone', [() => {
              this.selectedTasks.forEach((t) => (t.type.set('milestone')));
              this.updateComplete.then(() => {
                this.fireCalculateDates();
              });
            }]);
  }
  del({healEdges}: {healEdges: boolean}) {
    fireOps(this, 'del', [() => {
              const orderedTasks = this._orderedTasks();
              const firstTask = orderedTasks.shift();
              if (firstTask) {
                const idx = this.g.taskIndex().get(firstTask)!;
                for (let t of this.selectedTasks) {
                  this._del(t, {healEdges});
                }
                if (idx < this.g.topo().length - 1) {
                  this.set(this.g.topo()[idx]);
                }
                this.updateComplete.then(() => {
                  this.fireCalculateDates();
                });
              }
            }]);
  }

  private _del(t: Task, {healEdges}: {healEdges: boolean}) {
    this.g.removeNode(t, healEdges);
    this.selectedTasks.delete(t);
    assertIsDefined(this.g);
    if (this.activeTask == t) {
      this.activeTask = this._orderedTasks().pop();
    }
  }
  add(t: Task) {
    this.selectedTasks.add(t);
    this.activeTask = t;
  }
  set(t: Task) {
    (this.getTaskRow(t) as any)?.scrollIntoViewIfNeeded();
    this.selectedTasks.clear();
    this.selectedTasks.add(t);
    this.activeTask = t;
  }
  addRange(t: Task) {
    if (!this.activeTask) {
      this.add(t);
      return;
    }
    const last_idx = this.g.taskIndex().get(this.activeTask)!;
    const t_idx = this.g.taskIndex().get(t)!;
    const [from, to] = [last_idx, t_idx].sort(np.byValue);
    for (let i = from; i <= to; i++) {
      this.selectedTasks.add(this.g.topo()[i]);
    }
    this.activeTask = t;
  }
  private has(t: Task) {
    return this.selectedTasks.has(t);
  }
  private isActive(t: Task) {
    return this.activeTask == t;
  }
  private clear() {
    this.selectedTasks.clear();
    this.activeTask = undefined;
  }
  private next() {
    this.set(this.g.next(this.activeOrTop));
  }
  private prev() {
    this.set(this.g.prev(this.activeOrTop));
  }
  private growDown() {
    this.add(this.g.next(this.activeOrTop));
  }
  private growUp() {
    this.add(this.g.prev(this.activeOrTop));
  }
  private _orderedTasks() {
    const tasks = Array.from(this.selectedTasks.values());
    tasks.sort(this.g.inTopoOrder);
    return tasks;
  }
  private _reverseOrderedTasks() {
    const tasks = Array.from(this.selectedTasks.values());
    tasks.sort(this.g.inTopoOrder);
    return tasks;
  }
  addDeps() {
    fireOps(this, 'add-deps', [() => {
              const tasks = this._orderedTasks();
              const t = tasks.pop();
              if (t) {
                tasks.forEach((p) => this.g.addEdge(t, p));
                // this.requestUpdate();
                this.updateComplete.then(() => {
                  this.fireCalculateDates();
                });
              }
            }]);
  }
  removeDeps() {
    fireOps(this, 'remove-deps', [() => {
              const tasks = this._orderedTasks();
              const t = tasks.pop();
              if (t) {
                const dependsOn = t.edges();
                tasks.filter((p) => dependsOn.has(p))
                    .forEach((p) => this.g.removeEdge(t, p));
                this.updateComplete.then(() => {
                  this.fireCalculateDates();
                });
              }
            }]);
  }
  shiftUp() {
    fireOps(
        this, 'shift-up', [() => {
          const tasks = Array.from(this.selectedTasks.values());
          tasks.sort(this.g.inTopoOrder);
          for (let t of tasks) {
            const dependsOn = [...t.edges()];
            const latestDep = Math.max(
                0,
                ...dependsOn.map((d) => this.g.taskIndex().get(d)!),
            );
            const idx = this.g.taskIndex().get(t)!;
            if (idx - 1 > latestDep) {
              this.g.topo.update(topo => {
                const old = topo[idx - 1];
                topo.splice(idx - 1, 2, t, old);
                return [...topo];
              });
            }
          }
          this.requestUpdate();  // XXX this shouldn't be necessary!
          this.updateComplete.then(
              () =>
                  (this.getTaskRow(tasks[0]) as any)?.scrollIntoViewIfNeeded(),
          );
        }]);
  }
  shiftDown() {
    fireOps(
        this, 'shift-down', [() => {
          const tasks = [...this.selectedTasks];
          tasks.sort(this.g.inTopoOrder);
          for (let t of tasks) {
            const requiredBy = [...t.inv_edges()];
            const firstReq = Math.min(
                this.g.topo().length,
                ...requiredBy.map((d) => this.g.taskIndex().get(d)!),
            );
            const idx = this.g.topo().indexOf(t);
            if (idx + 1 < firstReq) {
              this.g.topo.update(topo => {
                const old = topo[idx + 1];
                topo.splice(idx, 2, old, t);
                return [...topo];
              });
            }
          }
          this.requestUpdate();  // XXX this shouldn't be necessary!
          this.updateComplete.then(
              () =>
                  (this.getTaskRow(tasks[0]) as any)?.scrollIntoViewIfNeeded(),
          );
        }]);
  }
  createTask({before, branch}: {before: boolean; branch: boolean}) {
    fireOps(this, 'create-task', [() => {
              let at = 0;
              let t: Task;
              if (!this.activeTask) {
                t = this.g.insertTask('New task', at);
              } else {
                const selectedIdxs: number[] = [];
                this.selectedTasks.forEach(
                    t => selectedIdxs.push(this.g.topo().indexOf(t)));
                const targetIdx = before ? Math.min(...selectedIdxs) :
                                           Math.max(...selectedIdxs);
                const target = this.g.topo()[targetIdx];
                if (before) {
                  t = this.g.insertTask('New task', targetIdx);
                } else {
                  t = this.g.insertTask('New task', targetIdx + 1);
                }
                if (before) {
                  if (!branch) {
                    const edges = [...target.edges()];  // copy
                    edges.forEach((to) => {
                      this.g.addEdge(t, to);
                      this.g.removeEdge(target, to);
                    });
                  }
                  this.selectedTasks.forEach((c) => this.g.addEdge(c, t));
                } else {
                  if (!branch) {
                    target.inv_edges().forEach((from) => {
                      this.g.addEdge(from, t);
                      this.g.removeEdge(from, target);
                    });
                  }
                  assertIsDefined(this.g);
                  this.selectedTasks.forEach((p) => this.g.addEdge(t, p));
                }
              }
              this.set(t);
              TaskMapDirective.row(t).then((r) => {
                this.fireCalculateDates();
                r.edit('name');
              });
            }]);
  }
  toggleStatus() {
    fireOps(this, 'toggle-status', [() => {
              this.activeTask?.toggleStatus(new Date());
              window.setTimeout(() => {
                this.fireCalculateDates();
              });
            }]);
  }
  override connectedCallback() {
    super.connectedCallback();
    document.body.addEventListener('keydown', this.boundKeydown);
  }
  override disconnectedCallback() {
    super.disconnectedCallback();
    document.body.removeEventListener('keydown', this.boundKeydown);
  }
  private getTaskRow(t: Task): TaskRow {
    return this.shadowRoot!.getElementById(`task-${t.id}`)! as TaskRow;
  }
  boundKeydown = this.keydown.bind(this);
  keydown(e: KeyboardEvent) {
    if (e.target != document.body) {
      return;
    }
    if (e.key == 'Escape') {
      this.clear();
      this.fireSelectionChanged();
    }
    if (e.key == 'Enter') {
      if (!this.activeTask) return;
      if (e.ctrlKey || e.altKey || e.metaKey) {
        this.createTask({before: e.shiftKey, branch: e.altKey});
      } else if (this.activeTask) {
        this.getTaskRow(this.activeTask)!.edit('name');
      }
    }
    if (e.key == 'Delete' || e.key == 'Backspace') {
      this.del({healEdges: e.ctrlKey});
    }
    if (e.key == 'd') {
      this.addDeps();
    }
    if (e.key == 'D') {
      this.removeDeps();
    }
    if (e.key == 'ArrowDown' || e.key == 'j' || e.key == 'J') {
      if (e.ctrlKey || e.metaKey) {
        this.shiftDown();
      } else if (e.shiftKey) {
        this.growDown();
      } else {
        this.next();
      }
      e.preventDefault();
      this.fireSelectionChanged();
    }
    if (e.key == 'ArrowUp' || e.key == 'k' || e.key == 'K') {
      if (e.ctrlKey || e.metaKey) {
        this.shiftUp();
      } else if (e.shiftKey) {
        this.growUp();
      } else {
        this.prev();
      }
      e.preventDefault();
      this.fireSelectionChanged();
    }
    if (e.key == ' ') {
      this.toggleStatus();
      e.preventDefault();
    }
    if (e.key == 't') {
      this.setTypeTask();
    }
    if (e.key == 'm') {
      this.setTypeMilestone();
    }
  }
  handleCreateTask(e: CustomEvent) {
    this.createTask(e.detail);
  }
  fireSelectionChanged() {
    this.dispatchEvent(
      new CustomEvent('selection-changed', {
        detail: {
          activeTask: this.activeTask,
          selectedTasks: this.selectedTasks,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }
}
