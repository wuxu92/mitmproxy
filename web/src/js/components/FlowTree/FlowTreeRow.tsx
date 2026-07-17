import * as React from "react";
import classnames from "classnames";
import type { Flow } from "../../flow";
import type { FlowTreeRow as Row } from "../../flow/tree";
import {
    getMethod,
    getTotalSize,
    statusCode,
    statusColor,
    startTime,
    endTime,
} from "../../flow/utils";
import { formatSize, formatTimeDelta } from "../../utils";
import { useAppDispatch } from "../../ducks";
import { replay } from "../../ducks/flows";
import { canReplay } from "../../flow/utils";
import Icon from "../common/Icon";
import styles from "../../../css/flowtree.module.css";

const INDENT_PX = 14;

interface FlowTreeRowProps {
    row: Row;
    selected: boolean;
    style: React.CSSProperties;
    onToggle: (key: string) => void;
    onSelect: (flow: Flow, e: React.MouseEvent) => void;
}

function FlowMeta({ flow }: { flow: Flow }) {
    const start = startTime(flow);
    const end = endTime(flow);
    const color = statusColor(flow);
    const code = statusCode(flow);
    return (
        <span className={styles.meta}>
            <span className={styles.method}>{getMethod(flow)}</span>
            <span className={styles.status} style={color ? { color } : undefined}>
                {code ?? ""}
            </span>
            <span className={styles.size}>
                {formatSize(getTotalSize(flow))}
            </span>
            <span className={styles.time}>
                {start && end ? formatTimeDelta(1000 * (end - start)) : "…"}
            </span>
        </span>
    );
}

function NodeBadges({ row }: { row: Row }) {
    const { node } = row;
    return (
        <span className={styles.badges}>
            {node.pendingCount > 0 && (
                <span
                    className={classnames(styles.count, styles.pending)}
                    title={`${node.pendingCount} pending`}
                >
                    {node.pendingCount}
                </span>
            )}
            {node.errorCount > 0 && (
                <span
                    className={classnames(styles.count, styles.error)}
                    title={`${node.errorCount} errors`}
                >
                    {node.errorCount}
                </span>
            )}
            <span className={styles.count} title={`${node.flowCount} requests`}>
                {node.flowCount}
            </span>
        </span>
    );
}

export default React.memo(function FlowTreeRow({
    row,
    selected,
    style,
    onToggle,
    onSelect,
}: FlowTreeRowProps) {
    const dispatch = useAppDispatch();
    const { node, depth, label, expandable, expanded, flow } = row;
    const isFlowRow = flow !== undefined;
    const intercepted = flow?.intercepted ?? false;

    const onClick = (e: React.MouseEvent) => {
        if (isFlowRow) {
            onSelect(flow, e);
        } else if (expandable) {
            onToggle(node.key);
        }
    };

    const iconName = node.kind === "leaf" ? "files" : "openFolder";

    return (
        <div
            className={classnames(styles.row, {
                [styles.selected]: selected,
                [styles.highlighted]: node.hasHighlight && !isFlowRow,
                [styles.intercepted]: intercepted,
            })}
            style={{ ...style, paddingLeft: 6 + depth * INDENT_PX }}
            onClick={onClick}
            role="treeitem"
            aria-expanded={expandable ? expanded : undefined}
            aria-selected={selected}
        >
            {expandable ? (
                <span
                    className={styles.twisty}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggle(node.key);
                    }}
                >
                    <Icon name={expanded ? "chevronDown" : "chevronRight"} />
                </span>
            ) : (
                <span className={styles.twistyPlaceholder} />
            )}

            {!isFlowRow && (
                <span className={styles.icon}>
                    <Icon name={iconName} />
                </span>
            )}

            <span
                className={classnames(styles.label, {
                    [styles.hostLabel]: node.kind === "host" && !isFlowRow,
                    [styles.folderLabel]: node.kind === "folder" && !isFlowRow,
                })}
                title={node.key}
            >
                {label}
            </span>

            {isFlowRow ? (
                <FlowMeta flow={flow} />
            ) : (
                <NodeBadges row={row} />
            )}

            {isFlowRow && canReplay(flow) && (
                <span
                    className={styles.quickaction}
                    title="Replay this flow"
                    onClick={(e) => {
                        e.stopPropagation();
                        dispatch(replay([flow]));
                    }}
                >
                    <Icon name="replay" className="text-primary" />
                </span>
            )}
        </div>
    );
});
