/**
 * @fileoverview Operational transform operators.
 *
 * An operational transform (OT) model of edits allows collaborative editing,
 * even when two users are editing the same field in the model. The same model
 * allows undo/redo and offline editing.
 */

export class EditOp {
  at: number;
  deleted: string;
  added: string;
  constructor(at: number, deleted: string, added: string) {
    this.at = at;
    this.deleted = deleted;
    this.added = added;
  }
  toString() {
    return `Edit(@${this.at} "${this.deleted}" -> "${this.added}")`;
  }
  apply(target: string) {
    return [
      target.slice(0, this.at),
      this.added,
      target.slice(this.at + this.deleted.length)
    ].join('');
  }
  reverse(): EditOp {
    return new EditOp(this.at, this.added, this.deleted);
  }
}

export class EditOpBuilder {
  original: string;
  constructor(original: string) {
    this.original = original;
  }
  build(final: string): EditOp {
    // There's probably a clever way to do this using the carat positions. But
    // I'm not smart enough to figure it out. So we'll brute-force it instead.
    // original: [prefix][deleted][suffix]
    //    final: [prefix][added][suffix]
    //Any of prefix, added, deleted, or suffix can be empty.
    const original = this.original;
    const otl = original.length;
    const ftl = final.length;
    const length = Math.min(otl, ftl);
    // Find the common prefix span: first <s> characters.
    let s = 0;
    while (s < length && original[s] == final[s]) { s++; }
    // Find the common suffix span: the last <e> characters.
    let e = 0;
    while (e < length && original[otl - e - 1] == final[ftl - e - 1]) { e++; }

    const deleted = original.slice(s, otl - e);
    const added = final.slice(s, ftl - e);
    return new EditOp(s, deleted, added);
  }
};

export class Op {};

export class EditTitleOp extends Op {
  edit: EditOp;
  constructor(edit: EditOp) {
    super();
    this.edit = edit;
  }
}

declare global {
  interface HTMLElementEventMap {
    'operate': CustomEvent<Op>;
  }
}
