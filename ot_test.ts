import 'jasmine';

/** Operational transform implementation for tasksight.
 *
 * The operational transform protocol and semantics allow for simultaneous,
 * conflict-free edits, with low latency, between multiple clients.
 *
 */

import {
  computed,
  effect,
  provideZonelessChangeDetection,
  signal,
  type Signal,
} from '@angular/core';
import {createApplication} from '@angular/platform-browser';
import Change from 'goog:com.google.mcsched.ot.Change';
import ConflictPolicy from 'goog:com.google.mcsched.ot.ConflictPolicy';
import DeleteNodeOp from 'goog:com.google.mcsched.ot.DeleteNodeOp';
import DocAddress from 'goog:com.google.mcsched.ot.DocAddress';
import DocAddress_Slot from 'goog:com.google.mcsched.ot.DocAddress.Slot';
import Document from 'goog:com.google.mcsched.ot.Document';
import EditDocOp from 'goog:com.google.mcsched.ot.EditDocOp';
import EditNodeOp from 'goog:com.google.mcsched.ot.EditNodeOp';
import EditPatch from 'goog:com.google.mcsched.ot.EditPatch';
import IndexOp from 'goog:com.google.mcsched.ot.IndexOp';
import InsertPatch from 'goog:com.google.mcsched.ot.InsertPatch';
import MovePatch from 'goog:com.google.mcsched.ot.MovePatch';
import NewNodeOp from 'goog:com.google.mcsched.ot.NewNodeOp';
import NodeAddress from 'goog:com.google.mcsched.ot.NodeAddress';
import NodeAddress_Slot from 'goog:com.google.mcsched.ot.NodeAddress.Slot';
import NopPatch from 'goog:com.google.mcsched.ot.NopPatch';
import Op from 'goog:com.google.mcsched.ot.Op';
import OT from 'goog:com.google.mcsched.ot.OT';
import PArray from 'goog:com.google.mcsched.ot.PArray';
import Patch from 'goog:com.google.mcsched.ot.Patch';
import Patchable from 'goog:com.google.mcsched.ot.Patchable';
import PString from 'goog:com.google.mcsched.ot.PString';
import Rebasable from 'goog:com.google.mcsched.ot.Rebasable';
import RemovePatch from 'goog:com.google.mcsched.ot.RemovePatch';
import RenameNodeOp from 'goog:com.google.mcsched.ot.RenameNodeOp';
import Versionable from 'goog:com.google.mcsched.ot.Versionable';
import Object from 'goog:java.lang.Object';

import {options} from 'google3/third_party/javascript/mc_sched/watcher';

import {
  arrayToList,
  checkNodeConstraints,
  getNodeId,
  getRandomIndex,
  ins,
  nstr,
  rarray,
  rchanges,
  rem,
  rint,
  rstr,
  rstr1,
  setNodeId,
} from './ot_testutil';

describe('patch regression', () => {
  it('test one', () => {
    const doc = new Document();
    expect([...doc.orderedNodesArray()]).toEqual([]);
    // ^^ So this is not limited to just the browser environment.
  });
});

describe('SignalDocument', () => {
  it('test one computed', async () => {
    // await createApplication({
    //   providers: [provideZonelessChangeDetection()],
    // });
    const s = signal<string>('hello');
    let t = computed(() => s() + ' world');
    expect(t()).toEqual('hello world');
  });
  it('test one effect', async () => {
    const s = signal<string>('hello');
    let t: string | undefined;
    effect(() => {
      t = s() + ' world';
    }, options);
    // wait for the microtask queue to empty
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(t).toEqual('hello world');
  });
  it('set and get in java', () => {
    expect(new OT().testSignalGet()).toEqual('Hello');
  });
  it('test signal return', () => {
    const s = new OT().testSignalReturn();
    expect(s()).toEqual('Hello');
  });
  it('test signal computed', () => {
    const s = new OT().testSignalComputed();
    expect(s()).toEqual('Hello World');
  });
});

function rebase<C extends Patchable<C, E>, E>(
  base: Array<Patch<C, E>>,
  pending: Array<Patch<C, E>>,
  policy: ConflictPolicy,
  log?: boolean,
): {
  mutation: Array<Patch<C, E>>;
  rebased: Array<Patch<C, E>>;
  log: string;
} {
  const logger = log ? OT.newStringList() : null;
  const r = Rebasable.rebase(
    OT.makeList(base),
    OT.makeList(pending),
    policy,
    logger,
  );
  return {
    mutation: [...r.mutation.toArray()],
    rebased: [...r.rebased.toArray()],
    log: logger ? OT.join(logger) : '',
  };
}

describe('OT', () => {
  it('returns a message', () => {
    expect(new OT().getMessage()).toBe('Hello, World');
  });
});

const CONTEXT_WINS = ConflictPolicy.CONTEXT_WINS;
const PATCH_WINS = ConflictPolicy.PATCH_WINS;

interface OpenResponse {
  sessionId: number;
  nextServerVersion: number;
  changes: Change[];
}

interface SaveRequest {
  serverBaseVersion: number;
  sessionId: number;
  changes: Change[];
}

interface SaveResponse {
  nextServerVersion: number;

  changes: Change[]; // might be able to help with mutation too??
}

interface ApplyChanges {
  changes: Change[];
  nextServerVersion: number;
}

interface PollRequest {
  serverBaseVersion: number;
  sessionId: number;
}
interface PollResponse {
  changes: Change[];
  nextServerVersion: number;
}

class Server {
  nextVersion = 0;
  nextSessionId = 0;
  changes: Change[] = [];
  open(): OpenResponse {
    const sessionId = this.nextSessionId++;
    return {
      sessionId,
      nextServerVersion: this.nextVersion,
      changes: [...this.changes],
    };
  }

  poll(req: PollRequest): PollResponse {
    const changes = this.changes.slice(req.serverBaseVersion);
    return {
      changes: [...changes],
      nextServerVersion: this.nextVersion,
    } as PollResponse;
  }

  save(req: SaveRequest): SaveResponse {
    // We could take server changes until we find the first one from this client,
    // match them up with the request changes, then do a rebase. Then take
    // more server changes until we find another one from this client again, then
    // match them up and continue the rebase.
    const existing = this.changes.slice(req.serverBaseVersion);
    if (req.changes.length === 0) {
      return {
        changes: [...existing],
        nextServerVersion: this.nextVersion,
      } as SaveResponse;
    }

    let {nextVersion, toReply, toSave} = doSave({
      nextVersion: this.nextVersion,
      existing,
      pending: [...req.changes],
      sessionId: req.sessionId,
      serverBaseVersion: req.serverBaseVersion,
    });

    this.changes.push(...toSave);
    this.nextVersion = nextVersion;

    return {
      nextServerVersion: this.nextVersion,
      changes: toReply,
    } as SaveResponse;
  }
}
function doSave<T extends Versionable<T>>({
  nextVersion,
  existing,
  pending,
  sessionId,
  serverBaseVersion,
}: {
  nextVersion: number;
  existing: T[];
  pending: T[];
  sessionId: number;
  serverBaseVersion: number;
}): {nextVersion: number; toReply: T[]; toSave: T[]} {
  const originalNextVersion = nextVersion;
  const actualResults = Versionable.doSave(
    originalNextVersion,
    arrayToList(existing),
    arrayToList(pending),
    sessionId,
    serverBaseVersion,
  );
  return {
    nextVersion: actualResults.nextVersion,
    toReply: [...actualResults.toReply.toArray()],
    toSave: [...actualResults.toSave.toArray()],
  };
}

class Client {
  sessionId: number;
  nextServerVersion: number;
  changes: Change[];
  pending = new Array<Change>();
  nextClientVersion = 0;
  pendingDoc = new Document();
  constructor(readonly server: Server) {
    const res = server.open();
    this.sessionId = res.sessionId;
    this.nextServerVersion = res.nextServerVersion;
    this.changes = [...res.changes];
    this.changes.forEach((c) => {
      c.applyTo(this.pendingDoc);
    });
  }

  // Returns any mutations that should be applied to the document.
  innerApplyChanges({nextServerVersion, changes}: ApplyChanges): Change[] {
    changes = [...changes];
    // It works best to think that the server can push changes to us at any
    // time, some of which might be ours. It works best to ignore that we might
    // have made the poll() or save() request that resulted in the server
    // sending them to us.  The changes the server is pushing might or might not
    // have been seen by us.  The only situation that's an error is if the
    // server pushes over a gap -- sending us a change higher than the next
    // server version we're expecting.
    while (
      changes.length > 0 &&
      changes[0].serverVersion! < this.nextServerVersion
    ) {
      const c = changes.shift()!; // drop changes we've already seen
      if (!this.changes[c.serverVersion!].equals(c)) {
        throw new Error(
          `Server sent us a change that doesn't match our record`,
        );
      }
    }
    if (changes.length === 0) return []; // No-op. Should we update baseVersion etc?
    if (changes[0].serverVersion! > this.nextServerVersion) {
      // This is not an error, but it's a sign we're out of sync. Ignore it
      // and wait for a poll or save to try again.
      return [];
    }
    const integ = integrate(changes, this.pending);
    this.changes.push(...integ.store);
    this.pending = integ.pending;
    this.nextServerVersion = nextServerVersion;
    return integ.mutation;
  }

