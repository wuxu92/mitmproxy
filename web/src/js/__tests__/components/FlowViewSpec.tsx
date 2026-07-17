import * as React from "react";
import { act, fireEvent, render, screen } from "../test-utils";
import FlowView from "../../components/FlowView";
import * as flowActions from "../../ducks/flows";
import fetchMock, { enableFetchMocks } from "jest-fetch-mock";

enableFetchMocks();

test("FlowView", async () => {
    fetchMock.mockReject(new Error("backend missing"));

    const { asFragment, getByTestId, store } = render(<FlowView />);
    expect(asFragment()).toMatchSnapshot();

    fireEvent.click(screen.getByText("Response"));
    expect(asFragment()).toMatchSnapshot();

    // The combined Req&Resp tab stacks request above response and exposes a
    // Headers toggle (headers hidden by default there).
    fireEvent.click(screen.getByText("Req&Resp"));
    expect(asFragment()).toMatchSnapshot();
    fireEvent.click(screen.getByText("Headers"));
    expect(asFragment()).toMatchSnapshot();

    fireEvent.click(screen.getByText("WebSocket"));
    expect(asFragment()).toMatchSnapshot();

    fireEvent.click(screen.getByText("Connection"));
    expect(asFragment()).toMatchSnapshot();

    fireEvent.click(screen.getByText("Timing"));
    expect(asFragment()).toMatchSnapshot();

    fireEvent.click(screen.getByText("Comment"));
    expect(asFragment()).toMatchSnapshot();

    fireEvent.click(screen.getByText("Error"));
    expect(asFragment()).toMatchSnapshot();

    act(() =>
        store.dispatch(flowActions.select([store.getState().flows.list[2]])),
    );

    fireEvent.click(screen.getByText("Stream Data"));
    expect(asFragment()).toMatchSnapshot();

    fireEvent.click(screen.getByText("Error"));
    expect(asFragment()).toMatchSnapshot();

    act(() =>
        store.dispatch(flowActions.select([store.getState().flows.list[3]])),
    );

    fireEvent.click(screen.getByText("Request"));
    expect(asFragment()).toMatchSnapshot();

    fireEvent.click(screen.getByText("Response"));
    expect(asFragment()).toMatchSnapshot();

    fireEvent.click(screen.getByText("Error"));
    expect(asFragment()).toMatchSnapshot();

    act(() =>
        store.dispatch(flowActions.select([store.getState().flows.list[4]])),
    );

    fireEvent.click(screen.getByText("Datagrams"));
    expect(asFragment()).toMatchSnapshot();

    fireEvent.click(screen.getByText("Error"));
    expect(asFragment()).toMatchSnapshot();

    fireEvent.click(getByTestId("close-button-id"));
    expect(store.getState().flows.selected).toEqual([]);
});

test("combined request/response view: stacked sections, splitter, headers toggle", async () => {
    fetchMock.mockReject(new Error("backend missing"));

    const { container, unmount } = render(<FlowView />);

    // Standalone Request tab (default) always shows headers — the combined
    // view's collapse toggle must not affect it.
    expect(container.querySelector("section.request")).not.toBeNull();
    expect(container.querySelector("section.response")).toBeNull();
    expect(container.querySelector(".splitter.splitter-y")).toBeNull();
    expect(container.querySelectorAll(".headers")).toHaveLength(1);

    // Switch to the combined Req&Resp tab: request and response render stacked
    // in one column with a draggable horizontal splitter between them.
    fireEvent.click(screen.getByText("Req&Resp"));
    expect(container.querySelector("section.request")).not.toBeNull();
    expect(container.querySelector("section.response")).not.toBeNull();
    expect(container.querySelector(".splitter.splitter-y")).not.toBeNull();
    expect(
        container.querySelector("section.request")!.compareDocumentPosition(
            container.querySelector("section.response")!,
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // Headers are hidden by default here and appear once toggled.
    expect(container.querySelectorAll(".headers")).toHaveLength(0);
    fireEvent.click(screen.getByText("Headers"));
    expect(container.querySelectorAll(".headers")).toHaveLength(2);
    fireEvent.click(screen.getByText("Headers"));
    expect(container.querySelectorAll(".headers")).toHaveLength(0);

    // Flush the pending content fetches before teardown so their rejection
    // doesn't fire a state update outside act().
    await act(async () => {
        await Promise.resolve();
    });
    unmount();
});
