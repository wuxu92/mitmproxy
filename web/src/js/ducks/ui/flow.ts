import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

interface UiFlowState {
    tab: string;
    /** Whether request/response headers are shown in the combined message view.
     *  Hidden by default — the body is usually what matters. */
    showHeaders: boolean;
    contentViewFor: { [messageId: string]: string };
}

export const defaultState: UiFlowState = {
    tab: "request",
    showHeaders: false,
    contentViewFor: {},
};

const flowsSlice = createSlice({
    name: "ui/flow",
    initialState: defaultState,
    reducers: {
        selectTab(state, action: PayloadAction<string>) {
            state.tab = action.payload;
        },
        toggleHeaders(state) {
            state.showHeaders = !state.showHeaders;
        },
        setContentViewFor(
            state,
            action: PayloadAction<{ messageId: string; contentView: string }>,
        ) {
            state.contentViewFor[action.payload.messageId] =
                action.payload.contentView;
        },
    },
});

const { actions, reducer } = flowsSlice;
export const { selectTab, toggleHeaders, setContentViewFor } = actions;
export default reducer;