  poll(): void {
    this.onPoll(this.doPoll() as PollResponse);
  }
  doPoll(): PollResponse {
    return this.server.poll({
      serverBaseVersion: this.nextServerVersion,
      sessionId: this.sessionId,
    });
  }
  onPoll(res: PollResponse) {
    this.applyChanges({
      changes: res.changes,
      nextServerVersion: res.nextServerVersion,
    });
  }
  save(): void {
    this.onSave(this.doSave());
  }
  doSave() {
    return this.server.save({
      sessionId: this.sessionId,
      serverBaseVersion: this.nextServerVersion,
      changes: this.pending,
    });
  }
  onSave(res: SaveResponse) {
    this.applyChanges(res);
  }

  createAndApplyChange(ops: Op[]): Change {
    const change = new Change(
      null,
      this.sessionId,
      this.nextClientVersion++,
      arrayToList(ops),
    );
    this.pendingDoc.checkNodeConstraints();
    change.applyTo(this.pendingDoc);
    this.pendingDoc.checkNodeConstraints();

    this.pending.push(change);
    return change;
  }

  addNode(index: number, name: string): void {
    const id = this.pendingDoc.nextNodeId++;
    const newNodeOp = new NewNodeOp(id);
    const indexOp = new IndexOp(PArray.ins<number>(index, id));
    const editNodeOp = new EditNodeOp(
      new NodeAddress(id, NodeAddress_Slot.NAME),
      arrayToList([PString.ins(0, name)]),
    );
    this.createAndApplyChange([newNodeOp, indexOp, editNodeOp]);
  }

  removeNodeById(id: number): void {
    const index = this.pendingDoc.orderedNodes().indexOf(id);
    if (index === -1) {
      throw new Error(`Node with id ${id} not found in the document.`);
    }
    this.removeNodeByIndex(index);
  }

  removeNodeByIndex(index: number): void {
    const id = this.pendingDoc.orderedNodes().get(index);
    const nodeAddress = new NodeAddress(id, NodeAddress_Slot.NAME);
    const editOp = new EditNodeOp(
      nodeAddress,
      arrayToList([
        nodeAddress.get(this.pendingDoc)().makePatch(new PString('')),
      ]),
    );
    const rmNodeOp = new IndexOp(
      PArray.rem<number>(index, id) as Patch<PArray<number>, number>,
    );
    const delNodeOp = new DeleteNodeOp(id);
    this.createAndApplyChange([editOp, rmNodeOp, delNodeOp]);
  }

  moveNode(from: number, to: number): void {
    const id = this.pendingDoc.orderedNodes().get(from);
    const moveOp = new IndexOp(
      new MovePatch<PArray<number>, number>(from, PArray.of([id]), to),
    );
    this.createAndApplyChange([moveOp]);
  }

  editNodeName(id: number, newName: string): void {
    const nodeAddress = new NodeAddress(id, NodeAddress_Slot.NAME);
    const editOp = new EditNodeOp(
      nodeAddress,
      arrayToList([
        nodeAddress.get(this.pendingDoc)().makePatch(new PString(newName)),
      ]),
    );
    this.createAndApplyChange([editOp]);
  }

  editDocTitle(newTitle: string): Change {
    const docAddress = new DocAddress(DocAddress_Slot.TITLE);
    const editOp = new EditDocOp(
      docAddress,
      arrayToList([
        docAddress.get(this.pendingDoc)().makePatch(new PString(newTitle)),
      ]),
    );
    return this.createAndApplyChange([editOp]);
  }

  applyChanges(res: ApplyChanges): Change[] {
    const mutation = this.innerApplyChanges(res);
    for (const c of mutation) {
      this.pendingDoc.checkNodeConstraints();
      c.applyTo(this.pendingDoc);
      try {
        this.pendingDoc.checkNodeConstraints();
      } catch (e) {
        throw new Error(
          `Failed node constraints after applying change: ${c}\n${e}${e instanceof Error ? e.stack : ''}`,
        );
      }
    }
    const doc = new Document();
    for (const c of this.changes) {
      c.applyTo(doc);
    }
    for (const p of this.pending) {
      p.applyTo(doc);
    }
    if (!this.pendingDoc.equals(doc)) {
      throw new Error(
        `After applying changes, pending doc ${this.pendingDoc} != ${doc}, which was reconstructed from changes: ${this.changes} + ${this.pending}`,
      );
    }
    return mutation;
  }
}

type EOr<T> = T | Error;
type EFun<T, K> = (t: T) => EOr<K>;

function emap<T, K>(f: EFun<T, K>, t: EOr<T>): EOr<K> {
  return t instanceof Error ? t : f(t);
}

function safely<T>(f: () => T): EOr<T> {
  try {
    return f();
  } catch (e) {
    if (e instanceof Error) return e;
    throw e;
  }
}

function safeApplyStrPatches(
  to: PString,
  patches: EOr<Array<Patch<PString, string>>>,
): EOr<PString> {
  return emap((patches) => {
    let r: EOr<PString> = to;
    for (const p of patches) {
      r = emap((r) => safely(() => p.applyTo(r)), r);
    }
    return r;
  }, patches);
}

function ensurePString(s: string | PString): PString {
  return s instanceof PString ? s : new PString(s);
}

// Building the complete operational transform diamond is painful. When we can
// build the test case using examples and generate the patches, it's easiest
// to read.
interface CheckOneOpSpecWithExamples {
  policy: ConflictPolicy;
  shared: string | PString;
  baseStr: string | PString;
  pendingStr: string | PString;
  expected?: string;
}
// But not all operations can be formed from examples -- the move operation
// can't be inferred.
interface CheckOneOpSpecWithPatches {
  policy: ConflictPolicy;
  shared: string | PString;
  basePatch: Patch<PString, string>;
  pendingPatch: Patch<PString, string>;
  expected?: string;
}
type CheckOneOpSpec = CheckOneOpSpecWithExamples | CheckOneOpSpecWithPatches;
function checkOneOp(s: CheckOneOpSpec) {
  const {policy} = s;
  const shared = ensurePString(s.shared);
  const expected =
    s.expected !== undefined ? new PString(s.expected) : undefined;
  const baseStr: PString =
    'baseStr' in s ? ensurePString(s.baseStr) : s.basePatch.applyTo(shared);
  const pendingStr: PString =
    'pendingStr' in s
      ? ensurePString(s.pendingStr)
      : s.pendingPatch.applyTo(shared);
  const basePatch = 'basePatch' in s ? s.basePatch : shared.makePatch(baseStr);
  const pendingPatch =
    'pendingPatch' in s ? s.pendingPatch : shared.makePatch(pendingStr);

  const decomposedBase = checkedDecompose(basePatch);
  const decomposedPending = checkedDecompose(pendingPatch);
  const soList = Rebasable.rebase(
    arrayToList(decomposedBase),
    arrayToList(decomposedPending),
    policy,
  );
  const so = {
    mutation: soList.mutation.toArray(),
    rebased: soList.rebased.toArray(),
  };
  const sr = {
    mutation: Patch.checkedRecompose(soList.mutation).toArray(),
    rebased: Patch.checkedRecompose(soList.rebased).toArray(),
  };
  const rbLeft = safeApplyStrPatches(baseStr, so.rebased);
  const rbRight = safeApplyStrPatches(pendingStr, so.mutation);

  const mutationPatch: EOr<Patch<PString, string>> = safeForward(
    basePatch,
    pendingPatch,
    policy.flop(),
  );
  const rebasePatch: EOr<Patch<PString, string>> = safeForward(
    pendingPatch,
    basePatch,
    policy,
  );
  const mutationStr = safeApplyStrPatches(
    pendingStr,
    emap((p) => [p], mutationPatch),
  );
  const rebaseStr = safeApplyStrPatches(
    baseStr,
    emap((p) => [p], rebasePatch),
  );
  if (
    mutationPatch instanceof Error ||
    rebasePatch instanceof Error ||
    mutationStr instanceof Error ||
    rebaseStr instanceof Error ||
    rbLeft instanceof Error ||
    rbRight instanceof Error ||
    !rebaseStr.equals(mutationStr) ||
    !rbLeft.equals(rbRight) ||
    !rebaseStr.equals(rbLeft) ||
    (expected !== undefined
      ? !rebaseStr.equals(expected) || !mutationStr.equals(expected)
      : false)
  ) {
    const expectedStr = expected !== undefined ? `[expected ${expected}]` : '';
    const policyStr =
      policy === CONTEXT_WINS
        ? 'CONTEXT_WINS/CONTEXT_WINS'
        : 'PATCH_WINS/PATCH_WINS';
    throw new Error(`
=======
policy  : ${policyStr}
shared  : ${shared}
base    : ${shared} -> ${baseStr} = ${basePatch}
pending : ${shared} -> ${pendingStr} = ${pendingPatch}
--
expecte : ${expected}
so mut  : ${rbRight}
so reb  : ${rbLeft} [${emap((rbRight) => emap((rbLeft) => rbLeft.equals(rbRight), rbLeft), rbRight) ? 'matches' : 'does not match'} so mut]
-- mutation
so mut p: b^p = ${basePatch}^${pendingPatch} = ${sr.mutation}
mo mut p: b^p = ${basePatch}^${pendingPatch} = ${mutationPatch} [${emap((p) => sr.mutation.every((m, i) => m.equals(p)), mutationPatch)}]
mo mut s: p + m = ${pendingStr} + ${mutationPatch} = ${mutationStr}${expectedStr}
-- rebase
so reb p: p^b = ${pendingPatch}^${basePatch} = ${sr.rebased}
mo reb p: p^b = ${pendingPatch}^${basePatch} = ${rebasePatch} [${emap((p) => sr.rebased.every((m, i) => m.equals(p)), rebasePatch)}]
mo reb s: b + r = ${baseStr} + ${rebasePatch} = ${rebaseStr}${expectedStr}
`);
  }
  expect(true).toBe(true);
}

