package com.google.mcsched.ot;

import static com.google.mcsched.ot.AngularCore.WritableSignal;
import static com.google.mcsched.ot.AngularCore.signal;

import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/** Record type used for modeling the document. */
@JsType
@NullMarked
public final class Node {
  public final WritableSignal<PString> name = signal(new PString(""));

  public Node() {}

  public Node copy() {
    Node copy = new Node();
    copy.name.set(this.name.asReadonly().get());
    return copy;
  }

  @Override
  public boolean equals(@Nullable Object other) {
    if (other == null) {
      return false;
    }
    if (other instanceof Node) {
      Node otherNode = (Node) other;
      return this.name.asReadonly().get().equals(otherNode.name.asReadonly().get());
    }
    return false;
  }

  @Override
  public int hashCode() {
    return this.name.hashCode();
  }

  @Override
  public String toString() {
    return "Node{" + "\nname='" + this.name + '\'' + '}';
  }
}
