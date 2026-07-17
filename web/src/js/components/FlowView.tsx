import * as React from "react";
import { HttpMessages, Request, Response } from "./FlowView/HttpMessages";
import {
    Request as DnsRequest,
    Response as DnsResponse,
} from "./FlowView/DnsMessages";
import Connection from "./FlowView/Connection";
import Error from "./FlowView/Error";
import Timing from "./FlowView/Timing";
import WebSocket from "./FlowView/WebSocket";
import Comment from "./FlowView/Comment";
import { selectTab, toggleHeaders } from "../ducks/ui/flow";
import { useAppDispatch, useAppSelector } from "../ducks";
import type {
    Error as FlowError,
    Flow,
    HTTPFlow,
    WebSocketData,
} from "../flow";
import classnames from "classnames";
import TcpMessages from "./FlowView/TcpMessages";
import UdpMessages from "./FlowView/UdpMessages";
import * as flowsActions from "../ducks/flows";
import Icon from "./common/Icon";

type TabId =
    | "request"
    | "response"
    | "httpmessages"
    | "error"
    | "connection"
    | "timing"
    | "websocket"
    | "tcpmessages"
    | "udpmessages"
    | "dnsrequest"
    | "dnsresponse"
    | "comment";

export const tabLabels: Record<TabId, string> = {
    request: Request.displayName,
    response: Response.displayName,
    httpmessages: HttpMessages.displayName,
    error: Error.displayName,
    connection: Connection.displayName,
    timing: Timing.displayName,
    websocket: WebSocket.displayName,
    tcpmessages: TcpMessages.displayName,
    udpmessages: UdpMessages.displayName,
    dnsrequest: DnsRequest.displayName,
    dnsresponse: DnsResponse.displayName,
    comment: Comment.displayName,
};

function renderTab(active: TabId, flow: Flow): React.ReactElement | null {
    switch (active) {
        case "request":
            return <Request />;
        case "response":
            return <Response />;
        case "httpmessages":
            return <HttpMessages />;
        case "error":
            return flow.error ? (
                <Error flow={flow as Flow & { error: FlowError }} />
            ) : null;
        case "connection":
            return <Connection flow={flow} />;
        case "timing":
            return <Timing flow={flow} />;
        case "websocket":
            return flow.type === "http" && flow.websocket ? (
                <WebSocket
                    flow={
                        flow as HTTPFlow & {
                            websocket: WebSocketData;
                        }
                    }
                />
            ) : null;
        case "tcpmessages":
            return flow.type === "tcp" ? <TcpMessages flow={flow} /> : null;
        case "udpmessages":
            return flow.type === "udp" ? <UdpMessages flow={flow} /> : null;
        case "dnsrequest":
            return <DnsRequest />;
        case "dnsresponse":
            return flow.type === "dns" && flow.response ? (
                <DnsResponse />
            ) : null;
        case "comment":
            return <Comment flow={flow} />;
    }
}

export function tabsForFlow(flow: Flow): TabId[] {
    let tabs: TabId[];
    switch (flow.type) {
        case "http":
            tabs = ["request"];
            if (flow.response) {
                tabs.push("response");
                tabs.push("httpmessages");
            }
            if (flow.websocket) tabs.push("websocket");
            break;
        case "tcp":
            tabs = ["tcpmessages"];
            break;
        case "udp":
            tabs = ["udpmessages"];
            break;
        case "dns":
            tabs = ["dnsrequest"];
            if (flow.response) tabs.push("dnsresponse");
            break;
    }

    if (flow.error) tabs.push("error");
    tabs.push("connection");
    tabs.push("timing");
    tabs.push("comment");
    return tabs;
}

export default function FlowView() {
    const dispatch = useAppDispatch();
    const flow = useAppSelector((state) => state.flows.selected[0]);
    let active = useAppSelector((state) => state.ui.flow.tab) as TabId;

    const showHeaders = useAppSelector((state) => state.ui.flow.showHeaders);
    if (flow == undefined) {
        return <></>;
    }

    const tabs = tabsForFlow(flow);

    if (tabs.indexOf(active) < 0) {
        active = tabs[0];
    }
    return (
        <div className="flow-detail">
            <nav className="nav-tabs nav-tabs-sm">
                <button
                    data-testid="close-button-id"
                    className="close-button"
                    onClick={() => dispatch(flowsActions.select([]))}
                >
                    <Icon name="closeCircle" />
                </button>
                {tabs.map((tabId) => (
                    <a
                        key={tabId}
                        href="#"
                        className={classnames({ active: active === tabId })}
                        onClick={(event) => {
                            event.preventDefault();
                            dispatch(selectTab(tabId));
                        }}
                    >
                        {tabLabels[tabId]}
                    </a>
                ))}
                {(active === "request" ||
                    active === "response" ||
                    active === "httpmessages") && (
                    <button
                        className={classnames("btn", "btn-xs", "headers-toggle", {
                            "btn-primary": showHeaders,
                            "btn-default": !showHeaders,
                        })}
                        title={
                            showHeaders
                                ? "Hide request/response headers"
                                : "Show request/response headers"
                        }
                        onClick={() => dispatch(toggleHeaders())}
                    >
                        Toggle Headers
                    </button>
                )}
            </nav>
            {renderTab(active, flow)}
        </div>
    );
}
