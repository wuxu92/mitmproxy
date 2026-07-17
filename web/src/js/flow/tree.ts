/*
Pure, framework-free model that folds a flat list of flows into a Charles-style
tree grouped by host and URL path segments. No React, no Redux — unit-testable
in isolation.

Grouping:
  HTTP flow  -> root  = scheme://pretty_host[:port]
                folder = each path segment (query string stripped)
                leaf   = the full path; repeat calls to the same path collect
                         under one leaf as multiple flows.
  Non-HTTP   -> grouped under a synthetic host derived from mainPath(flow) so
                mixed captures (tcp/udp/dns) still render.
*/
import type { Flow, HTTPFlow } from "../flow";
import { RequestUtils, getTotalSize, mainPath } from "./utils";

export type FlowTreeNodeKind = "host" | "folder" | "leaf";

export interface FlowTreeNode {
    /** Stable identity, e.g. "https://example.com:443/api/users". Used as the
     *  React key and as the expanded-set key. */
    key: string;
    /** Display label for this segment (host string for roots, segment otherwise). */
    label: string;
    depth: number;
    kind: FlowTreeNodeKind;
    children: FlowTreeNode[];
    /** Flows terminating exactly at this node. Leaves always have >= 1. A folder
     *  may also hold flows when a path is both a folder and a leaf
     *  (e.g. /api and /api/users). */
    flows: Flow[];

    // Recursive aggregates, computed once during build.
    flowCount: number;
    errorCount: number;
    /** Flows still awaiting a response (or with no response at all). */
    pendingCount: number;
    totalSize: number;
    hasHighlight: boolean;
}

const HOST_DEPTH = 0;

function isPending(flow: Flow): boolean {
    if (flow.error) return false;
    switch (flow.type) {
        case "http":
            return flow.response === undefined;
        case "dns":
            return flow.response === undefined;
        default:
            return false;
    }
}

/** scheme://pretty_host[:port] for HTTP flows, else the synthetic mainPath host. */
function rootKey(flow: Flow): string {
    if (flow.type === "http") {
        const url = RequestUtils.pretty_url(flow.request as HTTPFlow["request"]);
        // pretty_url is scheme://host[:port]/path — strip the path.
        const schemeEnd = url.indexOf("://");
        const afterScheme = schemeEnd >= 0 ? schemeEnd + 3 : 0;
        const pathStart = url.indexOf("/", afterScheme);
        return pathStart >= 0 ? url.slice(0, pathStart) : url;
    }
    return mainPath(flow);
}

/** Ordered, query-stripped path segments for an HTTP flow. Non-HTTP flows have
 *  no sub-structure and live directly under their synthetic host. */
function pathSegments(flow: Flow): string[] {
    if (flow.type !== "http") return [];
    const path = flow.request.path.split("?", 1)[0].split("#", 1)[0];
    return path.split("/").filter((s) => s.length > 0);
}

interface MutableNode extends FlowTreeNode {
    children: MutableNode[];
    _childIndex: Map<string, MutableNode>;
}

function makeNode(
    key: string,
    label: string,
    depth: number,
    kind: FlowTreeNodeKind,
): MutableNode {
    return {
        key,
        label,
        depth,
        kind,
        children: [],
        flows: [],
        flowCount: 0,
        errorCount: 0,
        pendingCount: 0,
        totalSize: 0,
        hasHighlight: false,
        _childIndex: new Map(),
    };
}

function childOf(
    parent: MutableNode,
    key: string,
    label: string,
    kind: FlowTreeNodeKind,
): MutableNode {
    let node = parent._childIndex.get(key);
    if (node === undefined) {
        node = makeNode(key, label, parent.depth + 1, kind);
        parent._childIndex.set(key, node);
        parent.children.push(node);
    }
    return node;
}

/** Roll per-flow aggregates up every node on the path from a leaf to its root. */
function accumulate(
    chain: MutableNode[],
    flow: Flow,
    highlighted: boolean,
): void {
    const size = getTotalSize(flow);
    const err = flow.error !== undefined ? 1 : 0;
    const pend = isPending(flow) ? 1 : 0;
    for (const node of chain) {
        node.flowCount += 1;
        node.errorCount += err;
        node.pendingCount += pend;
        node.totalSize += size;
        if (highlighted) node.hasHighlight = true;
    }
}

function finalize(node: MutableNode): FlowTreeNode {
    // A node with children is a folder/host; a childless node holding flows is a
    // leaf. Sort children: folders before leaves, then alphabetically by label.
    node.children.sort((a, b) => {
        const aLeaf = a.children.length === 0;
        const bLeaf = b.children.length === 0;
        if (aLeaf !== bLeaf) return aLeaf ? 1 : -1;
        return a.label.localeCompare(b.label);
    });
    for (const child of node.children) finalize(child);
    // Drop the internal index from the emitted shape.
    delete (node as Partial<MutableNode>)._childIndex;
    return node;
}

/**
 * Build the host/path tree for a list of flows.
 * @param flows        Already-filtered flow list (state.flows.view).
 * @param highlightedIds Ids to mark; bubbles up to ancestors as hasHighlight.
 */
