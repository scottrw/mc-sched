package com.google.mcsched.ot;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/**
 * A subtype of Rebasable that carries global ordering information.
 *
 * <p>This global ordering information is required to allow the client to process updates from the
 * server that may "clear" pending changes on the client, but also mix edits from other clients in.
 *
 * <p>This more complex form of rebase is called integrate(), and is equivalent to rebase() when all
 * the pending changes occur strictly after all the base changes in global ordering.
 */
@JsType
@NullMarked
public abstract class Versionable<T extends Versionable<T>> extends Rebasable<T> {
  // TODO: make package-visible after migrating the rest to Java
  public final @Nullable Double serverVersion;
  public final double sessionId;
  public final double clientVersion;

  public Versionable(@Nullable Double serverVersion, double sessionId, double clientVersion) {
    this.serverVersion = serverVersion;
    this.sessionId = sessionId;
    this.clientVersion = clientVersion;
  }

  public boolean sameSession(T other) {
    return this.sessionId == other.sessionId;
  }

  public abstract T rename(double serverId);

  @Override
  public abstract boolean equals(@Nullable Object other);

  @Override
  public abstract int hashCode();

  @Override
  public abstract String toString();

  /**
   * The results of an integrate operation.
   *
   * <p>The client should apply the mutation to its document, then discard the mutation list. Then
   * the client should store the |store| changes, delete its existing pending operations and
   * substitute |pending| instead.
   */
  @JsType
  public static class IntegrateResults<T extends Versionable<T>> {
    /**
     * Mutations that should be applied to the client to bring it into a consistent state, but not
     * stored.
     */
    public final List<T> mutation;

    /** Changes from the server and the client that are now canonical and should be stored. */
    public final List<T> store;

    /**
     * Changes from the client that have not been accepted by the server and should remain pending.
     *
     * <p>These have been rebased atop all the stored changes, and have already had the mutations
     * applied to them.
     */
    public final List<T> pending;

    public IntegrateResults(List<T> mutation, List<T> store, List<T> pending) {
      this.mutation = mutation;
      this.store = store;
      this.pending = pending;
    }
  }

  /**
   * Integrate interleaved operations from the server and client.
   *
   * <p>Integrate is a more complicated form of rebase, where the client and server changes are
   * interleaved. We use the Versionable properties to establish a total ordering of changes between
   * the server and client.
   *
   * <p>Not all client changes may be in the server's list of changes, so we need to return a) which
   * changes the client should store, b) which mutations the client should apply to its own
   * document, and c) which client changes were not accepted by the server (and thus remain pending
   * on the client).
   *
   * <p>Consider this case:
   *
   * <pre>
   * Server: [a', b', c', d']
   * Client: [    b,  c,     e]
   * </pre>
   *
   * <li>These are returned to store: a', b', c', d'
   * <li>These are returned as mutations: a', b' - b, c' - c, d', e' - e <br>
   *     (that is: all the server-only changes are returned in a format that can be applied to the
   *     client's document in its current state at "e")
   * <li>These are returned as pending: e' (that is: e rebased on all server changes.)
   */
  public static <T extends Versionable<T>> IntegrateResults<T> integrate(
      List<T> server, List<T> pending) {
    ArrayList<T> mutation = new ArrayList<>();
    ArrayList<T> store = new ArrayList<>();
    ArrayDeque<T> pendingList = new ArrayDeque<>(pending);
    server = new ArrayList<>(server);
    for (int b = 0; b < server.size(); b++) {
      T base = server.get(b);
      store.add(base); // always store the server's canonical version
      ArrayDeque<T> nextPending = new ArrayDeque<>();
      if (!pendingList.isEmpty() && pendingList.getFirst().sameSession(base)) {
        T p = pendingList.removeFirst();
        if (!p.rename(base.serverVersion).equals(base)) {
          // If the client versions mismatch, or the content of the op mismatches, it means the
          // client or server rebased incorrectly.
          throw new IllegalStateException(
              "Rebase mismatch: client rebase produced "
                  + p
                  + " but server specified "
                  + base
                  + " for base "
                  + b);
        }
        continue;
      }
      for (T p : pendingList) {
        T pendingPrime = base.beneath(p, ConflictPolicy.CONTEXT_WINS);
        T basePrime = p.beneath(base, ConflictPolicy.PATCH_WINS);
        base = basePrime;
        @Nullable T baseExtra = base.popExtra();
        if (baseExtra != null) {
          server.add(b + 1, baseExtra);
        }
        nextPending.add(pendingPrime);
        @Nullable T pendingExtra = pendingPrime.popExtra();
        if (pendingExtra != null) {
          nextPending.add(pendingExtra);
        }
      }
      pendingList = nextPending;
      mutation.add(base);
    }
    return new IntegrateResults<>(mutation, store, new ArrayList<>(pendingList));
  }

  @JsType
  public static class SaveResults<T extends Versionable<T>> {
    public final List<T> toSave;
    public final List<T> toReply;
    public final double nextVersion;

    public SaveResults(List<T> toSave, List<T> toReply, double nextVersion) {
      this.toSave = toSave;
      this.toReply = toReply;
      this.nextVersion = nextVersion;
    }
  }

  public static <T extends Versionable<T>> SaveResults<T> doSave(
      double nextVersion,
      List<T> existingChanges,
      List<T> pendingChanges,
      double sessionId,
      double serverBaseVersion) {
    var existing = new ArrayDeque<>(existingChanges);
    var pending = new ArrayDeque<>(pendingChanges);
    var changes = new ArrayList<T>();
    int i = existing.size() + pending.size();
    while (existing.size() > 0 && pending.size() > 0) {
      i--;
      var base = new ArrayList<T>();
      // Collect all changes from the server not from this client.
      while (existing.size() > 0 && existing.getFirst().sessionId != sessionId) {
        var e = existing.removeFirst();
        base.add(e);
        changes.add(e);
      }
      // XXX: fix the signature of rebase so the copy isn't required.
      var r = Rebasable.rebase(base, List.copyOf(pending), ConflictPolicy.CONTEXT_WINS, null);
      pending = new ArrayDeque<>(r.rebased);

      // Now peel off pending changes that were rebased and saved.
      while (pending.size() > 0
          && existing.size() > 0
          && existing.getFirst().sessionId == sessionId) {

        var e = existing.removeFirst();
        var p = pending.removeFirst();
        if (!e.equals(p.rename(e.serverVersion))) {
          // If this happens, we dropped a change, or the server and client
          // didn't agree on how to rebase it.
          throw new IllegalStateException("Client save clientVersion out of order: " + changes);
        }
        changes.add(e); // these already have assigned server versions
      }

      if (i < 0) {
        // If I were smarter, I'd be able to prove this isn't possible using
        // induction and the loop invariant.
        throw new IllegalStateException("Too many iterations");
      }
    }

    // If there are still existing changes, gather them to send to the client.
    changes.addAll(existing);

    // If there are pending changes, they've already been rebased, so we can commit them now.
    var pending2 = new ArrayList<T>();
    for (var p : pending) {
      var renamed = p.rename(nextVersion++);
      changes.add(renamed);
      pending2.add(renamed);
    }

    for (i = 0; i < changes.size(); i++) {
      var c = changes.get(i);
      if (c.serverVersion != serverBaseVersion + i) {
        throw new IllegalStateException("Client save clientVersion out of order: " + changes);
      }
    }

    return new SaveResults<>(pending2, changes, nextVersion);
  }
}

/* */
