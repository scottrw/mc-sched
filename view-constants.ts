/**
 * @fileoverview Shared view constants.
 */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const FONTSIZE = 14;
export const PAD = 5;
export const YSKIP = FONTSIZE + PAD * 2;
export const LANESKIP = Math.floor((2 * FONTSIZE) / 5 + PAD * 2);
export const RADIUS = YSKIP / 8;

export function displayDotX(x: number) {
  return PAD + Math.floor((x + 0.5) * LANESKIP);
}
