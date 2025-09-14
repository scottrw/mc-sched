package com.google.mcsched.ot;

import com.google.protos.mcsched.ot.OpProto;
import com.google.protos.mcsched.ot.RenameNodeOpProto;
import java.util.Objects;
import jsinterop.annotations.JsOptional;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/**
 * Renames all the nodes in the Document with a given id or higher.
 *
 * <p>This is part of the resolution protocol when the client and server both simultaneously add a
 * node. Because they both start with the same nextNodeId, they will create that node with the same
 * ID. When this is discovered in rebase during the AddNodeOp.atopAddNodeOp method, the solution is
 * for the server-side to keep its id, and the client to rename its id to make space for the
 * server-side node.
 *
 * <p>This operation should only ever appear in the RebaseResults.mutation field, and should never
 * be stored on the server or client as a canonical change.
 */
@JsType
@NullMarked
public final class RenameNodeOp extends Op {
  public final double id;
  public final double newId;
  private @Nullable Op extra;

  public RenameNodeOp(double id, double newId, @JsOptional @Nullable Op extra) {
    this.id = id;
    this.newId = newId;
    this.extra = extra;
  }

  @Override
  public @Nullable Op popExtra() {
    Op extra = this.extra;
    this.extra = null;
    return extra;
  }

  @Override
  public void applyTo(Document doc) {
    doc.nextNodeId = (int) transform(doc.nextNodeId);
    doc.renameNodes(this.id, this.newId - this.id);
  }

  public double transform(double x) {
    if (this.inRange(x)) {
      return x + this.newId - this.id;
    }
    return x;
  }

  public boolean inRange(double x) {
    return x >= this.id;
  }

  @Override
  public Op beneath(Op pending, ConflictPolicy policy) {
    return pending.atopRenameNodeOp(this, policy);
  }

  @Override
  public boolean equals(@Nullable Object other) {
    if (other == null) {
      return false;
    }
    if (other instanceof RenameNodeOp) {
      RenameNodeOp otherRenameNodeOp = (RenameNodeOp) other;
      return this.id == otherRenameNodeOp.id
          && this.newId == otherRenameNodeOp.newId
          && (this.extra == null && otherRenameNodeOp.extra == null
              || (this.extra != null
                  && otherRenameNodeOp.extra != null
                  && this.extra.equals(otherRenameNodeOp.extra)));
    }
    return false;
  }

  @Override
  public int hashCode() {
    return Objects.hash(this.id, this.newId, this.extra);
  }

  @Override
  public String toString() {
    return "RenameNodeOp{"
        + "id="
        + this.id
        + ", newId="
        + this.newId
        + ", extra="
        + this.extra
        + '}';
  }

  @Override
  public OpProto toProto() {
    return OpProto.newBuilder()
        .setRename(RenameNodeOpProto.newBuilder().setFrom((long) this.id).setTo((long) this.newId))
        .build();
  }

  public static RenameNodeOp fromProto(RenameNodeOpProto proto) {
    return new RenameNodeOp((double) proto.getFrom(), (double) proto.getTo(), null);
  }
}
