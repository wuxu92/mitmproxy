import { TFlow } from "../../ducks/tutils";
import * as React from "react";
import HttpMessage, {
    ViewImage,
} from "../../../components/contentviews/HttpMessage";
import { act, fireEvent, render, screen, waitFor } from "../../test-utils";
import fetchMock, { enableFetchMocks } from "jest-fetch-mock";

enableFetchMocks();

let mockUseCodeEditor = false,
    mockCapturedOnChange: ((content: string) => void) | null = null;

jest.mock("../../../components/contentviews/CodeEditor", () => {
    const actual = jest.requireActual(
        "../../../components/contentviews/CodeEditor",
    );
    return {
        __esModule: true,
        default: ({
            initialContent,
            onChange,
        }: {
            initialContent: string;
            onChange: (c: string) => void;
        }) => {
            if (!mockUseCodeEditor) {
                return actual.default({ initialContent, onChange });
            }
            mockCapturedOnChange = onChange;
            return (
                <textarea
                    data-testid="mock-editor"
                    defaultValue={initialContent}
                />
            );
        },
    };
});

test("HttpMessage", async () => {
    const text = "data\n".repeat(512) + "additional\n".repeat(512);

    const cvd = {
        view_name: "Raw",
        description: "",
        syntax_highlight: "none",
    };

    fetchMock.mockResponses(
        JSON.stringify({
            text: "data\n".repeat(512) + "additional\n",
            ...cvd,
        }),
        JSON.stringify({
            text,
            ...cvd,
        }),
        JSON.stringify({
            text: "rawdata\n".repeat(5),
            ...cvd,
        }),
        "raw content",
        JSON.stringify({
            text: "rawdata\n".repeat(5),
            ...cvd,
        }),
    );

    const tflow = TFlow();
    const { asFragment } = render(
        <HttpMessage flow={tflow} message={tflow.request} />,
    );
    await waitFor(() => screen.getAllByText("data"));
    expect(screen.queryByText("additional")).toBeNull();

    fireEvent.click(screen.getByText("Show more"));
    await waitFor(() => screen.getAllByText("additional"));

    fireEvent.click(screen.getByText("auto"));
    fireEvent.click(screen.getByText("raw"));
    await waitFor(() => screen.getAllByText("rawdata"));
    expect(asFragment()).toMatchSnapshot();

    fireEvent.click(screen.getByText("Edit"));
    expect(asFragment()).toMatchSnapshot();
    fireEvent.click(screen.getByText("Cancel"));

    await waitFor(() => screen.getAllByText("rawdata"));
    expect(asFragment()).toMatchSnapshot();

    await waitFor(() => screen.getByText("Copy"));
    expect(asFragment()).toMatchSnapshot();
});

test("ViewImage", async () => {
    const flow = TFlow();
    const { asFragment } = render(
        <ViewImage flow={flow} message={flow.request} />,
    );
    expect(asFragment()).toMatchSnapshot();
});

test("ViewImage.matches", () => {
    const flow = TFlow();
    const matches = (contentType: string) => {
        flow.response.headers = [["Content-Type", contentType]];
        return ViewImage.matches(flow.response);
    };
    expect(matches("image/png")).toBe(true);
    expect(matches("image/jpeg")).toBe(true);
    expect(matches("image/jpg")).toBe(true);
    expect(matches("image/gif")).toBe(true);
    expect(matches("image/webp")).toBe(true);
    expect(matches("image/avif")).toBe(true);
    expect(matches("image/svg+xml")).toBe(true);
    expect(matches("image/vnd.microsoft.icon")).toBe(true);
    expect(matches("image/x-icon")).toBe(true);
    expect(matches("IMAGE/AVIF")).toBe(true);
    expect(matches("image/heic")).toBe(false);
    expect(matches("application/json")).toBe(false);
    expect(matches("video/mp4")).toBe(false);
});

/*
    This test differs from the one above because clicking the copy button triggers 'handleClickCopyButton'.
    In the previous test, the response contained "raw content," which caused an "invalid JSON response body" error
    when processing the following line:
    `const data: ContentViewData = await response.json()`
    since "raw content" is not valid JSON.
*/
describe("HttpMessage Copy Button", () => {
    beforeEach(() => {
        fetchMock.resetMocks();
        jest.spyOn(console, "error").mockImplementation(() => {});
    });

    test("handles successful copy action", async () => {
        jest.spyOn(console, "warn").mockImplementation(() => {});

        const text = "data\nadditional\n";
        fetchMock.mockResponse(JSON.stringify({ text, description: "Auto" }));

        const tflow = TFlow();
        render(<HttpMessage flow={tflow} message={tflow.request} />);

        await waitFor(() => screen.getByText("Copy"));

        fireEvent.click(screen.getByText("Copy"));
    });

    test("handles failed fetch with non-ok response", async () => {
        fetchMock.mockResponse("", {
            status: 500,
            statusText: "Internal Server Error",
        });

        const tflow = TFlow();
        render(<HttpMessage flow={tflow} message={tflow.request} />);

        await waitFor(() => screen.getByText("Copy"));
        fireEvent.click(screen.getByText("Copy"));

        await waitFor(() =>
            expect(console.error).toHaveBeenCalledWith(expect.any(Error)),
        );
    });
});