function checkOneOpBothPolicies(spec: CheckOneOpSpec) {
  checkOneOp(spec);
  checkOneOp({...spec, policy: spec.policy.flop()});
}

function forward<C extends Patchable<C, E>, E>(
  patch: Patch<C, E>,
  context: Patch<C, E>,
  policy: ConflictPolicy,
): Patch<C, E> {
  return context.beneath(patch, policy);
}

function safeForward<C extends Patchable<C, E>, E>(
  patch: Patch<C, E>,
  context: Patch<C, E>,
  policy: ConflictPolicy,
): EOr<Patch<C, E>> {
  return forward(patch, context, policy);
}

function checkedDecompose(
  p: Patch<PString, string>,
): Array<Patch<PString, string>> {
  p = p.noteless();
  const ret = p.decompose();
  const recomposed = Patch.recompose(ret).toArray();
  if (p instanceof NopPatch && recomposed.length === 0) {
    return ret.toArray();
  }
  if (recomposed.length !== 1 || !recomposed[0].equals(p)) {
    throw new Error(`r(d(${p})) => r(${ret}) => ${recomposed}`);
  }
  return [...ret.toArray()]; // strip off $$arrayMetadata, which confuses tests
}

function rclients(client: Client, n: number) {
  for (let i = 0; i < n; i++) {
    rclient(client);
  }
}

function rclient(client: Client) {
  if (client.pendingDoc.size() < 5) {
    if (Math.random() < 0.25) {
      client.addNode(
        Math.floor(Math.random() * client.pendingDoc.size()),
        nstr(5).getRawString(),
      );
      return;
    }
  }
  if (client.pendingDoc.size() > 0) {
    const idx = Math.floor(Math.random() * client.pendingDoc.size());
    const id = client.pendingDoc.orderedNodes().get(idx);
    if (Math.random() < 0.25) {
      client.removeNodeById(id);
      return;
    }
    if (Math.random() < 0.25) {
      const old = client.pendingDoc.getNodeById(id)!.name();
      const newStr = rstr(old);
      client.editNodeName(id, newStr.getRawString());
      return;
    }
  }
  client.editDocTitle(rstr(client.pendingDoc.title()).getRawString());
}

function docEqualityTester<T>(a: unknown, b: unknown): boolean | undefined {
  if (a instanceof Document && b instanceof Document) {
    return a.equals(b);
  }
  return undefined; // Use default equality check for other types
}

function listEqualityTester<T>(a: unknown, b: unknown): boolean | undefined {
  if (a instanceof Object && b instanceof Object) {
    return a.equals(b);
  }
  return undefined; // Use default equality check for other types
}

function patchEqualityTester<T>(a: unknown, b: unknown): boolean | undefined {
  if (a instanceof Patch && b instanceof Patch) {
    return a.equals(b);
  }
  return undefined; // Use default equality check for other types
}

function opEqualityTester<T>(a: unknown, b: unknown): boolean | undefined {
  if (a instanceof Op && b instanceof Op) {
    return a.equals(b);
  }
  return undefined; // Use default equality check for other types
}

