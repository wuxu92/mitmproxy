import reducer, {
    initialState,
    setMode,
    toggleMode,
    toggleNode,
    expandAll,
    collapseAll,
    setAutoExpand,
    setCompact,
    toggleCompact,
} from "../../../ducks/ui/flowtree";

describe("flowtree ui reducer", () => {
    it("sets an explicit mode", () => {
        const state = reducer(initialState, setMode("structure"));
        expect(state.mode).toBe("structure");
    });

    it("toggles mode between structure and sequence", () => {
        const once = reducer(initialState, toggleMode());
        expect(once.mode).toBe("structure");
        const twice = reducer(once, toggleMode());
        expect(twice.mode).toBe("sequence");
    });

    it("toggles a node key on and off immutably", () => {
        const opened = reducer(initialState, toggleNode("k1"));
        expect(opened.expanded.has("k1")).toBe(true);
        // Original set untouched (immutable update, no Immer draft mutation).
        expect(initialState.expanded.has("k1")).toBe(false);

        const closed = reducer(opened, toggleNode("k1"));
        expect(closed.expanded.has("k1")).toBe(false);
    });

    it("replaces the expanded set on expandAll", () => {
        const state = reducer(
            { ...initialState, expanded: new Set(["old"]) },
            expandAll(["a", "b", "c"]),
        );
        expect([...state.expanded].sort()).toEqual(["a", "b", "c"]);
    });

    it("clears the expanded set on collapseAll", () => {
        const state = reducer(
            { ...initialState, expanded: new Set(["a", "b"]) },
            collapseAll(),
        );
        expect(state.expanded.size).toBe(0);
    });

    it("sets autoExpandNew", () => {
        const state = reducer(initialState, setAutoExpand(true));
        expect(state.autoExpandNew).toBe(true);
    });

    it("defaults compact to on", () => {
        expect(initialState.compact).toBe(true);
    });

    it("sets compact explicitly", () => {
        expect(reducer(initialState, setCompact(false)).compact).toBe(false);
    });

    it("toggles compact", () => {
        const once = reducer(initialState, toggleCompact());
        expect(once.compact).toBe(false);
        expect(reducer(once, toggleCompact()).compact).toBe(true);
    });
});
