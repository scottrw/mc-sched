package com.google.mcsched.ot;

import static java.util.stream.Collectors.toList;

import com.google.common.collect.ImmutableList;
import com.google.protos.mcsched.ot.EditNodeOpProto;
import com.google.protos.mcsched.ot.OpProto;
import java.util.List;
import java.util.Objects;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/** Represents a series of Patches occurring at a given location in the Document. */
@JsType
@NullMarked
public final class EditNodeOp extends Op {
  public final NodeAddress address;
  public final List<Patch<PString, String>> patch;

  public EditNodeOp(NodeAddress address, List<Patch<PString, String>> patch) {
    this.address = address;
    this.patch = patch;
  }

  @Override
  public void applyTo(Document d) {
    address.update(
        d,
        (current) -> {
          for (var p : patch) {
            current = p.applyTo(current);
          }
          return current;
        });
  }

  @Override
  public Op beneath(Op pending, ConflictPolicy policy) {
    return pending.atopEditNodeOp(this, policy);
  }

  @Override
  public Op atopEditNodeOp(EditNodeOp context, ConflictPolicy policy) {
    if (address.equals(context.address)) {
      List<Patch<PString, String>> rebased =
          Patch.rebase(context.patch, patch, policy, null).rebased;
      return new EditNodeOp(address, rebased);
    }
    return this;
  }

  @Override
  public Op atopDeleteNodeOp(DeleteNodeOp context, ConflictPolicy policy) {
    if (address.id == context.clientId) {
      return NoOp.NO_OP;
    }
    return this;
  }

  @Override
  public Op atopRenameNodeOp(RenameNodeOp context, ConflictPolicy policy) {
    if (context.inRange(address.id)) {
      return new EditNodeOp(new NodeAddress(context.transform(address.id), address.slot), patch);
    }
    return this;
  }

  @Override
  public boolean equals(@Nullable Object other) {
    if (other == null) {
      return false;
    }
    if (other instanceof EditNodeOp) {
      EditNodeOp otherEditNodeOp = (EditNodeOp) other;
      return address.equals(otherEditNodeOp.address) && patch.equals(otherEditNodeOp.patch);
    }
    return false;
  }

  @Override
  public int hashCode() {
    return Objects.hash(address, patch);
  }

  @Override
  public String toString() {
    return "EditNodeOp{" + "address=" + address + ", patch=" + patch + '}';
  }

  @Override
  public OpProto toProto() {
    return OpProto.newBuilder()
        .setEditNode(
            EditNodeOpProto.newBuilder()
                .setAddress(address.toProto())
                .addAllPatches(
                    patch.stream().map(Patch::toProto).collect(ImmutableList.toImmutableList()))
                .build())
        .build();
  }

  public static EditNodeOp fromProto(EditNodeOpProto proto) {
    List<Patch<PString, String>> patch =
        proto.getPatchesList().stream()
            .map(p -> Patch.<PString, String>fromProto(p, PString::fromProto))
            .collect(toList());
    return new EditNodeOp(NodeAddress.fromProto(proto.getAddress()), patch);
  }
  ;
}