describe('Generic change', () => {
  beforeEach(() => {
    jasmine.addCustomEqualityTester(patchEqualityTester);
    jasmine.addCustomEqualityTester(listEqualityTester);
    jasmine.addCustomEqualityTester(opEqualityTester);
    jasmine.addCustomEqualityTester(docEqualityTester);
  });

  it('apply editop', () => {
    const doc = new Document();
    const op = new EditDocOp(
      new DocAddress(DocAddress_Slot.TITLE),
      arrayToList([PString.ins(0, 'hello')]),
    );
    op.applyTo(doc);
    expect(doc.title()).toEqual(new PString('hello'));
  });

  it('ins,ins^ins,ins renames ids', () => {
    function addNode(id: number, idx: number, name: string): Op[] {
      return [
        new NewNodeOp(id),
        new IndexOp(PArray.ins<number>(idx, id)),
        new EditNodeOp(
          new NodeAddress(id, NodeAddress_Slot.NAME),
          arrayToList([PString.ins(0, name)]),
        ),
      ];
    }
    const base: Op[] = [...addNode(0, 10, 'x'), ...addNode(1, 11, 'y')];
    const pending: Op[] = [...addNode(0, 10, 'a'), ...addNode(1, 11, 'b')];
    const log = OT.newStringList();
    try {
      const rList = Rebasable.rebase(
        arrayToList(base),
        arrayToList(pending),
        CONTEXT_WINS,
        log,
      );
      const mutation = rList.mutation.toArray().map((c) => c); // get rid of $$arrayMetadata
      const rebased = rList.rebased.toArray().map((c) => c);
      expect(mutation).toEqual([
        new RenameNodeOp(0, 1),
        ...addNode(0, 10, 'x'),
        new RenameNodeOp(1, 2),
        ...addNode(1, 11, 'y'),
      ]);
      expect(rebased[0]).toEqual(new NewNodeOp(2));
      expect(rebased[1]).toEqual(new IndexOp(PArray.ins<number>(12, 2)));
      expect(rebased[2]).toEqual(
        new EditNodeOp(
          new NodeAddress(2, NodeAddress_Slot.NAME),
          arrayToList([PString.ins(0, 'a')]),
        ),
      );
      expect(rebased[3]).toEqual(new NewNodeOp(3));
      expect(rebased[4]).toEqual(new IndexOp(PArray.ins<number>(13, 3)));
      expect(rebased[5]).toEqual(
        new EditNodeOp(
          new NodeAddress(3, NodeAddress_Slot.NAME),
          arrayToList([PString.ins(0, 'b')]),
        ),
      );
    } catch (e) {
      throw new Error(`${e}\n${log.toArray().join('\n')}`);
    }
  });

  it('ins,ins^ins renames ids', () => {
    function addNode(id: number, idx: number, name: string): Op[] {
      return [
        new NewNodeOp(id),
        new IndexOp(PArray.ins<number>(idx, id)),
        new EditNodeOp(
          new NodeAddress(id, NodeAddress_Slot.NAME),
          arrayToList([ins(0, name) as Patch<PString, string>]),
        ),
      ];
    }
    const base: Op[] = addNode(0, 0, 'x');
    const pending: Op[] = [...addNode(0, 0, 'y'), ...addNode(1, 0, 'z')];
    const log = OT.newStringList();
    try {
      const r = Rebasable.rebase(
        arrayToList(base),
        arrayToList(pending),
        CONTEXT_WINS,
        log,
      );
      const mutation = r.mutation.toArray().map((c) => c); // get rid of $$arrayMetadata
      const rebased = r.rebased.toArray().map((c) => c);
      expect(rebased).toEqual([...addNode(1, 1, 'y'), ...addNode(2, 1, 'z')]);
      expect(mutation).toEqual([new RenameNodeOp(0, 1), ...addNode(0, 0, 'x')]);
    } catch (e) {
      throw new Error(`${e}\n${log.toArray().join('\n')}`);
    }
  });

  it('ins^ins renames ids', () => {
    function addNode(id: number, idx: number, name: string): Op[] {
      return [
        new NewNodeOp(id),
        new IndexOp(ins(idx, [id]) as Patch<PArray<number>, number>),
        new EditNodeOp(
          new NodeAddress(id, NodeAddress_Slot.NAME),
          arrayToList([ins(0, name) as Patch<PString, string>]),
        ),
      ];
    }
    const base: Op[] = addNode(0, 0, 'x');
    const pending: Op[] = addNode(0, 0, 'y');
    const log = OT.newStringList();
    try {
      const {rebased, mutation} = Rebasable.rebase(
        arrayToList(base),
        arrayToList(pending),
        CONTEXT_WINS,
        log,
      );
      expect(rebased.toArray().map((c) => c)).toEqual(addNode(1, 1, 'y'));
      expect(mutation.toArray().map((c) => c)).toEqual([
        new RenameNodeOp(0, 1),
        ...addNode(0, 0, 'x'),
      ]);
    } catch (e) {
      throw new Error(`${e}\n${log.toArray().join('\n')}`);
    }
  });

  it('rebase edit op', () => {
    const errors = [];
    for (let i = 0; i < 1000; i++) {
      const sharedDoc = rchanges(new Document(), 10).doc;
      const oldNodeId = getNodeId();
      const base = rchanges(sharedDoc, 1);
      setNodeId(oldNodeId);
      const pending = rchanges(sharedDoc, 1);
      const log = OT.newStringList();
      let rebased;
      let mutation;
      try {
        const r = Rebasable.rebase(
          arrayToList(base.changes),
          arrayToList(pending.changes),
          CONTEXT_WINS,
          log,
        );
        rebased = r.rebased.toArray().map((c) => c);
        mutation = r.mutation.toArray().map((c) => c);
      } catch (e) {
        errors.push(
          new Error(`${e}${e instanceof Error ? e.stack : ''}
shared     : ${sharedDoc}
base       : ${base.changes}
baseDoc    : ${base.doc}
pending    : ${pending.changes}
pendingDoc : ${pending.doc}
rebase log follows:
${log.toArray().join('\n')}`),
        );
        if (errors.length > 1) {
          throw new Error(errors.join('\n\n'));
        }
        continue;
      }
      let destBase;
      let destPatch;
      try {
        destBase = rebased.reduce(
          (doc, patch) => patch.applyTo(doc),
          base.doc.copy(),
        );
        checkNodeConstraints(destBase);
        destPatch = mutation.reduce(
          (doc, patch) => patch.applyTo(doc),
          pending.doc.copy(),
        );
        checkNodeConstraints(destPatch);
      } catch (e) {
        errors.push(
          new Error(`${e}${e instanceof Error ? e.stack : ''}
shared     : ${sharedDoc}
base       : ${base.changes}
baseDoc    : ${base.doc}
pending    : ${pending.changes}
pendingDoc : ${pending.doc}
rebase     : ${rebased}
mutation   : ${mutation}
${destBase} ==? ${destPatch}
rebase log follows:
${log.toArray().join('\n')}
`),
        );
        if (errors.length > 1) {
          throw new Error(errors.join('\n'));
        }
      }
      expect(destBase).toEqual(destPatch);
      expect(rebased.map((c) => c.clientVersion)).toEqual(
        pending.changes.map((c) => c.clientVersion),
      );
      expect(mutation.map((c) => c.clientVersion)).toEqual(
        base.changes.map((c) => c.clientVersion),
      );
    }
    if (errors.length > 0) {
      throw new Error(errors.join('\n'));
    }
  });

  function renumberClient(
    changes: Change[],
    sessionId: number,
    start: number,
  ): [Change[], number] {
    return [
      changes.map(
        (c) => new Change(c.serverVersion, sessionId, start++, c.ops),
      ),
      start,
    ];
  }
  function renumberServer(
    changes: Change[],
    start: number,
  ): [Change[], number] {
    return [
      changes.map(
        (c) => new Change(start++, c.sessionId, c.clientVersion, c.ops),
      ),
      start,
    ];
  }

  it('integrate', () => {
    for (let i = 0; i < 1000; i++) {
      const sharedDoc = new Document();
      const base = rchanges(sharedDoc, Math.floor(Math.random() * 5));
      const brn = renumberClient(base.changes, 0, 0);
      base.changes = brn[0];
      const pending = rchanges(sharedDoc, Math.floor(Math.random() * 5));
      const rn = renumberClient(pending.changes, 1, 0);
      pending.changes = rn[0];
      const nextClient = rn[1];
      // emulate server rebase:
      const r = Rebasable.rebase(
        arrayToList(base.changes),
        arrayToList(pending.changes),
        CONTEXT_WINS,
      );
      const rebased = r.rebased.toArray().map((c) => c);
      let serverChanges = [...base.changes, ...rebased];
      const srn = renumberServer(serverChanges, 0);
      serverChanges = srn[0];
      const uncleared = rchanges(pending.doc, Math.floor(Math.random() * 5));
      const crn = renumberClient(uncleared.changes, 1, nextClient);
      uncleared.changes = crn[0];

      // emulate client
      const i = integrate(serverChanges, [
        ...pending.changes,
        ...uncleared.changes,
      ]);
      expect(i.store).toEqual(serverChanges);
      expect(i.pending.length).toEqual(uncleared.changes.length); // complete integrate.
    }
  });

  it('Server.save() saves rebased changes not pending changes', () => {
    const server = new Server();
    const client0 = new Client(server);
    const client1 = new Client(server);
    client0.editDocTitle('ab');
    client0.save(); // Creates Change with EditNodeOp([ins(0,'ab')])
    const op0 = server.changes[0].ops.toArray()[0] as EditDocOp;
    expect(op0).toEqual(
      new EditDocOp(
        new DocAddress(DocAddress_Slot.TITLE),
        arrayToList([ins(0, 'ab') as Patch<PString, string>]),
      ),
    );
    client1.editDocTitle('de');
    const res = client1.doSave(); // Creates Change with EditNodeOp([ins(2,'de')])
    const op1 = server.changes[1].ops.toArray()[0] as EditDocOp;
    expect(op1).toEqual(
      new EditDocOp(
        new DocAddress(DocAddress_Slot.TITLE),
        arrayToList([ins(2, 'de') as Patch<PString, string>]),
      ),
    );
    client1.onSave(res);
  });

  it('rename 2 nodes', () => {
    const server = new Server();
    const client1 = new Client(server);
    const client2 = new Client(server);
    client1.addNode(0, 'd');
    client1.save();

    client2.addNode(0, 'h');
    client2.addNode(1, 'i');
    client2.save();

    client1.poll();
    expect(client1.changes).toEqual(client2.changes);
    expect(client1.pendingDoc).toEqual(client2.pendingDoc);
  });

  it('duplicate ids regression in poll with pending node additions atop node additions', () => {
    const server = new Server();
    const client1 = new Client(server);
    const client2 = new Client(server);
    client1.addNode(0, 'b'); // with just one add, we get NextNodeId changed after applying changes.
    client1.addNode(0, 'c'); // with two adds, we get "node 2 already exists"
    client1.save();

    client2.addNode(0, 'g');
    client2.addNode(1, 'h'); // requires two adds to trigger failure.
    // Poll, not save(), triggers the case in integrate() where pending changes
    // that are not accepted by the server are rebased atop the server's changes.
    // There was a bug where these were treated with the opposite conflict
    // resolution policy.
    const res = client2.doPoll();
    client2.onPoll(res);
    client2.onPoll(res);

    client2.save();
    client1.poll();
    expect({...client1, sessionId: undefined}).toEqual({
      ...client2,
      sessionId: undefined,
    });
  });

  it('add/remove protocol regression', () => {
    const server = new Server();
    const client0 = new Client(server);
    client0.addNode(0, 'a');
    client0.save();

    const client1 = new Client(server);
    const client2 = new Client(server);
    client1.removeNodeByIndex(0);
    client1.addNode(0, 'b');
    client1.save();

    client2.addNode(0, 'c');
    client2.removeNodeByIndex(0);
    client2.addNode(0, 'd');
    // There was a regression where RenameIndexOp would throw an error if the
    // old id had been deleted. This is actually not a problem, because
    // the rename operation just applies to all ids greater than the old id.
    client2.save();
    client1.poll();
    expect(client1.changes).toEqual(client2.changes);
    if (!client1.pendingDoc.equals(client2.pendingDoc)) {
      throw new Error(
        `client1.pendingDoc: ${client1.pendingDoc}\nclient2.pendingDoc: ${client2.pendingDoc}`,
      );
    }
    expect(client1.pendingDoc).toEqual(client2.pendingDoc);
  });

  it('integrate protocol quickcheck', () => {
    const errors = [];
    const trials = 50;
    for (let i = 0; i < trials; i++) {
      const server = new Server();
      const client0 = new Client(server);
      rclients(client0, Math.floor(Math.random() * 5));
      const oldNextNode = client0.pendingDoc.nextNodeId;

      client0.save();

      expect(client0.pendingDoc.nextNodeId).toEqual(oldNextNode);
      expect(client0.pendingDoc.nextNodeId).toEqual(
        client0.pendingDoc.nextNodeId,
      );

      const client1 = new Client(server);
      const client2 = new Client(server);
      const saveRedeliver = new Map<Client, Array<SaveResponse>>();
      const pollRedeliver = new Map<Client, Array<PollResponse>>();
      const clients = [client1, client2];
      clients.forEach((c) => {
        saveRedeliver.set(c, []);
        pollRedeliver.set(c, []);
      });
      let itererr = false;
      for (let j = 0; j < 10; j++) {
        for (const c of clients) {
          try {
            rclients(c, Math.floor(Math.random() * 5));
          } catch (e) {
            errors.push(
              `${i}/${j}: Error adding random changes: ${e}${e instanceof Error ? e.stack : ''}
                to client: ${c.pendingDoc} pendingDoc.nextNodeId: ${c.pendingDoc.nextNodeId}`,
            );
            itererr = true;
            break;
          }
          const oldPending = [...c.pending];
          const oldServer = [...server.changes];
          try {
            if (Math.random() < 0.5) {
              const res = c.doSave();
              saveRedeliver.get(c)!.push(res);
              if (Math.random() < 0.5) {
                const results = saveRedeliver.get(c)!;
                c.onSave(results[Math.floor(Math.random() * results.length)]);
              }
              if (Math.random() < 0.5) {
                c.onSave(res);
              }
              if (Math.random() < 0.5) {
                c.onSave(res);
              }
            } else if (Math.random() < 0.5) {
              const res = c.doPoll();
              pollRedeliver.get(c)!.push(res);
              if (Math.random() < 0.5) {
                const results = pollRedeliver.get(c)!;
                c.onPoll(results[Math.floor(Math.random() * results.length)]);
              }
              if (Math.random() < 0.5) {
                c.onPoll(res);
              }
              if (Math.random() < 0.5) {
                c.onPoll(res);
              }
            }
          } catch (e) {
            errors.push(
              new Error(`${i}/${j}: ${e}${e instanceof Error ? e.stack : ''}
Saving   : ${c.pending.map((c) => c.toString()).join('\n           ')} nextNodeId: ${c.pendingDoc.nextNodeId}


To server: ${server.changes
                .slice(c.nextServerVersion)
                .map((c) => c.toString())
                .join('\n           ')}


Old server: ${oldServer.map((c) => c.toString()).join('\n           ')}
Old pending: ${oldPending.map((c) => c.toString()).join('\n           ')}`),
            );
            itererr = true;
            break;
          }
        }
        if (itererr) break;
      }
      try {
        if (!itererr) {
          clients.forEach((c) => {
            c.save();
          });
          clients.forEach((c) => {
            c.poll();
          });
        }
      } catch (e) {
        errors.push(
          new Error(
            `${i} Failure in final consistency sync: ${e}${e instanceof Error ? e.stack : ''}`,
          ),
        );
        continue;
      }
      if (
        !itererr &&
        !client1.changes.every((c, i) => client2.changes[i].equals(c))
      ) {
        errors.push(
          new Error(
            `${i}: Patch convergence failure:\nClient 1: ${client1.changes}\nClient 2: ${client2.changes}`,
          ),
        );
      }
      if (!itererr && !client1.pendingDoc.equals(client2.pendingDoc)) {
        errors.push(
          new Error(
            `${i}: Document convergence failure:\nClient 1: ${client1.pendingDoc}\nClient 2: ${client2.pendingDoc}`,
          ),
        );
      } else {
        if (!itererr) expect(client1.pendingDoc).toEqual(client2.pendingDoc);
      }
    }
    if (errors.length > 0) {
      throw new Error(
        `Found ${errors.length} errors out of ${trials}. First few:
${errors.slice(0, 5).join('\n')}`,
      );
    }
  });

  it('proto roundtrip', () => {
    for (let i = 0; i < 100; i++) {
      const client = new Client(new Server());
      rclients(client, Math.floor(Math.random() * 5) + 5);
      if (Math.random() < 0.2) {
        client.save();
      }
      const protos = client.changes.map((c) => c.toProto());
      const roundtripped = protos.map((p) => Change.fromProto(p));
      expect(roundtripped).toEqual(client.changes);
    }
  });
});

