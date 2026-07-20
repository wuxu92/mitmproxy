import * as React from "react";
import { useRef, useState } from "react";
import classnames from "classnames";
import Icon from "../common/Icon";
import type { IconName } from "../common/Icon";
import { copyToClipboard } from "../../utils";

export type JsonValue =
    | null
    | boolean
    | number
    | string
    | JsonValue[]
    | { [key: string]: JsonValue };

function isContainer(
    value: JsonValue,
): value is JsonValue[] | { [key: string]: JsonValue } {
    return value !== null && typeof value === "object";
}

/** Rebuild an object with `oldKey` renamed to `newKey`, preserving insertion order. */
function renameKey(
    obj: { [key: string]: JsonValue },
    oldKey: string,
    newKey: string,
): { [key: string]: JsonValue } {
    const out: { [key: string]: JsonValue } = {};
    for (const [k, v] of Object.entries(obj)) {
        out[k === oldKey ? newKey : k] = v;
    }
    return out;
}

/** Coerce edited text back into a JSON scalar, preserving the original type. */
function coerce(text: string, original: JsonValue): JsonValue {
    if (typeof original === "number") {
        const n = Number(text);
        return text.trim() !== "" && !Number.isNaN(n) ? n : text;
    }
    if (typeof original === "string") {
        return text;
    }
    // original is null: allow it to become any scalar.
    if (text === "null") return null;
    if (text === "true") return true;
    if (text === "false") return false;
    const n = Number(text);
    if (text.trim() !== "" && !Number.isNaN(n)) return n;
    return text;
}

type PathSegment = string | number;

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** Render a path as a JSONPath string, e.g. `$.a.b[0]['weird key']`. */
function formatJsonPath(path: PathSegment[]): string {
    let out = "$";
    for (const seg of path) {
        if (typeof seg === "number") {
            out += `[${seg}]`;
        } else if (IDENTIFIER.test(seg)) {
            out += `.${seg}`;
        } else {
            out += `['${seg.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}']`;
        }
    }
    return out;
}

/** Serialize a node's value for copying: strings raw, everything else as JSON. */
function formatValue(value: JsonValue): string {
    if (typeof value === "string") return value;
    return JSON.stringify(value, null, isContainer(value) ? 2 : undefined);
}

interface CopyButtonProps {
    icon: IconName;
    label: string;
    getText: () => string;
    className: string;
}

/** Hover-revealed button that copies text to the clipboard with brief feedback. */
function CopyButton({ icon, label, getText, className }: CopyButtonProps) {
    const [copied, setCopied] = useState(false);
    const reset = useRef<number | undefined>(undefined);
    const copy = () => {
        copyToClipboard(Promise.resolve(getText()));
        setCopied(true);
        clearTimeout(reset.current);
        reset.current = window.setTimeout(() => setCopied(false), 1000);
    };
    return (
        <span
            className={classnames("json-btn json-copy", className, {
                "json-copy-done": copied,
            })}
            title={copied ? "Copied!" : label}
            onClick={copy}
        >
            <Icon
                name={copied ? "confirm" : icon}
                size={12}
                aria-label={label}
            />
        </span>
    );
}

interface JsonTreeProps {
    data: JsonValue;
    editable?: boolean;
    onChange?: (data: JsonValue) => void;
}

export default function JsonTree({
    data,
    editable = false,
    onChange,
}: JsonTreeProps) {
    return (
        <div className="json-tree">
            <JsonNode
                value={data}
                path={[]}
                editable={editable}
                onChangeValue={(v) => onChange?.(v)}
            />
        </div>
    );
}

interface JsonNodeProps {
    name?: string;
    isIndex?: boolean;
    value: JsonValue;
    path: PathSegment[];
    editable: boolean;
    onChangeValue: (value: JsonValue) => void;
    onRenameKey?: (newKey: string) => void;
    onDelete?: () => void;
}

