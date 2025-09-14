import 'jasmine';
import {Graph} from './graph';

describe('Graph', () => {
  it('removing last task removes all edges', () => {
    const g = new Graph();
    const emptyData = g.serialize();
    const a = g.appendTask('a');
    const b = g.appendTask('b');
    g.addEdge(b, a);
    expect(b.edges()).toContain(a);
    expect(a.inv_edges()).toContain(b);
    g.removeNode(b, true);
    expect(g.topo()).toEqual([a]);
    expect([...a.edges()]).toEqual([]);
    expect([...a.inv_edges()]).toEqual([]);
  });

  it('copy keeps node instances separate', () => {
    const g = new Graph();
    const a = g.appendTask('a');
    const b = g.appendTask('b');
    g.addEdge(b, a);

    const g2 = g.copy();
    const a1 = g2.task(a.id);
    const b1 = g2.task(b.id);
    expect(a1).not.toBe(a);
    expect(b1).not.toBe(b);
    expect([...b1.edges()]).toEqual([a1]);
    expect([...a1.inv_edges()]).toEqual([b1]);
  });

  it('layoutX does not lose edges', () => {
    const g = new Graph();
    const a = g.appendTask('a');
    const b = g.appendTask('b');
    g.addEdge(b, a);
    g.layoutX();
    expect(b.edges()).toContain(a);
    expect(a.inv_edges()).toContain(b);
  })
});
