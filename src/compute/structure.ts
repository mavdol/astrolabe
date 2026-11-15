import type { Results } from "../schema/benchmark.js";

/** A node id, or undefined for the single implicit node of a flat benchmark. */
export type NodeId = string | undefined;

export interface NodeTree {
  hasStructure: boolean;
  nodesInDeclaredOrder: NodeId[];
  childrenOf: Map<string, string[]>;
  parentOf: Map<string, string | undefined>;
}

export function nodeTreeOf(results: Results): NodeTree {
  const childrenOf = new Map<string, string[]>();
  const parentOf = new Map<string, string | undefined>();
  const nodes = results.structure?.nodes ?? [];

  for (const node of nodes) {
    parentOf.set(node.id, node.parent);
    childrenOf.set(node.id, []);
  }

  for (const node of nodes) if (node.parent !== undefined) childrenOf.get(node.parent)?.push(node.id);

  return {
    hasStructure: nodes.length > 0,
    nodesInDeclaredOrder: nodes.length > 0 ? nodes.map((node) => node.id) : [undefined],
    childrenOf,
    parentOf,
  };
}

export function descendantsOf(tree: NodeTree, node: string): string[] {
  const descendants: string[] = [];
  const visit = (id: string) => {
    for (const child of tree.childrenOf.get(id) ?? []) {
      descendants.push(child);
      visit(child);
    }
  };

  visit(node);

  return descendants;
}

export function hasAncestorIn(tree: NodeTree, node: NodeId, nodes: Set<NodeId>): boolean {
  for (
    let ancestor = node === undefined ? undefined : tree.parentOf.get(node);
    ancestor !== undefined;
    ancestor = tree.parentOf.get(ancestor)
  ) {
    if (nodes.has(ancestor)) return true;
  }

  return false;
}

/** How a node's value is built: from one node that carries data, or from the children that hold values. */
export type Aggregation = { dataNodeIndex: number } | { children: Aggregation[] };

export interface AggregationPlan {
  aggregation: Aggregation;
  /** The nodes that carry data under the node, in the order their indexes refer to. */
  dataNodes: NodeId[];
}

/**
 * A node holds values when it carries data itself, when at least two of its
 * children hold values, or when it has a single child in the structure (it
 * then repeats that child).
 */
export function aggregationPlanFor(tree: NodeTree, node: NodeId, nodesWithData: Set<NodeId>): AggregationPlan | null {
  const dataNodes: NodeId[] = [];
  const build = (current: NodeId): Aggregation | null => {
    if (nodesWithData.has(current)) {
      dataNodes.push(current);

      return { dataNodeIndex: dataNodes.length - 1 };
    }

    if (current === undefined) return null;

    const children = tree.childrenOf.get(current) ?? [];

    if (children.length === 0) return null;

    const dataNodeCountBefore = dataNodes.length;
    const childrenWithValues = children.map(build).filter((child): child is Aggregation => child !== null);

    if (children.length === 1) return childrenWithValues[0] ?? null;

    if (childrenWithValues.length >= 2) return { children: childrenWithValues };

    dataNodes.length = dataNodeCountBefore;

    return null;
  };
  const aggregation = build(node);

  return aggregation ? { aggregation, dataNodes } : null;
}
