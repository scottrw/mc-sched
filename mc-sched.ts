/**
 * @fileoverview Monte-Carlo scheduling app main class
 */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {LitElement, css, html, nothing} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import './dag-view';
import type {DagView} from './dag-view';
import {Calendar, Holiday} from './dates';
import './editors';
import './holidays-view';
import './milestone-view';
import {makeRandomGraph, makeRandomHolidays} from './random-graph';
import type {Task} from './task';
import {ChangeViewOptions, ViewOptions} from './view-options';

// TODO: window title broken
@customElement('mc-sched')
export class MCSched extends LitElement {
  @property() currentRoute: string = '';
  @property() viewOptions: ViewOptions = new ViewOptions();
  @property() selectedTasks: number = 0;
  @property() activeTask?: Task;

  static override styles = css`
    :host {
      font-family:
        Google Sans,
        Roboto,
        Arial,
        sans-serif;
      font-size: 14px;
      margin: 0;
      background-color: var(--chrome-background-color);
      display: grid;
      grid-template-rows: min-content auto min-content;
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      right: 0;
      overflow: hidden;
      --chrome-background-color: #fafbfd;
    }
    svg text,
    svg input {
      cursor: default;
      user-select: none;
      font-family:
        Roboto,
        Google Sans,
        Arial,
        sans-serif;
      font-size: 14px;
      dominant-baseline: central;
    }
    svg .tick text {
      font-size: 8px;
    }
    #chrome {
      display: flex;
      padding: 6px;
      height: 48px;
    }
    #chrome svg {
      padding: 8px;
    }
    #share {
      align-self: flex-end;
    }
    #menus {
      display: block;
      margin: 0;
      padding: 0;
      font-size: 16px;
      padding: 2px;
      user-select: none;
      cursor: default;
    }
    #menus {
      color: #202124;
    }
    #menus > li {
      font-size: 15px;
      display: inline-block;
      margin: 0;
      border-radius: 5px;
      padding: 2px 8px 2px 8px;
    }
    li.disabled {
      opacity: 25%;
    }
    #menus li:hover {
      background-color: #e5e5e5;
    }
    #menus li:active {
      background-color: #d5d5d5;
    }
    ul ul li:has(ul)::after {
      content: '\\25b8';
      float: right;
      display: block;
      max-height: 14px;
      clear: both;
    }
    li > ul {
      display: none;
    }
    li.visible > ul {
      display: block;
      position: absolute;
      width: 13em;
      z-index: 1;
      box-shadow: 0px 0px 6px 2px rgb(128 128 128 / 47%);
      border-radius: 5px;
    }
    li.visible ul li.visible ul {
      margin-left: 95%;
      margin-top: -1em;
    }
    li.visible > ul > li {
      display: block;
      padding: 2px 8px 2px 8px;
      border-radius: 5px;
    }
    li.visible > ul {
      padding: 0;
      background-color: var(--chrome-background-color);
    }
    li span {
      float: right;
      font-family: monospace;
      font-size: 12px;
    }
    #dag-view {
      min-height: 0;
      display: grid;
    }
    #milestones,
    #holidays {
      display: none;
      min-height: 0;
      overflow: scroll;
    }
    #tabs {
      border-top: 1px solid #e3e3e3;
      padding-left: 10px;
      padding-bottom: 5px;
    }
    #tabs div {
      display: inline-block;
      padding: 5px 10px 5px 10px;
      border: 1px solid #e3e3e3;
      border-width: 0 1px 1px 1px;
      user-select: none;
      cursor: default;
    }
    .tab-active {
      background-color: white;
    }
  `;
  boundOnHashChange = this.onHashChange.bind(this);
  onHashChange(e: Event) {
    const url = new URL(
      document.location.hash.slice(1),
      document.location.href,
    );
    if (['/tasks', '/milestones', '/holidays'].indexOf(url.pathname) < 0) {
      this.setRoute('/tasks');
    } else {
      this.currentRoute = url.pathname;
    }
  }
  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('hashchange', this.boundOnHashChange);
    window.addEventListener('click', this.boundWindowClick);
    this.onHashChange(new Event('hashchange'));
  }
  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('hashchange', this.boundOnHashChange);
    window.removeEventListener('click', this.boundWindowClick);
  }
  g = makeRandomGraph(20);
  holidays: Holiday[] = makeRandomHolidays(10);
  calendar = new Calendar(new Date(), this.holidayDates(this.holidays));
  holidayDates(holidays: Holiday[]): Date[] {
    const dateSet = new Set<Date>();
    for (let holiday of holidays) {
      for (
        let date = new Date(holiday.startDate);
        date.valueOf() <= holiday.endDate.valueOf();
        date.setDate(date.getDate() + 1)
      ) {
        dateSet.add(new Date(date));
      }
    }
    const dateArray: Date[] = Array.from(dateSet);
    dateArray.sort((a, b) => a.valueOf() - b.valueOf());
    return dateArray;
  }
  boundWindowClick = this.windowClick.bind(this);
  windowClick(e: MouseEvent) {
    this.hideMenus(this.renderRoot.querySelector('#menus')!);
  }
  hideMenus(root: HTMLElement, except?: HTMLElement) {
    root.querySelectorAll('.visible').forEach((e) => {
      if (e != except) {
        e.classList.remove('visible');
      }
    });
  }
  menuClick(e: MouseEvent) {
    const target = e.composedPath()[0] as HTMLElement;
    this.hideMenus(target.closest('ul')!, target);
    if (target.querySelector('ul')) {
      target.classList.toggle('visible');
    } else {
      this.hideMenus(this.renderRoot.querySelector('#menus')!);
    }
    e.stopPropagation();
  }
  check(cond: boolean) {
    if (cond) {
      return html`&#x1F5F9;`;
    } else {
      return html`&#x2610;`;
    }
  }
  override render() {
    return html` <div id="chrome">
        <img src="logo.svg" width="40" height="40" />
        <div id="chrome-middle">
          <editable-title text="CRIB Unified Backlog"></editable-title>
          <ul id="menus" @click=${this.menuClick}>
            <li>File </li
            ><li
              >Edit
              <ul>
                <li
                  class=${classMap({disabled: this.selectedTasks < 1})}
                  @click=${this.deleteTasks}
                  >Delete tasks<span>&#x232b;</span> </li
                ><li
                  class=${classMap({
                    disabled: !(this.activeTask?.type == 'task'),
                  })}
                  @click=${this.setTypeMilestone}
                  >Set as milestone<span>m</span> </li
                ><li
                  class=${classMap({
                    disabled: !(this.activeTask?.type == 'milestone'),
                  })}
                  @click=${this.setTypeTask}
                  >Set as task<span>t</span>
                </li></ul
              > </li
            ><li
              >Insert
              <ul>
                <li
                  class=${classMap({disabled: this.selectedTasks < 1})}
                  @click=${this.addUpstream}
                  >Upstream task<span>&#x21E7;-Ctrl-&#x23ce;</span> </li
                ><li
                  class=${classMap({disabled: this.selectedTasks < 1})}
                  @click=${this.addDownstream}
                  >Downstream task<span>Ctrl-&#x23ce;</span>
                </li></ul
              > </li
            ><li
              >View
              <ul>
                <li
                  >Show tasks
                  <ul>
                    <li @click=${this.toggleFinished}
                      >${this.check(this.viewOptions.showFinished)} Finished
                      tasks </li
                    ><li @click=${this.toggleBlocked}
                      >${this.check(this.viewOptions.showBlocked)} Blocked tasks </li
                    ><li @click=${this.toggleMilestones}
                      >${this.check(this.viewOptions.showOnlyMilestones)} Only
                      Milestones
                    </li></ul
                  > </li
                ><li
                  >Date format
                  <ul>
                    <li @click=${this.setRelative}
                      >${this.check(this.viewOptions.dateFormat == 'rel')}
                      Relative to today </li
                    ><li @click=${this.setAbs}
                      >${this.check(this.viewOptions.dateFormat == 'abs')}
                      Absolute dates
                    </li></ul
                  >
                </li></ul
              >
            </li></ul
          >
        </div>
      </div>
      <dag-view
        id="dag-view"
        .graph=${this.g}
        .calendar=${this.calendar}
        @view-options-changed=${this.onViewOptionsChanged}
        @selection-changed=${this.handleSelectionChanged}
        .viewOptions=${this.viewOptions}
        style="display: ${this.currentRoute == '/tasks'
          ? 'grid'
          : 'none'}"></dag-view>
      <milestone-view
        id="milestones"
        .graph=${this.g}
        style="display: ${this.currentRoute == '/milestones'
          ? 'grid'
          : 'none'}"></milestone-view>
      <holidays-view
        id="holidays"
        .holidays=${this.holidays}
        @changed=${this.holidaysChanged}
        style="display: ${this.currentRoute == '/holidays'
          ? 'grid'
          : 'none'}"></holidays-view>
      <div id="tabs">
        <div
          class="${this.currentRoute == '/tasks' ? 'tab-active' : nothing}"
          id="tasks-tab"
          @click=${() => this.setRoute('/tasks')}
          >Tasks</div
        >
        <div
          class="${this.currentRoute == '/milestones' ? 'tab-active' : nothing}"
          id="milestones-tab"
          @click=${() => this.setRoute('/milestones')}
          >Milestones</div
        >
        <div
          class="${this.currentRoute == '/holidays' ? 'tab-active' : nothing}"
          id="holidays-tab"
          @click=${() => this.setRoute('/holidays')}
          >Holidays</div
        >
      </div>`;
  }
  holidaysChanged(e: CustomEvent) {
    this.holidays = e.detail.holidays;
    this.calendar = new Calendar(
      this.calendar.day0,
      this.holidayDates(this.holidays),
    );
    window.setTimeout(() => this.g.calculateDates(this.calendar));
    e.stopPropagation();
  }
  @query('#dag-view', true) dagView?: DagView;
  deleteTasks(e: MouseEvent) {
    // Reaching into dagView this way feels ugly.
    if (!this.activeTask) return;
    this.dagView!.taskGrid.del({healEdges: true});
  }
  setTypeTask(e: MouseEvent) {
    if (!this.activeTask) return;
    this.dagView!.taskGrid.setTypeTask();
    this.requestUpdate();
  }
  setTypeMilestone(e: MouseEvent) {
    if (!this.activeTask) return;
    this.dagView!.taskGrid.setTypeMilestone();
    this.requestUpdate();
  }
  addUpstream(e: MouseEvent) {
    if (!this.activeTask) return;
    this.dagView!.taskGrid.createTask({before: true, branch: false});
  }
  addDownstream(e: MouseEvent) {
    if (!this.activeTask) return;
    this.dagView!.taskGrid.createTask({before: false, branch: false});
  }
  handleSelectionChanged(
    e: CustomEvent<{activeTask?: Task; selectedTasks: Set<Task>}>,
  ) {
    this.selectedTasks = this.dagView!.selectedTasks;
    this.activeTask = e.detail.activeTask;
  }
  toggleFinished(e: MouseEvent) {
    this.viewOptions = {
      ...this.viewOptions,
      showFinished: !this.viewOptions.showFinished,
    };
  }
  toggleBlocked(e: MouseEvent) {
    this.viewOptions = {
      ...this.viewOptions,
      showBlocked: !this.viewOptions.showBlocked,
    };
  }
  toggleMilestones(e: MouseEvent) {
    this.viewOptions = {
      ...this.viewOptions,
      showOnlyMilestones: !this.viewOptions.showOnlyMilestones,
    };
  }
  setRelative(e: MouseEvent) {
    this.viewOptions = {...this.viewOptions, dateFormat: 'rel'};
  }
  setAbs(e: MouseEvent) {
    this.viewOptions = {...this.viewOptions, dateFormat: 'abs'};
  }
  onViewOptionsChanged(e: ChangeViewOptions) {
    this.viewOptions = e.detail;
  }
  setRoute(route: string) {
    console.log('update hash', `#${route}`);
    window.location.hash = `#${route}`;
  }
}
