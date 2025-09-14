package com.google.mcsched.ot;

import com.google.protos.mcsched.ot.PatchableProto;
import jsinterop.annotations.JsOptional;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/** Represents a patchable ordered collection (eg string or array). */
@JsType
@NullMarked
public abstract class Patchable<C extends Patchable<C, E>, E> {
  /** Return the element at the given index. */
  public abstract E get(int index);

  /** Return a new Patchable containing the elements from start to the end of the collection. */
  public abstract C slice1(int start);

  /** Return a new Patchable containing the elements from the start index to the end index. */
  public abstract C slice2(int start, int end);

  /** Return the number of elements in the collection. */
  public abstract int size();

  /**
   * Return a new Patchable containing the elements of the collection concatenated with the given
   * elements.
   */
  public abstract C concat(C... a);

  /**
   * Return a new Patchable containing all the elements up to the <at> index, with deleteLength then
   * removed, and the elements from <insert> added, then the remainder of elements after <at>
   * appended.
   */
  public abstract C splice(int at, int deleteLength, @JsOptional @Nullable C insert);

  /** Helper function for concatenating two Patchables. */
  public static <C extends Patchable<C, E>, E> C ucat(@Nullable C a, C b) {
    if (a == null) {
      return b;
    }
    return a.concat(b);
  }

  public Patch<C, E> makePatch(C newStr) {
    if (equals(newStr)) {
      return new NopPatch<C, E>();
    }
    int start = 0;
    int end = 0;
    while (start < Math.min(this.size(), newStr.size())
        && this.get(start).equals(newStr.get(start))) {
      start++;
    }
    while (end < Math.min(this.size(), newStr.size())
        && this.size() - end > start
        && newStr.size() - end > start
        && this.get(this.size() - end - 1).equals(newStr.get(newStr.size() - end - 1))) {
      end++;
    }
    return Patch.at(
        start,
        this.slice2(start, this.size() - end),
        newStr.slice2(start, newStr.size() - end),
        null);
  }

  public abstract PatchableProto toProto();
}
