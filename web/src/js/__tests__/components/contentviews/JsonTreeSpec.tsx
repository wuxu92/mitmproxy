import * as React from "react";
import JsonTree from "../../../components/contentviews/JsonTree";
import type { JsonValue } from "../../../components/contentviews/JsonTree";
import { fireEvent, render, screen } from "../../test-utils";

const sample: JsonValue = {
    name: "mitm",
    count: 3,
    enabled: true,
    missing: null,
    tags: ["a", "b"],
    nested: { inner: "x" },
};

test("renders JSON structure with typed values", () => {
    render(<JsonTree data={sample} />);
    expect(screen.getByText('"name"')).toBeInTheDocument();
    expect(screen.getByText('"mitm"')).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("true")).toBeInTheDocument();
    expect(screen.getByText("null")).toBeInTheDocument();
    // container summaries: 2 items (tags), 1 key (nested)
    expect(screen.getByText('"tags"')).toBeInTheDocument();
});

test("collapses and expands a container node", () => {
    render(<JsonTree data={sample} />);
    // "x" from nested object is visible when expanded.
    expect(screen.getByText('"x"')).toBeInTheDocument();

    // Collapse the root object via its toggle (first toggle in the tree).
    const toggles = document.querySelectorAll(".json-toggle");
    fireEvent.click(toggles[0]);
    // Everything below the root is now hidden.
    expect(screen.queryByText('"x"')).toBeNull();
    expect(screen.getByText("6 keys")).toBeInTheDocument();
});

test("edits a value after click and emits updated JSON", () => {
    const changes: JsonValue[] = [];
    render(
        <JsonTree
            data={sample}
            editable
            onChange={(d) => changes.push(d)}
        />,
    );
    // Value shows as static text until clicked.
    expect(screen.queryByDisplayValue("mitm")).toBeNull();
    fireEvent.click(screen.getByText('"mitm"'));
    const input = screen.getByDisplayValue("mitm");
    fireEvent.change(input, { target: { value: "proxy" } });
    fireEvent.blur(input);

    expect(changes).toHaveLength(1);
    expect((changes[0] as { name: string }).name).toBe("proxy");
});

test("Escape cancels an edit without emitting a change", () => {
    const changes: JsonValue[] = [];
    render(
        <JsonTree data={sample} editable onChange={(d) => changes.push(d)} />,
    );
    fireEvent.click(screen.getByText('"mitm"'));
    const input = screen.getByDisplayValue("mitm");
    fireEvent.change(input, { target: { value: "proxy" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);
    expect(changes).toHaveLength(0);
    // Reverts to static display.
    expect(screen.getByText('"mitm"')).toBeInTheDocument();
});

test("coerces numeric edits back to numbers", () => {
    const changes: JsonValue[] = [];
    render(
        <JsonTree data={{ count: 3 }} editable onChange={(d) => changes.push(d)} />,
    );
    fireEvent.click(screen.getByText("3"));
    const input = screen.getByDisplayValue("3");
    fireEvent.change(input, { target: { value: "42" } });
    fireEvent.blur(input);
    expect(changes[0]).toEqual({ count: 42 });
});

test("renames a key after click preserving order", () => {
    const changes: JsonValue[] = [];
    render(
        <JsonTree
            data={{ a: 1, b: 2 }}
            editable
            onChange={(d) => changes.push(d)}
        />,
    );
    fireEvent.click(screen.getByText('"a"'));
    const keyInput = screen.getByDisplayValue("a");
    fireEvent.change(keyInput, { target: { value: "z" } });
    fireEvent.blur(keyInput);
    expect(Object.keys(changes[0] as object)).toEqual(["z", "b"]);
});

test("adds and deletes entries", () => {
    const changes: JsonValue[] = [];
    render(
        <JsonTree
            data={{ a: 1 }}
            editable
            onChange={(d) => changes.push(d)}
        />,
    );
    fireEvent.click(screen.getByLabelText("add entry"));
    expect(changes[changes.length - 1]).toEqual({ a: 1, key: "" });

    // Delete the existing "a" entry.
    fireEvent.click(screen.getByLabelText("delete entry"));
    expect(changes[changes.length - 1]).toEqual({});
});

test("edits array items by index", () => {
    const changes: JsonValue[] = [];
    render(
        <JsonTree
            data={["a", "b"]}
            editable
            onChange={(d) => changes.push(d)}
        />,
    );
    fireEvent.click(screen.getByText('"b"'));
    const input = screen.getByDisplayValue("b");
    fireEvent.change(input, { target: { value: "c" } });
    fireEvent.blur(input);
    expect(changes[0]).toEqual(["a", "c"]);
});
