import * as React from "react";
import FilterInput, { FilterIcon } from "./FilterInput";
import * as flowsActions from "../../ducks/flows";
import Button from "../common/Button";
import { update as updateOptions } from "../../ducks/options";
import { useAppDispatch, useAppSelector } from "../../ducks";
import { FilterName, setFilter, setHighlight } from "../../ducks/ui/filter";
import {
    setMode,
    expandAll,
    collapseAll,
    toggleCompact,
} from "../../ducks/ui/flowtree";
import { selectAllExpandableKeys } from "../../ducks/flows/treeSelectors";
import classnames from "classnames";

FlowListMenu.title = "Flow List";

export default function FlowListMenu() {
    return (
        <div className="main-menu">
            <div className="menu-group">
                <div className="menu-content">
                    <FlowFilterInput />
                    <HighlightInput />
                </div>
                <div className="menu-legend">Find</div>
            </div>

            <div className="menu-group">
                <div className="menu-content">
                    <InterceptInput />
                    <ResumeAll />
                </div>
                <div className="menu-legend">Intercept</div>
            </div>

            <div className="menu-group">
                <div className="menu-content">
                    <ViewModeToggle />
                </div>
                <div className="menu-legend">View</div>
            </div>
        </div>
    );
}

function InterceptInput() {
    const dispatch = useAppDispatch();
    const value = useAppSelector((state) => state.options.intercept);
    return (
        <FilterInput
            value={value || ""}
            placeholder="Intercept"
            icon={FilterIcon.INTERCEPT}
            color="hsl(208, 56%, 53%)"
            onChange={(val) => dispatch(updateOptions("intercept", val))}
        />
    );
}

function FlowFilterInput() {
    const dispatch = useAppDispatch();
    const value = useAppSelector((state) => state.ui.filter[FilterName.Search]);
    return (
        <FilterInput
            value={value}
            placeholder="Search"
            icon={FilterIcon.SEARCH}
            color="black"
            onChange={(expr) => dispatch(setFilter(expr))}
        />
    );
}

function HighlightInput() {
    const dispatch = useAppDispatch();
    const value = useAppSelector(
        (state) => state.ui.filter[FilterName.Highlight],
    );
    return (
        <FilterInput
            value={value}
            placeholder="Highlight"
            icon={FilterIcon.HIGHLIGHT}
            color="hsl(48, 100%, 50%)"
            onChange={(expr) => dispatch(setHighlight(expr))}
        />
    );
}

export function ResumeAll() {
    const dispatch = useAppDispatch();
    return (
        <Button
            className="btn-sm"
            title="[a]ccept all"
            icon="resumeAll"
            iconClassName="text-success"
            onClick={() => dispatch(flowsActions.resumeAll())}
        >
            Resume All
        </Button>
    );
}

export function ViewModeToggle() {
    const dispatch = useAppDispatch();
    const mode = useAppSelector((state) => state.ui.flowtree.mode);
    const expandableKeys = useAppSelector(selectAllExpandableKeys);
    const compact = useAppSelector((state) => state.ui.flowtree.compact);
    const isStructure = mode === "structure";
    return (
        <div className="btn-group" role="group">
            <Button
                className={classnames("btn-sm", {
                    "btn-primary": !isStructure,
                })}
                title="Chronological list of flows"
                icon="files"
                onClick={() => dispatch(setMode("sequence"))}
            >
                Sequence
            </Button>
            <Button
                className={classnames("btn-sm", {
                    "btn-primary": isStructure,
                })}
                title="Group flows into a tree by host and path"
                icon="openFolder"
                onClick={() => dispatch(setMode("structure"))}
            >
                Structure
            </Button>
            {isStructure && (
                <>
                    <Button
                        className="btn-sm"
                        title="Expand all"
                        icon="expandMore"
                        onClick={() => dispatch(expandAll(expandableKeys))}
                    >
                        Expand
                    </Button>
                    <Button
                        className="btn-sm"
                        title="Collapse all"
                        icon="chevronUp"
                        onClick={() => dispatch(collapseAll())}
                    >
                        Collapse
                    </Button>
                    <Button
                        className={classnames("btn-sm", {
                            "btn-primary": compact,
                        })}
                        title="Collapse single-child folders into one row"
                        icon="fold"
                        onClick={() => dispatch(toggleCompact())}
                    >
                        Compact
                    </Button>
                </>
            )}
        </div>
    );
}