// provide some wrappers around the java implementation to ease testing.
function integrate<T extends Versionable<T>>(
  server: T[],
  pending: T[],
): {mutation: T[]; store: T[]; pending: T[]} {
  const i = Versionable.integrate(arrayToList(server), arrayToList(pending));
  return {
    mutation: [...i.mutation.toArray()],
    store: [...i.store.toArray()],
    pending: [...i.pending.toArray()],
  };
}

describe('Monotonic Protocol', () => {
  beforeEach(() => {
    jasmine.addCustomEqualityTester(patchEqualityTester);
    jasmine.addCustomEqualityTester(listEqualityTester);
    jasmine.addCustomEqualityTester(opEqualityTester);
    jasmine.addCustomEqualityTester(docEqualityTester);
  });
  class FakeOp extends Op {
    constructor(readonly name: string) {
      super();
    }
    override beneath(pending: FakeOp, policy: ConflictPolicy): FakeOp {
      return pending;
    }
    override toString() {
      return `FakeOp(${this.name})`;
    }
    override equals(other?: FakeOp): boolean {
      if (other === undefined) {
        return false;
      }
      return this.name === other.name;
    }
    override hashCode() {
      return 42;
    }
    override applyTo(doc: Document): Document {
      return doc;
    }
  }
  function f(name: string) {
    return arrayToList([new FakeOp(name)]);
  }
  it('server saves 1 change', () => {
    const server = new Server();
    expect(server.open().sessionId).toBe(0);
    const req1: SaveRequest = {
      sessionId: 0,
      serverBaseVersion: 0,
      changes: [new Change(null, 0, 0, f('x'))],
    };
    const res1 = server.save(req1);
    const expectedRes1: SaveResponse = {
      changes: [new Change(0, 0, 0, f('x'))],
      nextServerVersion: 1,
    };
    expect(res1).toEqual(expectedRes1);
    expect(server.changes).toEqual([new Change(0, 0, 0, f('x'))]);

    // Save is idempotent: the second save should return the same response,
    // and should not have any effect on the server state.
    const res2 = server.save(req1);
    expect(res2).toEqual(expectedRes1);
    expect(server.changes).toEqual([new Change(0, 0, 0, f('x'))]);
  });

  it('server saves 2 changes with reissue of save 1', () => {
    const server = new Server();
    expect(server.open().sessionId).toBe(0);
    const req1: SaveRequest = {
      sessionId: 0,
      serverBaseVersion: 0,
      changes: [new Change(null, 0, 0, f('x'))],
    };
    const res1 = server.save(req1);
    const expectedRes1: SaveResponse = {
      changes: [new Change(0, 0, 0, f('x'))],
      nextServerVersion: 1,
    };
    expect(res1).toEqual(expectedRes1);
    expect(server.changes).toEqual([new Change(0, 0, 0, f('x'))]);

    // Save another change.
    expect(server.open().sessionId).toBe(1);
    const req2: SaveRequest = {
      sessionId: 1,
      serverBaseVersion: 1,
      changes: [new Change(null, 1, 0, f('y'))],
    };
    const res2 = server.save(req2);
    const expectedRes2: SaveResponse = {
      changes: [new Change(1, 1, 0, f('y'))],
      nextServerVersion: 2,
    };
    expect(res2).toEqual(expectedRes2);
    expect(server.changes).toEqual([
      new Change(0, 0, 0, f('x')),
      new Change(1, 1, 0, f('y')),
    ]);

    // Imagine client 1 didn't receive the save results and tries again.
    // The server is idempotent, meaning it won't number-store the changes,
    // but the save() operation isn't "pure" -- client 1 will still observe
    // the changes that were made by client 2.
    const res3 = server.save(req1);
    const expectedRes3: SaveResponse = {
      changes: [new Change(0, 0, 0, f('x')), new Change(1, 1, 0, f('y'))],
      nextServerVersion: 2,
    };
    expect(res3).toEqual(expectedRes3);
    expect(server.changes).toEqual([
      new Change(0, 0, 0, f('x')),
      new Change(1, 1, 0, f('y')),
    ]);

    // Imagine client 1 now tries to save a new change using its old base version.
    // This should succeed after rebasing atop the changes made by client 2.
    const req4: SaveRequest = {
      sessionId: 0,
      serverBaseVersion: 1,
      changes: [new Change(null, 0, 1, f('z'))],
    };
    const res4 = server.save(req4);
    const expectedRes4: SaveResponse = {
      changes: [new Change(1, 1, 0, f('y')), new Change(2, 0, 1, f('z'))],
      nextServerVersion: 3,
    };
    expect(res4).toEqual(expectedRes4);
    expect(server.changes).toEqual([
      new Change(0, 0, 0, f('x')),
      new Change(1, 1, 0, f('y')),
      new Change(2, 0, 1, f('z')),
    ]);
    // TODO: client 1 makes req1 again. Client2 makes req2 again.

    // Imagine client 1 has amnesia and makes req1 again.
    const res5 = server.save(req1);
    const expectedRes5: SaveResponse = {
      changes: [
        new Change(0, 0, 0, f('x')),
        new Change(1, 1, 0, f('y')),
        new Change(2, 0, 1, f('z')),
      ],
      nextServerVersion: 3,
    };
    expect(res5).toEqual(expectedRes5);

    // imagine client 2 has amnesia and makes req2 again.
    const res6 = server.save(req2);
    const expectedRes6: SaveResponse = {
      changes: [new Change(1, 1, 0, f('y')), new Change(2, 0, 1, f('z'))],
      nextServerVersion: 3,
    };
    expect(res6).toEqual(expectedRes6);
  });

  it('client delivery ignored if version is too high', () => {
    const server = new Server();
    const client = new Client(server);
    const req1: ApplyChanges = {
      nextServerVersion: 2,
      changes: [new Change(1, 1, 1, f('x'))],
    };
    client.applyChanges(req1);
    expect(client.changes).toEqual([]);
  });

  it('client delivery from other session accepted', () => {
    const server = new Server();
    const client = new Client(server);
    const changeX = new Change(0, 1, 1, f('x'));
    const changeY = new Change(1, 1, 2, f('y'));
    const req1: ApplyChanges = {
      nextServerVersion: 1,
      changes: [changeX],
    };
    expect(client.applyChanges(req1)).toEqual([changeX]);
    expect(client.changes).toEqual([changeX]);

    // Ignore repeat delivery.
    expect(client.applyChanges(req1)).toEqual([]);
    expect(client.changes).toEqual([changeX]);

    // Accept incremental delivery overlapping with existing state.
    const req2: ApplyChanges = {
      nextServerVersion: 2,
      changes: [changeX, changeY],
    };
    expect(client.applyChanges(req2)).toEqual([changeY]);
    expect(client.changes).toEqual([changeX, changeY]);
    expect(client.nextServerVersion).toBe(2);
  });

  it('client delivery from other session accepted beneath a pending change', () => {
    const server = new Server();
    const client = new Client(server);
    client.createAndApplyChange(f('a').toArray());
    const changeX = new Change(0, 1, 1, f('x'));
    const changeY = new Change(1, 1, 2, f('y'));
    const req1: ApplyChanges = {
      nextServerVersion: 1,
      changes: [changeX],
    };
    expect(client.applyChanges(req1)).toEqual([changeX]);
    expect(client.changes).toEqual([changeX]);

    // Ignore repeat delivery.
    expect(client.applyChanges(req1)).toEqual([]);
    expect(client.changes).toEqual([changeX]);

    // Accept incremental delivery overlapping with existing state.
    const req2: ApplyChanges = {
      nextServerVersion: 2,
      changes: [changeX, changeY],
    };
    expect(client.applyChanges(req2)).toEqual([changeY]);
    expect(client.changes).toEqual([changeX, changeY]);
    expect(client.nextServerVersion).toBe(2);
  });

  it('client delivery including all pending changes', () => {
    const server = new Server();
    const client = new Client(server);
    const clientChangeA = client.createAndApplyChange(f('a').toArray());
    const changeX = new Change(0, 1, 1, f('x'));
    const changeA = clientChangeA.rename(1) as Change;
    const changeY = new Change(2, 1, 2, f('y'));
    const req1: ApplyChanges = {
      nextServerVersion: 3,
      changes: [changeX, changeA, changeY],
    };
    expect(client.applyChanges(req1)).toEqual([changeX, changeY]);
    expect(client.changes).toEqual([changeX, changeA, changeY]);
    expect(client.nextServerVersion).toBe(3);

    // redelivery should be ignored.
    expect(client.applyChanges(req1)).toEqual([]);
    expect(client.changes).toEqual([changeX, changeA, changeY]);
  });
});

