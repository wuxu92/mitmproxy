/*
Memoized selectors that derive the Charles-style flow tree from the already-
filtered flow view. Recompute only when their inputs change:
  - selectFlowTree      : rebuilds when the filtered view or highlights change.
  - selectVisibleTreeRows: reflattens when the tree or the expanded set changes.
`createSelector` is re-exported by Redux Toolkit (reselect), no new dependency.
*/
import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "../store";
import { buildFlowTree, compactTree, flattenTree } from "../../flow/tree";
import type { FlowTreeNode, FlowTreeRow } from "../../flow/tree";

const selectView = (state: RootState) => state.flows.view;
const selectHighlightedIds = (state: RootState) => state.flows.highlightedIds;
const selectExpanded = (state: RootState) => state.ui.flowtree.expanded;
const selectCompact = (state: RootState) => state.ui.flowtree.compact;

const selectRawTree = createSelector(
    [selectView, selectHighlightedIds],
    (view, highlightedIds): FlowTreeNode[] =>
        buildFlowTree(view, highlightedIds),
);

/** The tree as rendered: single-child folder chains collapsed when compact is on. */
export const selectFlowTree = createSelector(
    [selectRawTree, selectCompact],
    (tree, compact): FlowTreeNode[] => (compact ? compactTree(tree) : tree),
);

export const selectVisibleTreeRows = createSelector(
    [selectFlowTree, selectExpanded],
    (tree, expanded): FlowTreeRow[] => flattenTree(tree, expanded),
);

/** Every expandable node key in the current tree — for "expand all". */
export const selectAllExpandableKeys = createSelector(
    [selectFlowTree],
    (tree): string[] => {
        const keys: string[] = [];
        const walk = (node: FlowTreeNode) => {
            const multiFlow =
                node.children.length === 0 && node.flows.length > 1;
            if (node.children.length > 0 || multiFlow) keys.push(node.key);
            for (const child of node.children) walk(child);
        };
        for (const root of tree) walk(root);
        return keys;
    },
);
