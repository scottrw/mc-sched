package com.google.mcsched.ot;

import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;

/**
 * Defines how to break ties in the operational transform.
 *
 * <p>Most operations can be transformed past one another without a conflict, but InsertPatch and
 * NewNode operations have to choose a winner. Both the client and the server need to use the same
 * setting, or they will drift out of sync.
 */
@JsType
@NullMarked
public enum ConflictPolicy {
  CONTEXT_WINS,
  PATCH_WINS;

  public ConflictPolicy flop() {
    return equals(CONTEXT_WINS) ? PATCH_WINS : CONTEXT_WINS;
  }
}
