import 'jasmine';
import {Graph} from './graph';

describe('Graph', () => {
  it('removing last task removes all edges', () => {
    const g = new Graph();
    const emptyData = g.serialize();
    const a = g.appendTask('a');
    const b = g.appendTask('b');
    g.addEdge(b, a);
    expect(g.edges(b)).toContain(a);
    expect(g.invEdges(a)).toContain(b);
    g.removeNode(b, true);
    expect(g.topo).toEqual([a]);
    expect(g.E).toEqual(new Map());
    expect(g.E_inv).toEqual(new Map());
  });
});
