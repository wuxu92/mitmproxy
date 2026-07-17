import * as React from "react";
import { act, render, fireEvent, screen } from "../test-utils";
import FlowTree from "../../components/FlowTree";
import { TStore } from "../ducks/tutils";
import { testState } from "../ducks/tutils";
import { THTTPFlow } from "../ducks/_tflow";
import type { HTTPFlow } from "../../flow";
import type { RootState } from "../../ducks";

// jsdom has no layout engine or ResizeObserver, so @tanstack/react-virtual
// would measure a 0x0 viewport and render no rows. Give the scroll container a
// real height and a no-op ResizeObserver so the virtualizer produces rows.
beforeAll(() => {
    class MockResizeObserver {
        cb: ResizeObserverCallback;
        constructor(cb: ResizeObserverCallback) {
            this.cb = cb;
        }
        observe(el: Element) {
            // Fire synchronously so the virtualizer measures a non-zero rect.
            this.cb(
                [{ target: el } as ResizeObserverEntry],
                this as unknown as ResizeObserver,
            );
        }
        unobserve() {}
        disconnect() {}
    }
    // jsdom lacks ResizeObserver; install the stub on the global object.
    globalThis.ResizeObserver =
        MockResizeObserver as unknown as typeof ResizeObserver;
    // @tanstack/virtual-core reads offsetWidth/offsetHeight for the viewport.
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get: () => 600,
    });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
        configurable: true,
        get: () => 400,
    });
});

function flow(id: string, path: string): HTTPFlow {
    const f: HTTPFlow = THTTPFlow();
    f.id = id;
    f.request.scheme = "https";
    f.request.host = "a.com";
    f.request.pretty_host = "a.com";
    f.request.port = 443;
    f.request.path = path;
    f.error = undefined;
    return f;
}

function storeWith(
    view: HTTPFlow[],
    expanded: Set<string> = new Set(),
    compact = false,
) {
    const state: RootState = {
        ...testState,
        flows: {
            ...testState.flows,
            list: view,
            view,
            selected: [],
            selectedIds: new Set(),
            highlightedIds: new Set(),
        },
        ui: {
            ...testState.ui,
            flowtree: { mode: "structure", expanded, autoExpandNew: false, compact },
        },
    } as RootState;
    return TStore(state);
}

const ROOT = "https://a.com";

describe("FlowTree Component", () => {
    it("renders an empty message when there are no rows", () => {
        render(<FlowTree />, { store: storeWith([]) });
        expect(screen.getByText(/no flows match/i)).toBeInTheDocument();
    });

    it("renders a collapsed host node with an aggregate count", () => {
        render(<FlowTree />, {
            store: storeWith([flow("a", "/api/users")]),
        });
        expect(screen.getByText(ROOT)).toBeInTheDocument();
        // The root is collapsed, so the leaf path is not yet visible.
        expect(screen.queryByText("/api/users")).not.toBeInTheDocument();
    });

    it("expands a node on click via toggleNode", () => {
        const store = storeWith([flow("a", "/api/users")]);
        render(<FlowTree />, { store });

        act(() => {
            fireEvent.click(screen.getByText(ROOT));
        });
        expect(store.getState().ui.flowtree.expanded.has(ROOT)).toBe(true);
    });

    it("selects a flow when a leaf row is clicked", () => {
        const store = storeWith(
            [flow("solo", "/api/solo")],
            new Set([ROOT, `${ROOT}/api`]),
        );
        render(<FlowTree />, { store });

        const leaf = screen.getByText("solo");
        act(() => {
            fireEvent.click(leaf);
        });
        expect(store.getState().flows.selected.map((f) => f.id)).toEqual([
            "solo",
        ]);
    });

    it("collapses a single-child folder chain when compact is on", () => {
        const store = storeWith(
            [flow("u", "/api/v2/users")],
            new Set([ROOT]),
            true,
        );
        render(<FlowTree />, { store });
        // The whole /api/v2/users chain renders as one merged row, not three.
        expect(screen.getByText("api/v2/users")).toBeInTheDocument();
        expect(screen.queryByText("api")).not.toBeInTheDocument();
    });
});
