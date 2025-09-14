package com.google.mcsched.ot;

import com.google.protos.mcsched.ot.OpProto;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/**
 * A Document-level mutation operation.
 *
 * <p>A document has Nodes, which have Slots that are PStrings and can be modified with any of the
 * Patch subclasses.
 *
 * <p>A document also has top-level Slots which are also PStrings and can be modified with any of
 * the Patch subclasses.
 *
 * <p>Lastly, a document has a PArray of node ids, which represents the display order of the nodes
 * in the document. This can be modified with any Patch as well.
 *
 * <p>In addition to these PArray/PString level operations, the Op hierarchy supports allocating and
 * deleting new nodes and managing their ids.
 */
@JsType
@NullMarked
public abstract class Op extends Rebasable<Op> {
  public abstract void applyTo(Document d);

  @Override
  public abstract Op beneath(Op pending, ConflictPolicy policy);

  public Op atopEditNodeOp(EditNodeOp context, ConflictPolicy policy) {
    return this;
  }

  public Op atopEditDocOp(EditDocOp context, ConflictPolicy policy) {
    return this;
  }

  public Op atopNewNodeOp(NewNodeOp context, ConflictPolicy policy) {
    return this;
  }

  public Op atopDeleteNodeOp(DeleteNodeOp context, ConflictPolicy policy) {
    return this;
  }

  public Op atopIndexOp(IndexOp context, ConflictPolicy policy) {
    return this;
  }

  public Op atopRenameNodeOp(RenameNodeOp context, ConflictPolicy policy) {
    return this;
  }

  @Override
  public abstract boolean equals(@Nullable Object other);

  @Override
  public abstract int hashCode();

  @Override
  public abstract String toString();

  abstract OpProto toProto();

  static Op fromProto(OpProto proto) {
    switch (proto.getOpCase()) {
      case EDIT_DOC:
        return EditDocOp.fromProto(proto.getEditDoc());
      case EDIT_NODE:
        return EditNodeOp.fromProto(proto.getEditNode());
      case INDEX:
        return IndexOp.fromProto(proto.getIndex());
      case NEW_NODE:
        return NewNodeOp.fromProto(proto.getNewNode());
      case DELETE_NODE:
        return DeleteNodeOp.fromProto(proto.getDeleteNode());
      case NO_OP:
        return NoOp.NO_OP;
      case RENAME:
        return RenameNodeOp.fromProto(proto.getRename());
      default:
        throw new IllegalArgumentException("Unknown op type: " + proto.getOpCase());
    }
  }
}
