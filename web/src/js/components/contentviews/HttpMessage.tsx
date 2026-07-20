import React, { useCallback, useEffect, useRef, useState } from "react";
import type { HTTPFlow, HTTPMessage } from "../../flow";
import { useAppDispatch, useAppSelector } from "../../ducks";
import { setContentViewFor } from "../../ducks/ui/flow";
import type { ContentViewData } from "./useContentView";
import { useContentView } from "./useContentView";
import { useContent } from "./useContent";
import { MessageUtils } from "../../flow/utils";
import FileChooser from "../common/FileChooser";
import * as flowActions from "../../ducks/flows";
import { uploadContent } from "../../ducks/flows";
import Button from "../common/Button";
import CodeEditor from "./CodeEditor";
import ContentRenderer from "./ContentRenderer";
import ViewSelector, { JSON_TREE_VIEW } from "./ViewSelector";
import JsonTree from "./JsonTree";
import type { JsonValue } from "./JsonTree";
import { SyntaxHighlight } from "../../backends/consts";
import { copyViewContentDataToClipboard, fetchApi } from "../../utils";

// Mirrors the backend JSON contentview's render_priority (see _view_json.py):
// application/json, application/json-rpc, or any application/*+json subtype.
function isJsonContentType(contentType: string | undefined): boolean {
    if (!contentType) return false;
    const ct = contentType.toLowerCase();
    return (
        ct === "application/json" ||
        ct === "application/json-rpc" ||
        (ct.startsWith("application/") && ct.endsWith("json"))
    );
}

function tryParseJson(text: string | undefined): { value: JsonValue } | null {
    if (text === undefined || text === "") return null;
    try {
        return { value: JSON.parse(text) as JsonValue };
    } catch {
        return null;
    }
}

type HttpMessageProps = {
    flow: HTTPFlow;
    message: HTTPMessage;
};

export default function HttpMessage({ flow, message }: HttpMessageProps) {
    const [isEdited, setIsEdited] = useState<boolean>(false);
    if (isEdited) {
        return (
            <HttpMessageEdit
                flow={flow}
                message={message}
                stopEdit={() => setIsEdited(false)}
            />
        );
    } else {
        return (
            <HttpMessageView
                flow={flow}
                message={message}
                startEdit={() => setIsEdited(true)}
            />
        );
    }
}

type HttpMessageEditProps = {
    flow: HTTPFlow;
    message: HTTPMessage;
    stopEdit: () => void;
};

function HttpMessageEdit({ flow, message, stopEdit }: HttpMessageEditProps) {
    const dispatch = useAppDispatch();

    const part = flow.request === message ? "request" : "response";
    const url = MessageUtils.getContentURL(flow, message);
    const content = useContent(url, message.contentHash);
    const [editedContent, setEditedContent] = useState<string>();

    const isJson = isJsonContentType(MessageUtils.getContentType(message));
    const [jsonData, setJsonData] = useState<JsonValue | undefined>();
    const [jsonMode, setJsonMode] = useState(false);
    const [rawMode, setRawMode] = useState(false);
    const [rawText, setRawText] = useState<string>("");
    // `save` may run from Done's click handler in the same event tick that a
    // focused value editor commits on blur (mousedown-blur fires before click).
    // React state updates are async, so read the freshly-committed value from
    // refs kept in sync synchronously instead of the stale render closure.
    const jsonDataRef = useRef<JsonValue | undefined>(undefined);
    const rawTextRef = useRef<string>("");
    const setJson = useCallback((v: JsonValue | undefined) => {
        jsonDataRef.current = v;
        setJsonData(v);
    }, []);
    const setRaw = useCallback((t: string) => {
        rawTextRef.current = t;
        setRawText(t);
    }, []);
    useEffect(() => {
        const parsed = isJson ? tryParseJson(content) : null;
        if (parsed) {
            setJson(parsed.value);
            setJsonMode(true);
        } else {
            setJsonMode(false);
        }
    }, [content, isJson]);

    const toggleRaw = () => {
        if (!rawMode) {
            setRaw(JSON.stringify(jsonData, null, 4));
            setRawMode(true);
        } else {
            const parsed = tryParseJson(rawText);
            if (parsed) setJson(parsed.value);
            setRawMode(false);
        }
    };

    const save = async () => {
        let newContent: string;
        if (jsonMode && rawMode) {
            newContent = rawTextRef.current;
        } else if (jsonMode && jsonDataRef.current !== undefined) {
            newContent = JSON.stringify(jsonDataRef.current);
        } else {
            newContent = editedContent ?? content ?? "";
        }
        await dispatch(
            flowActions.update(flow, {
                [part]: { content: newContent },
            }),
        );
        stopEdit();
    };

    let body: React.ReactNode;
    if (isJson && content === undefined) {
        body = <div className="json-tree">Loading…</div>;
    } else if (jsonMode && rawMode) {
        body = (
            <CodeEditor
                initialContent={rawText}
                language={SyntaxHighlight.JAVASCRIPT}
                onChange={(t) => {
                    setRaw(t);
                    const parsed = tryParseJson(t);
                    if (parsed) setJson(parsed.value);
                }}
            />
        );
    } else if (jsonMode && jsonData !== undefined) {
        body = <JsonTree data={jsonData} editable onChange={setJson} />;
    } else {
        body = (
            <CodeEditor
                initialContent={content || ""}
                onChange={setEditedContent}
            />
        );
    }

    return (
        <div className="contentview" key="edit">
            <div className="controls">
                <h5>[Editing]</h5>
                <Button
                    onClick={save}
                    icon="confirm"
                    iconClassName="text-success"
                    className="btn-xs"
                >
                    Done
                </Button>
                &nbsp;
                <Button
                    onClick={() => stopEdit()}
                    icon="close"
                    iconClassName="text-danger"
                    className="btn-xs"
                >
                    Cancel
                </Button>
                {jsonMode && (
                    <>
                        &nbsp;
                        <Button
                            onClick={toggleRaw}
                            icon={rawMode ? "fold" : "edit"}
                            className="btn-xs"
                        >
                            {rawMode ? "Tree" : "Raw"}
                        </Button>
                    </>
                )}
            </div>
            {body}
        </div>
    );
}

