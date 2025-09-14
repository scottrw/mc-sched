package com.google.mcsched.ot;

import com.google.protos.mcsched.ot.NewNodeOpProto;
import com.google.protos.mcsched.ot.OpProto;
import java.util.Objects;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/**
 * Allocates a new node with a given id (but does not add it to the node ordering).
 *
 * <p>This is part one of a three-part operation to create a new node. First, this operation
 * allocates a node with a given id. Next, an IndexOp inserts the node id into the node ordering
 * list in the document. Last, any number of EditNodeOps fills in the initial values for the node.
 *
 * <p>Creating a new node with three operations instead of one makes the rebase() operation much
 * simpler, because each aspect of the new node process can be handled orthogonally: what the node
 * id will be (subject to adds and deletes of nodes on the server), where the node will sit in the
 * node ordering of the document (subject to moves, inserts, and deletes of other nodes on the
 * server), and what the content of the node will be (which won't have any collisions with other
 * edits on the server).
 */
@JsType
@NullMarked
public final class NewNodeOp extends Op {
  public final double
      clientId; // TODO: can be package-level visibility after MonotonicServer/Client migrate.

  public NewNodeOp(double clientId) {
    this.clientId = clientId;
  }

  @Override
  public void applyTo(Document d) {
    d.nextNodeId = Math.max((int) d.nextNodeId, (int) clientId + 1);
    var unused = d.addNode(clientId);
  }

  @Override
  public Op beneath(Op pending, ConflictPolicy policy) {
    return pending.atopNewNodeOp(this, policy);
  }

  @Override
  public Op atopNewNodeOp(NewNodeOp context, ConflictPolicy policy) {
    if (clientId == context.clientId) {
      if (policy == ConflictPolicy.CONTEXT_WINS) {
        return new NewNodeOp(context.clientId + 1);
      }
      return new RenameNodeOp(clientId, context.clientId + 1, this);
    }
    return this;
  }

  @Override
  public Op atopRenameNodeOp(RenameNodeOp context, ConflictPolicy policy) {
    if (policy == ConflictPolicy.CONTEXT_WINS && context.inRange(clientId)) {
      return new NewNodeOp(context.transform(clientId));
    }
    return this;
  }

  @Override
  public boolean equals(@Nullable Object other) {
    if (other == null) {
      return false;
    }
    if (other instanceof NewNodeOp) {
      NewNodeOp otherNewNodeOp = (NewNodeOp) other;
      return clientId == otherNewNodeOp.clientId;
    }
    return false;
  }

  @Override
  public int hashCode() {
    return Objects.hash(clientId);
  }

  @Override
  public String toString() {
    return "NewNodeOp";
  }

  @Override
  public OpProto toProto() {
    return OpProto.newBuilder()
        .setNewNode(NewNodeOpProto.newBuilder().setId((long) this.clientId))
        .build();
  }

  public static NewNodeOp fromProto(NewNodeOpProto proto) {
    return new NewNodeOp((double) proto.getId());
  }
}
