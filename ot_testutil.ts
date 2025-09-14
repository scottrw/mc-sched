/**
 * @fileoverview A description of this module.  What would someone
 * new to your team want to know about the code in this file?
 * (DO NOT SUBMIT as is; replace this comment.)
 */

import Change from 'goog:com.google.mcsched.ot.Change';
import DeleteNodeOp from 'goog:com.google.mcsched.ot.DeleteNodeOp';
import DocAddress from 'goog:com.google.mcsched.ot.DocAddress';
import DocAddress_Slot from 'goog:com.google.mcsched.ot.DocAddress.Slot';
import Document from 'goog:com.google.mcsched.ot.Document';
import EditDocOp from 'goog:com.google.mcsched.ot.EditDocOp';
import EditNodeOp from 'goog:com.google.mcsched.ot.EditNodeOp';
import IndexOp from 'goog:com.google.mcsched.ot.IndexOp';
import MovePatch from 'goog:com.google.mcsched.ot.MovePatch';
import NewNodeOp from 'goog:com.google.mcsched.ot.NewNodeOp';
import NodeAddress from 'goog:com.google.mcsched.ot.NodeAddress';
import NodeAddress_Slot from 'goog:com.google.mcsched.ot.NodeAddress.Slot';
import Op from 'goog:com.google.mcsched.ot.Op';
import OT from 'goog:com.google.mcsched.ot.OT';
import PArray from 'goog:com.google.mcsched.ot.PArray';
import Patch from 'goog:com.google.mcsched.ot.Patch';
import PString from 'goog:com.google.mcsched.ot.PString';
import List from 'goog:java.util.List';

export function ins(at: number, insert: string | number[], note?: string) {
  if (typeof insert === 'string') {
    return Patch.at(at, null, new PString(insert), note ?? null);
  }
  return Patch.at(at, null, PArray.of(insert), note ?? null);
}

export function rem(at: number, remove: string | number[], note?: string) {
  if (typeof remove === 'string') {
    return Patch.at(at, new PString(remove), new PString(''), note ?? null);
  }
  return Patch.at(at, PArray.of(remove), PArray.of([]), note ?? null);
}

export function arrayToList<T>(array: T[]): List<T> {
  return OT.makeList(array);
}

export function getRandomIndex(length: number): number {
  // Allow index up to length for appending
  return Math.floor(Math.random() * (length + 1));
}

let n = 0;

export function rarray(old: PArray<number>): PArray<number> {
  const newArray = old.copy();
  const at = getRandomIndex(old.size());

  // Determine removal length (0 to max possible from 'at')
  // Can only remove if 'at' is within the bounds of the original array.
  const maxRemoveLength =
    old.size() > 0 && at < old.size() ? old.size() - at : 0;
  const removeLength = Math.floor(Math.random() * (maxRemoveLength + 1)); // 0 to maxRemoveLength

  // Determine insert sequence (0 to 5 elements)
  const insertLength = Math.floor(Math.random() * 6); // 0 to 5
  const insertSequence: number[] = [];
  for (let i = 0; i < insertLength; i++) {
    insertSequence.push(n++); // Use global 'n'
  }

  // Apply the changes using splice. This might be a no-op if removeLength and insertLength are both 0.
  newArray.splice(at, removeLength, PArray.of(insertSequence));

  return newArray;
}

export function nstr(len: number): PString {
  const cps = [];
  const z = 'z'.codePointAt(0)!;
  const sp = 'a'.codePointAt(0)!;
  for (let i = 0; i < len; i++) {
    cps.push(Math.floor(Math.random() * (z - sp)) + sp);
  }
  return new PString(String.fromCodePoint(...cps));
}

export function rstr(old: PString): PString {
  if (old.size() === 0) {
    return nstr(Math.floor(Math.random() * 5) + 1);
  }
  const at = Math.floor(Math.random() * old.size());
  const len = Math.floor(Math.random() * (old.size() - at));
  return old.splice(at, len, nstr(len + Math.random() * 5));
}

export function rstr1(old: PString): PString {
  const at = Math.floor(Math.random() * old.size());
  if (Math.random() < 0.5) {
    return old.splice(at, 1);
  } else {
    return old.splice(at, 0, nstr(1));
  }
}

export function rint(max: number) {
  return 1 + Math.floor(Math.random() * (max - 1));
}

