package com.google.mcsched.ot;

import static com.google.common.collect.ImmutableList.toImmutableList;
import static com.google.mcsched.ot.Patchable.ucat;

import com.google.common.collect.ImmutableList;
import com.google.protos.mcsched.ot.PatchProto;
import com.google.protos.mcsched.ot.PatchableProto;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/** Supertype of patch operations on generic ordered collections (arrays, strings). */
@JsType
@NullMarked
public abstract class Patch<C extends Patchable<C, E>, E> extends Rebasable<Patch<C, E>> {

  /** If this Patch can be expressed as smaller, more atomic Patches, return those. */
  public abstract List<Patch<C, E>> decompose();

  /** Return a new patch of the same type, but shifted relative to its current location. */
  public abstract Patch<C, E> shift(int relative, String note);

  /** Return the number of elements added or removed from the collection. */
  public abstract int cumulative();

  /** Return a new patch of the same type, but with a note. */
  public Patch<C, E> noted(String note) {
    // TODO: This technique of noting creates a lot of garbage, and it's only useful
    // when we're debugging. It changes the runtime of the integrate protocol quickcheck from
    // 2.163s to 1.705s when removed.
    return new Noted<C, E>(note, this);
  }

  /** If this patch has a note, return the underlying patch. */
  public Patch<C, E> noteless() {
    return this;
  }

  /** Apply this patch to the given collection. */
  public abstract C applyTo(C dst);

  /** Double-dispatch implementation of Rebasable.beneath for *^ins transform. */
  public abstract Patch<C, E> atopInsert(InsertPatch<C, E> context, ConflictPolicy policy);

  /** Double-dispatch implementation of Rebasable.beneath for *^rm transform. */
  public abstract Patch<C, E> atopRemove(RemovePatch<C, E> context, ConflictPolicy policy);

  /** Double-dispatch implementation of Rebasable.beneath for *^edit transform. */
  public abstract Patch<C, E> atopEdit(EditPatch<C, E> context, ConflictPolicy policy);

  /** Double-dispatch implementation of Rebasable.beneath for *^mv transform. */
  public abstract Patch<C, E> atopMove(MovePatch<C, E> context, ConflictPolicy policy);

  /** Double-dispatch implementation of Rebasable.beneath for *^composite transform. */
  public Patch<C, E> atopComposite(CompositePatch<C, E> context, ConflictPolicy policy) {
    return flatten(
            checkedRecompose(
                rebase(context.children, ImmutableList.of(this), policy, null).rebased))
        .noted("a^c 1");
  }

  /** If note is not null, return a new patch with the note. Otherwise, return the patch. */
  public static <C extends Patchable<C, E>, E> Patch<C, E> maybeNote(
      @Nullable String note, Patch<C, E> p) {
    if (note != null) {
      return p.noted(note);
    }
    return p;
  }

  /**
   * Factory function for creating the correct Patch type given zero or more inserts and deletes.
   */
  public static <C extends Patchable<C, E>, E> Patch<C, E> at(
      int at, @Nullable C remove, @Nullable C insert, @Nullable String note) {
    Patch<C, E> p;
    int rl = remove != null ? remove.size() : 0;
    int il = insert != null ? insert.size() : 0;
    if (rl == 0 && il == 0) {
      p = new NopPatch<C, E>();
    } else if (rl == 1 && il == 0) {
      p = new RemovePatch<C, E>(at, remove);
    } else if (rl == 0 && il == 1) {
      p = new InsertPatch<C, E>(at, insert);
    } else {
      p = new EditPatch<C, E>(at, rl > 0 ? remove : null, il > 0 ? insert : null);
    }
    return Patch.maybeNote(note, p);
  }

  /** Given a list of patches, attempt to combine them into fewer Patches. */
  public static <C extends Patchable<C, E>, E> List<Patch<C, E>> recompose(
      List<Patch<C, E>> patches) {
    return new Recomposer<>(patches).ret;
  }

  /**
   * The stateful implementation of the recompose algorithm.
   *
   * <p>Keeps a list of flushed patches that can't be added to any further, as well as a pending
   * patch that is under construction.
   *
   * <p>For each incoming patch, see if it can be combined with the pending patch. Otherwise, flush
   * the pending patch and create a new pending patch.
   */
  private static class Recomposer<C extends Patchable<C, E>, E> {
    class PendingEdit {
      int at;
      @Nullable C remove;
      @Nullable C insert;

      PendingEdit(int at, @Nullable C remove, @Nullable C insert) {
        this.at = at;
        this.remove = remove;
        this.insert = insert;
      }
    }

    List<Patch<C, E>> ret = new ArrayList<>();
    PendingEdit pending = null;

    void flush() {
      if (pending != null) {
        ret.add(Patch.at(pending.at, pending.remove, pending.insert, null));
        pending = null;
      }
    }

