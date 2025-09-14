package com.google.mcsched.ot;

import static java.util.stream.Collectors.toList;

import com.google.common.collect.ImmutableList;
import com.google.protos.mcsched.ot.EditDocOpProto;
import com.google.protos.mcsched.ot.OpProto;
import java.util.List;
import java.util.Objects;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/** Represents a series of Patches occurring at a given location in the Document. */
@JsType
@NullMarked
public final class EditDocOp extends Op {
  public final DocAddress address;
  public final List<Patch<PString, String>> patch;

  public EditDocOp(DocAddress address, List<Patch<PString, String>> patch) {
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
    return pending.atopEditDocOp(this, policy);
  }

  @Override
  public Op atopEditDocOp(EditDocOp context, ConflictPolicy policy) {
    if (address.equals(context.address)) {
      List<Patch<PString, String>> rebased = rebase(context.patch, patch, policy, null).rebased;
      return new EditDocOp(address, rebased);
    }
    return this;
  }

  @Override
  public boolean equals(@Nullable Object other) {
    if (other == null) {
      return false;
    }
    if (other instanceof EditDocOp) {
      EditDocOp otherEditDocOp = (EditDocOp) other;
      return address.equals(otherEditDocOp.address) && patch.equals(otherEditDocOp.patch);
    }
    return false;
  }

  @Override
  public int hashCode() {
    return Objects.hash(address, patch);
  }

  @Override
  public String toString() {
    return "EditDocOp{" + "address=" + address + ", patch=" + patch + '}';
  }

  @Override
  public OpProto toProto() {
    return OpProto.newBuilder()
        .setEditDoc(
            EditDocOpProto.newBuilder()
                .setAddress(address.toProto())
                .addAllPatches(
                    patch.stream().map(Patch::toProto).collect(ImmutableList.toImmutableList()))
                .build())
        .build();
  }

  public static EditDocOp fromProto(EditDocOpProto proto) {
    List<Patch<PString, String>> patch =
        proto.getPatchesList().stream()
            .map(p -> Patch.<PString, String>fromProto(p, PString::fromProto))
            .collect(toList());
    return new EditDocOp(DocAddress.fromProto(proto.getAddress()), patch);
  }
  ;
}