describe('Generic patch', () => {
  beforeEach(() => {
    jasmine.addCustomEqualityTester(patchEqualityTester);
    jasmine.addCustomEqualityTester(docEqualityTester);
  });

  it('string mangler', () => {
    let str = new PString('');
    for (let i = 0; i < 100; i++) {
      const newStr = rstr(str);
      const patch: Patch<PString, string> = str.makePatch(newStr);
      expect(patch.applyTo(str)).toEqual(newStr);
      str = newStr;
    }
  });

  it('array insert', () => {
    const patch = PArray.of([0]).makePatch(PArray.of([0, 1]));
    expect(patch).toEqual(ins(1, [1]) as Patch<PArray<number>, number>);
    expect(patch.applyTo(PArray.of([0]))).toEqual(PArray.of([0, 1]));
  });

  it('array mangler', () => {
    let array = PArray.of<number>([]);
    for (let i = 0; i < 100; i++) {
      const newArray = rarray(array);
      const patch = array.makePatch(newArray);
      const result = patch.applyTo(array);
      expect(result).toEqual(newArray);
      array = newArray;
    }
  });

  it('forward ins(0)^ins(0)=ins(1) [context wins]', () => {
    expect(
      forward(
        // op^context
        ins(0, [1]) as Patch<PArray<number>, number>, // op
        ins(0, [2]) as Patch<PArray<number>, number>, // context
        CONTEXT_WINS,
      ),
    ).toEqual(ins(1, [1]) as Patch<PArray<number>, number>);
  });

  it('forward ins(0)^ins(0)=ins(1) [op wins]', () => {
    expect(
      forward(
        // op^context
        ins(0, [1]) as Patch<PArray<number>, number>, // op
        ins(0, [2]) as Patch<PArray<number>, number>, // context
        PATCH_WINS,
      ),
    ).toEqual(ins(0, [1]) as Patch<PArray<number>, number>);
  });

  it('forward ins(1)^ins(0)=ins(2)', () => {
    expect(
      forward(
        // op^context
        ins(1, [1]) as Patch<PArray<number>, number>, // op
        ins(0, [2]) as Patch<PArray<number>, number>, // context
        CONTEXT_WINS,
      ),
    ).toEqual(ins(2, [1]) as Patch<PArray<number>, number>);
    expect(
      forward(
        // op^context
        ins(1, [1]) as Patch<PArray<number>, number>, // op
        ins(0, [2]) as Patch<PArray<number>, number>, // context
        PATCH_WINS,
      ),
    ).toEqual(ins(2, [1]) as Patch<PArray<number>, number>);
  });

  it('forward ins(0)^ins(1)=ins(0)', () => {
    expect(
      forward(
        // op^context
        ins(0, [1]) as Patch<PArray<number>, number>, // op
        ins(1, [2]) as Patch<PArray<number>, number>, // context
        CONTEXT_WINS,
      ),
    ).toEqual(ins(0, [1]) as Patch<PArray<number>, number>);
    expect(
      forward(
        // op^context
        ins(0, [1]) as Patch<PArray<number>, number>, // op
        ins(1, [2]) as Patch<PArray<number>, number>, // context
        PATCH_WINS,
      ),
    ).toEqual(ins(0, [1]) as Patch<PArray<number>, number>);
  });

  it('one-op ins vs rm', () => {
    checkOneOpBothPolicies({
      policy: PATCH_WINS,
      shared: 'ab',
      baseStr: 'xab',
      pendingStr: 'b',
    });
  });

  it('one-op rm vs rm', () => {
    checkOneOpBothPolicies({
      policy: PATCH_WINS,
      shared: 'ax',
      baseStr: 'x',
      pendingStr: 'x',
      expected: 'x',
    });
  });

  it('safeDecompose', () => {
    expect(checkedDecompose(ins(0, 'a') as Patch<PString, string>)).toEqual([
      ins(0, 'a') as Patch<PString, string>,
    ]);
    expect(checkedDecompose(rem(0, 'a') as Patch<PString, string>)).toEqual([
      rem(0, 'a') as Patch<PString, string>,
    ]);
    expect(checkedDecompose(ins(0, 'ab') as Patch<PString, string>)).toEqual([
      ins(0, 'a') as Patch<PString, string>,
      ins(1, 'b') as Patch<PString, string>,
    ]);
    expect(checkedDecompose(rem(0, 'ab') as Patch<PString, string>)).toEqual([
      rem(0, 'a') as Patch<PString, string>,
      rem(0, 'b') as Patch<PString, string>,
    ]);
    expect(
      checkedDecompose(new PString('ab').makePatch(new PString('cd'))),
    ).toEqual([
      rem(0, 'a') as Patch<PString, string>,
      rem(0, 'b') as Patch<PString, string>,
      ins(0, 'c') as Patch<PString, string>,
      ins(1, 'd') as Patch<PString, string>,
    ]);
  });

  it('one op, one transform', () => {
    for (let i = 0; i < 1000; i++) {
      const shared = nstr(5);
      checkOneOpBothPolicies({
        policy: PATCH_WINS,
        shared,
        baseStr: rstr1(shared),
        pendingStr: rstr1(shared),
      });
    }
  });

  function makeOnePatch(str: PString): [PString, Patch<PString, string>] {
    const newStr = rstr1(str);
    return [newStr, str.makePatch(newStr)];
  }

  it('one op, rebase', () => {
    for (let i = 0; i < 1000; i++) {
      const shared = nstr(5);
      let baseStr = shared;
      let basePatch;
      let pendingStr = shared;
      let pendingPatch;
      const basePatches = [];
      const pendingPatches = [];
      for (let j = 0; j < 10; j++) {
        [baseStr, basePatch] = makeOnePatch(baseStr);
        basePatches.push(basePatch);
        [pendingStr, pendingPatch] = makeOnePatch(pendingStr);
        pendingPatches.push(pendingPatch);
      }
      for (const policy of [CONTEXT_WINS, PATCH_WINS]) {
        const {rebased, mutation} = rebase(basePatches, pendingPatches, policy);
        const a = safeApplyStrPatches(baseStr, rebased);
        const b = safeApplyStrPatches(pendingStr, mutation);
        expect(a).toEqual(b);
        if (a instanceof Error || b instanceof Error || !a.equals(b)) {
          throw new Error(`${a} != ${b}`);
        }
      }
    }
  });

  it('mv^mv same to index', () => {
    checkOneOpBothPolicies({
      policy: PATCH_WINS,
      shared: 'abcde',
      basePatch: new MovePatch<PString, string>(4, new PString('e'), 0), // eabcd
      pendingPatch: new MovePatch<PString, string>(3, new PString('d'), 0), // strPatcher.mv('d', 3, 0), // dabce
    });
  });

  it('ins^mv same to index', () => {
    checkOneOpBothPolicies({
      policy: CONTEXT_WINS,
      shared: 'ax',
      basePatch: new MovePatch<PString, string>(1, new PString('x'), 0),
      pendingPatch: new InsertPatch<PString, string>(1, new PString('y')),
      expected: 'xay',
    });
  });

  it('mv^mv chasing', () => {
    checkOneOp({
      policy: PATCH_WINS,
      shared: 'abc',
      basePatch: new MovePatch<PString, string>(1, new PString('b'), 0),
      pendingPatch: new MovePatch<PString, string>(1, new PString('b'), 2),
      expected: 'acb',
    });
  });

  it('edit^rm regression 1', () => {
    checkOneOp({
      policy: PATCH_WINS,
      shared: 'fgiqs',
      basePatch: new PString('fgiqs').makePatch(new PString('fcnfxqs')),
      pendingPatch: new PString('fgiqs').makePatch(new PString('giqs')),
      expected: 'cnfxqs',
    });
  });

  {
    function op(shared: PString) {
      if (shared.size() < 2) return ins(shared);
      if (shared.size() > 10) return rm(shared);
      if (Math.random() < 0.25 && shared.size() > 1) {
        return rm(shared);
      } else if (Math.random() < 0.25 && shared.size() > 2) {
        return mv(shared);
      } else if (Math.random() < 0.25) {
        return ins(shared);
      } else {
        return edit(shared);
      }
    }
    function rm(shared: PString) {
      const index = getRandomIndex(shared.size() - 1);
      return new RemovePatch<PString, string>(
        index,
        shared.slice2(index, index + 1),
      );
    }
    function ins(shared: PString) {
      const index = getRandomIndex(shared.size());
      return new InsertPatch<PString, string>(index, nstr(1));
    }
    function mv(shared: PString) {
      const from = getRandomIndex(shared.size() - 1);
      const to = getRandomIndex(shared.size() - 2);
      if (from !== to) {
        return new MovePatch<PString, string>(
          from,
          shared.slice2(from, from + 1),
          to,
        );
      }
      return rm(shared);
    }
    function edit(shared: PString) {
      return shared.makePatch(rstr(shared));
    }

    it('quickcheck for moves', () => {
      let wins = 0;
      const errors = [];
      for (let i = 0; i < 2000; i++) {
        const shared = nstr(5);
        const basePatch = op(shared);
        const pendingPatch = op(shared);
        try {
          checkOneOp({policy: PATCH_WINS, shared, basePatch, pendingPatch});
          wins++;
        } catch (e) {
          errors.push(e);
        }
        try {
          checkOneOp({policy: CONTEXT_WINS, shared, basePatch, pendingPatch});
        } catch (e) {
          errors.push(e);
        }
        if (errors.length > 10) {
          throw new Error(
            `there were ${errors.length} errors and ${wins} wins\n${errors.join('\n')}`,
          );
        }
      }
      if (errors.length > 0) {
        throw new Error(
          `there were ${errors.length} errors and ${wins} wins\n${errors.join('\n')}`,
        );
      }
    });

    interface RebaseSpec {
      policy: ConflictPolicy;
      shared: string | PString;
      base: Array<Patch<PString, string>>;
      baseStr: string | PString;
      pending: Array<Patch<PString, string>>;
      pendingStr: string | PString;
    }
    function explode(patches: Array<Patch<PString, string>>) {
      return [...Patch.explode(arrayToList(patches)).toArray()];
    }
    function recompose(patches: Array<Patch<PString, string>>) {
      return [...Patch.recompose(arrayToList(patches)).toArray()];
    }
    function checkRebase(s: RebaseSpec) {
      const {policy, base, pending} = s;
      const shared = ensurePString(s.shared);
      const baseStr = ensurePString(s.baseStr);
      const pendingStr = ensurePString(s.pendingStr);
      const expectedBaseStr = base.reduce((s, p) => p.applyTo(s), shared);
      const expectedPendingStr = pending.reduce((s, p) => p.applyTo(s), shared);
      let a;
      let ea;
      let b;
      let eb;
      let mo;
      let so;
      let moLog;
      let soLog;
      try {
        so = rebase(explode(base), explode(pending), policy, true);
        soLog = so.log;
        so = {rebased: recompose(so.rebased), mutation: recompose(so.mutation)};
        mo = rebase(base, pending, policy, moLog);
        moLog = mo.log;

        ea = so.rebased.reduce((s, p) => p.applyTo(s), baseStr);
        eb = so.mutation.reduce((s, p) => p.applyTo(s), pendingStr);
        a = mo.rebased.reduce((s, p) => p.applyTo(s), baseStr);
        b = mo.mutation.reduce((s, p) => p.applyTo(s), pendingStr);
        if (!a.equals(b)) {
          throw new Error(`${a} != ${b}`);
        }
        expect(a).toEqual(b);
      } catch (e) {
        throw new Error(
          `--------
${e}
${(e as Error).stack}
policy     : ${policy === CONTEXT_WINS ? 'CONTEXT_WINS' : 'PATCH_WINS'}
shared     : ${shared}
base       : ${base}
baseStr    : ${baseStr} = ${expectedBaseStr} [${baseStr.equals(expectedBaseStr)}]
pending    : ${pending}
pendingStr : ${pendingStr} = ${expectedPendingStr} [${pendingStr.equals(expectedPendingStr)}]
mo.rebased : ${mo?.rebased}
so.rebased : ${so?.rebased}
mo.mutation: ${mo?.mutation}
so.mutation: ${so?.mutation}
a = base + mo.rebased = ${a} [${ea}]
b = pending + mo.mutation = ${b} [${eb}]
-- so rebase log
${soLog}
-- mo rebase log
${moLog}
`,
        );
      }
    }
    function at(idx: number, insert: string, remove: string) {
      return new EditPatch<PString, string>(
        idx,
        new PString(insert),
        new PString(remove),
      );
    }

    it('regression for rebase 1', () => {
      // The actual regression was in recompose(), which didn't handle Edits
      // interspersed with insert and remove operations.
      checkRebase({
        policy: CONTEXT_WINS,
        shared: 'bd',
        base: [at(1, 'd', 'z')],
        baseStr: 'bz',
        pending: [new RemovePatch<PString, string>(0, new PString('b'))],
        pendingStr: 'd',
        // expected: 'zw',
      });
    });

    it('quickcheck for rebase moves', () => {
      const errors = [];
      let wins = 0;
      for (let i = 0; i < 100; i++) {
        const shared = nstr(10);
        let baseStr = shared;
        const base: Array<Patch<PString, string>> = [];
        let pendingStr = shared;
        const pending: Array<Patch<PString, string>> = [];
        for (let j = 0; j < 20; j++) {
          const b = op(baseStr);
          baseStr = b.applyTo(baseStr);
          base.push(b);
          const p = op(pendingStr);
          pendingStr = p.applyTo(pendingStr);
          pending.push(p);
        }
        try {
          checkRebase({
            policy: CONTEXT_WINS,
            shared,
            base,
            baseStr,
            pending,
            pendingStr,
          });
        } catch (e) {
          errors.push(e);
        }
        try {
          checkRebase({
            policy: PATCH_WINS,
            shared,
            base,
            baseStr,
            pending,
            pendingStr,
          });
        } catch (e) {
          errors.push(e);
        }
        if (errors.length > 10) {
          throw new Error(
            `there were ${errors.length} errors and ${wins} wins\n${errors.join('\n')}`,
          );
        }
        wins++;
      }
      if (errors.length > 0) {
        throw new Error(
          `there were ${errors.length} errors and ${wins} wins\n${errors.join('\n')}`,
        );
      }
    });
  }

  it('multi op, one transform', () => {
    // - Let's try:
    //   - forward() returns arrays
    //   - patch.decompose() caches
    //   - rebase() has to splice() if the return values aren't singles.
    let wins = 0;
    const errors = [];
    for (let i = 0; i < 1000; i++) {
      const shared = nstr(5);
      const baseStr = rstr(shared);
      const pendingStr = rstr(shared);
      try {
        checkOneOp({policy: PATCH_WINS, shared, baseStr, pendingStr});
        wins++;
      } catch (e) {
        errors.push(e as Error);
      }
      try {
        checkOneOp({policy: CONTEXT_WINS, shared, baseStr, pendingStr});
      } catch (e) {
        errors.push(e as Error);
      }
      if (errors.length > 10) {
        throw new Error(
          `there were ${errors.length} errors and ${wins} wins\n${errors.map((e) => `${e}\n${e.stack}`).join('\n')}`,
        );
      }
    }
    if (errors.length > 0) {
      throw new Error(
        `there were ${errors.length} errors and ${wins} wins\n${errors.map((e) => `${e}\n${e.stack}`).join('\n')}`,
      );
    }
  });

  it('forward transform [ins(0)], [ins(0)]', () => {
    const {mutation, rebased} = rebase(
      [PArray.ins<number>(0, 0)],
      [PArray.ins<number>(0, 1)],
      CONTEXT_WINS,
    );
    expect(mutation).toEqual([ins(0, [0], '1')]);
    expect(rebased).toEqual([ins(1, [1], '3.1')]);
  });

  it('forward transform overlapping deletes', () => {
    expect(
      forward(
        rem(1, [1]) as Patch<PArray<number>, number>,
        rem(0, [0, 1, 2]) as Patch<PArray<number>, number>,
        CONTEXT_WINS,
      ),
    ).toEqual(new NopPatch<PArray<number>, number>());
  });

  it('ins(0)^rem(0) / context wins', () => {
    expect(
      forward(
        ins(0, 'x') as Patch<PString, string>,
        rem(0, 'b') as Patch<PString, string>,
        CONTEXT_WINS,
      ),
    ).toEqual(ins(0, 'x'));
  });

  it('rm^mv', () => {
    checkOneOpBothPolicies({
      policy: PATCH_WINS,
      shared: 'abc',
      basePatch: new MovePatch<PString, string>(0, new PString('a'), 1), // bac
      pendingPatch: new RemovePatch<PString, string>(0, new PString('a')), // bc
      expected: 'bc',
    });
  });

  const strPatcher = {
    ins: (index: number, str: string) =>
      new InsertPatch<PString, string>(index, new PString(str)),
    mv: (str: string, from: number, to: number) =>
      new MovePatch<PString, string>(from, new PString(str), to),
    rem: (index: number, str: string) =>
      new RemovePatch<PString, string>(index, new PString(str)),
    makePatch: (shared: string, str: string) =>
      new PString(str).makePatch(new PString(shared)),
  };

  it('ins^mv', () => {
    checkOneOpBothPolicies({
      policy: PATCH_WINS,
      shared: 'abc',
      basePatch: strPatcher.mv('a', 0, 1),
      pendingPatch: strPatcher.ins(0, 'x'),
      expected: 'xbac',
    });
  });

  it('mv^rm', () => {
    checkOneOpBothPolicies({
      policy: PATCH_WINS,
      shared: 'abc',
      basePatch: strPatcher.rem(0, 'a'), // bc
      pendingPatch: strPatcher.mv('a', 0, 2), // bca
      expected: 'bc',
    });
  });

  interface QuickSpec {
    shared: string;
    base: string;
    patch: string;
    contextWins: string;
    patchWins: string;
  }
  function checkOne({shared, base, patch, contextWins, patchWins}: QuickSpec) {
    const pairs: Array<[ConflictPolicy, string]> = [
      [CONTEXT_WINS, contextWins],
      [PATCH_WINS, patchWins],
    ];
    const errors = [];
    for (const [policy, expected] of pairs) {
      try {
        checkOneOp({
          policy,
          shared,
          baseStr: base,
          pendingStr: patch,
          expected,
        });
      } catch (e) {
        if (e instanceof Error) errors.push(e);
      }
    }
    if (errors.length > 0) throw errors;
  }
  function quickcheck({
    shared,
    base,
    patch,
    contextWins,
    patchWins,
  }: QuickSpec) {
    checkOne({shared, base, patch, contextWins, patchWins});
    const letters = new Set<string>();
    [shared, base, patch].forEach((s) => {
      s.split('').forEach((c) => {
        letters.add(c);
      });
    });
    for (let i = 0; i < 50; i++) {
      const subs = new Map<string, string>();
      letters.forEach((l) => {
        subs.set(l, new Array(rint(5)).fill(l).join(''));
      });
      const [sharedStr, baseStr, patchStr, contextWinsStr, patchWinsStr] = [
        shared,
        base,
        patch,
        contextWins,
        patchWins,
      ].map((s) =>
        s
          .split('')
          .map((l) => subs.get(l))
          .join(''),
      );
      checkOne({
        shared: sharedStr,
        base: baseStr,
        patch: patchStr,
        contextWins: contextWinsStr,
        patchWins: patchWinsStr,
      });
    }
  }

  it('remove and replace at same character', () => {
    quickcheck({
      shared: 'cd',
      base: 'd', // rm(0. 'c')
      patch: 'y', // p(0, 'cd', 'y')
      contextWins: 'y',
      patchWins: 'y',
    });
  });

  it('forward partially overlapped / back delete', () => {
    quickcheck({
      shared: 'bcd',
      base: 'by', // p(1, cd, y)
      patch: 'xd', // p(0, bc, x)
      contextWins: 'yx', // by -> xy = p(0, b, x)
      patchWins: 'xy', // by -> xy = p(0, b, x)
    });
  });

  it('forward partially overlapped / front delete', () => {
    quickcheck({
      shared: 'bcd',
      base: 'xd',
      patch: 'by',
      contextWins: 'xy',
      patchWins: 'yx',
    });
  });

  it('patch insert immediately after context replace', () => {
    quickcheck({
      shared: 'ab',
      base: 'ax',
      patch: 'aby',
      contextWins: 'axy',
      patchWins: 'ayx',
    });
  });

  it('forward patch completely contained in context', () => {
    quickcheck({
      shared: 'bcd',
      base: 'x',
      patch: 'byd',
      contextWins: 'xy',
      patchWins: 'yx',
    });
  });

  it('regression 3', () => {
    quickcheck({
      shared: 'bc',
      base: 'x', // p(0, bc, x)
      patch: 'by', // p(1, c, y)
      contextWins: 'xy',
      patchWins: 'yx',
    });
  });

  it('patch contains context', () => {
    quickcheck({
      shared: 'abc',
      base: 'axc',
      patch: 'y',
      contextWins: 'xy',
      patchWins: 'yx',
    });
  });
});

