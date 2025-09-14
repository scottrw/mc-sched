package com.google.mcsched.ot;

import com.google.common.collect.ImmutableList;
import com.google.errorprone.annotations.CanIgnoreReturnValue;
import com.google.protos.mcsched.ot.ChangeProto;
import java.util.List;
import java.util.Objects;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/** A globally ordered set of operations that must be applied or undone atomically. */
@JsType
@NullMarked
public final class Change extends Versionable<Change> {
  public final List<Op> ops; // TODO: fix Server to avoid reading this.

  public Change(
      @Nullable Double serverVersion, double sessionId, double clientVersion, List<Op> ops) {
    super(serverVersion, sessionId, clientVersion);
    this.ops = ops;
  }

  @Override
  public Change rename(double serverId) {
    return new Change(serverId, this.sessionId, this.clientVersion, this.ops);
  }

  @Override
  public boolean equals(@Nullable Object other) {
    if (other == null) {
      return false;
    }
    if (other instanceof Change) {
      Change otherChange = (Change) other;
      return this.serverVersion.equals(otherChange.serverVersion)
          && this.sessionId == otherChange.sessionId
          && this.clientVersion == otherChange.clientVersion
          && this.ops.size() == otherChange.ops.size()
          && this.ops.equals(otherChange.ops);
    }
    return false;
  }

  @Override
  public Change beneath(Change pending, ConflictPolicy policy) {
    return pending.atopChange(this, policy);
  }

  public Change atopChange(Change context, ConflictPolicy policy) {
    return new Change(
        this.serverVersion,
        this.sessionId,
        this.clientVersion,
        rebase(context.ops, this.ops, policy, null).rebased);
  }

  @CanIgnoreReturnValue
  public Document applyTo(Document doc) {
    for (Op op : this.ops) {
      op.applyTo(doc);
    }
    return doc;
  }

  @Override
  public int hashCode() {
    return Objects.hash(this.serverVersion, this.sessionId, this.clientVersion, this.ops);
  }

  @Override
  public String toString() {
    return this.serverVersion
        + "="
        + this.sessionId
        + "@"
        + this.clientVersion
        + "["
        + this.ops
        + "]";
  }

  public ChangeProto toProto() {
    var builder =
        ChangeProto.newBuilder()
            .setSessionId((long) this.sessionId)
            .setClientVersion((long) this.clientVersion)
            .addAllOps(this.ops.stream().map(Op::toProto).collect(ImmutableList.toImmutableList()));
    if (this.serverVersion != null) {
      builder.setServerVersion(this.serverVersion.longValue());
    }
    return builder.build();
  }

  public static Change fromProto(ChangeProto proto) {
    return new Change(
        (double) proto.getServerVersion(),
        (double) proto.getSessionId(),
        (double) proto.getClientVersion(),
        proto.getOpsList().stream().map(Op::fromProto).collect(ImmutableList.toImmutableList()));
  }
}
