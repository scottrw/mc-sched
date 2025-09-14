package com.google.mcsched.ot;

import jsinterop.annotations.JsFunction;
import jsinterop.annotations.JsMethod;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;

/**
 * Exposes Angular Core to Java.
 *
 * <p>Typescript clients of this code should import '@angular/core' instead
 *
 * <p>There is a java super-source implementation of this interface that doesn't actually do
 * anything.
 */
@JsType
@NullMarked
public final class AngularCore {

  @JsFunction
  public static interface Signal<T> {
    public T get();
  }

  @JsFunction
  public static interface SignalUpdater<T> {
    public T update(T value);
  }

  @JsType(
      isNative = true,
      namespace = "google3.third_party.javascript.angular2.rc.packages.core",
      name = "index.WritableSignal")
  public static final class WritableSignal<T> {
    public native T get();

    public native void set(T value);

    public native void update(SignalUpdater<T> updater);

    public native Signal<T> asReadonly();
  }

  @JsFunction
  public static interface SignalMaker<T> {
    T create();
  }

  @JsMethod(
      namespace = "google3.third_party.javascript.angular2.rc.packages.core.index",
      name = "computed")
  public static native <T> Signal<T> computed(SignalMaker<T> maker);

  @JsMethod(namespace = "google3.third_party.javascript.angular2.rc.packages.core.index")
  public static native <T> WritableSignal<T> signal(T initialValue);
}
