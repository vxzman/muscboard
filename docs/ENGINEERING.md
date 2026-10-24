# muscboard 工程方案

新会话先读这一份。它覆盖项目目的、目录、设计与美学、代码约定、发布和踩过的坑。细节实现以源码为准。

---

## 1. 项目目的

muscboard 是 [SagerNet/sing-box-dashboard](https://github.com/SagerNet/sing-box-dashboard) 的非官方深度定制 fork，给 [sing-box](https://sing-box.sagernet.org) 做 Web / 桌面控制面板。

目标：在保留上游全部能力（节点、连接、日志、Tailscale、终端、配置编辑等）的前提下，做成一套**晶莹液态玻璃**界面，而不是 iOS 设置页克隆，也不是大面积纯白卡片。

仓库 GPL-3.0-or-later。README 必须保留原作者版权与“非官方”声明，不要改 `LICENSE`。

GitHub：<https://github.com/vxzman/muscboard>  
包名仍是上游的 `sing-box-dashboard`（`package.json` 版本固定 `0.1.0`，不要为发版去 bump）。

---

## 2. 远端与目录

| 远端 | 用途 |
| --- | --- |
| `muboard` | 自己的 GitHub：`https://github.com/vxzman/muscboard.git`（HTTPS）。推送、发版只走这里。 |
| `origin` | 上游 SagerNet，经 gh-proxy。只用来 `git fetch origin && git merge origin/main`。 |

分支跟踪 `main...muboard/main`。本地改完先 commit；**用户没说推送就不要 push**。

```text
src/
  api/           gRPC-Web / Connect 与 daemon 流
  app/           主题、i18n、路由、能力、桌面宿主
  components/    共享控件、Logo、切页、编辑器
  views/         各页面
  styles/        globals.css 令牌 + shared.css 控件
  lib/           ansi、存储、终端主题等
  gen/           buf 生成（gitignore，需 pnpm generate）
run/             mock daemon（:8090）+ 一键启动脚本
docs/            本文件 + screenshots/
public/          favicon、字体许可
vendor/          iTerm2 配色子模块（终端主题生成用）
```

不要再往仓库里放：`dist/`、`dist.tar.gz`、`ignore/`（曾经的上游对照副本）、agent 草稿、`run/*.log` / `*.pid`。

---

## 3. 设计风格与美学

一句话：**CFNext 的会动色池画布 + tomnest 的三层玻璃，填充要薄，霜才晶莹。**

参考过 Apple Liquid Glass、apple.com、CFNext、tomnest。只借手法，不抄：

- 不抄 iOS Settings 的大块纯白
- 不抄 tomnest 的 MD3 色板、卡片 `translateY`、切页 `filter: blur()`
- 不把日志做成黑终端洞

### 3.1 画布（氛围层）

- 浅底 `#d0dae8`，深底 `#04060b`
- `.atmosphere` 是 `#root` 的**兄弟**（写在 `index.html`），`#root` 不要 `isolation`
- 四个 `.atmosphere i`：径向渐变色池，`--blob-blur: 48px`（形状还在，卡片才有东西可雾化）
- 五个 `.atmosphere b`：2px bokeh，玻璃滑过时霜立刻可见
- `body::before` 细颗粒 `noise-shift`

### 3.2 三层玻璃

| 层 | 模糊 | 填充 | 用在 |
| --- | --- | --- | --- |
| Chrome | 32px / 200% saturate / brightness 1.05 | 14–22% 白 | 侧栏、菜单、抽屉、对话框、工具栏 |
| Content | 22px / 190% / brightness 1.06 | 14% 白 | 卡片、列表、日志 |
| Nested | 12px / 170% | 8% 白 + `--glass-sheen-soft` | 节点块、搜索框 |

Sheen 是**镜面高光**（约 28% 白 → 10% accent），不是 74% 白膜。白膜会盖住 backdrop-filter，看起来泛白、没有晶莹。`--material-*` 是 content 玻璃的别名。

字永远实色：`#16202e` / `#e9eef7`。不要半透明灰字去抢对比。标题字距约 `-0.03em`，留白偏大。

### 3.3 颜色

令牌只在 `src/styles/globals.css` 定义值。除该文件外 **禁止 hex**（stylelint），用 `rgb()` / `color-mix()` / `var(--ios-*)`。

一个强调色管按钮、选中、链接（默认系统蓝 `#007AFF` / `#0A84FF`，可换预设）。图标砖按功能着色：

| 功能 | 令牌 |
| --- | --- |
| 上传 / Taildrop | `--ios-grad-green` / `--ios-grad-blue` |
| 测速、警告 | `--ios-grad-orange` |
| 连接、USB/IP、二维码 | `--ios-grad-purple` |
| 路由 / 模式 / 展开 | `--ios-grad-indigo` |
| 终端、peer、分享 | `--ios-grad-teal` |
| 删除、停止 | `--ios-grad-red` |
| 中性 | `--ios-grad-gray` |
| 品牌 | `--ios-grad-brand` |

图标：彩色圆角块 + 白色 `currentColor` 路径。品牌标志提炼进 `iconPaths.ts`，不要单独 SVG 组件。改配色必须同时覆盖：

```css
.card-header > .icon[data-icon="…"],
.nav-row > .icon:first-child[data-icon="…"],
.nav-line > .icon:first-child[data-icon="…"]
```

空状态图标尺寸要 `!important`（`Icon` 有内联宽高）。小按钮里的 13–16px 图标不要套色块。

### 3.4 动效

只走令牌，不要第三种曲线，不要 overshoot：

| 场景 | 令牌 | 时长 |
| --- | --- | --- |
| 进入 / 悬停 / 控件 | `--ease-apple` | 0.18s / 0.28s |
| 离开 | `--ease-in` | 0.34s |
| 切页进入 | `--ease-apple` | 0.44s |
| Dock 跟指针 | `--ease-out` | ~0.06s |

- 卡片、按钮悬停不要 `translateY`
- 按下最多 `scale(0.96–0.98)`
- 只动 `transform` / `opacity`，不动 margin/width/top
- **切页禁止 `filter: blur()`**（会让毛玻璃失效）
- 尊重 `prefers-reduced-motion`
- 节点 Dock 放大走 **DOM transform**（rAF），用 `offsetLeft`/`offsetTop` 量中心，不要量已变换的 rect

节点页层次：托盘 → 节点块 → 选中 → 按下。网格 `auto-fit` + `minmax(min(220px, 100%), 1fr)`。

---

## 4. 代码风格

- React 19 + Vite 8 + CSS Modules（`camelCaseOnly`：CSS 写 kebab-case，TSX 用 `styles.boxLogo`，不要 `styles["box-logo"]`）
- 覆盖全局控件必须提权：`:global(.icon-button).pause-button`
- stylelint：`font-size` / `font-weight` / `z-index` / `gap` / `padding` / `margin` 必须用 token；属性顺序 recess-order；keyframe 用 `0%`/`100%`
- 新 z-index 先在 `globals.css` 加 token，禁止裸数字
- 文案在 `src/app/translations.ts`（Groups 的 zh-Hans 是「节点」）
- 日志不是黑底：用同一套玻璃。ANSI 对比读 `--material-bg`（`useLogBackground`），不要 `--terminal-bg`
- `DaemonApi.retryNow` / `reconnectNow` 要覆盖 OpenConnect、OpenVPN 以及 `serviceStatus`、`status`、`groups`、`clashMode`、`logs`、`connections`、`outbounds`、`tailscale`、`usbip`
- 工具详情路由必须带端点 tag，例如 `#/tools/tailscale/tailscale0`（mock tag：`tailscale0` / `oc0` / `ovpn0` / `usbip0`）

改完至少跑：

```sh
corepack pnpm lint:css && corepack pnpm lint && corepack pnpm exec tsc -b
```

UI 改动还要看浅色/深色，以及 390px 移动端。不要只看一张截图。

---

## 5. 本地运行

```sh
./run/start.sh          # mock :8090 + Vite :5173
./run/stop.sh
```

设置页 URL 填 `http://127.0.0.1:8090`（密钥可空）。填 5173 会 `[unimplemented] HTTP 404`。

```js
localStorage.setItem("sing-box-dashboard.servers", JSON.stringify({
  servers: [{ id: "mock", name: "本地模拟", url: "localhost:8090", secret: "mock" }],
  activeId: "mock",
}));
localStorage.setItem("sing-box-dashboard.theme", "light"); // 或 "dark"
localStorage.setItem("sing-box-dashboard.language", "zh-Hans");
```

协议细节见 `run/README.md`。Vite 跑久了可能吐旧 CSS，源码和计算样式对不上就重启 dev server。

---

## 6. 发布

标签 `YYYYMMDD`，同一天再发加序号：`20260919`、`202609192`。不要版本号，不要短线。附件永远叫 **`muboard.zip` / `muboard.tar.gz`**。

每次发版把 `latest` 标签挪到这次提交，这样这些地址永远是最新 dist：

- https://github.com/vxzman/muscboard/releases/latest/download/muboard.zip
- https://github.com/vxzman/muscboard/releases/latest/download/muboard.tar.gz
- https://github.com/vxzman/muscboard/releases/download/latest/muboard.zip
- https://github.com/vxzman/muscboard/releases/download/latest/muboard.tar.gz

```sh
DATE=$(date +%Y%m%d)
if git rev-parse -q --verify "refs/tags/$DATE" >/dev/null; then
  n=2
  while git rev-parse -q --verify "refs/tags/${DATE}$n" >/dev/null; do n=$((n + 1)); done
  DATE="${DATE}$n"
fi
corepack pnpm build
(cd dist && zip -qr /tmp/muboard.zip .)
tar -czf /tmp/muboard.tar.gz -C dist .
git tag -a "$DATE" -m "muscboard $DATE"
git tag -f -a latest -m "muscboard latest ($DATE)"
git push muboard HEAD:main
git push muboard "$DATE"
git push -f muboard latest
gh release create "$DATE" /tmp/muboard.zip /tmp/muboard.tar.gz \
  --title "muscboard $DATE" \
  --notes "Frontend build for muscboard $DATE." \
  --repo vxzman/muscboard
gh release delete latest --yes --repo vxzman/muscboard || true
gh release create latest /tmp/muboard.zip /tmp/muboard.tar.gz \
  --title "muscboard latest" \
  --notes "Always the newest frontend build (currently $DATE)." \
  --latest \
  --repo vxzman/muscboard
```

历史 `v0.1.0`–`v0.1.4` 仍在；带短线的日期标签已删。

---

## 7. 注意事项（踩过的坑）

1. **祖先 `filter` / `transform` / `isolation` 会吃掉毛玻璃。** `translate3d(0,0,0)` 也算。切页 100% 必须 `transform: none`，`PageTransition` 结束后卸掉 `.enter`。`#root` 不要 `isolation`。模糊看不见时先查这条，再调半径。
2. **74% 白 sheen 会把霜盖成奶白色。** 填充保持约 14%，sheen 只做高光。
3. **CSS Modules 只导出 camelCase。**
4. **`[class*="group-item"]` 会误伤 `.group-items`。**
5. **Dock 放大不要被 sticky 头切掉。** `.group-items` 留一点 `margin-top`；悬停 `z-index: var(--z-hover-pop)`（5，低于 sticky 的 10）。
6. **深色截图**：先写 `localStorage` 再 `Page.reload`，否则 React 主题状态还是浅色。
7. **合并上游**时冲突多半在 `globals.css` / `shared.css` / 各 view 的 CSS module。

---

## 8. 明确不要做的事

- 不要 push `origin`
- 不要把 `filter: blur()` 加到切页
- 不要给卡片加 `translateY` 悬停
- 不要把日志改回黑底
- 不要 bump `package.json` 版本号
- 不要把 `ignore/`、`dist/`、打包 zip/tar.gz 提交进仓库
- 不要在 `globals.css` 以外写死 hex 或裸 z-index
