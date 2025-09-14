package com.google.mcsched.ot;

import com.google.common.collect.ImmutableList;
import com.google.protos.mcsched.ot.InsertPatchProto;
import com.google.protos.mcsched.ot.PatchProto;
import com.google.protos.mcsched.ot.PatchableProto;
import java.util.List;
import java.util.Objects;
import java.util.function.Function;
import jsinterop.annotations.JsConstructor;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/**
 * Represents an insert of a single element.
 *
 * <p>Despite being a single element, the inserted item is stored in a container. Otherwise, the
 * recompose() operation would need to be able to construct new instances of the container type
 * given only a single element, which in JavaScript would require passing around a factory function
 * everywhere. By storing the single element in a container, recompose() can concat() multiple
 * elements together without needing to create a new container from scratch.
 */
@JsType
@NullMarked
public class InsertPatch<C extends Patchable<C, E>, E> extends Patch<C, E> {
  public final int at;
  public final C insert;

  @JsConstructor
  public InsertPatch(int at, C insert) {
    super();
    this.at = at;
    this.insert = insert;
    if (at < 0) {
      throw new IllegalArgumentException("ins: bad at: " + at);
    }
    if (insert.size() != 1) {
      throw new IllegalArgumentException("ins: bad insert: " + insert);
    }
  }

  @Override
  public List<Patch<C, E>> decompose() {
    return ImmutableList.of(this);
  }

  @Override
  public String toString() {
    return "ins1(" + at + ", " + insert + ")";
  }

  @Override
  public int cumulative() {
    return 1;
  }

  @Override
  public Patch<C, E> shift(int relative, String note) {
    return new InsertPatch<C, E>(at + relative, insert).noted(note);
  }

  @Override
  public boolean equals(@Nullable Object obj) {
    if (this == obj) {
      return true;
    }
    if (obj == null) {
      return false;
    }

    if (!(obj instanceof Patch)) {
      return false;
    }

    Patch<?, ?> otherNoteless = ((Patch<?, ?>) obj).noteless();

    if (!(otherNoteless instanceof InsertPatch)) {
      return false;
    }

    InsertPatch<?, ?> otherInsert = (InsertPatch<?, ?>) otherNoteless;
    return at == otherInsert.at && insert.equals(otherInsert.insert);
  }

  @Override
  public int hashCode() {
    return Objects.hash(at, insert);
  }

  @Override
  public C applyTo(C dst) {
    return dst.splice(at, 0, insert);
  }

  @Override
  public Patch<C, E> beneath(Patch<C, E> patch, ConflictPolicy policy) {
    return patch.atopInsert(this, policy);
  }

  @Override
  public Patch<C, E> atopInsert(InsertPatch<C, E> context, ConflictPolicy policy) {
    if (at < context.at) {
      return noted("i^i 1");
    }
    if (context.at < at) {
      return shift(1, "i^i 2");
    }
    if (policy == ConflictPolicy.PATCH_WINS) {
      return noted("i^i 3");
    }
    if (policy == ConflictPolicy.CONTEXT_WINS) {
      return shift(1, "i^i 4");
    }
    throw new IllegalStateException("Unhandled one-op: " + this + "^" + context);
  }

  @Override
  public Patch<C, E> atopRemove(RemovePatch<C, E> context, ConflictPolicy policy) {
    if (at < context.at) {
      return noted("i^r 1");
    }
    if (context.at < at) {
      return shift(context.cumulative(), "i^r 2");
    }
    return noted("i^r 3");
  }

  @Override
  public Patch<C, E> atopEdit(EditPatch<C, E> context, ConflictPolicy policy) {
    if (at < context.at) {
      return noted("i^e 1");
    }

    int removedSize = (context.remove != null ? context.remove.size() : 0);
    if (at + removedSize < at) { // This condition implies removedSize < 0.
      return shift(
          context.cumulative(), "i^e 1"); // Note: The note is 'i^e 1', same as the first case.
    }

    return decomposeAndRebase(context, this, policy).noted("i^e");
  }

  @Override
  public Patch<C, E> atopMove(MovePatch<C, E> context, ConflictPolicy policy) {
    return flatRebase(
            ImmutableList.of(context.removePatch, context.insertPatch),
            ImmutableList.of(this),
            policy)
        .noted("i^m");
  }

  @Override
  public PatchProto toProto() {
    return PatchProto.newBuilder()
        .setInsert(InsertPatchProto.newBuilder().setAt(at).setInsert(insert.toProto()).build())
        .build();
  }

  public static <C extends Patchable<C, E>, E> InsertPatch<C, E> fromProto(
      InsertPatchProto proto, Function<PatchableProto, C> makePatchable) {
    return new InsertPatch<C, E>((int) proto.getAt(), makePatchable.apply(proto.getInsert()));
  }
}
