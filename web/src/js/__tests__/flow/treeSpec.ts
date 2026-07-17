import { buildFlowTree, compactTree, flattenTree } from "../../flow/tree";
import type { FlowTreeNode } from "../../flow/tree";
import { THTTPFlow, TTCPFlow } from "../ducks/_tflow";
import type { HTTPFlow } from "../../flow";

interface HttpOpts {
    id?: string;
    scheme?: string;
    host?: string;
    port?: number;
    path?: string;
    method?: string;
    status?: number;
    withResponse?: boolean;
    withError?: boolean;
}

function httpFlow(opts: HttpOpts = {}): HTTPFlow {
    const f: HTTPFlow = THTTPFlow();
    f.id = opts.id ?? Math.random().toString(36).slice(2);
    f.request.scheme = opts.scheme ?? "https";
    f.request.host = opts.host ?? "example.com";
    f.request.pretty_host = opts.host ?? "example.com";
    f.request.port = opts.port ?? 443;
    f.request.path = opts.path ?? "/";
    f.request.method = opts.method ?? "GET";
    // Defaults: clean flow with a response and no error, so aggregates are
    // predictable. Individual tests opt into pending/error.
    f.error = undefined;
    if (opts.withError) {
        f.error = { msg: "boom", timestamp: 1 };
    }
    if (opts.withResponse === false) {
        f.response = undefined;
    } else {
        f.response!.status_code = opts.status ?? 200;
    }
    return f;
}

/** Depth-first lookup of the first node whose key ends with `suffix`. */
function findNode(
    roots: FlowTreeNode[],
    suffix: string,
): FlowTreeNode | undefined {
    for (const root of roots) {
        if (root.key.endsWith(suffix)) return root;
        const found = findNode(root.children, suffix);
        if (found) return found;
    }
    return undefined;
}

describe("buildFlowTree", () => {
    it("groups flows by scheme://host[:port] root", () => {
        const tree = buildFlowTree([
            httpFlow({ host: "a.com", path: "/x" }),
            httpFlow({ host: "b.com", path: "/y" }),
            httpFlow({ host: "a.com", path: "/z" }),
        ]);
        expect(tree.map((r) => r.key).sort()).toEqual([
            "https://a.com",
            "https://b.com",
        ]);
    });

    it("includes a non-default port in the root key", () => {
        const tree = buildFlowTree([
            httpFlow({ scheme: "http", host: "a.com", port: 8080, path: "/x" }),
        ]);
        expect(tree[0].key).toBe("http://a.com:8080");
    });

    it("nests path segments as folders with a leaf at the end", () => {
        const tree = buildFlowTree([
            httpFlow({ host: "a.com", path: "/api/v2/users" }),
        ]);
        const api = findNode(tree, "/api")!;
        expect(api.kind).toBe("folder");
        const v2 = findNode(tree, "/api/v2")!;
        expect(v2.kind).toBe("folder");
        const users = findNode(tree, "/api/v2/users")!;
        expect(users.kind).toBe("leaf");
        expect(users.flows).toHaveLength(1);
    });

    it("handles a path that is both a folder and a leaf", () => {
        const tree = buildFlowTree([
            httpFlow({ id: "onapi", host: "a.com", path: "/api" }),
            httpFlow({ id: "onusers", host: "a.com", path: "/api/users" }),
        ]);
        const api = findNode(tree, "/api")!;
        // /api has its own flow AND a child leaf /api/users.
        expect(api.flows.map((f) => f.id)).toEqual(["onapi"]);
        expect(api.children).toHaveLength(1);
        expect(api.children[0].key).toBe("https://a.com/api/users");
        // A node with children is a folder even though it holds a flow.
        expect(api.kind).toBe("folder");
    });

    it("collects repeat calls to the same path under one leaf", () => {
        const tree = buildFlowTree([
            httpFlow({ id: "c1", host: "a.com", path: "/ping" }),
            httpFlow({ id: "c2", host: "a.com", path: "/ping" }),
            httpFlow({ id: "c3", host: "a.com", path: "/ping" }),
        ]);
        const ping = findNode(tree, "/ping")!;
        expect(ping.kind).toBe("leaf");
        expect(ping.flows.map((f) => f.id)).toEqual(["c1", "c2", "c3"]);
        expect(ping.flowCount).toBe(3);
    });

    it("groups non-HTTP flows under a synthetic host node", () => {
        const tcp = TTCPFlow();
        const tree = buildFlowTree([tcp]);
        expect(tree).toHaveLength(1);
        expect(tree[0].kind).toBe("host");
        // The flow lives directly on the host node (no path structure).
        expect(tree[0].flows.map((f) => f.id)).toEqual([tcp.id]);
    });

    it("bubbles aggregate counts and size up to ancestors", () => {
        const tree = buildFlowTree([
            httpFlow({ host: "a.com", path: "/api/ok" }),
            httpFlow({ host: "a.com", path: "/api/err", withError: true }),
            httpFlow({
                host: "a.com",
                path: "/api/pending",
                withResponse: false,
            }),
        ]);
        const root = tree[0];
        expect(root.flowCount).toBe(3);
        expect(root.errorCount).toBe(1);
        expect(root.pendingCount).toBe(1);
        // Each clean http flow totals request(7) + response(7) = 14; the pending
        // one has no response body counted, the errored one still has a body.
        expect(root.totalSize).toBeGreaterThan(0);
        const api = findNode(tree, "/api")!;
        expect(api.flowCount).toBe(3);
        expect(api.errorCount).toBe(1);
    });

    it("orders folders before leaves, then alphabetically", () => {
        const tree = buildFlowTree([
            httpFlow({ host: "a.com", path: "/zebra" }), // leaf
            httpFlow({ host: "a.com", path: "/alpha/x" }), // folder alpha
            httpFlow({ host: "a.com", path: "/beta/y" }), // folder beta
        ]);
        expect(tree[0].children.map((c) => c.label)).toEqual([
            "alpha",
            "beta",
            "zebra",
        ]);
    });

    it("marks highlighted flows and bubbles highlight to ancestors", () => {
        const flows = [
            httpFlow({ id: "hl", host: "a.com", path: "/api/users" }),
            httpFlow({ id: "plain", host: "a.com", path: "/api/orders" }),
        ];
        const tree = buildFlowTree(flows, new Set(["hl"]));
        const root = tree[0];
        expect(root.hasHighlight).toBe(true);
        expect(findNode(tree, "/api/users")!.hasHighlight).toBe(true);
        expect(findNode(tree, "/api/orders")!.hasHighlight).toBe(false);
    });

    it("strips the query string when grouping", () => {
        const tree = buildFlowTree([
            httpFlow({ id: "q1", host: "a.com", path: "/search?q=1" }),
            httpFlow({ id: "q2", host: "a.com", path: "/search?q=2" }),
        ]);
        const search = findNode(tree, "/search")!;
        expect(search.flows.map((f) => f.id).sort()).toEqual(["q1", "q2"]);
    });
});