export function editDoc(doc: Document): Op {
  const slot =
    Math.random() < 0.5 ? DocAddress_Slot.TITLE : DocAddress_Slot.SUBTITLE;
  const address = new DocAddress(slot);
  const old = address.get(doc)();
  const newStr = rstr(old);
  const patch = old.makePatch(newStr);
  const op = new EditDocOp(address, arrayToList([patch]));
  op.applyTo(doc);
  return op;
}

let nodeId = 0;
export function getNodeId(): number {
  return nodeId;
}
export function setNodeId(id: number) {
  nodeId = id;
}

export function addNode(doc: Document): Change {
  const idx = Math.floor(Math.random() * doc.size());
  const id = nodeId++;
  const newNode = new NewNodeOp(id);
  const insNode = new IndexOp(ins(idx, [id]) as Patch<PArray<number>, number>);
  const editNode = new EditNodeOp(
    new NodeAddress(id, NodeAddress_Slot.NAME),
    arrayToList([ins(0, `n${id}`) as Patch<PString, string>]),
  );
  const c = change([newNode, insNode, editNode]);
  c.applyTo(doc);
  doc.getNodeById(id);
  if (doc.orderedNodes().indexOf(id) < 0) {
    throw new Error(`failed to insert ${id} into ${doc}`);
  }
  checkNodeConstraints(doc);
  return c;
}

export function checkNodeConstraints(doc: Document) {
  doc.checkNodeConstraints();
}

export function rmNode(doc: Document): Change {
  checkNodeConstraints(doc);
  const idIdx = Math.floor(Math.random() * doc.size());
  const id = doc.orderedNodes().get(idIdx);
  const idx = idIdx;
  if (idx === -1) {
    throw new Error(`rmnode(${id}): node ${id} does not exist in ${doc}`);
  }
  const editOp = new EditNodeOp(
    new NodeAddress(id, NodeAddress_Slot.NAME),
    arrayToList([doc.getNodeById(id)!.name().makePatch(new PString(''))]),
  );
  const rmNodeOp = new IndexOp(rem(idx, [id]) as Patch<PArray<number>, number>);
  const delNodeOp = new DeleteNodeOp(id);
  const c = change([editOp, rmNodeOp, delNodeOp]);
  c.applyTo(doc);
  if (doc.orderedNodes().indexOf(id) >= 0) {
    throw new Error(`failed to remove ${id} from ${doc}`);
  }
  checkNodeConstraints(doc);
  return c;
}

export function editNode(doc: Document) {
  const idx = Math.floor(Math.random() * doc.size());
  const id = doc.orderedNodes().get(idx);
  const addr = new NodeAddress(id, NodeAddress_Slot.NAME);
  const old = addr.get(doc)();
  const newStr = rstr(old);
  const op = new EditNodeOp(addr, arrayToList([old.makePatch(newStr)]));
  op.applyTo(doc);
  return op;
}

export function edit(doc: Document) {
  if (doc.size() > 0) {
    if (Math.random() < 0.5) {
      return editNode(doc);
    }
  }
  return editDoc(doc);
}

export function rchange(doc: Document) {
  if (doc.size() < 5) {
    if (Math.random() < 0.25) {
      return addNode(doc);
    }
  }
  if (doc.size() > 0) {
    if (Math.random() < 0.25) {
      const from = Math.floor(Math.random() * doc.size());
      const to = Math.floor(Math.random() * doc.size());
      if (from !== to) {
        const c = change([
          new IndexOp(
            new MovePatch<PArray<number>, number>(
              from,
              doc.orderedNodes().slice2(from, from + 1),
              to,
            ) as Patch<PArray<number>, number>,
          ),
        ]);
        c.applyTo(doc);
        return c;
      }
    }
    if (Math.random() < 0.25) {
      return rmNode(doc);
    }
  }
  return change([edit(doc)]);
}
let changeId = 0;
export function change(ops: Op[]) {
  return new Change(null, 0, changeId++, arrayToList(ops));
}

export function rchanges(doc: Document, count: number) {
  const d = doc.copy();
  checkNodeConstraints(d);
  const changes = [];
  for (let i = 0; i < count; i++) {
    try {
      checkNodeConstraints(d);
    } catch (e) {
      throw new Error(
        `rchanges failed on ${i}th iteration:\n${e}\n${d} ==? ${doc}`,
      );
    }
    const c = rchange(d);
    checkNodeConstraints(d);
    changes.push(c);
  }
  return {doc: d, changes};
}
