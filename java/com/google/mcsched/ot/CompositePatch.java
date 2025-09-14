package com.google.mcsched.ot;

import static java.util.stream.Collectors.toList;

import com.google.common.collect.ImmutableList;
import com.google.protos.mcsched.ot.CompositePatchProto;
import com.google.protos.mcsched.ot.PatchProto;
import com.google.protos.mcsched.ot.PatchableProto;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.function.Function;
import jsinterop.annotations.JsConstructor;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/**
 * A composite patch contains multiple patches.
 *
 * <p>This is required because Edit.atop* or *.atopEdit may result in multiple patches, but if so,
 * they have already been transformed and shouldn't be transformed again in the next round of
 * rebase(). However, NewNode.atopNewNode returns two operations, and the RenameNodeOp <b>must</b>
 * be applied to the next round of rebase().
 */
@JsType
@NullMarked
public class CompositePatch<C extends Patchable<C, E>, E> extends Patch<C, E> {
  public final List<Patch<C, E>> children;

  @JsConstructor
  public CompositePatch(List<Patch<C, E>> children) {
    this.children = children;
  }

  @Override
  public List<Patch<C, E>> decompose() {
    List<Patch<C, E>> ret = new ArrayList<>();
    for (Patch<C, E> child : children) {
      ret.addAll(child.decompose());
    }
    return ret;
  }

  @Override
  public String toString() {
    return "p[" + children.toString() + "]";
  }

  @Override
  public Patch<C, E> shift(int relative, String note) {
    // The original TypeScript implementation ignores `relative`.
    // This is a direct translation.
    return noted(note);
  }

  @Override
  public int cumulative() {
    return children.stream().mapToInt(Patch::cumulative).sum();
  }

  // Assuming Patch.equals(Patch<C,E>) exists and is intended to be overridden.
  // If Patch does not define this specific equals signature, this @Override should be removed,
  // or Patch should be updated. Standard Java would use `equals(Object o)`.
  @Override
  public boolean equals(@Nullable Object obj) {
    if (obj == null) {
      return false;
    }
    if (obj == this) {
      return true;
    }
    if (!(obj instanceof Patch)) {
      return false;
    }
    Patch<?, ?> other = (Patch<?, ?>) obj;
    Patch<?, ?> otherPatch = other.noteless();
    if (!(otherPatch instanceof CompositePatch)) {
      return false;
    }
    CompositePatch<?, ?> otherComposite = (CompositePatch<?, ?>) otherPatch;
    if (children.size() != otherComposite.children.size()) {
      return false;
    }
    for (int i = 0; i < children.size(); i++) {
      if (!children.get(i).noteless().equals(otherComposite.children.get(i).noteless())) {
        return false;
      }
    }
    return true;
  }

  @Override
  public int hashCode() {
    // Consistent with equals, which compares noteless children.
    int result = 1;
    for (Patch<C, E> child : children) {
      result = 31 * result + (child.noteless() == null ? 0 : child.noteless().hashCode());
    }
    return result;
  }

  @Override
  public C applyTo(C dst) {
    C currentDst = dst;
    for (Patch<C, E> p : children) {
      currentDst = p.applyTo(currentDst);
    }
    return currentDst;
  }

  @Override
  public Patch<C, E> atopComposite(CompositePatch<C, E> context, ConflictPolicy policy) {
    // Assuming Patch.flatten, Patch.recompose are static methods.
    // Rebasable.rebase is static.
    return Patch.flatten(
            Patch.recompose(Rebasable.rebase(context.children, children, policy, null).rebased))
        .noted("c^c 1");
  }

  // This is a helper method, not an override from Patch.java
  public Patch<C, E> atopAny(Patch<C, E> context, ConflictPolicy policy) {
    Patch<C, E> composite = flatRebase(Arrays.asList(context), children, policy);
    return composite.noted("c^any 1");
  }

  @Override
  public Patch<C, E> atopInsert(InsertPatch<C, E> context, ConflictPolicy policy) {
    return atopAny(context, policy);
  }

  @Override
  public Patch<C, E> atopRemove(RemovePatch<C, E> context, ConflictPolicy policy) {
    return atopAny(context, policy);
  }

  @Override
  public Patch<C, E> atopEdit(EditPatch<C, E> context, ConflictPolicy policy) {
    return atopAny(context, policy);
  }

  @Override
  public Patch<C, E> atopMove(MovePatch<C, E> context, ConflictPolicy policy) {
    return atopAny(context, policy);
  }

  @Override
  public Patch<C, E> beneath(Patch<C, E> patch, ConflictPolicy policy) {
    return patch.atopComposite(this, policy);
  }

  @Override
  public PatchProto toProto() {
    return PatchProto.newBuilder()
        .setComposite(
            CompositePatchProto.newBuilder()
                .addAllPatches(
                    children.stream().map(Patch::toProto).collect(ImmutableList.toImmutableList()))
                .build())
        .build();
  }

  public static <C extends Patchable<C, E>, E> CompositePatch<C, E> fromProto(
      CompositePatchProto proto, Function<PatchableProto, C> makePatchable) {
    List<Patch<C, E>> children =
        proto.getPatchesList().stream()
            .map(p -> Patch.<C, E>fromProto(p, makePatchable))
            .collect(toList());
    return new CompositePatch<>(children);
  }
}
