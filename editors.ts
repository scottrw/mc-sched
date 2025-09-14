/**
 * @fileoverview Editors
 */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TODO:
 * - This seems more complicated than it needs to be. Do we need a EditableFoo
 *   AND a FooEdit tag? Could they be one thing? Firing and catching the events
 *   seems like a smell. There's also a large amount of configuration in the
 *   grid view to extract values from the model, translate and set them as
 *   properties on the Editables, listen for edits then fetch the relevant
 *   values back from the Editable properties and reflect them back in the
 *   model.
 */

import {css, html, LitElement, nothing} from 'lit';
import {customElement, property, state} from 'lit/decorators.js';
import {createRef, ref} from 'lit/directives/ref.js';

import {fmtDateAll} from './dates';
import {Estimate} from './estimate';
import type {NPPercentileOrError} from './np';
import {firePatch} from './op';

const defaultTasks = [
  'Architecture Design',
  'Architecture Review',
  'Write Technical Design Document',
  'Technical Design Review',
  'Set up dev/staging/prod environments',
  'Create CI/CD pipeline',
  'QA',
  'Launch approvals',
  'Deploy to Prod',
];

@customElement('editable-title')
export class EditableTitle extends LitElement {
  @property() text: string = '';
  static override styles = css`
    input {
      background: none;
      font-size: 18px;
      padding: 2px 8px 2px 8px;
      border: 1px solid var(--chrome-background-color);
    }
    input:hover {
      border: 1px solid #c0c0c0;
      border-radius: 5px;
    }
    input:focus {
      background: white;
    }
  `;
  inputRef = createRef<HTMLInputElement>();
  get input() {
    return this.inputRef.value!;
  }

  override render() {
    return html` <input
      type="text"
      title="Rename"
      spellcheck="false"
      autocomplete="off"
      style="width: ${this.text.length}ch"
      ${ref(this.inputRef)}
      @keydown=${this.keydown}
      @input=${this.handleInput}
      .value=${this.text} />`;
  }
  handleInput(e: Event) {
    const text = (e.target as HTMLInputElement).value;
    firePatch(this, {name: 'edit', text});
  }
  keydown(e: KeyboardEvent) {
    if (e.key == 'Escape') {
      this.input.blur();
      return;
    }
    if (e.key == 'Enter') {
      this.input.blur();
    }
  }
}

class HideableElement extends LitElement {
  static override styles: any = css`
    input {
      width: 100%;
      outline: none;
      border: 1px solid #c0c0c0;
      border-radius: 5px;
      height: 22px;
      padding: 0;
      padding-left: 5px;
      padding-right: 5px;
      font-size: 14px;
      margin-right: 5px;
      box-sizing: border-box;
    }
  `;
  boundFireHide = this.fireHide.bind(this);
  boundSwallowClick = this.swallowClick.bind(this);
  boundKeydown = this.keydown.bind(this);
  inputRef = createRef<HTMLInputElement>();
  fireHide() {
    this.dispatchEvent(
      new CustomEvent('hide', {bubbles: true, composed: true}),
    );
  }
  fireCreateTask(detail: any) {
    this.dispatchEvent(
      new CustomEvent('create-task', {detail, bubbles: true, composed: true}),
    );
  }
  fireTab() {
    this.dispatchEvent(new CustomEvent('tab', {bubbles: true, composed: true}));
  }
  swallowClick(e: Event) {
    e.stopPropagation();
  }
  override connectedCallback() {
    super.connectedCallback();
    document.addEventListener('click', this.boundFireHide);
  }
  get input() {
    return this.inputRef.value!;
  }
  override disconnectedCallback() {
    document.removeEventListener('click', this.boundFireHide);
    this.input.removeEventListener('click', this.boundSwallowClick);
    this.input.removeEventListener('keydown', this.boundKeydown);
    super.disconnectedCallback();
  }
  override firstUpdated() {
    this.input.addEventListener('click', this.boundSwallowClick);
    this.input.addEventListener('keydown', this.boundKeydown);
    this.input.focus();
    this.input.select();
  }
  keydown(e: KeyboardEvent) {
    if (e.key == 'Escape') {
      this.fireHide();
    } else if (e.key == 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      this.fireHide();
      if (e.ctrlKey || e.altKey || e.metaKey) {
        this.fireCreateTask({before: e.shiftKey, branch: e.altKey});
      }
    } else if (e.key == 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      this.fireHide();
      this.fireTab();
    }
  }
}

/**
 * @TODO: Currently this uses the built in datalist. Next would be to create
 * a custom autocomplete renderer for prettier styling. Also expanding the
 * default list of tasks to include default time estimates which would
 * also autocomplete when chosen.
 */
