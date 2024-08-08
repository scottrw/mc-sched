/**
 * @fileoverview Various options for display.
 *
 * These are centralized in a single object because they get passed around
 * everywhere. There's probably a better way to do this.
 */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export class ViewOptions {
  searchFilter: string = '';

  showFinished: boolean = true;
  showBlocked: boolean = true;
  showOnlyMilestones: boolean = false;

  dateFormat: 'abs' | 'rel' = 'abs';
}

export type ChangeViewOptions = CustomEvent<ViewOptions>;

export function fireViewOptionsChanged(
  source: EventTarget,
  viewOptions: ViewOptions,
) {
  source.dispatchEvent(
    new CustomEvent<ViewOptions>('view-options-changed', {
      detail: viewOptions,
      bubbles: true,
      composed: true,
    }),
  );
}
