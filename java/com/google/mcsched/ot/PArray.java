package com.google.mcsched.ot;

import static com.google.common.collect.ImmutableList.toImmutableList;

import com.google.protos.mcsched.ot.PIntArrayProto;
import com.google.protos.mcsched.ot.PatchableProto;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.function.Function;
import java.util.function.Predicate;
import jsinterop.annotations.JsConstructor;
import jsinterop.annotations.JsIgnore;
import jsinterop.annotations.JsOptional;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/** Patchable Array class */
@JsType
@NullMarked
// XXX: TODO: requiring T to extend Number is a hack to allow us to serialize to a proto,
// where we need to know the name of the proto field and the type in order to serialize.
// Conceptually, T can be any object as long as we know how to serialize it. It's entirely
// possible that we should just use java serialization and a byte[] array instead.
public final class PArray<T extends Number> extends Patchable<PArray<T>, T> {
  private final List<T> array;

  public static <T extends Number> PArray<T> of(T[] initialArray) {
    return new PArray<>(Arrays.asList(initialArray));
  }

  /**
   * Constructs a PArray from a list.
   *
   * @param initialList The initial list of elements. If null, an empty list is used. The list is
   *     defensively copied.
   */
  @JsConstructor
  public PArray(List<T> initialList) {
    this.array = new ArrayList<>(initialList);
  }

  @Override
  public T get(int index) {
    // this.array is guaranteed non-null by the constructor.
    return this.array.get(index);
  }

  @Override
  public PArray<T> slice1(int start) {
    // this.array is guaranteed non-null by the constructor.
    // Relies on List.subList for bounds checking (throws IndexOutOfBoundsException if invalid).
    return new PArray<>(this.array.subList(start, this.array.size()));
  }

  @Override
  public PArray<T> slice2(int start, int end) {
    // this.array is guaranteed non-null by the constructor.
    // Relies on List.subList for bounds checking (throws IndexOutOfBoundsException if invalid).
    return new PArray<>(this.array.subList(start, end));
  }

  @Override
  public int size() {
    // this.array is guaranteed non-null by the constructor.
    return this.array.size();
  }

  @Override
  public PArray<T> concat(PArray<T>... a) {
    // this.array is guaranteed non-null by the constructor.
    List<T> newList = new ArrayList<>(this.array);
    if (a != null) {
      for (PArray<T> pArr : a) {
        if (pArr != null) {
          // pArr.array is guaranteed non-null by PArray constructor.
          newList.addAll(pArr.array);
        }
      }
    }
    return new PArray<>(newList);
  }

  @Override
  public PArray<T> splice(int at, int deleteLength, @JsOptional @Nullable PArray<T> insert) {
    // this.array is guaranteed non-null by the constructor.
    // Relies on List.subList for bounds checking (throws IndexOutOfBoundsException if invalid).
    // This implies the following preconditions for parameters, otherwise subList will throw:
    // 1. 0 <= at <= this.array.size()
    // 2. deleteLength >= 0 (so at <= at + deleteLength)
    // 3. at + deleteLength <= this.array.size()
    List<T> resultList = new ArrayList<>(this.array.subList(0, at));
    if (insert != null) {
      // insert.array is guaranteed non-null by PArray constructor (initialized to empty if null).
      resultList.addAll(insert.array);
    }
    resultList.addAll(this.array.subList(at + deleteLength, this.array.size()));
    return new PArray<>(resultList);
  }

  @Override
  public boolean equals(@Nullable Object other) {
    if (other == null) {
      return false;
    }
    if (other instanceof PArray) {
      PArray<?> otherArray = (PArray<?>) other;
      return this.array.equals(otherArray.array);
    }
    return false;
  }

  @Override
  public int hashCode() {
    return this.array.hashCode();
  }

  public PArray<T> copy() {
    return new PArray<>(this.array);
  }

  @JsIgnore // Passing callbacks this way doesn't work
  public PArray<T> map(Function<T, T> mapper) {
    return new PArray<>(this.array.stream().map(mapper).collect(toImmutableList()));
  }

  @JsIgnore // Passing callbacks this way doesn't work
  public PArray<T> filter(Predicate<T> predicate) {
    return new PArray<>(this.array.stream().filter(predicate).collect(toImmutableList()));
  }

  public static <T extends Number> Patch<PArray<T>, T> ins(int index, T item) {
    return Patch.at(index, null, new PArray<>(Arrays.asList(item)), null);
  }

  public static <T extends Number> Patch<PArray<T>, T> rem(int index, T item) {
    return Patch.at(index, new PArray<>(Arrays.asList(item)), null, null);
  }

  public int indexOf(T item) {
    return this.array.indexOf(item);
  }

  public PArray<T> duplicates() {
    ArrayList<T> duplicates = new ArrayList<>();
    for (int i = 0; i < this.array.size(); i++) {
      for (int j = i + 1; j < this.array.size(); j++) {
        if (this.array.get(i).equals(this.array.get(j))) {
          duplicates.add(this.array.get(i));
        }
      }
    }
    return new PArray<>(duplicates);
  }

  public PArray<T> notIn(PArray<T> other) {
    ArrayList<T> notIn = new ArrayList<>();
    for (T item : this.array) {
      if (!other.array.contains(item)) {
        notIn.add(item);
      }
    }
    return new PArray<>(notIn);
  }

  // This shouldn't exist. It's only here temporarily while javascript is still implementing
  // Op. Once Op is in java, we should be able to use callbacks again and switch to map().
  @SuppressWarnings("unchecked") // safe by specification
  public T[] toArray() {
    return (T[]) this.array.toArray();
  }

  @Override
  public String toString() {
    return this.array.toString();
  }

  @Override
  public PatchableProto toProto() {
    return PatchableProto.newBuilder()
        .setArray(
            PIntArrayProto.newBuilder()
                .addAllValues(this.array.stream().map(T::longValue).collect(toImmutableList()))
                .build())
        .build();
  }

  public static PArray<Double> fromProto(PatchableProto proto) {
    return new PArray<Double>(
        proto.getArray().getValuesList().stream()
            .map(Long::doubleValue)
            .collect(toImmutableList()));
  }
}
