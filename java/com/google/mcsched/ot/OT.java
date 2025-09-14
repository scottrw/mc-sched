package com.google.mcsched.ot;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import jsinterop.annotations.JsMethod;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;

/** For build testing. */
@JsType
@NullMarked
public final class OT {

  public OT() {}

  public String testSignalGet() {
    AngularCore.Signal<String> s = AngularCore.signal("Hello").asReadonly();
    // XXX: the type of Signal is wrong. It's a "callable", that's how you get the value. So
    // the signal function returns a callable. How do we tell j2cl that, and what is the method
    // on the class that we invoke to actually call it??
    return s.get();
  }

  public AngularCore.Signal<String> testSignalReturn() {
    return AngularCore.signal("Hello").asReadonly();
  }

  public AngularCore.Signal<String> testSignalComputed() {
    AngularCore.Signal<String> s = AngularCore.signal("Hello").asReadonly();
    return AngularCore.computed(() -> s.get() + " World");
  }

  public String getMessage() {
    return "Hello, World";
  }

  @JsMethod
  public static <T> List<T> makeList(T[] array) {
    return Arrays.asList(array);
  }

  @JsMethod
  public static ArrayList<String> newStringList() {
    return new ArrayList<>();
  }

  @JsMethod
  public static String join(List<String> list) {
    return String.join("\n", list);
  }
}
