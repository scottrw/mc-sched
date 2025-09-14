package com.google.mcsched.ot;

import com.google.protos.mcsched.ot.EditPatchProto;
import com.google.protos.mcsched.ot.PatchProto;
import com.google.protos.mcsched.ot.PatchableProto;
import java.util.ArrayList; // Added for ArrayList
import java.util.List; // Added for List.of
import java.util.Objects;
import java.util.function.Function;
import jsinterop.annotations.JsConstructor;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/**
 * Represents a contiguous remove and insert of multiple characters at the same document location.
 *
 * <p>For storage and rebase efficiency, multiple operations are grouped this way when possible.
 * However, the transform operations can become exceedingly complex when multiple edit operations
 * overlap. In these cases, the Edit is broken back down into its constituent single-character
 * insert and delete operations, rebase()d, and then recombined into a single operation (Edit or
 * Composite).
 */
@JsType
@NullMarked
public class EditPatch<C extends Patchable<C, E>, E> extends Patch<C, E> {
  public final int at;
  public final @Nullable C remove;
  public final @Nullable C insert;

  @JsConstructor
  public EditPatch(int at, @Nullable C remove, @Nullable C insert) {
    super();
    this.at = at;
    this.remove = remove;
    this.insert = insert;
    if (at < 0) {
      throw new IllegalArgumentException("edit: bad at: " + at);
    }
    if ((remove != null ? remove.size() : 0) == 0 && (insert != null ? insert.size() : 0) == 0) {
      throw new IllegalArgumentException("should be a nop");
    }
  }

  @Override
  public List<Patch<C, E>> decompose() {
    List<Patch<C, E>> ret = new ArrayList<>();
    if (remove != null) {
      for (int r = 0; r < remove.size(); r++) {
        ret.add(new RemovePatch<C, E>(at, remove.slice2(r, r + 1)));
      }
    }
    if (insert != null) {
      for (int i = 0; i < insert.size(); i++) {
        ret.add(new InsertPatch<C, E>(at + i, insert.slice2(i, i + 1)));
      }
    }
    return ret;
  }

  @Override
  public String toString() {
    return "p("
        + at
        + ", "
        + (remove != null ? remove : "")
        + ", "
        + (insert != null ? insert : "")
        + ")";
  }

  @Override
  public Patch<C, E> shift(int relative, String note) {
    return new EditPatch<C, E>(at + relative, remove, insert).noted(note);
  }

  @Override
  public int cumulative() {
    return (insert != null ? insert.size() : 0) - (remove != null ? remove.size() : 0);
  }

  @Override
  public boolean equals(@Nullable Object otherObj) {
    if (otherObj == null) {
      return false;
    }
    if (this == otherObj) {
      return true;
    }
    if (!(otherObj instanceof Patch)) {
      return false;
    }
    Patch<?, ?> other = ((Patch<?, ?>) otherObj).noteless();
    if (other instanceof EditPatch<?, ?>) {
      EditPatch<?, ?> otherEdit = (EditPatch<?, ?>) other;
      return (at == otherEdit.at
          && (remove != null ? remove.equals(otherEdit.remove) : otherEdit.remove == null)
          && (insert != null ? insert.equals(otherEdit.insert) : otherEdit.insert == null));
    }
    return false;
  }

  public void checkContext(C to) {
    if (remove == null) {
      return;
    }
    if (remove.size() == 0) {
      return;
    }
    C removed = to.slice2(at, at + remove.size());
    if (!remove.equals(removed)) {
      throw new IllegalStateException("Applying " + this + " to [" + to + "] failed to match");
    }
  }

  @Override
  public int hashCode() {
    return Objects.hash(at, remove, insert);
  }

  @Override
  public C applyTo(C dst) {
    checkContext(dst);
    return dst.splice(at, remove != null ? remove.size() : 0, insert);
  }

  @Override
  public Patch<C, E> beneath(Patch<C, E> patch, ConflictPolicy policy) {
    return patch.atopEdit(this, policy);
  }

  @Override
  public Patch<C, E> atopInsert(InsertPatch<C, E> context, ConflictPolicy policy) {
    if (at + (remove != null ? remove.size() : 0) < context.at) {
      return noted("1");
    }
    if (context.at < at) {
      return shift(context.cumulative(), "2");
    }

    if ((remove != null ? remove.size() : 0) == 0) {
      if (insert == null) {
        throw new IllegalArgumentException("should be a nop");
      }
      if (policy == ConflictPolicy.CONTEXT_WINS) {
        return at(context.at + 1, (C) insert.slice2(0, 0), insert, null).noted("3.1");
      }
      return at(context.at, (C) insert.slice2(0, 0), insert, null).noted("3.2");
    }
    return decomposeAndRebase(context, this, policy).noted("e^i");
  }

  @Override
  public Patch<C, E> atopRemove(RemovePatch<C, E> context, ConflictPolicy policy) {
    if (at + (remove != null ? remove.size() : 0) <= context.at) {
      return noted("1");
    }
    if (context.at + 1 < at) {
      return shift(context.cumulative(), "2");
    }
    // Assuming decomposeAndRebase is a static helper method.
    return decomposeAndRebase(context, this, policy).noted("e^r");
  }

  @Override
  public Patch<C, E> atopEdit(EditPatch<C, E> context, ConflictPolicy policy) {
    int cs = context.at;
    C cr = context.remove;
    int crl = cr != null ? cr.size() : 0; // insert and remove lengths
    int cer = cs + crl;
    int ps = at;
    C pr = remove;
    int prl = pr != null ? pr.size() : 0;
    int per = ps + prl;

    if (per < cs) {
      return noted("1");
    }
    if (cer < ps) {
      return shift(context.cumulative(), "2");
    }
    // Assuming decomposeAndRebase is a static helper method.
    return decomposeAndRebase(context, this, policy).noted("e^e");
  }

  @Override
  public Patch<C, E> atopMove(MovePatch<C, E> context, ConflictPolicy policy) {
    // Assuming decomposeAndRebase is a static helper method.
    return decomposeAndRebase(context, this, policy).noted("e^m");
  }

  @Override
  public PatchProto toProto() {
    var builder = EditPatchProto.newBuilder().setAt(at);
    if (remove != null) {
      builder.setRemove(remove.toProto());
    }
    if (insert != null) {
      builder.setInsert(insert.toProto());
    }
    return PatchProto.newBuilder().setEdit(builder.build()).build();
  }

  public static <C extends Patchable<C, E>, E> EditPatch<C, E> fromProto(
      EditPatchProto proto, Function<PatchableProto, C> makePatchable) {
    @Nullable C remove = proto.hasRemove() ? makePatchable.apply(proto.getRemove()) : null;
    @Nullable C insert = proto.hasInsert() ? makePatchable.apply(proto.getInsert()) : null;
    return new EditPatch<>((int) proto.getAt(), remove, insert);
  }
}
