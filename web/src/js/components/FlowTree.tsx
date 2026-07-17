import * as React from "react";
import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAppDispatch, useAppSelector } from "../ducks";
import { select, selectToggle } from "../ducks/flows";
import { toggleNode } from "../ducks/ui/flowtree";
import { selectVisibleTreeRows } from "../ducks/flows/treeSelectors";
import type { Flow } from "../flow";
import FlowTreeRow from "./FlowTree/FlowTreeRow";
import styles from "../../css/flowtree.module.css";

const ROW_HEIGHT = 32;

export default function FlowTree() {
    const dispatch = useAppDispatch();
    const rows = useAppSelector(selectVisibleTreeRows);
    const selectedIds = useAppSelector((state) => state.flows.selectedIds);
    const parentRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 12,
    });

    const onToggle = React.useCallback(
        (key: string) => dispatch(toggleNode(key)),
        [dispatch],
    );

    const onSelect = React.useCallback(
        (flow: Flow, e: React.MouseEvent) => {
            if (e.metaKey || e.ctrlKey) {
                dispatch(selectToggle(flow));
            } else {
                dispatch(select([flow]));
            }
        },
        [dispatch],
    );

    if (rows.length === 0) {
        return (
            <div className={styles.tree}>
                <div className={styles.empty}>No flows match the filter.</div>
            </div>
        );
    }

    return (
        <div ref={parentRef} className={styles.tree} role="tree">
            <div
                className={styles.spacer}
                style={{ height: virtualizer.getTotalSize() }}
            >
                {virtualizer.getVirtualItems().map((item) => {
                    const row = rows[item.index];
                    const selected =
                        row.flow !== undefined &&
                        selectedIds.has(row.flow.id);
                    return (
                        <FlowTreeRow
                            key={row.flow ? `${row.node.key}#${row.flow.id}` : row.node.key}
                            row={row}
                            selected={selected}
                            onToggle={onToggle}
                            onSelect={onSelect}
                            style={{
                                height: item.size,
                                transform: `translateY(${item.start}px)`,
                            }}
                        />
                    );
                })}
            </div>
        </div>
    );
}
