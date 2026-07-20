import * as React from "react";
import ViewSelector from "../../../components/contentviews/ViewSelector";
import { act, fireEvent, render, screen } from "../../test-utils";

test("ViewSelector", async () => {
    const onChange = jest.fn();
    const { asFragment } = render(
        <ViewSelector value="auto" onChange={onChange} />,
    );
    expect(asFragment()).toMatchSnapshot();

    await act(() => fireEvent.click(screen.getByText("auto")));
    expect(asFragment()).toMatchSnapshot();

    await act(() => fireEvent.click(screen.getByText("raw")));
    expect(onChange).toBeCalledWith("Raw");
});

test("ViewSelector surfaces the JSON tree pseudo-view for JSON bodies", async () => {
    const onChange = jest.fn();
    render(<ViewSelector value="auto" onChange={onChange} isJson />);

    await act(() => fireEvent.click(screen.getByText("auto")));
    await act(() => fireEvent.click(screen.getByText("json tree")));
    expect(onChange).toBeCalledWith("json tree");
});

test("ViewSelector omits the JSON tree pseudo-view for non-JSON bodies", async () => {
    const onChange = jest.fn();
    render(<ViewSelector value="auto" onChange={onChange} />);

    await act(() => fireEvent.click(screen.getByText("auto")));
    expect(screen.queryByText("json tree")).toBeNull();
});
