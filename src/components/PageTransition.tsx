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
  const motionRef = useRef<Motion>("cross");

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
    if (leave === null) {
      return;
    }
    const id = window.setTimeout(() => setLeave(null), 560);
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
        className={cx(styles.layer, styles.enter, styles[motionRef.current])}
      >
        {props.children}
      </div>
    </div>
  );
}