function JsonNode({
    name,
    isIndex = false,
    value,
    path,
    editable,
    onChangeValue,
    onRenameKey,
    onDelete,
}: JsonNodeProps) {
    const [collapsed, setCollapsed] = useState(false);

    const keyLabel =
        name === undefined ? null : isIndex ? (
            <span className="json-index">{name}:</span>
        ) : editable && onRenameKey ? (
            <EditableKey name={name} onRename={onRenameKey} />
        ) : (
            <span className="json-key">{JSON.stringify(name)}</span>
        );

    const deleteButton = editable && onDelete && (
        <Icon
            name="delete"
            size={12}
            className="json-btn json-delete"
            aria-label="delete entry"
            onClick={onDelete}
        />
    );

    const copyButtons = path.length > 0 && (
        <>
            <CopyButton
                icon="copy"
                label="Copy value"
                className="json-copy-value"
                getText={() => formatValue(value)}
            />
            <CopyButton
                icon="files"
                label="Copy JSON path"
                className="json-copy-path"
                getText={() => formatJsonPath(path)}
            />
        </>
    );

    if (!isContainer(value)) {
        return (
            <div className="json-row">
                {keyLabel}
                {keyLabel && <span className="json-punct">: </span>}
                <PrimitiveValue
                    value={value}
                    editable={editable}
                    onChange={onChangeValue}
                />
                {copyButtons}
                {deleteButton}
            </div>
        );
    }

    const isArray = Array.isArray(value);
    const entries: [string, JsonValue][] = isArray
        ? value.map((v, i) => [String(i), v])
        : Object.entries(value);
    const [open, close] = isArray ? ["[", "]"] : ["{", "}"];
    const summary = isArray
        ? `${entries.length} ${entries.length === 1 ? "item" : "items"}`
        : `${entries.length} ${entries.length === 1 ? "key" : "keys"}`;

    const updateChild = (key: string, index: number, childValue: JsonValue) => {
        if (isArray) {
            const next = value.slice();
            next[index] = childValue;
            onChangeValue(next);
        } else {
            onChangeValue({ ...value, [key]: childValue });
        }
    };
    const deleteChild = (key: string, index: number) => {
        if (isArray) {
            const next = value.slice();
            next.splice(index, 1);
            onChangeValue(next);
        } else {
            const next = { ...value };
            delete next[key];
            onChangeValue(next);
        }
    };
    const renameChild = (key: string, newKey: string) => {
        if (!isArray) onChangeValue(renameKey(value, key, newKey));
    };
    const addChild = () => {
        if (isArray) {
            onChangeValue([...value, ""]);
        } else {
            const next = { ...value };
            let key = "key",
                i = 1;
            while (key in next) key = `key${i++}`;
            next[key] = "";
            onChangeValue(next);
        }
    };

    return (
        <div className="json-node">
            <div className="json-row">
                <span
                    className="json-toggle"
                    onClick={() => setCollapsed(!collapsed)}
                >
                    <Icon
                        name={collapsed ? "chevronRight" : "chevronDown"}
                        size={14}
                    />
                </span>
                {keyLabel}
                {keyLabel && <span className="json-punct">: </span>}
                <span className="json-punct">{open}</span>
                {collapsed && (
                    <span
                        className="json-summary"
                        onClick={() => setCollapsed(false)}
                    >
                        {" … "}
                        {close}
                        <span className="json-count"> {summary}</span>
                    </span>
                )}
                {editable && (
                    <Icon
                        name="addSquare"
                        size={12}
                        className="json-btn json-add"
                        aria-label="add entry"
                        onClick={addChild}
                    />
                )}
                {copyButtons}
                {deleteButton}
            </div>
            {!collapsed && (
                <>
                    <div className="json-children">
                        {entries.map(([key, childValue], index) => (
                            <JsonNode
                                key={isArray ? index : key}
                                name={key}
                                isIndex={isArray}
                                value={childValue}
                                path={[...path, isArray ? index : key]}
                                editable={editable}
                                onChangeValue={(v) =>
                                    updateChild(key, index, v)
                                }
                                onRenameKey={
                                    isArray
                                        ? undefined
                                        : (nk) => renameChild(key, nk)
                                }
                                onDelete={() => deleteChild(key, index)}
                            />
                        ))}
                    </div>
                    <div className="json-row json-close">
                        <span className="json-punct">{close}</span>
                    </div>
                </>
            )}
        </div>
    );
}

