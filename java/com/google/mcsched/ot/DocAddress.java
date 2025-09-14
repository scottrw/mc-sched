package com.google.mcsched.ot;

import static com.google.mcsched.ot.AngularCore.Signal;
import static com.google.mcsched.ot.AngularCore.SignalUpdater;

import com.google.protos.mcsched.ot.DocAddressProto;
import java.util.Objects;
import jsinterop.annotations.JsEnum;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/** Represents at top-level field within a Document where an Op occurred. */
@JsType
@NullMarked
public final class DocAddress {
  @JsEnum
  public enum Slot {
    TITLE,
    SUBTITLE,
  };

  public final Slot slot;

  public DocAddress(Slot slot) {
    this.slot = slot;
  }

  public Signal<PString> get(Document d) {
    switch (this.slot) {
      case TITLE:
        return d.title.asReadonly();
      case SUBTITLE:
        return d.subtitle.asReadonly();
    }
    throw new IllegalArgumentException("unknown slot: " + this.slot);
  }

  public void set(Document d, PString s) {
    switch (this.slot) {
      case TITLE:
        d.title.set(s);
        return;
      case SUBTITLE:
        d.subtitle.set(s);
        return;
    }
    throw new IllegalArgumentException("unknown slot: " + this.slot);
  }

  public void update(Document d, SignalUpdater<PString> updater) {
    switch (this.slot) {
      case TITLE:
        d.title.update(updater);
        return;
      case SUBTITLE:
        d.subtitle.update(updater);
        return;
    }
    throw new IllegalArgumentException("unknown slot: " + this.slot);
  }

  @Override
  public boolean equals(@Nullable Object other) {
    if (other == null) {
      return false;
    }
    if (other instanceof DocAddress) {
      DocAddress otherDocAddress = (DocAddress) other;
      return this.slot == otherDocAddress.slot;
    }
    return false;
  }

  @Override
  public int hashCode() {
    return Objects.hash(this.slot);
  }

  @Override
  public String toString() {
    return "doc." + this.slot;
  }

  public DocAddressProto toProto() {
    return DocAddressProto.newBuilder().setSlot(DocAddressProto.Slot.TITLE).build();
  }

  public static DocAddress fromProto(DocAddressProto proto) {
    return new DocAddress(DocAddress.Slot.TITLE);
  }
}
