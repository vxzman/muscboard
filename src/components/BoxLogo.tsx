import { cx } from "../lib/cx";

import styles from "./BoxLogo.module.css";

interface BoxLogoProps {
  size?: number;
  className?: string;
}

/** 纯 CSS 绘制的 sing-box 风格等距纸箱 Logo（无 SVG）。 */
export function BoxLogo({ size = 38, className }: BoxLogoProps) {
  return (
    <span
      className={cx(styles.boxLogo, className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className={styles.box}>
        <span className={cx(styles.face, styles.faceTop)} />
        <span className={cx(styles.face, styles.faceLeft)} />
        <span className={cx(styles.face, styles.faceRight)} />
      </span>
    </span>
  );
}