interface EditableKeyProps {
    name: string;
    onRename: (newKey: string) => void;
}

function EditableKey({ name, onRename }: EditableKeyProps) {
    const [editing, setEditing] = useState(false);
    if (!editing) {
        return (
            <span
                className="json-key json-editable"
                title="Click to edit key"
                onClick={() => setEditing(true)}
            >
                {JSON.stringify(name)}
            </span>
        );
    }
    return (
        <TextEditor
            className="json-key json-key-edit"
            ariaLabel="edit key"
            initial={name}
            onCommit={(text) => {
                if (text !== name) onRename(text);
                setEditing(false);
            }}
            onCancel={() => setEditing(false)}
        />
    );
}

function renderStatic(
    value: null | boolean | number | string,
): React.ReactElement {
    if (value === null) return <span className="json-null">null</span>;
    switch (typeof value) {
        case "string":
            return <span className="json-string">{JSON.stringify(value)}</span>;
        case "number":
            return <span className="json-number">{String(value)}</span>;
        default:
            return <span className="json-boolean">{String(value)}</span>;
    }
}

interface PrimitiveValueProps {
    value: null | boolean | number | string;
    editable: boolean;
    onChange: (value: JsonValue) => void;
}

function PrimitiveValue({ value, editable, onChange }: PrimitiveValueProps) {
    const [editing, setEditing] = useState(false);
    if (!editable || !editing) {
        const content = renderStatic(value);
        if (!editable) return content;
        return (
            <span
                className="json-editable"
                title="Click to edit value"
                onClick={() => setEditing(true)}
            >
                {content}
            </span>
        );
    }
    return (
        <PrimitiveEditor
            value={value}
            onCommit={(v) => {
                onChange(v);
                setEditing(false);
            }}
            onCancel={() => setEditing(false)}
        />
    );
}

function PrimitiveEditor({
    value,
    onCommit,
    onCancel,
}: {
    value: null | boolean | number | string;
    onCommit: (value: JsonValue) => void;
    onCancel: () => void;
}) {
    if (typeof value === "boolean") {
        return (
            <select
                className="json-value-edit json-boolean"
                aria-label="edit value"
                autoFocus
                defaultValue={String(value)}
                onChange={(e) => onCommit(e.target.value === "true")}
                onBlur={onCancel}
                onKeyDown={(e) => {
                    if (e.key === "Escape") onCancel();
                }}
            >
                <option value="true">true</option>
                <option value="false">false</option>
            </select>
        );
    }
    const typeClass =
        typeof value === "number"
            ? "json-number"
            : value === null
              ? "json-null"
              : "json-string";
    return (
        <TextEditor
            className={`json-value-edit ${typeClass}`}
            ariaLabel="edit value"
            initial={value === null ? "null" : String(value)}
            onCommit={(text) => onCommit(coerce(text, value))}
            onCancel={onCancel}
        />
    );
}

interface TextEditorProps {
    className: string;
    ariaLabel: string;
    initial: string;
    onCommit: (text: string) => void;
    onCancel: () => void;
}

function TextEditor({
    className,
    ariaLabel,
    initial,
    onCommit,
    onCancel,
}: TextEditorProps) {
    const [text, setText] = useState(initial);
    const cancelled = useRef(false);
    return (
        <input
            className={className}
            aria-label={ariaLabel}
            autoFocus
            value={text}
            size={Math.max(text.length, 1)}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => (cancelled.current ? onCancel() : onCommit(text))}
            onKeyDown={(e) => {
                if (e.key === "Enter") {
                    (e.target as HTMLInputElement).blur();
                } else if (e.key === "Escape") {
                    cancelled.current = true;
                    (e.target as HTMLInputElement).blur();
                }
            }}
        />
    );
}