type HttpMessageViewProps = {
    flow: HTTPFlow;
    message: HTTPMessage;
    startEdit: () => void;
};

function HttpMessageView({ flow, message, startEdit }: HttpMessageViewProps) {
    const dispatch = useAppDispatch();
    const part = flow.request === message ? "request" : "response";
    const contentView = useAppSelector(
        (state) => state.ui.flow.contentViewFor[flow.id + part] || "Auto",
    );

    const [maxLines, setMaxLines] = useState<number>(
        useAppSelector((state) => state.options.content_view_lines_cutoff),
    );
    const showMore = useCallback(
        () => setMaxLines(Math.max(1024, maxLines * 2)),
        [maxLines],
    );

    const isJson = isJsonContentType(MessageUtils.getContentType(message));
    const view = contentView.toLowerCase();
    // "auto" (default) auto-detects a JSON body; "json tree" forces the tree.
    // Both render via the backend "json" view, which we then parse into a tree.
    const wantJsonTree =
        isJson && (view === "auto" || view === JSON_TREE_VIEW);
    const backendView = view === JSON_TREE_VIEW ? "json" : contentView;

    const contentViewData = useContentView(
        flow,
        message,
        backendView,
        wantJsonTree ? undefined : maxLines + 1,
        message.contentHash,
    );

    const jsonData =
        wantJsonTree && contentViewData?.view_name === "JSON"
            ? tryParseJson(contentViewData.text)
            : null;

    let desc: string;
    if (message.contentLength === 0) {
        desc = "No content";
    } else if (contentViewData === undefined) {
        desc = "Loading...";
    } else {
        desc =
            `${contentViewData.view_name} ${contentViewData.description}`.trimEnd();
    }

    return (
        <div className="contentview" key="view">
            <div className="controls">
                <h5>{desc}</h5>
                {contentViewData && contentViewData?.text.length > 0 && (
                    <CopyButton flow={flow} message={message} />
                )}
                &nbsp;
                <Button onClick={startEdit} icon="edit" className="btn-xs">
                    Edit
                </Button>
                &nbsp;
                <FileChooser
                    icon="upload"
                    text="Replace"
                    title="Upload a file to replace the content."
                    onOpenFile={(content) =>
                        dispatch(uploadContent(flow, content, part))
                    }
                    className="btn btn-default btn-xs"
                />
                &nbsp;
                <ViewSelector
                    value={contentView}
                    isJson={isJson}
                    onChange={(cv) =>
                        dispatch(
                            setContentViewFor({
                                messageId: flow.id + part,
                                contentView: cv,
                            }),
                        )
                    }
                />
            </div>
            {ViewImage.matches(message) && (
                <ViewImage flow={flow} message={message} />
            )}
            {jsonData ? (
                <JsonTree data={jsonData.value} />
            ) : (
                <ContentRenderer
                    content={contentViewData?.text ?? ""}
                    maxLines={maxLines}
                    showMore={showMore}
                />
            )}
        </div>
    );
}

type CopyButtonProps = {
    flow: HTTPFlow;
    message: HTTPMessage;
};

function CopyButton({ flow, message }: CopyButtonProps) {
    const part = flow.request === message ? "request" : "response";
    const contentView = useAppSelector(
        (state) => state.ui.flow.contentViewFor[flow.id + part] || "Auto",
    );

    const [isCopied, setIsCopied] = useState<boolean>(false);
    const [isFetchingFullContent, setIsFetchingFullContent] =
        useState<boolean>(false);

    const handleClickCopyButton = async () => {
        try {
            const view =
                contentView.toLowerCase() === JSON_TREE_VIEW
                    ? "json"
                    : contentView;
            const url = MessageUtils.getContentURL(flow, message, view);
            setIsFetchingFullContent(true);

            const response = await fetchApi(url);
            if (!response.ok) {
                throw new Error(
                    `${response.status} ${response.statusText}`.trim(),
                );
            }

            const data: ContentViewData = await response.json();

            await copyViewContentDataToClipboard(data);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (e) {
            console.error(e);
        } finally {
            setIsFetchingFullContent(false);
        }
    };

    return (
        <Button
            onClick={handleClickCopyButton}
            icon="clipboard"
            className="btn-xs"
            disabled={isFetchingFullContent}
        >
            {isCopied ? "Copied!" : "Copy"}
        </Button>
    );
}

const isImage =
    /^image\/(png|jpe?g|gif|webp|avif|vnd\.microsoft\.icon|x-icon|svg\+xml)$/i;
ViewImage.matches = (msg: HTTPMessage) =>
    isImage.test(MessageUtils.getContentType(msg) || "");

type ViewImageProps = {
    flow: HTTPFlow;
    message: HTTPMessage;
};

export function ViewImage({ flow, message }: ViewImageProps) {
    return (
        <div className="flowview-image">
            <img
                src={MessageUtils.getContentURL(flow, message)}
                alt="preview"
                className="img-thumbnail"
            />
        </div>
    );
}
