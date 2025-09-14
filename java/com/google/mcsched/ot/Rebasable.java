package com.google.mcsched.ot;

import java.util.ArrayList;
import java.util.List;
import jsinterop.annotations.JsConstructor;
import jsinterop.annotations.JsOptional;
import jsinterop.annotations.JsProperty;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NonNull;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/** Abstract operation superclass, core type of the operational transform. */
@JsType
@NullMarked
public abstract class Rebasable<T extends Rebasable<T>> {
  public abstract T beneath(T pending, ConflictPolicy policy);

  public @Nullable T popExtra() {
    return null;
  }

  /** Rebase results */
  @NullMarked
  @JsType
  public static class RebaseResults<T extends Rebasable<T>> {
    /**
     * The operations that the client must apply to bring its current state to the destination
     * state.
     */
    @JsProperty public final @NonNull List<T> mutation;

    /** The operations that the client and the server should store as canonical. */
    @JsProperty public final @NonNull List<T> rebased;

    @JsConstructor
    public RebaseResults(List<T> mutation, List<T> rebased) {
      this.mutation = mutation;
      this.rebased = rebased;
    }
  }

  /**
   * Core operational transform function.
   *
   * <p>The literature refers to this operation as transform(), but I preferred the analogy with
   * Git's rebase operation.
   *
   * <p>The prerequisite is that all pendingTs take place <i>after</i> all baseT operations in
   * monotonic time. This is true on the server, where the server's operations categorically occur
   * before any operations on the client. It's also true on the client when receiving updates in the
   * special case that the client has no pending operations, and the server response doesn't contain
   * a mix of accepted changes and new changes. That generally can't be guaranteed. For that case,
   * use the Versionable.integrate() operation, which uses the global version number as a monotonic,
   * systemwide clock.
   *
   * <p>The result {mutation, rebased} = rebase(base, pending) always meets the
   */
  public static <T extends Rebasable<T>> RebaseResults<T> rebase(
      List<T> baseTs,
      List<T> pendingTs,
      ConflictPolicy policy,
      @JsOptional @Nullable ArrayList<String> log) {
    if (log != null) {
      log.add("rebase " + pendingTs + " atop " + baseTs);
    }
    List<T> mutation = new ArrayList<>();
    List<T> rebased = new ArrayList<>(pendingTs);
    List<T> mutableBaseTs = new ArrayList<>(baseTs); // Use a mutable copy

    for (int b = 0; b < mutableBaseTs.size(); b++) {
      T base = mutableBaseTs.get(b);
      if (log != null) {
        log.add(
            "  rebase p="
                + rebased
                + " atop b="
                + base
                + " ["
                + (policy == ConflictPolicy.CONTEXT_WINS
                    ? "context wins"
                    : "patch wins") // Assuming ConflictPolicy.CONTEXT_WINS
                + "]");
      }
      List<T> nextPending = new ArrayList<>();
      for (T pending : rebased) {
        T pendingPrime = base.beneath(pending, policy);
        // This is how we "chase" moves around.
        T basePrime = pending.beneath(base, policy.flop());
        if (log != null) {
          log.add("    p' = p^b = " + pending + " atop " + base + " = " + pendingPrime);
          log.add("      b^p = " + base + " atop " + pending + " = " + basePrime + " is new base");
        }
        base = basePrime;
        T extraOp = base.popExtra();
        if (extraOp != null) {
          mutableBaseTs.add(b + 1, extraOp); // Insert into the list being iterated
        }
        nextPending.add(pendingPrime);
        extraOp = pendingPrime.popExtra();
        if (extraOp != null) {
          nextPending.add(extraOp);
        }
      }
      rebased = nextPending;
      // We've "filtered" the base change through all the pending changes.
      if (log != null) {
        log.add("  mutation: " + base + "; rebased: " + rebased);
      }
      mutation.add(base);
    }
    return new RebaseResults<>(mutation, rebased);
  }
}