export function buildFlowTree(
    flows: readonly Flow[],
    highlightedIds: Set<string> = new Set(),
): FlowTreeNode[] {
    const roots: MutableNode[] = [];
    const rootIndex = new Map<string, MutableNode>();

    for (const flow of flows) {
        const rKey = rootKey(flow);
        let root = rootIndex.get(rKey);
        if (root === undefined) {
            root = makeNode(rKey, rKey, HOST_DEPTH, "host");
            rootIndex.set(rKey, root);
            roots.push(root);
        }

        const segments = pathSegments(flow);
        const chain: MutableNode[] = [root];
        let cursor = root,
            keyAcc = rKey;
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            keyAcc += "/" + seg;
            const isLast = i === segments.length - 1;
            cursor = childOf(cursor, keyAcc, seg, isLast ? "leaf" : "folder");
            chain.push(cursor);
        }
        // The terminal node holds the flow. For non-HTTP flows (no segments) that
        // is the host node itself.
        cursor.flows.push(flow);
        accumulate(chain, flow, highlightedIds.has(flow.id));
    }

    // A node that ended up with both children and flows is a folder that is also
    // directly addressable; keep kind "folder"/"host" (children win). A node with
    // flows and no children is a leaf. Reconcile kinds post-hoc.
    const reconcile = (node: MutableNode): void => {
        if (node.children.length > 0 && node.kind === "leaf") {
            node.kind = "folder";
        }
        for (const c of node.children) reconcile(c);
    };
    for (const root of roots) reconcile(root);

    roots.sort((a, b) => a.label.localeCompare(b.label));
    return roots.map((r) => finalize(r));
}

/**
 * Collapse chains of single-child path folders into one row, VS-Code / Charles
 * style: a folder with exactly one child and no directly-addressable flow of its
 * own is merged with that child, joining their labels with "/". Host roots stay
 * distinct, and a folder that holds its own flow (a path that is also a prefix of
 * deeper flows) terminates the chain. Returns a new tree with depths renumbered
 * for the collapsed shape; aggregates carry over unchanged (a merged chain shares
 * them, since every folded node had exactly one child and no own flow).
 */
export function compactTree(roots: readonly FlowTreeNode[]): FlowTreeNode[] {
    const rewrite = (node: FlowTreeNode, depth: number): FlowTreeNode => {
        let label = node.label,
            cur = node;
        while (
            cur.kind === "folder" &&
            cur.flows.length === 0 &&
            cur.children.length === 1
        ) {
            cur = cur.children[0];
            label += "/" + cur.label;
        }
        return {
            ...cur,
            label,
            depth,
            children: cur.children.map((c) => rewrite(c, depth + 1)),
        };
    };
    return roots.map((root) => rewrite(root, root.depth));
}

/** A flattened, render-ready row: one visible line in the virtualized tree. */
export interface FlowTreeRow {
    node: FlowTreeNode;
    depth: number;
    /** Display label for this row. A node's own row shows its full (compacted)
     *  label; a flow-entry row nested under it shows only the last segment, since
     *  the header row directly above already spells out the full path. */
    label: string;
    /** True when this row is an expandable node that is currently open. */
    expanded: boolean;
    /** True when the node can be expanded (has children or >1 flow at a leaf). */
    expandable: boolean;
    /** For leaf rows expanded into individual flows, the specific flow instance. */
    flow?: Flow;
}

/**
 * Walk the tree depth-first and emit only rows whose ancestors are all expanded.
 * Leaves with a single flow render as one selectable row; leaves with repeat
 * calls expand into one row per flow when opened.
 */
export function flattenTree(
    roots: readonly FlowTreeNode[],
    expanded: Set<string>,
): FlowTreeRow[] {
    const rows: FlowTreeRow[] = [];

    const visit = (node: FlowTreeNode): void => {
        const hasChildren = node.children.length > 0;
        const ownFlows = node.flows;
        // A single-flow leaf carries its flow on its own row so a click selects
        // it. Every other node with flows (a multi-flow leaf, or a folder/host
        // whose path is also a prefix of deeper flows) expands those flows into
        // separate selectable child rows.
        const isSingleLeaf = !hasChildren && ownFlows.length === 1;
        const expandable = hasChildren || ownFlows.length > 1;
        const isOpen = expanded.has(node.key);

        rows.push({
            node,
            depth: node.depth,
            label: node.label,
            expanded: expandable && isOpen,
            expandable,
            flow: isSingleLeaf ? ownFlows[0] : undefined,
        });

        if (!expandable || !isOpen) return;

        // Directly-addressable flows on this node render first (the request to
        // the node's own path), then its nested subfolders. Their label is just
        // the node's last segment — the header row above already shows the path.
        if (!isSingleLeaf) {
            const segment = node.label.slice(node.label.lastIndexOf("/") + 1);
            for (const flow of ownFlows) {
                rows.push({
                    node,
                    depth: node.depth + 1,
                    label: segment,
                    expanded: false,
                    expandable: false,
                    flow,
                });
            }
        }

        for (const child of node.children) visit(child);
    };

    for (const root of roots) visit(root);
    return rows;
}