// - Replace manual widgets with editors, and get the editors to dtrt.
//   - replacing the title Edit should be straightforward
// - notes from working with the other editors
//   - "accept" -- what is it for?

// - implement debouncing and edit coalescing in ot_client
//   - actually i think this should happen in the editor after all
//     - because it knows when the editor has lost focus or the user hits
//       return and wants to commit, and we should definitely flush when
//       that happens
//     - the trick is untwisting createChangeAndApply -- we're going to need
//       to apply the Op immediately, but we're _not_ going to create a change
//       until it's time to flush. And when we do, we're going to need to
//       createChange _without_ applying to the document, but still adding it
//       to pending. And probably triggering the save immediately, since we
//       already added debounce delay.
// - integrate title edit into tasksight
//   - should be fairly straightforward
// - integrate OT into node editor. Not sure how we'll do this.
// - we basically have to turn Graph into a subclass of Document?

// TODO: Other edit types: add/remove edge/group, move node, change node type.
// TODO: deal with compaction
// - I think this is an update where we consume the bottom of the server
//   range.
// - need to figure out how we're going to deal with "time travel"

// - deal with number types:
// - int64 in protobufs translates to gbignum in typescript, which is actually
//   just fine for us, I think. bignum supports arithmetic, so we can use it
//   to generate change ids. That would let us replace all the Double code in
//   OT with Long instead. Then the only place we're in trouble is java array
//   access, where the subscripts need to be Int, not Long
// - replace sessionId with random uuid (see Util.getProjectId())
// - live editing looks cool in text areas and is great for avoiding conflicts.
//   however if someone is editing an estimate, their in-progress changes can cause
//   everything to reflow constantly, and flicker in and out of valid states. We
//   could get around this by having a "proposed" value which is being edited, but
//   not yet committed. This has other side-effects -- if "proposal" is a document
//   condition, we can get edits stuck in this place. If a client starts typing,
//   then closes the browser window, someone else will have to go finish or
//   abort the edit. This kinda sucks too.

// - Once we deal with the number type problem, we should have a pretty good
//   grip on what the database schema should look like. At this point we should
//   write storage protos and a spanner schema, and hook back up the spanner
//   database backend.

// - Once we have a spanner database, we can look into push notifications and
//   get rid of polling.

// This is probably a good time to split out all the changes and get them
// reviewed.

// - then we have to deal with ACLs and we're ready to roll!

// - consider getting rid of noted(), it didn't really work like I wanted.

// - server shouldn't return the sessionIds of non-this sessions, they just
//   need to be not-this session. That should reduce some bandwidth.

// - if assigning sessionIds is a pain, we can look into having the client
//   fetch one before committing changes. We only need it when the client
//   needs to disambiguate its own changes over potentially multiple layers
//   of other clients' changes in Versionable.integrate().

// - once we have push notifications, look into tracking session carats, so
//   we can see what other people are looking at.
