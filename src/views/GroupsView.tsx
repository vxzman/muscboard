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
  const pressedRef = useRef<string | null>(null);
  const rafRef = useRef(0);
  const pendingCursor = useRef<{ clientX: number; clientY: number } | null>(null);

  const applyCursor = () => {
    const grid = gridRef.current;
    if (!grid) {
      return;
    }
    const nodes = grid.querySelectorAll<HTMLElement>("[data-node]");
    const cursor = pendingCursor.current;
    if (!cursor) {
      nodes.forEach((node) => {
        node.style.transform = "";
        node.style.zIndex = "";
      });
      return;
    }
    const gRect = grid.getBoundingClientRect();
    const relX = cursor.clientX - gRect.left;
    const relY = cursor.clientY - gRect.top;
    const pressed = pressedRef.current;
    nodes.forEach((node) => {
      const tag = node.dataset.node;
      if (!tag) {
        return;
      }
      const center = centersRef.current.get(tag);
      if (!center) {
        node.style.transform = "";
        node.style.zIndex = "";
        return;
      }
      const dNorm = Math.hypot(
        Math.abs(relX - center.x) / DOCK_RADIUS_X,
        Math.abs(relY - center.y) / DOCK_RADIUS_Y,
      );
      let mag = 0;
      if (dNorm < 1) {
        const cos = Math.cos((dNorm * Math.PI) / 2);
        mag = cos * cos;
      }
      if (mag > 0.005) {
        const baseScale = 1 + (DOCK_PEAK_SCALE - 1) * mag;
        const scale = pressed === tag ? baseScale * 0.93 : baseScale;
        node.style.transform = `translateY(${DOCK_PEAK_LIFT * mag}px) scale(${scale})`;
        node.style.zIndex = String(Math.round(1 + mag * 30));
      } else if (pressed === tag) {
        node.style.transform = "scale(0.94)";
        node.style.zIndex = "2";
      } else {
        node.style.transform = "";
        node.style.zIndex = "";
      }
    });
  };

  const onPointerEnter = (event: PointerEvent<HTMLDivElement>) => {
    if (!gridRef.current || !dockEnabled()) {
      return;
    }
    centersRef.current = measureDockCenters(gridRef.current);
    gridRef.current.classList.add(styles.docking);
    pendingCursor.current = { clientX: event.clientX, clientY: event.clientY };
    applyCursor();
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dockEnabled()) {
      return;
    }
    if (centersRef.current.size === 0 && gridRef.current) {
      centersRef.current = measureDockCenters(gridRef.current);
      gridRef.current.classList.add(styles.docking);
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
    pressedRef.current = null;
    gridRef.current?.classList.remove(styles.docking);
    applyCursor();
  };

  return (
    <div
      ref={gridRef}
      className={styles.groupItems}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {props.items.map((item) => (
        <GroupItemCard
          key={item.tag}
          item={item}
          selected={item.tag === props.selected}
          onSelect={() => props.onSelect(item)}
          onPressChange={(isPressed) => {
            pressedRef.current = isPressed ? item.tag : null;
            const node = gridRef.current?.querySelector<HTMLElement>(
              `[data-node="${CSS.escape(item.tag)}"]`,
            );
            node?.classList.toggle(styles.pressed, isPressed);
            applyCursor();
          }}
        />
      ))}
    </div>
  );
}

function GroupItemCard(props: {
  item: GroupItem;
  selected: boolean;
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

  return (
    <>
      <button
        type="button"
        data-node={item.tag}
        className={cx(styles.groupItem, props.selected && styles.selected)}
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
