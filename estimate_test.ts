import 'jasmine';
import {Estimate} from './estimate';

describe('Estimate', () => {
  it('Upper bound must be larger than lower bound', () => {
    expect(Estimate.check('1d - 1w')).toBeInstanceOf(Estimate);
    expect(Estimate.check('8h - 1d')).toBeInstanceOf(Estimate);
    expect(Estimate.check('8 - 2h')).toBe(false);
  });
});
