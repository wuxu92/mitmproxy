import {
    selectFlowTree,
    selectVisibleTreeRows,
    selectAllExpandableKeys,
} from "../../../ducks/flows/treeSelectors";
import { testState } from "../tutils";
import { THTTPFlow } from "../_tflow";
import type { RootState } from "../../../ducks";
import type { HTTPFlow } from "../../../flow";

function flow(id: string, path: string): HTTPFlow {
    const f: HTTPFlow = THTTPFlow();
    f.id = id;
    f.request.pretty_host = "a.com";
    f.request.host = "a.com";
    f.request.scheme = "https";
    f.request.port = 443;
    f.request.path = path;
    f.error = undefined;
    return f;
}

function stateWith(
    view: HTTPFlow[],
    expanded: Set<string> = new Set(),
    highlightedIds: Set<string> = new Set(),
): RootState {
    return {
        ...testState,
        flows: { ...testState.flows, view, highlightedIds },
        ui: {
            ...testState.ui,
            flowtree: { ...testState.ui.flowtree, expanded },
        },
    } as RootState;
}

describe("tree selectors", () => {
    it("memoizes the tree on stable inputs", () => {
        const state = stateWith([flow("a", "/x")]);
        expect(selectFlowTree(state)).toBe(selectFlowTree(state));
    });

    it("recomputes the tree when the view changes", () => {
        const s1 = stateWith([flow("a", "/x")]);
        const s2 = stateWith([flow("a", "/x"), flow("b", "/y")]);
        expect(selectFlowTree(s1)).not.toBe(selectFlowTree(s2));
    });

    it("flattens only expanded branches", () => {
        const collapsed = stateWith([flow("a", "/api/users")]);
        expect(selectVisibleTreeRows(collapsed)).toHaveLength(1);

        const rootKey = "https://a.com";
        const expanded = stateWith(
            [flow("a", "/api/users")],
            new Set([rootKey, `${rootKey}/api`]),
        );
        const keys = selectVisibleTreeRows(expanded).map((r) => r.node.key);
        expect(keys).toContain(`${rootKey}/api/users`);
    });

    it("lists every expandable key for expand-all", () => {
        const state = stateWith([
            flow("a", "/api/users"),
            flow("b", "/api/orders"),
        ]);
        const keys = selectAllExpandableKeys(state);
        expect(keys).toContain("https://a.com");
        expect(keys).toContain("https://a.com/api");
        // Single-flow leaves are not expandable.
        expect(keys).not.toContain("https://a.com/api/users");
    });
});
