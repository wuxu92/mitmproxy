import React from "react";
import { useAppSelector } from "../../ducks";
import Dropdown, { MenuItem } from "../common/Dropdown";
import Icon from "../common/Icon";

/** Frontend-only pseudo view: renders JSON as an editable/collapsible tree. */
export const JSON_TREE_VIEW = "json tree";

type ViewSelectorProps = {
    value: string;
    onChange: (viewName: string) => void;
    isJson?: boolean;
};

export default function ViewSelector({
    value,
    onChange,
    isJson = false,
}: ViewSelectorProps) {
    const contentViews = useAppSelector(
        (state) => state.backendState.contentViews || [],
    );

    // Surface the tree pseudo-view alongside the backend views for JSON bodies.
    let views = contentViews;
    if (isJson && !contentViews.includes(JSON_TREE_VIEW)) {
        const jsonIdx = contentViews.findIndex(
            (name) => name.toLowerCase() === "json",
        );
        views =
            jsonIdx === -1
                ? [...contentViews, JSON_TREE_VIEW]
                : contentViews.flatMap((name, i) =>
                      i === jsonIdx ? [name, JSON_TREE_VIEW] : [name],
                  );
    }

    const inner = (
        <span>
            <Icon name="files" />
            &nbsp;<b>View:</b> {value.toLowerCase()} <span className="caret" />
        </span>
    );

    return (
        <Dropdown
            text={inner}
            className="btn btn-default btn-xs"
            options={{ placement: "top-end" }}
        >
            {views.map((name) => (
                <MenuItem key={name} onClick={() => onChange(name)}>
                    {name.toLowerCase().replace("_", " ")}
                </MenuItem>
            ))}
        </Dropdown>
    );
}
