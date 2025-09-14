package com.google.mcsched.ot;

import com.google.protos.mcsched.ot.NoOpProto;
import com.google.protos.mcsched.ot.OpProto;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/**
 * Represents no operation occuring.
 *
 * <p>This can occur when two deletes overlap, for example.
 */
@JsType
@NullMarked
public final class NoOp extends Op {
  @Override
  public void applyTo(Document d) {}

  @Override
  public Op beneath(Op pending, ConflictPolicy policy) {
    return pending;
  }

  @Override
  public boolean equals(@Nullable Object other) {
    if (other == null) {
      return false;
    }
    if (other instanceof NoOp) {
      return true;
    }
    return false;
  }

  @Override
  public int hashCode() {
    return ((Object) this).hashCode();
  }

  @Override
  public String toString() {
    return "NoOp";
  }

  public static final NoOp NO_OP = new NoOp();

  @Override
  public OpProto toProto() {
    return OpProto.newBuilder().setNoOp(NoOpProto.getDefaultInstance()).build();
  }
}
