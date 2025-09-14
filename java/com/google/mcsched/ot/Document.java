package com.google.mcsched.ot;

import static com.google.common.collect.ImmutableList.toImmutableList;
import static com.google.mcsched.ot.AngularCore.Signal;
import static com.google.mcsched.ot.AngularCore.WritableSignal;
import static com.google.mcsched.ot.AngularCore.computed;
import static com.google.mcsched.ot.AngularCore.signal;

import com.google.common.collect.ImmutableList;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import jsinterop.annotations.JsOptional;
import jsinterop.annotations.JsType;
import org.jspecify.annotations.NullMarked;
import org.jspecify.annotations.Nullable;

/** Operational Transform model of a Project document. */
@JsType
@NullMarked
public final class Document {
  // XXX: Fix this so that all mc_sched only sees the readonly Signal
  // but OT sees a WritableSignal that it can update.
  public final WritableSignal<PString> title = signal(new PString(""));
  public final WritableSignal<PString> subtitle = signal(new PString(""));

  // XXX: yuck. j2cl will coerce js numbers to Doubles, but not to Integers.
  // So we're left with this mess instead.
  private Map<Double, Node> nodesById = new HashMap<>();

  // XXX: yuck. Subclass wants to examine this.
  public final WritableSignal<PArray<Double>> orderedNodes =
      signal(new PArray<>(ImmutableList.of()));
  public int nextNodeId = 0; // TODO: fix visibility

  public Signal<double[]> orderedNodesArray =
      computed(
          () -> {
            // NOTE: for reasons I haven't figured out, we have to call asReadonly() before
            // calling get(). J2CL will happily compile either, but at runtime the browser complains
            // that orderedNodes has no get() function. Casting asReadonly() seems to fix this.
            var orderedNodes = this.orderedNodes.asReadonly().get();
            var a = new double[orderedNodes.size()];
            for (int i = 0; i < orderedNodes.size(); i++) {
              a[i] = orderedNodes.get(i);
            }
            return a;
          });

  public Document() {}

  @Override
  public boolean equals(@Nullable Object other) {
    if (other == null) {
      return false;
    }
    if (other instanceof Document) {
      Document otherDoc = (Document) other;
      return this.title.asReadonly().get().equals(otherDoc.title.asReadonly().get())
          && this.subtitle.asReadonly().get().equals(otherDoc.subtitle.asReadonly().get())
          && this.orderedNodes.asReadonly().get().equals(otherDoc.orderedNodes.asReadonly().get())
          && this.nodesById.equals(otherDoc.nodesById);
    }
    return false;
  }

  @Override
  public int hashCode() {
    return Objects.hash(this.title, this.subtitle, this.orderedNodes, this.nodesById);
  }

  public Node allocateNode() {
    return new Node();
  }

  /**
   * Add a node to the document.
   *
   * <p>This doesn't add it from the ordered nodes, which is a separate Op.
   */
  public Node addNode(double id) {
    if (this.nodesById.containsKey(id)) {
      throw new IllegalArgumentException("node " + id + " already exists");
    }
    Node node = allocateNode();
    this.nodesById.put(id, node);
    return node;
  }

  /**
   * Remove a node from the document.
   *
   * <p>This doesn't remove it from the ordered nodes, which is a separate Op.
   */
  public void delNode(double id) {
    if (!this.nodesById.containsKey(id)) {
      throw new IllegalArgumentException("node " + id + " does not exist");
    }
    this.nodesById.remove(id);
  }

  // private int indexOfId(double id) {
  // XXX: it can cause a bug if this index doesn't get recalculated when
  // orderedNodes changes. It should _probably_ be done in a computed() that
  // uses the orderedNodes signal.
  // return this.orderedNodes.get().indexOf(id);
  // }

  public Document copy() {
    Document copy = new Document();
    // NOTE: calling get() here is correct (instead of computed) because the copy is of the document
    // at a particular time. Having it update itself when the original document changes would defeat
    // the purpose of making a copy.
    copy.title.set(this.title.asReadonly().get());
    copy.subtitle.set(this.subtitle.asReadonly().get());
    copy.orderedNodes.set(this.orderedNodes.asReadonly().get().copy());
    copy.nodesById = new HashMap<>();
    for (Map.Entry<Double, Node> entry : this.nodesById.entrySet()) {
      copy.nodesById.put(entry.getKey(), entry.getValue().copy());
    }
    return copy;
  }

