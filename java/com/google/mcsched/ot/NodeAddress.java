package com.google.mcsched.ot;

import static com.google.mcsched.ot.AngularCore.Signal;
import static com.google.mcsched.ot.AngularCore.SignalUpdater;

import com.google.protos.mcsched.ot.NodeAddressProto;
import java.util.Objects;
import jsinterop.annotations.JsEnum;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/** Represents at top-level field within a Document where an Op occurred. */
@JsType
@NullMarked
public final class NodeAddress {
  @JsEnum
  public enum Slot {
    NAME,
  };

  public final Slot slot;
  public final double id;

  public NodeAddress(double id, Slot slot) {
    this.id = id;
    this.slot = slot;
  }

  public Signal<PString> get(Document d) {
    switch (this.slot) {
      case NAME:
        return d.getNodeById(this.id).name.asReadonly();
    }
    throw new IllegalArgumentException("unknown slot: " + this.slot);
  }

  public void set(Document d, PString s) {
    switch (this.slot) {
      case NAME:
        d.getNodeById(this.id).name.set(s);
        return;
    }
    throw new IllegalArgumentException("unknown slot: " + this.slot);
  }

  public void update(Document d, SignalUpdater<PString> updater) {
    switch (this.slot) {
      case NAME:
        d.getNodeById(this.id).name.update(updater);
        return;
    }
    throw new IllegalArgumentException("unknown slot: " + this.slot);
  }

  @Override
  public boolean equals(@Nullable Object other) {
    if (other == null) {
      return false;
    }
    if (other instanceof NodeAddress) {
      NodeAddress otherNodeAddress = (NodeAddress) other;
      return this.id == otherNodeAddress.id && this.slot == otherNodeAddress.slot;
    }
    return false;
  }

  @Override
  public int hashCode() {
    return Objects.hash(this.id, this.slot);
  }

  @Override
  public String toString() {
    return "node." + this.id + "." + this.slot;
  }

  public NodeAddressProto toProto() {
    return NodeAddressProto.newBuilder()
        .setId((long) this.id)
        .setSlot(NodeAddressProto.Slot.NAME)
        .build();
  }

  public static NodeAddress fromProto(NodeAddressProto proto) {
    return new NodeAddress((double) proto.getId(), NodeAddress.Slot.NAME);
  }
}
