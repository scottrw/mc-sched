package com.google.mcsched.ot;

import com.google.protos.mcsched.ot.PatchProto;
import java.util.List;
import jsinterop.annotations.JsConstructor;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NonNull;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/**
 * A descriptive wrapper around a Patch that describes the rules that lead to its creation.
 *
 * <p>Used purely for debugging purposes to make it possible to tell which transform method rule was
 * used to produce the patch.
 */
@JsType
@NullMarked
public final class Noted<C extends Patchable<C, E>, E> extends Patch<C, E> {
  private final String note;
  private final Patch<C, E> patch;

  @JsConstructor
  public Noted(@NonNull String note, @NonNull Patch<C, E> patch) {
    this.note = note;
    this.patch = patch;
  }

  @Override
  public Patch<C, E> noteless() {
    return patch;
  }

  @Override
  public List<Patch<C, E>> decompose() {
    return patch.decompose();
  }

  @Override
  public String toString() {
    return patch + " [ " + note + "]";
  }

  @Override
  public Patch<C, E> shift(int relative, String note) {
    return patch.shift(relative, note);
  }

  @Override
  public int cumulative() {
    return patch.cumulative();
  }

  @Override
  public Patch<C, E> beneath(Patch<C, E> context, ConflictPolicy policy) {
    return patch.beneath(context, policy);
  }

  @Override
  public Patch<C, E> atopInsert(InsertPatch<C, E> context, ConflictPolicy policy) {
    return patch.atopInsert(context, policy);
  }

  @Override
  public Patch<C, E> atopRemove(RemovePatch<C, E> context, ConflictPolicy policy) {
    return patch.atopRemove(context, policy);
  }

  @Override
  public Patch<C, E> atopEdit(EditPatch<C, E> context, ConflictPolicy policy) {
    return patch.atopEdit(context, policy);
  }

  @Override
  public Patch<C, E> atopMove(MovePatch<C, E> context, ConflictPolicy policy) {
    return patch.atopMove(context, policy);
  }

  @Override
  public int hashCode() {
    return patch.hashCode();
  }

  @Override
  public boolean equals(@Nullable Object obj) {
    if (obj == null) {
      return false;
    }
    if (!(obj instanceof Patch)) {
      return false;
    }
    Patch<?, ?> other = (Patch<?, ?>) obj;
    return patch.equals(other.noteless());
  }

  @Override
  public Patch<C, E> noted(String note) {
    if (patch instanceof Noted) {
      throw new IllegalArgumentException("unexpected child");
    }
    return new Noted<C, E>(this.note + " > " + note, patch);
  }

  @Override
  public C applyTo(C dst) {
    return patch.applyTo(dst);
  }

  @Override
  public PatchProto toProto() {
    return patch.toProto();
  }
}