describe("HttpMessage body edit", () => {
    const cvd = { view_name: "Raw", description: "", syntax_highlight: "none" };

    beforeEach(() => {
        mockUseCodeEditor = true;
        mockCapturedOnChange = null;
        fetchMock.resetMocks();
    });

    afterEach(() => {
        mockUseCodeEditor = false;
        mockCapturedOnChange = null;
    });

    test("saving empty body sends empty string, not original content", async () => {
        fetchMock.mockResponses(
            JSON.stringify({ text: "original body", ...cvd }),
            "original body",
            JSON.stringify({}),
        );

        const tflow = TFlow();
        render(<HttpMessage flow={tflow} message={tflow.request} />);
        await waitFor(() => screen.getAllByText("original body"));

        fireEvent.click(screen.getByText("Edit"));
        await waitFor(() => screen.getByText("Done"));

        expect(mockCapturedOnChange).not.toBeNull();
        act(() => mockCapturedOnChange!(""));

        fireEvent.click(screen.getByText("Done"));

        await waitFor(() => {
            const putCall = fetchMock.mock.calls.find(
                ([, opts]) => opts && (opts as RequestInit).method === "PUT",
            );
            expect(putCall).toBeDefined();
            const body = JSON.parse(putCall![1]!.body as string);
            expect(body.request.content).toBe("");
        });
    });

    test("saving unedited body sends original content", async () => {
        fetchMock.mockResponses(
            JSON.stringify({ text: "original body", ...cvd }),
            "original body",
            JSON.stringify({}),
        );

        const tflow = TFlow();
        render(<HttpMessage flow={tflow} message={tflow.request} />);
        await waitFor(() => screen.getAllByText("original body"));

        fireEvent.click(screen.getByText("Edit"));
        await waitFor(() => {
            const editor = screen.getByTestId(
                "mock-editor",
            ) as HTMLTextAreaElement;
            expect(editor.defaultValue).toBe("original body");
        });
        fireEvent.click(screen.getByText("Done"));

        await waitFor(() => {
            const putCall = fetchMock.mock.calls.find(
                ([, opts]) => opts && (opts as RequestInit).method === "PUT",
            );
            expect(putCall).toBeDefined();
            const body = JSON.parse(putCall![1]!.body as string);
            expect(body.request.content).toBe("original body");
        });
    });
});

describe("HttpMessage JSON body", () => {
    beforeEach(() => {
        fetchMock.resetMocks();
    });

    function jsonFlow() {
        const tflow = TFlow();
        tflow.request.headers = [["content-type", "application/json"]];
        tflow.request.contentLength = 8;
        return tflow;
    }

    test("renders a JSON body as a collapsible tree", async () => {
        fetchMock.mockResponses(
            JSON.stringify({
                text: '{\n    "a": 1\n}',
                view_name: "JSON",
                description: "",
                syntax_highlight: "yaml",
            }),
        );
        const tflow = jsonFlow();
        render(<HttpMessage flow={tflow} message={tflow.request} />);
        await waitFor(() => screen.getByText('"a"'));
        expect(screen.getByText("1")).toBeInTheDocument();
        // A fold toggle exists for the root object.
        expect(document.querySelector(".json-toggle")).not.toBeNull();
    });

    test("switches between the JSON tree and other views via the dropdown", async () => {
        fetchMock.mockResponse(async (req) => {
            if (/content\/raw/i.test(req.url))
                return JSON.stringify({
                    text: "plain-raw-body",
                    view_name: "Raw",
                    description: "",
                    syntax_highlight: "none",
                });
            return JSON.stringify({
                text: '{\n    "a": 1\n}',
                view_name: "JSON",
                description: "",
                syntax_highlight: "yaml",
            });
        });
        const tflow = jsonFlow();
        render(<HttpMessage flow={tflow} message={tflow.request} />);
        // Auto-detected JSON renders as a tree.
        await waitFor(() => screen.getByText('"a"'));

        // Switch to a non-tree view: the tree disappears, raw text shows.
        await act(() => fireEvent.click(screen.getByText("auto")));
        await act(() => fireEvent.click(screen.getByText("raw")));
        await waitFor(() => screen.getByText("plain-raw-body"));
        expect(screen.queryByText('"a"')).toBeNull();

        // Switch back via the JSON tree pseudo-view: the tree returns.
        await act(() => fireEvent.click(screen.getByText("raw")));
        await act(() => fireEvent.click(screen.getByText("json tree")));
        await waitFor(() => screen.getByText('"a"'));
        expect(screen.queryByText("plain-raw-body")).toBeNull();
    });

    test("edits a JSON value inline and saves compact JSON", async () => {
        fetchMock.mockResponses(
            JSON.stringify({
                text: '{\n    "a": 1\n}',
                view_name: "JSON",
                description: "",
                syntax_highlight: "yaml",
            }),
            '{"a": 1}',
            JSON.stringify({}),
        );
        const tflow = jsonFlow();
        render(<HttpMessage flow={tflow} message={tflow.request} />);
        await waitFor(() => screen.getByText('"a"'));

        fireEvent.click(screen.getByText("Edit"));
        // In edit mode the value is static until clicked.
        fireEvent.click(await screen.findByText("1"));
        const input = await screen.findByDisplayValue("1");
        fireEvent.change(input, { target: { value: "2" } });
        fireEvent.blur(input);
        fireEvent.click(screen.getByText("Done"));

        await waitFor(() => {
            const putCall = fetchMock.mock.calls.find(
                ([, opts]) => opts && (opts as RequestInit).method === "PUT",
            );
            expect(putCall).toBeDefined();
            const body = JSON.parse(putCall![1]!.body as string);
            expect(body.request.content).toBe('{"a":2}');
        });
    });
});
