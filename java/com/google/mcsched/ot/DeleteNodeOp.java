package com.google.mcsched.ot;

import com.google.protos.mcsched.ot.DeleteNodeOpProto;
import com.google.protos.mcsched.ot.OpProto;
import java.util.Objects;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/**
 * Remove an allocated Node from the document
 *
 * <p>Note that this is part of a three-part operation. First, EditNodeOps zero out the fields of
 * the node. This way, when the Delete is undone, the fields will be restored. Then, an IndexOp
 * removes the node from the orderedNodes list of the document. Last, this operation removes it from
 * the ID map.
 */
@JsType
@NullMarked
public final class DeleteNodeOp extends Op {
  public final double clientId;

  public DeleteNodeOp(double clientId) {
    this.clientId = clientId;
  }

  @Override
  public void applyTo(Document d) {
    d.delNode(this.clientId);
  }

  @Override
  public Op beneath(Op pending, ConflictPolicy policy) {
    return pending.atopDeleteNodeOp(this, policy);
  }

  @Override
  public Op atopNewNodeOp(NewNodeOp context, ConflictPolicy policy) {
    if (clientId == context.clientId) {
      throw new IllegalArgumentException("cannot delete node and create node in same op");
    }
    return this;
  }

  @Override
  public Op atopDeleteNodeOp(DeleteNodeOp context, ConflictPolicy policy) {
    if (clientId == context.clientId) {
      return NoOp.NO_OP;
    }
    return this;
  }

  @Override
  public Op atopRenameNodeOp(RenameNodeOp context, ConflictPolicy policy) {
    if (context.inRange(this.clientId)) {
      return new DeleteNodeOp(context.transform(this.clientId));
    }
    return this;
  }

  @Override
  public boolean equals(@Nullable Object other) {
    if (other == null) {
      return false;
    }
    if (other instanceof DeleteNodeOp) {
      DeleteNodeOp otherDeleteNodeOp = (DeleteNodeOp) other;
      return this.clientId == otherDeleteNodeOp.clientId;
    }
    return false;
  }

  @Override
  public int hashCode() {
    return Objects.hash(this.clientId);
  }

  @Override
  public String toString() {
    return "del(" + this.clientId + ")";
  }

  @Override
  public OpProto toProto() {
    return OpProto.newBuilder()
        .setDeleteNode(DeleteNodeOpProto.newBuilder().setId((long) this.clientId))
        .build();
  }

  public static DeleteNodeOp fromProto(DeleteNodeOpProto proto) {
    return new DeleteNodeOp((double) proto.getId());
  }
}
