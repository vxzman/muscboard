import { useRef, useState, type PointerEvent } from "react";

import { proxyDisplayType, urlTestDelayTone } from "../api/format";
import { useStream } from "../api/stream";
import { useApi } from "../app/context";
import { showError } from "../app/errorStore";
import { usePendingValue } from "../app/hooks";
import { useI18n } from "../app/i18n";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { StreamStates } from "../components/StreamBanner";
import { Badge, Card, IconButton, MenuItem, Spinner, useContextMenu } from "../components/ui";
import type { Group, GroupItem } from "../gen/daemon/started_service_pb";
import styles from "./GroupsView.module.css";
import { cx } from "../lib/cx";

export function GroupsView() {
  const api = useApi();
  const { t } = useI18n();
  const groups = useStream(api.groups);

  return (
    <div className="page">
      <PageHeader title={t("Groups")} />
      <StreamStates
        snapshot={groups}
        loaded={groups.data.loaded}
        empty={groups.data.groups.length === 0}
        emptyIcon="folder"
        emptyMessage={t("Empty groups")}
      />
      {groups.data.groups.map((group) => (
        <GroupCard key={group.tag} group={group} />
      ))}
    </div>
  );
}

function GroupCard(props: { group: Group }) {
  const api = useApi();
  const { t } = useI18n();
  const group = props.group;
  const [testing, setTesting] = useState(false);
  const [expanded, setExpandOverride] = usePendingValue(group.isExpand);
  const [selected, setPendingSelection] = usePendingValue(group.selected);

  const toggleExpand = () => {
    const next = !expanded;
    setExpandOverride(next);
    api.setGroupExpand(group.tag, next).catch(() => setExpandOverride(null));
  };

  const runURLTest = () => {
    setTesting(true);
    api
      .urlTest(group.tag)
      .catch(showError)
      .finally(() => setTesting(false));
  };

  const selectItem = (item: GroupItem) => {
    if (!group.selectable || item.tag === selected) {
      return;
    }
    setPendingSelection(item.tag);
    api.selectOutbound(group.tag, item.tag).catch((error: unknown) => {
      setPendingSelection(null);
      showError(error);
    });
  };

  return (
    <div className={cx(styles.groupCard, expanded && styles.expanded)}>
      <Card
        title={
          <>
            {group.tag}
            <span style={{ marginLeft: 8, color: "var(--text-faint)", fontWeight: 500 }}>
              {proxyDisplayType(group.type)}
            </span>
          </>
        }
        actions={
          <>
            <Badge>{group.items.length}</Badge>
            <IconButton
              title={t("URL test")}
              onClick={runURLTest}
              disabled={testing}
              className={styles.urlTestButton}
            >
              {testing ? <Spinner /> : <Icon name="speed" />}
            </IconButton>
            <IconButton
              title={expanded ? t("Collapse") : t("Expand")}
              onClick={toggleExpand}
              className={styles.expandButton}
            >
              <Icon name={expanded ? "expand_less" : "expand_more"} />
            </IconButton>
          </>
        }
      >
        {expanded ? (
          <GroupItemsDock
            items={group.items}
            selected={selected}
            onSelect={selectItem}
          />
        ) : (
          <div className={styles.groupDots}>
            {group.items.map((item) => {
              const tone = item.urlTestDelay > 0 ? urlTestDelayTone(item.urlTestDelay) : "";
              return (
                <span
                  key={item.tag}
                  className={cx(styles.groupDot, styles[tone], item.tag === selected && styles.selected)}
                  title={`${item.tag}${item.urlTestDelay > 0 ? ` (${item.urlTestDelay}ms)` : ""}`}
                />
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

const DOCK_RADIUS_X = 380;
const DOCK_RADIUS_Y = 85;
const DOCK_PEAK_SCALE = 1.24;
const DOCK_PEAK_LIFT = -14;

type NodeCenter = { x: number; y: number };

function dockEnabled(): boolean {
  return typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function measureDockCenters(grid: HTMLElement): Map<string, NodeCenter> {
  const centers = new Map<string, NodeCenter>();
  const nodes = grid.querySelectorAll<HTMLElement>("[data-node]");
  nodes.forEach((node) => {
    const tag = node.dataset.node;
    if (!tag) {
      return;
    }
    // offsetLeft / offsetTop are relative to grid (position: relative)
    // and completely immune to any active CSS transforms.
    centers.set(tag, {
      x: node.offsetLeft + node.offsetWidth / 2,
      y: node.offsetTop + node.offsetHeight / 2,
    });
  });
  return centers;
}

function GroupItemsDock(props: {
  items: GroupItem[];
  selected: string;
  onSelect: (item: GroupItem) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const centersRef = useRef<Map<string, NodeCenter>>(new Map());
  const [magnify, setMagnify] = useState<Record<string, number>>({});
  const [docking, setDocking] = useState(false);
  const [pressed, setPressed] = useState<string | null>(null);
  const rafRef = useRef(0);
  const pendingCursor = useRef<{ clientX: number; clientY: number } | null>(null);

  const applyCursor = () => {
    const cursor = pendingCursor.current;
    if (!cursor || !gridRef.current) {
      setMagnify({});
      return;
    }
    const gRect = gridRef.current.getBoundingClientRect();
    const relX = cursor.clientX - gRect.left;
    const relY = cursor.clientY - gRect.top;

    const next: Record<string, number> = {};
    centersRef.current.forEach((center, tag) => {
      const dx = Math.abs(relX - center.x);
      const dy = Math.abs(relY - center.y);
      const dNorm = Math.hypot(dx / DOCK_RADIUS_X, dy / DOCK_RADIUS_Y);
      if (dNorm < 1) {
        const cos = Math.cos((dNorm * Math.PI) / 2);
        const mag = cos * cos;
        if (mag > 0.005) {
          next[tag] = mag;
        }
      }
    });
    setMagnify(next);
  };

  const onPointerEnter = () => {
    if (gridRef.current && dockEnabled()) {
      centersRef.current = measureDockCenters(gridRef.current);
      setDocking(true);
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dockEnabled()) {
      return;
    }
    if (centersRef.current.size === 0 && gridRef.current) {
      centersRef.current = measureDockCenters(gridRef.current);
    }
    if (!docking) {
      setDocking(true);
    }
    pendingCursor.current = { clientX: event.clientX, clientY: event.clientY };
    if (rafRef.current !== 0) {
      return;
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      applyCursor();
    });
  };

  const onPointerLeave = () => {
    if (rafRef.current !== 0) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    pendingCursor.current = null;
    setMagnify({});
    setDocking(false);
    setPressed(null);
  };

  return (
    <div
      ref={gridRef}
      className={cx(styles.groupItems, docking && styles.docking)}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {props.items.map((item) => (
        <GroupItemCard
          key={item.tag}
          item={item}
          selected={item.tag === props.selected}
          pressed={pressed === item.tag}
          magnitude={magnify[item.tag] ?? 0}
          onSelect={() => props.onSelect(item)}
          onPressChange={(isPressed) => setPressed(isPressed ? item.tag : null)}
        />
      ))}
    </div>
  );
}

function GroupItemCard(props: {
  item: GroupItem;
  selected: boolean;
  pressed: boolean;
  magnitude: number;
  onSelect: () => void;
  onPressChange: (pressed: boolean) => void;
}) {
  const api = useApi();
  const { t } = useI18n();
  const item = props.item;
  const menu = useContextMenu(
    <MenuItem icon="speed" onSelect={() => api.urlTest(item.tag).catch(showError)}>
      {t("URL test")}
    </MenuItem>,
  );

  let dockStyle: { transform?: string; zIndex?: number } | undefined;
  const mag = props.magnitude;
  if (mag > 0.005) {
    const baseScale = 1 + (DOCK_PEAK_SCALE - 1) * mag;
    const scale = props.pressed ? baseScale * 0.93 : baseScale;
    const lift = DOCK_PEAK_LIFT * mag;
    dockStyle = {
      transform: `translateY(${lift}px) scale(${scale})`,
      zIndex: Math.round(1 + mag * 30),
    };
  } else if (props.pressed) {
    dockStyle = {
      transform: "scale(0.94)",
      zIndex: 2,
    };
  }

  return (
    <>
      <button
        type="button"
        data-node={item.tag}
        className={cx(
          styles.groupItem,
          props.selected && styles.selected,
          props.pressed && styles.pressed,
        )}
        style={dockStyle}
        onClick={props.onSelect}
        {...menu.triggerProps}
        onPointerDown={(event) => {
          menu.triggerProps.onPointerDown?.(event);
          if (event.button === 0) {
            props.onPressChange(true);
          }
        }}
        onPointerUp={() => {
          menu.triggerProps.onPointerUp();
          props.onPressChange(false);
        }}
        onPointerCancel={() => {
          menu.triggerProps.onPointerCancel();
          props.onPressChange(false);
        }}
      >
        <span className={styles.itemTag}>
          {props.selected && <span className={styles.selectedDot} />}
          {item.tag}
        </span>
        <span className={styles.itemMeta}>
          <span>{proxyDisplayType(item.type)}</span>
          {item.urlTestDelay > 0 && (
            <span className={cx(styles.delayText, styles[urlTestDelayTone(item.urlTestDelay)])}>
              {item.urlTestDelay}ms
            </span>
          )}
        </span>
      </button>
      {menu.element}
    </>
  );
}
