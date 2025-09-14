package com.google.mcsched.ot;

import com.google.common.collect.ImmutableList;
import com.google.protos.mcsched.ot.PatchProto;
import com.google.protos.mcsched.ot.PatchableProto;
import com.google.protos.mcsched.ot.RemovePatchProto;
import java.util.List;
import java.util.Objects;
import java.util.function.Function;
import jsinterop.annotations.JsConstructor;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/** Remove an element at a given location. */
@JsType
@NullMarked
public final class RemovePatch<C extends Patchable<C, E>, E> extends Patch<C, E> {
  public final int at;
  public final C remove;

  @JsConstructor
  RemovePatch(int at, C remove) {
    super();
    this.at = at;
    this.remove = remove;
    if (at < 0) {
      throw new IllegalArgumentException("rm: bad at: " + at);
    }
    if (remove.size() != 1) {
      throw new IllegalArgumentException("rm: bad remove: " + remove);
    }
  }

  @Override
  public int cumulative() {
    return -1;
  }

  @Override
  public List<Patch<C, E>> decompose() {
    return ImmutableList.of(this);
  }

  @Override
  public String toString() {
    return "rm1(" + this.at + ", " + this.remove + ")";
  }

  @Override
  public Patch<C, E> shift(int relative, String note) {
    return new RemovePatch<>(this.at + relative, this.remove).noted(note);
  }

  @Override
  public boolean equals(@Nullable Object otherObj) {
    if (this == otherObj) {
      return true;
    }
    if (otherObj == null) {
      return false;
    }
    if (!(otherObj instanceof Patch)) {
      return false;
    }
    Patch<?, ?> otherPatch = ((Patch<?, ?>) otherObj).noteless();
    if (otherPatch instanceof RemovePatch) {
      RemovePatch<?, ?> otherRemovePatch = (RemovePatch<?, ?>) otherPatch;
      return this.at == otherRemovePatch.at && this.remove.equals(otherRemovePatch.remove);
    }
    return false;
  }

  @Override
  public int hashCode() {
    return Objects.hash(at, remove);
  }

  @Override
  public C applyTo(C dst) {
    if (!dst.slice2(this.at, this.at + this.remove.size()).equals(this.remove)) {
      throw new IllegalArgumentException(
          "Could not apply rm(" + this.at + ", " + this.remove + ") to " + dst);
    }
    return dst.splice(this.at, 1, null);
  }

  @Override
  public Patch<C, E> atopInsert(InsertPatch<C, E> context, ConflictPolicy policy) {
    if (this.at < context.at) {
      return this.noted("r^i 1");
    }
    return this.shift(1, "r^i 2");
  }

  @Override
  public Patch<C, E> atopRemove(RemovePatch<C, E> context, ConflictPolicy policy) {
    if (this.at < context.at) {
      return this.noted("r^r 1");
    }
    if (context.at < this.at) {
      return this.shift(-1, "r^r 2");
    }
    if (!this.remove.equals(context.remove)) {
      throw new IllegalArgumentException(
          this + " and " + context + " should agree which character to remove");
    }
    return new NopPatch<C, E>().noted("r^r 3");
  }

  @Override
  public Patch<C, E> beneath(Patch<C, E> patch, ConflictPolicy policy) {
    return patch.atopRemove(this, policy);
  }

  @Override
  public Patch<C, E> atopEdit(EditPatch<C, E> context, ConflictPolicy policy) {
    int crl = (context.remove == null) ? 0 : context.remove.size();
    int cer = context.at + crl;

    if (this.at + 1 <= context.at) {
      return this.noted("r^e 1");
    }
    if (cer <= this.at) {
      return this.shift(context.cumulative(), "r^e 2");
    }

    // Assuming CONTEXT_WINS is an enum member like ConflictPolicy.CONTEXT_WINS
    if (policy == ConflictPolicy.CONTEXT_WINS && context.at < this.at && this.at + 1 <= cer) {
      return new NopPatch<C, E>().noted("r^e 3");
    }

    // Assuming decomposeAndRebase is a static helper method.
    return decomposeAndRebase(context, this, policy).noted("r^e 4");
  }

  @Override
  public Patch<C, E> atopMove(MovePatch<C, E> context, ConflictPolicy policy) {
    if (context.from != this.at) {
      // If the move is not at the same location as the remove, we can
      // treat the move like a [rem, ins]
      List<Patch<C, E>> rebased =
          rebase(
                  ImmutableList.of(context.removePatch, context.insertPatch),
                  ImmutableList.of(this),
                  policy,
                  null)
              .rebased;
      return flatten(recompose(rebased)).noted("r^m 1");
    }
    // If not, we need to chase the move.
    return this.move(context.to).noted("r^m 2");
  }

  public RemovePatch<C, E> move(int to) {
    return new RemovePatch<>(to, this.remove);
  }

  @Override
  public PatchProto toProto() {
    return PatchProto.newBuilder()
        .setRemove(RemovePatchProto.newBuilder().setAt(at).setRemove(remove.toProto()).build())
        .build();
  }

  public static <C extends Patchable<C, E>, E> RemovePatch<C, E> fromProto(
      RemovePatchProto proto, Function<PatchableProto, C> makePatchable) {
    return new RemovePatch<>((int) proto.getAt(), makePatchable.apply(proto.getRemove()));
  }
}
