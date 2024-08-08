/** @fileoverview numpy-like vectorized javascript math. */

/**
 * @license
 * Copyright Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const I = 1000;

export function byValue(a: number, b: number) {
  return a - b;
}

export type NPArray = {
  type: 'array';
  array: number[];
};
export type NPScalar = {
  type: 'scalar';
  scalar: number;
};
export type NPError = {
  type: 'error';
  message: string;
};
export type NPValue = NPArray | NPScalar | NPError;

export function rand_norm90(lb: number, ub: number): NPArray {
  const sigma = (ub - lb) / 3.29;
  const mean = (ub + lb) / 2;
  const a = new Array<number>(I);
  for (let i = 0; i < I; i += 2) {
    const u1 = 1 - Math.random();
    const u2 = Math.random();
    const mag = sigma * Math.sqrt(-2 * Math.log(u1));
    a[i] = Math.max(0, Math.floor(mag * Math.cos(2 * Math.PI * u2) + mean));
    a[i + 1] = Math.max(0, Math.floor(mag * Math.sin(2 * Math.PI * u2) + mean));
  }
  return {type: 'array', array: a};
}

export function avg(a: NPValue): NPValue {
  switch (a.type) {
    case 'scalar':
      return a;
    case 'error':
      return a;
    case 'array':
      let r = 0;
      for (let v of a.array) r += v;
      return {type: 'scalar', scalar: r / a.array.length};
  }
}

type CResult = {err?: string; scalars: number[]; arrays: number[][]};

function coalesce(as: NPValue[]): CResult {
  for (let a of as) {
    // TODO: coalesce the errors instead of returning the first one
    if (a.type == 'error') return {err: a.message, scalars: [], arrays: []};
  }
  const scalars = (as.filter((a) => a.type === 'scalar') as NPScalar[]).map(
    (a) => a.scalar,
  );
  const arrays = (as.filter((a) => a.type === 'array') as NPArray[]).map(
    (a) => a.array,
  );
  return {err: undefined, scalars, arrays};
}

export function add(as: NPValue[]): NPValue {
  const {err, scalars, arrays} = coalesce(as);
  if (err) return {type: 'error', message: err};
  const scalar = scalars.reduce((a, b) => a + b, 0);
  if (arrays.length == 0) {
    return {type: 'scalar', scalar};
  }
  const _as = arrays;
  const m = _as.length;
  const out = new Array<number>();
  for (let i = 0; i < I; i++) {
    out[i] = scalar;
    for (let j = 0; j < m; j++) out[i] += _as[j][i];
  }
  return {type: 'array', array: out};
}

export function max(as: NPValue[]): NPValue {
  const {err, scalars, arrays} = coalesce(as);
  if (err) return {type: 'error', message: err};
  const scalar = scalars.reduce(
    (a, b) => Math.max(a, b),
    Number.NEGATIVE_INFINITY,
  );
  if (arrays.length == 0) {
    return {type: 'scalar', scalar};
  }
  const m = arrays.length;
  const out = new Array<number>();
  for (let i = 0; i < I; i++) {
    out[i] = scalar;
    for (let j = 0; j < m; j++) out[i] = Math.max(out[i], arrays[j][i]);
  }
  return {type: 'array', array: out};
}

export type NPPercentile<T> = {
  type: 'percentile';
  lb: T;
  ub: T;
  med: T;
};

export type NPPercentileOrError<T> = NPPercentile<T> | NPError;

export const undef: NPError = {type: 'error', message: 'undefined'};

export function percentile90(a: NPValue): NPPercentileOrError<number> {
  switch (a.type) {
    case 'scalar':
      return {type: 'percentile', lb: a.scalar, ub: a.scalar, med: a.scalar};
    case 'error':
      return a;
    case 'array':
      const b = [...a.array];
      /* TODO: This sort is pretty expensive. Find an alternative.
       * We know the length of the array, so we know we need to keep the 50 lowest
       * and 50 largest numbers to find the 5% and 95%-iles. Can we do something
       * similar to find the median? */
      b.sort(byValue);
      return {
        type: 'percentile',
        lb: b[Math.floor(b.length * 0.05)],
        med: b[Math.floor(b.length * 0.5)],
        ub: b[Math.floor(b.length * 0.95)],
      };
  }
}
