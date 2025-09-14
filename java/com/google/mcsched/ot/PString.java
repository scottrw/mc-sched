package com.google.mcsched.ot;

import com.google.protos.mcsched.ot.PatchableProto;
import jsinterop.annotations.JsOptional;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NonNull;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/** Patchable String class */
@JsType
@NullMarked
public final class PString extends Patchable<PString, String> {
  private String string;

  /**
   * Constructs a PString.
   *
   * @param string The initial string value. If null, an empty string is used.
   */
  public PString(String string) {
    this.string = string;
  }

  @Override
  public boolean equals(@Nullable Object other) {
    if (other == null) {
      return false;
    }
    if (other == this) {
      return true;
    }
    if (!(other instanceof PString)) {
      return false;
    }
    PString otherPString = (PString) other;
    return string.equals(otherPString.string);
  }

  @Override
  public int hashCode() {
    return string.hashCode();
  }

  @Override
  public String get(int index) {
    // this.string is guaranteed non-null by the constructor.
    return String.valueOf(this.string.charAt(index));
  }

  @Override
  public PString slice1(int start) {
    // this.string is guaranteed non-null by the constructor.
    return new PString(this.string.substring(start));
  }

  @Override
  public PString slice2(int start, int end) {
    // this.string is guaranteed non-null by the constructor.
    return new PString(this.string.substring(start, end));
  }

  @Override
  public int size() {
    // this.string is guaranteed non-null by the constructor.
    return this.string.length();
  }

  @Override
  public PString concat(PString... a) {
    // this.string is guaranteed non-null by the constructor.
    StringBuilder sb = new StringBuilder(this.string);
    if (a != null) {
      for (PString pstr : a) {
        if (pstr != null) {
          // pstr.string is guaranteed non-null by the PString constructor.
          sb.append(pstr.string);
        }
      }
    }
    return new PString(sb.toString());
  }

  @Override
  public PString splice(int at, int deleteLength, @JsOptional @Nullable PString insert) {
    // this.string is guaranteed non-null by the constructor.
    StringBuilder sb = new StringBuilder(this.string);
    String insertStr = "";
    if (insert != null) {
      // insert.string is guaranteed non-null by the PString constructor.
      insertStr = insert.string;
    }
    sb.replace(at, at + deleteLength, insertStr);
    return new PString(sb.toString());
  }

  public static @NonNull Patch<PString, String> ins(int at, String insert) {
    return Patch.at(at, null, new PString(insert), null);
  }

  @Override
  public String toString() {
    return "PString(" + string + ")";
  }

  public String getRawString() {
    return string;
  }

  @Override
  public PatchableProto toProto() {
    return PatchableProto.newBuilder().setText(string).build();
  }

  public static PString fromProto(PatchableProto proto) {
    return new PString(proto.getText());
  }

  public Patch<PString, String> patchTo(String newString) {
    return makePatch(new PString(newString));
  }
}