describe("flattenTree", () => {
    const flows = [
        httpFlow({ id: "u1", host: "a.com", path: "/api/users" }),
        httpFlow({ id: "u2", host: "a.com", path: "/api/users" }),
        httpFlow({ id: "o1", host: "a.com", path: "/api/orders" }),
    ];

    it("shows only roots when nothing is expanded", () => {
        const tree = buildFlowTree(flows);
        const rows = flattenTree(tree, new Set());
        expect(rows).toHaveLength(1);
        expect(rows[0].node.kind).toBe("host");
        expect(rows[0].expanded).toBe(false);
        expect(rows[0].expandable).toBe(true);
    });

    it("reveals children of expanded nodes", () => {
        const tree = buildFlowTree(flows);
        const rootKey = tree[0].key;
        const apiKey = `${rootKey}/api`;
        const rows = flattenTree(tree, new Set([rootKey, apiKey]));
        const keys = rows.map((r) => r.node.key);
        expect(keys).toContain(`${rootKey}/api/users`);
        expect(keys).toContain(`${rootKey}/api/orders`);
    });

    it("expands a multi-flow leaf into one row per flow", () => {
        const tree = buildFlowTree(flows);
        const rootKey = tree[0].key;
        const usersKey = `${rootKey}/api/users`;
        const rows = flattenTree(
            tree,
            new Set([rootKey, `${rootKey}/api`, usersKey]),
        );
        const flowRows = rows.filter(
            (r) => r.node.key === usersKey && r.flow !== undefined,
        );
        expect(flowRows.map((r) => r.flow!.id).sort()).toEqual(["u1", "u2"]);
    });

    it("labels a header row with the full path and its flow entries with the last segment", () => {
        // A compacted multi-flow leaf: the header spells out the full path, but
        // its nested flow-entry rows show only the last segment.
        const tree = compactTree(
            buildFlowTree([
                httpFlow({ id: "t1", host: "a.com", path: "/oauth2/v2/token" }),
                httpFlow({ id: "t2", host: "a.com", path: "/oauth2/v2/token" }),
            ]),
        );
        const rootKey = tree[0].key;
        const tokenKey = `${rootKey}/oauth2/v2/token`;
        const rows = flattenTree(tree, new Set([rootKey, tokenKey]));
        const header = rows.find(
            (r) => r.node.key === tokenKey && r.flow === undefined,
        )!;
        expect(header.label).toBe("oauth2/v2/token");
        const entries = rows.filter(
            (r) => r.node.key === tokenKey && r.flow !== undefined,
        );
        expect(entries).toHaveLength(2);
        expect(entries.every((r) => r.label === "token")).toBe(true);
    });

    it("carries the flow directly on a single-flow leaf", () => {
        const tree = buildFlowTree([
            httpFlow({ id: "solo", host: "a.com", path: "/api/solo" }),
        ]);
        const rootKey = tree[0].key;
        const rows = flattenTree(tree, new Set([rootKey, `${rootKey}/api`]));
        const leaf = rows.find((r) => r.node.key.endsWith("/solo"))!;
        expect(leaf.flow?.id).toBe("solo");
        expect(leaf.expandable).toBe(false);
    });

    it("renders a folder's own flow as a selectable child row", () => {
        // /api is directly addressable and also a prefix of /api/users, so its
        // node is a folder that still owns a flow. Expanding it must surface
        // that flow as its own selectable row, above the nested subfolder.
        const tree = buildFlowTree([
            httpFlow({ id: "onapi", host: "a.com", path: "/api" }),
            httpFlow({ id: "onusers", host: "a.com", path: "/api/users" }),
        ]);
        const rootKey = tree[0].key;
        const apiKey = `${rootKey}/api`;
        const rows = flattenTree(tree, new Set([rootKey, apiKey]));
        const apiRow = rows.find(
            (r) => r.node.key === apiKey && r.flow === undefined,
        )!;
        expect(apiRow.expandable).toBe(true);
        const ownFlowRow = rows.find(
            (r) => r.node.key === apiKey && r.flow !== undefined,
        );
        expect(ownFlowRow?.flow?.id).toBe("onapi");
        expect(ownFlowRow?.expandable).toBe(false);
        // The directly-addressable flow row precedes the nested subfolder.
        const apiFlowIdx = rows.findIndex(
            (r) => r.node.key === apiKey && r.flow !== undefined,
        );
        const usersIdx = rows.findIndex(
            (r) => r.node.key === `${rootKey}/api/users`,
        );
        expect(apiFlowIdx).toBeLessThan(usersIdx);
    });
});

