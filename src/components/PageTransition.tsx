import { useEffect, useRef, useState, type ReactNode } from "react";

import { cx } from "../lib/cx";

import styles from "./PageTransition.module.css";

type Motion = "cross" | "push" | "pop";

interface PageTransitionProps {
  routeKey: string;
  depth: number;
  children: ReactNode;
}

interface LeaveLayer {
  key: string;
  node: ReactNode;
  motion: Motion;
}

export function PageTransition(props: PageTransitionProps) {
  const prev = useRef({ key: props.routeKey, depth: props.depth, node: props.children });
  const [leave, setLeave] = useState<LeaveLayer | null>(null);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const motionRef = useRef<Motion>("cross");
  const entering = settledKey !== props.routeKey;

  if (prev.current.key !== props.routeKey) {
    motionRef.current =
      props.depth > prev.current.depth ? "push" : props.depth < prev.current.depth ? "pop" : "cross";
    setLeave({
      key: prev.current.key,
      node: prev.current.node,
      motion: motionRef.current,
    });
    prev.current = { key: props.routeKey, depth: props.depth, node: props.children };
  } else {
    prev.current.node = props.children;
    prev.current.depth = props.depth;
  }

  useEffect(() => {
    const id = window.setTimeout(() => setSettledKey(props.routeKey), 480);
    return () => window.clearTimeout(id);
  }, [props.routeKey]);

  useEffect(() => {
    if (leave === null) {
      return;
    }
    const id = window.setTimeout(() => setLeave(null), 480);
    return () => window.clearTimeout(id);
  }, [leave]);

  return (
    <div className={styles.stage}>
      {leave !== null && (
        <div
          key={leave.key}
          className={cx(styles.layer, styles.leave, styles[leave.motion])}
          aria-hidden
        >
          {leave.node}
        </div>
      )}
      <div
        key={props.routeKey}
        className={cx(
          styles.layer,
          entering && styles.enter,
          entering && styles[motionRef.current],
        )}
      >
        {props.children}
      </div>
    </div>
  );
}
