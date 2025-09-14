package com.google.mcsched.ot;

import org.jspecify.annotations.NullMarked;

/**
 * Java-only basic implementation of AngularCore.
 *
 * <p>The java signals implementation doesn't do anything fancy. Computed values are calculated
 * on-demand and aren't cached.
 */
@NullMarked
public final class AngularCore {
  public static interface Signal<T> {
    public T get();
  }

  public static interface SignalUpdater<T> {
    public T update(T value);
  }

  public static class WritableSignal<T> implements Signal<T> {
    private T value;

    public WritableSignal(T initialValue) {
      this.value = initialValue;
    }

    @Override
    public T get() {
      return this.value;
    }

    public void set(T value) {
      this.value = value;
    }

    public void update(SignalUpdater<T> updater) {
      this.value = updater.update(this.value);
    }

    public Signal<T> asReadonly() {
      return this;
    }
  }

  public static interface SignalMaker<T> {
    T create();
  }

  private static class ComputedSignal<T> implements Signal<T> {
    private final SignalMaker<T> maker;

    public ComputedSignal(SignalMaker<T> maker) {
      this.maker = maker;
    }

    @Override
    public T get() {
      return maker.create();
    }
  }

  public static <T> Signal<T> computed(SignalMaker<T> maker) {
    return new ComputedSignal<>(maker);
  }

  public static <T> WritableSignal<T> signal(T initialValue) {
    return new WritableSignal<>(initialValue);
  }

  private AngularCore() {}
}
