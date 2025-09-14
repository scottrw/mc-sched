import 'jasmine';

import {EditOp, EditOpBuilder} from './operation';

/** Checks that the expected operation is built, and that when it is applied to
 * the original it produces the final string. Also computes the reverse
 * operation, and checks that when applied to the final string it produces the
 * original. */
function checkEdit(original: string, final: string, expected: EditOp) {
  const actual = new EditOpBuilder(original).build(final);
  expect(actual).toEqual(expected);
  expect(actual.apply(original)).toEqual(final);
  expect(actual.reverse().apply(final)).toEqual(original);
}

describe('EditOp', () => {
  it('Computes no op change', () => {
    checkEdit("", "", new EditOp(0, "", ""));
  });
  it('Computes delete only character', () => {
    checkEdit("a", "", new EditOp(0, "a", ""));
  });
  it('Computes delete from right', () => {
    checkEdit("ab", "a", new EditOp(1, "b", ""));
  });
  it('Computes delete from left', () => {
    checkEdit("ab", "b", new EditOp(0, "a", ""));
  });
  it('Computes delete range in middle', () => {
    checkEdit("abc", "ac", new EditOp(1, "b", ""));
  });
  it('Computes add at beginning', () => {
    checkEdit("bc", "abc", new EditOp(0, "", "a"));
  });
  it('Computes add at end', () => {
    checkEdit("a", "ab", new EditOp(1, "", "b"));
  });
  it('Computes add in middle', () => {
    checkEdit("ac", "abc", new EditOp(1, "", "b"));
  });
});
