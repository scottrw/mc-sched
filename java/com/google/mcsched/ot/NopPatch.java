package com.google.mcsched.ot;

import com.google.protos.mcsched.ot.NopPatchProto;
import com.google.protos.mcsched.ot.PatchProto;
import java.util.Collections;
import java.util.List;
import jsinterop.annotations.JsConstructor;
import jsinterop.annotations.JsMethod;
import jsinterop.annotations.JsOptional;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/**
 * Represents no operation.
 *
 * <p>Some transforms result in no operation being needed (for example, the client and server both
 * delete the same element), however Rebasable() always needs to return a Patch.
 *
 * <p>Additionally, rebase() for Changes always needs to return the same number of Changes.
 */
@JsType
@NullMarked
public class NopPatch<C extends Patchable<C, E>, E> extends Patch<C, E> {
  @JsConstructor
  public NopPatch() {
    super();
  }

  @Override
  @JsMethod
  public List<Patch<C, E>> decompose() {
    return Collections.emptyList();
  }

  @Override
  @JsMethod
  public String toString() {
    return "nop";
  }

  @Override
  @JsMethod
  public Patch<C, E> shift(int relative, String note) {
    return noted(note);
  }

  @Override
  @JsMethod
  public int cumulative() {
    return 0;
  }

  @Override
  @JsMethod
  public C applyTo(C dst) {
    return dst;
  }

  @Override
  @JsMethod
  public int hashCode() {
    return NopPatch.class.hashCode();
  }

  @Override
  @JsMethod
  public boolean equals(@JsOptional @Nullable Object obj) {
    if (obj == null) {
      return false;
    }
    if (this == obj) {
      return true;
    }
    if (!(obj instanceof NopPatch)) {
      return false;
    }
    NopPatch<?, ?> other = (NopPatch<?, ?>) obj;
    return other.noteless() instanceof NopPatch;
  }

  @Override
  @JsMethod
  public Patch<C, E> beneath(Patch<C, E> patch, ConflictPolicy policy) {
    return patch;
  }

  @Override
  @JsMethod
  public Patch<C, E> atopInsert(InsertPatch<C, E> context, ConflictPolicy policy) {
    return this;
  }

  @Override
  @JsMethod
  public Patch<C, E> atopRemove(RemovePatch<C, E> context, ConflictPolicy policy) {
    return this;
  }

  @Override
  @JsMethod
  public Patch<C, E> atopEdit(EditPatch<C, E> context, ConflictPolicy policy) {
    return this;
  }

  @Override
  @JsMethod
  public Patch<C, E> atopMove(MovePatch<C, E> context, ConflictPolicy policy) {
    return this;
  }

  @Override
  public PatchProto toProto() {
    return PatchProto.newBuilder().setNop(NopPatchProto.getDefaultInstance()).build();
  }
}
