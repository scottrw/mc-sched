package com.google.mcsched.ot;

import com.google.protos.mcsched.ot.IndexOpProto;
import com.google.protos.mcsched.ot.OpProto;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/** Represents an operation on the order of the nodes in the document. */
@JsType
@NullMarked
public final class IndexOp extends Op {
  public final Patch<PArray<Double>, Double> patch;

  public IndexOp(Patch<PArray<Double>, Double> patch) {
    this.patch = patch;
  }

  @Override
  public void applyTo(Document d) {
    d.patchOrderedNodes(this.patch);
  }

  @Override
  public Op beneath(Op pending, ConflictPolicy policy) {
    return pending.atopIndexOp(this, policy);
  }

  @Override
  public Op atopRenameNodeOp(RenameNodeOp context, ConflictPolicy policy) {
    var patch = this.patch.noteless();
    // This is ugly, but we can't easily move the logic into InsertPatch, because
    // InsertPatch can contain any E, but we know in this case it must contain
    // a Double.
    if (patch instanceof InsertPatch) {
      var ins = (InsertPatch<PArray<Double>, Double>) patch;
      var pi = ins.insert;
      if (pi.size() != 1) {
        throw new IllegalArgumentException("Invalid index patch: " + this.patch);
      }
      if (context.inRange(pi.get(0))) {
        var newInsert = pi.map(context::transform);
        return new IndexOp(new InsertPatch<>(ins.at, newInsert));
      }
      return this;
    } else if (patch instanceof RemovePatch) {
      var rm = (RemovePatch<PArray<Double>, Double>) patch;
      var toRemove = rm.remove.map(context::transform);
      if (rm.remove.size() != 1) {
        throw new IllegalArgumentException("Invalid index patch: " + this.patch);
      }
      return new IndexOp(new RemovePatch<>(rm.at, toRemove));
    } else if (patch instanceof NopPatch) {
      return this;
    }
    throw new IllegalArgumentException("Invalid index patch: " + this.patch);
  }

  @Override
  public Op atopIndexOp(IndexOp context, ConflictPolicy policy) {
    return new IndexOp(context.patch.beneath(this.patch.noteless(), policy));
  }

  @Override
  public boolean equals(@Nullable Object other) {
    if (other == null) {
      return false;
    }
    if (other instanceof IndexOp) {
      IndexOp otherIndexOp = (IndexOp) other;
      return this.patch.noteless().equals(otherIndexOp.patch.noteless());
    }
    return false;
  }

  @Override
  public int hashCode() {
    return this.patch.hashCode();
  }

  @Override
  public String toString() {
    return "IndexOp{" + "patch=" + this.patch + '}';
  }

  @Override
  public OpProto toProto() {
    return OpProto.newBuilder()
        .setIndex(IndexOpProto.newBuilder().setPatch(this.patch.toProto()))
        .build();
  }

  public static IndexOp fromProto(IndexOpProto proto) {
    return new IndexOp(
        Patch.<PArray<Double>, Double>fromProto(proto.getPatch(), PArray::fromProto));
  }
}