@customElement('autocomplete-edit')
export class AutocompleteEdit extends HideableElement {
  static override styles = HideableElement.styles;
  @property() text?: string;
  @property() options: string[] = defaultTasks;
  override render() {
    return html`<input
        ${ref(this.inputRef)}
        type="text"
        @input=${this.handleInput}
        .value=${this.text || ''}
        list="defaultOptions" />
      <datalist id="defaultOptions">
        ${this.options.map((o) => html`<option value=${o}></option>`)}
      </datalist>`;
  }
  handleInput(e: Event) {
    const text = this.inputRef.value!.value;
    firePatch(this, {name: 'edit', text});
  }
}

@customElement('text-edit')
export class TextEdit extends HideableElement {
  static override styles = HideableElement.styles;
  @property() text?: string;
  override render() {
    return html`<input
      ${ref(this.inputRef)}
        @input=${this.handleInput}
      type="text"
      .value=${this.text || ''} />`;
  }
  handleInput(e: Event) {
    const text = this.inputRef.value!.value;
    firePatch(this, {name: 'edit', text});
  }
}

const _est_pattern =
  /^ *([0-9]+(?:\.[0-9]+)?) *([dwm]?) *- *([0-9]+(?:\.[0-9]+)?) *([dwm]) *$/;
const _est_pattern_str = _est_pattern.source;

@customElement('est-edit')
export class EstEdit extends HideableElement {
  // TODO: validate that est-edit lb < ub
  static override styles = [
    HideableElement.styles,
    css`input:invalid { background-color: pink; }`
  ];
  @property() estimate?: Estimate;
  override render() {
    return html` <input
      ${ref(this.inputRef)}
      type="text"
      pattern=${_est_pattern_str}
      @input=${this.handleInput}
      .value=${this.estimate?.displayString() ?? ''}
      @keydown=${this.keydown} />`;
  }
  handleInput(e: Event) {
    const value = this.inputRef.value!.value;
    firePatch(this, {
      name: 'est-edit',
      estimate: Estimate.check(value) || undefined
    });
  }
}

@customElement('date-edit')
export class DateEdit extends HideableElement {
  static override styles = HideableElement.styles;
  @property() date?: Date;
  override render() {
    return html` <input
      ${ref(this.inputRef)}
      @input=${this.handleInput}
      type="date"
      .valueAsDate=${this.date ?? new Date()} />`;
  }
  handleInput(e: Event) {
    const date = this.inputRef.value!.valueAsDate!;
    firePatch(this, { name: 'edit', date });
  }
}

export abstract class Editable extends LitElement {
  @state() editing: Boolean = false;
  static override styles = css`
    .editing .content {
      display: none;
    }
    div {
      margin-inline-end: 5px;
      overflow: clip;
      user-select: none;
      width: 100%;
      min-height: 18px;
    }
  `;
  override render() {
    return html` <div
      class=${this.editing ? 'editing' : nothing}
      @hide=${this._stopEditing}
      title=${this.getContent()}
      @dblclick=${this._startEditing}>
      <span class="content">${this.getContent()}</span>
      ${this.renderEdit()}
    </div>`;
  }
  renderEdit() {
    if (!this.editing) return nothing;
    return this.doRenderEdit();
  }
  abstract getContent(): string;
  abstract doRenderEdit(): void;
  _startEditing() {
    this.editing = true;
  }
  _stopEditing() {
    this.editing = false;
  }
}

@customElement('editable-text')
export class EditableText extends Editable {
  static override styles = Editable.styles;
  @property() text?: string;
  textEditRef = createRef<TextEdit>();
  getContent() {
    return this.text || '';
  }
  doRenderEdit() {
    return html`<autocomplete-edit
      ${ref(this.textEditRef)}
      .text=${this.text}></autocomplete-edit>`;
  }
}

@customElement('editable-est')
export class EditableEst extends Editable {
  static override styles = Editable.styles;
  @property() estimate?: Estimate;
  estEditRef = createRef<EstEdit>();
  getContent() {
    return this.estimate?.displayString() ?? '???';
  }
  doRenderEdit() {
    return html`<est-edit
      ${ref(this.estEditRef)}
      .estimate=${this.estimate}></est-edit>`;
  }
}

@customElement('editable-date')
export class EditableDate extends Editable {
  static override styles = Editable.styles;
  @property() dateActual?: Date;
  @property() dateCalculated?: NPPercentileOrError<Date>;
  @property() dateFormat: 'abs' | 'rel' = 'abs';
  dateEditRef = createRef<DateEdit>();
  getContent() {
    return fmtDateAll(this.dateFormat, this.dateActual, this.dateCalculated);
  }
  doRenderEdit() {
    // TODO: dateActual does the silly thing where it's a day ahead.
    return html`<date-edit
      ${ref(this.dateEditRef)}
      .date=${this.dateActual}></date-edit>`;
  }
}