describe("compactTree", () => {
    it("merges a single-child folder chain into one labelled row", () => {
        const tree = buildFlowTree([
            httpFlow({ id: "u", host: "a.com", path: "/api/v2/users" }),
        ]);
        const compact = compactTree(tree);
        // Host stays distinct; the whole /api/v2/users chain folds into the host.
        expect(compact).toHaveLength(1);
        expect(compact[0].kind).toBe("host");
        expect(compact[0].children).toHaveLength(1);
        const merged = compact[0].children[0];
        expect(merged.label).toBe("api/v2/users");
        expect(merged.children).toHaveLength(0);
        expect(merged.flows.map((f) => f.id)).toEqual(["u"]);
        // Depth is renumbered for the collapsed shape.
        expect(merged.depth).toBe(1);
    });

    it("stops folding where a folder branches", () => {
        const tree = buildFlowTree([
            httpFlow({ id: "x", host: "a.com", path: "/api/v1/users" }),
            httpFlow({ id: "y", host: "a.com", path: "/api/v1/orders" }),
        ]);
        const root = compactTree(tree)[0];
        // /api/v1 collapses to one node, which then branches into two leaves.
        expect(root.children).toHaveLength(1);
        const branch = root.children[0];
        expect(branch.label).toBe("api/v1");
        expect(branch.children.map((c) => c.label).sort()).toEqual([
            "orders",
            "users",
        ]);
    });

    it("does not fold a folder that holds its own flow", () => {
        const tree = buildFlowTree([
            httpFlow({ id: "onapi", host: "a.com", path: "/api" }),
            httpFlow({ id: "onusers", host: "a.com", path: "/api/users" }),
        ]);
        const root = compactTree(tree)[0];
        // /api is directly addressable, so it must not merge with /api/users.
        expect(root.children).toHaveLength(1);
        expect(root.children[0].label).toBe("api");
        expect(root.children[0].children.map((c) => c.label)).toEqual([
            "users",
        ]);
    });

    it("keeps the deepest node key so expansion state is stable", () => {
        const tree = buildFlowTree([
            httpFlow({ id: "u", host: "a.com", path: "/api/v2/users" }),
        ]);
        const merged = compactTree(tree)[0].children[0];
        expect(merged.key).toBe(tree[0].key + "/api/v2/users");
    });
});
