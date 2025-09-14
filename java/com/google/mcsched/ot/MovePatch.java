package com.google.mcsched.ot;

// Added for ArrayList
import static com.google.common.collect.ImmutableList.toImmutableList;

import com.google.common.collect.ImmutableList;
import com.google.protos.mcsched.ot.MovePatchProto;
import com.google.protos.mcsched.ot.PatchProto;
import com.google.protos.mcsched.ot.PatchableProto;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.function.Function;
import jsinterop.annotations.JsConstructor;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/**
 * Represents the user intention of moving an element to a different position in the collection.
 *
 * <p>This is a distinct user intention separate from deleting the old element and adding it back in
 * a new location in the collection because deletes of the same element will follow the move around.
 */
@JsType
@NullMarked
public class MovePatch<C extends Patchable<C, E>, E> extends Patch<C, E> {
  public final int from;
  public final C value;
  public final int to;
  final RemovePatch<C, E> removePatch;
  final InsertPatch<C, E> insertPatch;

  @JsConstructor
  public MovePatch(int from, C value, int to) {
    super();
    this.from = from;
    this.value = value;
    this.to = to;
    if (from < 0 || to < 0) {
      throw new IllegalArgumentException("MovePatch indices cannot be negative");
    }
    if (from == to) {
      throw new IllegalArgumentException("MovePatch from and to indices cannot be the same");
    }
    if (value.size() != 1) {
      throw new IllegalArgumentException("MovePatch value must be a single character");
    }
    this.removePatch = new RemovePatch<C, E>(from, value);
    this.insertPatch = new InsertPatch<C, E>(to, value);
  }

  @Override
  public List<Patch<C, E>> decompose() {
    // A move can be decomposed into a remove and an insert,
    // but to preserve the user's intent, we'll return the move as a single patch.
    // This allows rebase() to propagate the move to further edits, allowing
    // these edits to "chase" the move around.
    return ImmutableList.of(this);
  }

  @Override
  public String toString() {
    return "mv(" + from + ", " + value + ", " + to + ")";
  }

  @Override
  public Patch<C, E> shift(int relative, String note) {
    return new MovePatch<C, E>(from + relative, value, to + relative).noted(note);
  }

  @Override
  public int cumulative() {
    // A move does not change the total number of elements
    return 0;
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
    if (otherPatch instanceof MovePatch) {
      MovePatch<?, ?> otherMovePatch = (MovePatch<?, ?>) otherPatch;
      return from == otherMovePatch.from
          && to == otherMovePatch.to
          && value.equals(otherMovePatch.value);
    }
    return false;
  }

  @Override
  public int hashCode() {
    return Objects.hash(from, value, to);
  }

  @Override
  public C applyTo(C dst) {
    // Assuming slice is equivalent to slice2 for single character.
    C found = dst.slice2(from, from + 1);
    if (!found.equals(value)) {
      throw new IllegalArgumentException(
          "MovePatch applyTo failed: value mismatch at from="
              + from
              + ". Expected "
              + value
              + ", got "
              + found);
    }
    // Assuming splice with deleteLength 1 and no insert is what's intended.
    C removed = dst.splice(from, 1, null);
    return removed.splice(to, 0, value);
  }

  @Override
  public Patch<C, E> beneath(Patch<C, E> patch, ConflictPolicy policy) {
    return patch.atopMove(this, policy);
  }

  @Override
  public Patch<C, E> atopInsert(InsertPatch<C, E> context, ConflictPolicy policy) {
    return atopContext(context, policy);
  }

  private static class PatchesTuple<C extends Patchable<C, E>, E> {
    final RemovePatch<C, E> rm;
    final InsertPatch<C, E> ins;

    PatchesTuple(RemovePatch<C, E> rm, InsertPatch<C, E> ins) {
      this.rm = rm;
      this.ins = ins;
    }
  }

  private PatchesTuple<C, E> separatePatchIntoParts(List<Patch<C, E>> patchesList) {
    ImmutableList<Patch<C, E>> filteredPatches =
        patchesList.stream()
            .map(Patch::noteless)
            .filter(p -> !(p instanceof NopPatch))
            .collect(toImmutableList());
    if (filteredPatches.size() != 2) {
      throw new IllegalArgumentException(
          "wrong arguments to separatePatchIntoParts: " + filteredPatches + ". expected [rm, ins]");
    }
    Patch<C, E> rmPatch = filteredPatches.get(0);
    Patch<C, E> insPatch = filteredPatches.get(1);
    if (!(rmPatch instanceof RemovePatch) || !(insPatch instanceof InsertPatch)) {
      throw new IllegalArgumentException(
          "Wrong arguments to separatePatchIntoParts: " + filteredPatches + ". expected [rm, ins]");
    }
    return new PatchesTuple<>((RemovePatch<C, E>) rmPatch, (InsertPatch<C, E>) insPatch);
  }

  private Patch<C, E> atopContext(Patch<C, E> context, ConflictPolicy policy) {
    var rb =
        rebase(ImmutableList.of(context), Arrays.asList(removePatch, insertPatch), policy, null);
    PatchesTuple<C, E> parts = separatePatchIntoParts(rb.rebased);
    if (parts.rm.at == parts.ins.at) {
      return new NopPatch<C, E>().noted("mv^any 1");
    }
    return new MovePatch<C, E>(parts.rm.at, parts.rm.remove, parts.ins.at).noted("mv^any 3");
  }

  @Override
  public Patch<C, E> atopRemove(RemovePatch<C, E> context, ConflictPolicy policy) {
    if (from == context.at) {
      return new NopPatch<C, E>().noted("mv^any 2");
    }
    return atopContext(context, policy);
  }

  @Override
  public Patch<C, E> atopEdit(EditPatch<C, E> context, ConflictPolicy policy) {
    return flatRebase(context.decompose(), ImmutableList.of(this), policy).noted("m^e");
  }

  @Override
  public Patch<C, E> atopMove(MovePatch<C, E> context, ConflictPolicy policy) {
    if (from == context.from && to == context.to) {
      return new NopPatch<C, E>().noted("mv^mv 1");
    }
    if (from == context.from) {
      if (policy == ConflictPolicy.CONTEXT_WINS) {
        return new NopPatch<C, E>().noted("mv^mv 3");
      }
    }
    return atopContext(context, policy);
  }

  @Override
  public PatchProto toProto() {
    return PatchProto.newBuilder()
        .setMove(
            MovePatchProto.newBuilder().setFrom(from).setTo(to).setItem(value.toProto()).build())
        .build();
  }

  public static <C extends Patchable<C, E>, E> MovePatch<C, E> fromProto(
      MovePatchProto proto, Function<PatchableProto, C> makePatchable) {
    return new MovePatch<C, E>(
        (int) proto.getFrom(), makePatchable.apply(proto.getItem()), (int) proto.getTo());
  }
}