  public boolean hasNode(double id) {
    return this.nodesById.containsKey(id);
  }

  // XXX: this won't update when orderedNodes updates.
  // public double getIdAtIndex(int idx) {
  //   return this.orderedNodes.get().get(idx);
  // }

  public void renameNodes(double above, double by) {
    // if id >= above, id += by
    HashMap<Double, Node> newIds = new HashMap<>();
    for (Map.Entry<Double, Node> entry : this.nodesById.entrySet()) {
      double id = entry.getKey();
      double newId = id >= above ? id + by : id;
      newIds.put(newId, entry.getValue());
    }
    this.orderedNodes.update(
        orderedNodes ->
            orderedNodes.map(
                id -> {
                  if (id >= above) {
                    return id + by;
                  } else {
                    return id;
                  }
                }));
    this.nodesById = newIds;
  }

  public void patchOrderedNodes(Patch<PArray<Double>, Double> patch) {
    this.orderedNodes.update(orderedNodes -> patch.applyTo(orderedNodes));
  }

  public int size() {
    return this.nodesById.size();
  }

  // XXX: the result would not update.
  // public PArray<Double> slice(int start, int end) {
  //   return this.orderedNodes.slice2(start, end);
  // }

  public Node getNodeById(double id) {
    if (!this.nodesById.containsKey(id)) {
      throw new IllegalArgumentException("node " + id + " does not exist");
    }
    return this.nodesById.get(id);
  }

  @Override
  public String toString() {
    return "Document{"
        + "\ntitle='"
        + this.title
        + '\''
        + "\nsubtitle='"
        + this.subtitle
        + '\''
        + "\nnodesById="
        + this.nodesById
        + "\norderedNodes="
        + this.orderedNodes
        + '}';
  }

  public void checkNodeConstraints(@JsOptional @Nullable Double nextNodeId) {
    var orderedNodes = this.orderedNodes.asReadonly().get();
    PArray<Double> notInOrdered =
        new PArray<>(new ArrayList<>(this.nodesById.keySet())).notIn(orderedNodes);
    if (notInOrdered.size() > 0) {
      throw new IllegalStateException("nodes not in ordered: " + notInOrdered);
    }
    PArray<Double> duplicates = orderedNodes.duplicates();
    if (duplicates.size() > 0) {
      throw new IllegalStateException("duplicate nodes: " + duplicates);
    }
    if (nextNodeId != null) {
      ImmutableList<Double> equalOrHigherNextNodeId =
          nodesById.keySet().stream().filter(id -> id >= nextNodeId).collect(toImmutableList());
      if (equalOrHigherNextNodeId.size() > 0) {
        throw new IllegalStateException(
            "nodes equal or higher nextNodeId: " + equalOrHigherNextNodeId);
      }
    }
    PArray<Double> notInIdMap =
        orderedNodes.notIn(new PArray<>(new ArrayList<>(this.nodesById.keySet())));
    if (notInIdMap.size() > 0) {
      throw new IllegalStateException("nodes not in id map: " + notInIdMap);
    }
  }

  // Helper functions for creating ops. Not sure if these go here, or go on the
  // Op class.
  public List<Op> addNodeOps(int index, String name) {
    double id = this.nextNodeId++;
    var newNodeOp = new NewNodeOp(id);
    var indexOp = new IndexOp(PArray.<Double>ins(index, id));
    var editNodeOp =
        new EditNodeOp(new NodeAddress(id, NodeAddress.Slot.NAME), List.of(PString.ins(0, name)));
    return List.of(newNodeOp, indexOp, editNodeOp);
  }

  public List<Op> removeNodeByIdOps(double id) {
    // NOTE: calling get() instead of creating a computed() is correct because the
    // Ops shouldn't be recomputed when the document changes (that would be very wrong)
    var index = this.orderedNodes.asReadonly().get().indexOf(id);
    var editNodeOp =
        new EditNodeOp(
            new NodeAddress(id, NodeAddress.Slot.NAME),
            List.of(this.getNodeById(id).name.asReadonly().get().makePatch(new PString(""))));
    var rmNodeOp = new IndexOp(PArray.<Double>rem(index, id));
    var delNodeOp = new DeleteNodeOp(id);
    return List.of(editNodeOp, rmNodeOp, delNodeOp);
  }

  public void applyAll(List<Op> ops) {
    for (Op op : ops) {
      op.applyTo(this);
    }
  }
}