    Recomposer(List<Patch<C, E>> patches) {
      for (var p : patches) {
        var inner = p.noteless();
        if (inner instanceof NopPatch) {
          continue;
        } else if (inner instanceof MovePatch || inner instanceof EditPatch) {
          flush();
          ret.add(p);
          continue;
        }
        if (inner instanceof RemovePatch) {
          var rm = (RemovePatch<C, E>) inner;
          if (pending != null) {
            if (rm.at != pending.at || pending.insert != null) {
              flush();
            }
          }
          if (pending == null) {
            pending = new PendingEdit(rm.at, rm.remove, null);
            continue;
          }
          if (rm.at == pending.at) {
            pending.remove = ucat(pending.remove, rm.remove);
            continue;
          }
        }
        if (inner instanceof InsertPatch) {
          var ins = (InsertPatch<C, E>) inner;
          int pil = pending != null && pending.insert != null ? pending.insert.size() : 0;
          if (pending != null && ins.at != pending.at + pil) {
            flush();
          }
          if (pending == null) {
            pending = new PendingEdit(ins.at, null, ins.insert);
            continue;
          }
          if (ins.at == pending.at + pil) {
            pending.insert = ucat(pending.insert, ins.insert);
            continue;
          }
        }
        flush();
        ret.add(p);
      }
      flush();
    }
  }

  /** A wrapper around rebase that ensures exactly one patch is returned. */
  public static <C extends Patchable<C, E>, E> Patch<C, E> flatRebase(
      List<Patch<C, E>> base, List<Patch<C, E>> pending, ConflictPolicy policy) {
    return flatten(recompose(rebase(base, pending, policy, null).rebased));
  }

  /**
   * A wrapper around rebase that decomposes the pending Patch, then ensures exactly one patch is
   * returned.
   */
  public static <C extends Patchable<C, E>, E> Patch<C, E> decomposeAndRebase(
      Patch<C, E> base, Patch<C, E> pending, ConflictPolicy policy) {
    if (!(base instanceof EditPatch || pending instanceof EditPatch)) {
      throw new IllegalArgumentException(
          "decomposeAndRebase should only be called with multi-op edits, not "
              + pending
              + "^"
              + base);
    }
    return flatten(recompose(rebase(base.decompose(), pending.decompose(), policy, null).rebased));
  }

  /**
   * A wrapper around recompose that checks for consistency.
   *
   * <p>Checks the identity that decompose(recompose(x)) = decompose(x).
   *
   * <p>Note that several bugs in the initial implementation were related to edge cases in
   * recompose.
   */
  public static <C extends Patchable<C, E>, E> List<Patch<C, E>> checkedRecompose(
      List<Patch<C, E>> patches) {
    patches =
        patches.stream()
            .map((p) -> p.noteless())
            .filter((p) -> !(p instanceof NopPatch))
            .collect(toImmutableList());
    if (patches.size() == 0) {
      return patches;
    }
    var ret = recompose(patches);
    var ps = explode(patches);
    var rp = explode(ret);
    if (ps.size() != rp.size()) {
      throw new IllegalStateException("recompose failed 1");
    }
    for (int i = 0; i < ps.size(); i++) {
      if (!ps.get(i).equals(rp.get(i))) {
        throw new IllegalStateException("recompose failed 2: " + ps.get(i) + " vs " + rp.get(i));
      }
    }
    return ret;
  }

  /**
   * Applies decompose() to all the patches in the array and returns a flat array of the results.
   */
  public static <C extends Patchable<C, E>, E> ImmutableList<Patch<C, E>> explode(
      List<Patch<C, E>> patches) {
    return patches.stream().flatMap(p -> p.decompose().stream()).collect(toImmutableList());
  }

  /**
   * Given a list of patches, returns exactly one patch.
   * <li>If the list is empty, create and return a new NopPatch.
   * <li>If the list contains a single patch, return it.
   * <li>Otherwise create and return a new CompositePatch from the list.
   */
  public static <C extends Patchable<C, E>, E> Patch<C, E> flatten(List<Patch<C, E>> children) {
    if (children.size() == 0) {
      return new NopPatch<>();
    }
    if (children.size() == 1) {
      return children.get(0);
    }
    return new CompositePatch<>(children);
  }

  public abstract PatchProto toProto();

  public static <C extends Patchable<C, E>, E> Patch<C, E> fromProto(
      PatchProto proto, Function<PatchableProto, C> makePatchable) {
    switch (proto.getPatchCase()) {
      case COMPOSITE:
        return new CompositePatch<>(
            proto.getComposite().getPatchesList().stream()
                .map(p -> Patch.<C, E>fromProto(p, makePatchable))
                .collect(ImmutableList.toImmutableList()));
      case EDIT:
        return EditPatch.fromProto(proto.getEdit(), makePatchable);
      case REMOVE:
        return RemovePatch.fromProto(proto.getRemove(), makePatchable);
      case INSERT:
        return InsertPatch.fromProto(proto.getInsert(), makePatchable);
      case NOP:
        return new NopPatch<>();
      case MOVE:
        return MovePatch.fromProto(proto.getMove(), makePatchable);
    }
    throw new IllegalArgumentException("Unknown patch type: " + proto.getPatchCase());
  }
}
