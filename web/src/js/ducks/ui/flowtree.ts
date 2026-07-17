/*
UI state for the Charles-style flow tree: which view mode is active, which tree
nodes are expanded, and whether new flows auto-expand their branch. The expanded
set is a `Set` (dynamic runtime membership, needs O(1) toggle) and is therefore
whitelisted in the store's serializableCheck ignoredPaths, mirroring `flows`.
*/
import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import { enableMapSet } from "immer";

// This slice keeps a Set in state; Immer needs the MapSet plugin to draft it.
// (The flows duck stores Sets too but uses a manual, Immer-free reducer.)
enableMapSet();

export type FlowTreeMode = "structure" | "sequence";

export interface FlowTreeState {
    mode: FlowTreeMode;
    expanded: Set<string>;
    autoExpandNew: boolean;
    /** Collapse single-child folder chains into one row (VS-Code style). */
    compact: boolean;
}

export const initialState: FlowTreeState = {
    mode: "sequence",
    expanded: new Set<string>(),
    autoExpandNew: false,
    compact: true,
};

const flowtreeSlice = createSlice({
    name: "ui/flowtree",
    initialState,
    reducers: {
        setMode(state, action: PayloadAction<FlowTreeMode>) {
            state.mode = action.payload;
        },
        toggleMode(state) {
            state.mode = state.mode === "structure" ? "sequence" : "structure";
        },
        toggleNode(state, action: PayloadAction<string>) {
            const key = action.payload;
            if (state.expanded.has(key)) {
                state.expanded.delete(key);
            } else {
                state.expanded.add(key);
            }
        },
        expandAll(state, action: PayloadAction<string[]>) {
            state.expanded = new Set(action.payload);
        },
        collapseAll(state) {
            state.expanded = new Set<string>();
        },
        setAutoExpand(state, action: PayloadAction<boolean>) {
            state.autoExpandNew = action.payload;
        },
        setCompact(state, action: PayloadAction<boolean>) {
            state.compact = action.payload;
        },
        toggleCompact(state) {
            state.compact = !state.compact;
        },
    },
});

const { actions, reducer } = flowtreeSlice;
export const {
    setMode,
    toggleMode,
    toggleNode,
    expandAll,
    collapseAll,
    setAutoExpand,
    setCompact,
    toggleCompact,
} = actions;
export default reducer;
