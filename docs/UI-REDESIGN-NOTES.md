# UI 重绘改造笔记（muscboard）

> 用途：记录本次 UI 深度定制（Material You 毛玻璃 + Apple Flat 多彩）中**改过什么**、
> **踩过什么坑**、**下次怎么改不用反复试**。改 UI 前先读这一份。

---

## 1. 设计语言与设计令牌

风格定位：**毛玻璃（frosted glass）打底 + iOS 多彩渐变控件 + Dock 式弹性动效**。
所有颜色/间距/圆角/模糊都在 `src/styles/globals.css` 定义，改 UI 先改令牌，不要到处写死。

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--glass-blur` | 34px | 全局毛玻璃模糊强度（卡片 24–26px） |
| `--glass-bg` / `--glass-bg-strong` | 深浅两套 | 玻璃底色（随主题切换） |
| `--glass-border` | — | 玻璃描边 |
| `--glass-saturate` | 200% | 玻璃饱和度 |
| `--ios-blue/green/orange/purple/indigo/gray` | iOS 系统色 | 语义色 |
| `--ios-grad-*` | `linear-gradient(...)` | 渐变（按钮/图标/徽章主用） |
| `--ios-grad-brand` | 蓝→靛 | Logo / 主品牌渐变 |
| `--z-sticky-header` | 10 | 组卡片 sticky 头部 |
| `--z-hover-pop` | 5 | 悬停放大元素的层级（低于 sticky 头） |

**主渐变配色约定**（按语义，别乱换）：

- 上传=绿、下载=蓝、状态/测速=橙、连接/组=紫/靛、设置=灰、品牌=蓝→靛
- 徽章默认=蓝渐变白字；测速按钮=橙渐变胶囊；展开按钮=靛渐变胶囊

---

## 2. 需要重绘的元素清单（改 UI 时对照这个清单逐个检查）

### 2.1 品牌 Logo（纸箱）

- 组件：`src/components/BoxLogo.tsx` + `BoxLogo.module.css`
- 纯 CSS 手绘等距纸箱（三面 `clip-path` + 渐变 + 顶面胶带），**不是 SVG**
- 使用位置（三处，替换了原 "S" 方块）：侧栏（38px）、移动端顶栏（24px）、设置页 Brand（34px）
- 改 Logo 形状：改 `BoxLogo.module.css` 里三个面的 `clip-path: polygon(...)` 坐标

### 2.2 侧栏导航项（`src/App.module.css`）

- `.nav-item`：`padding: var(--space-10) var(--space-14)`、字号 `--text-md`、图标方块 32px
- 每个页面颜色由 `[data-page="..."]` 指定 `--nav-color` / `--nav-grad`
- 动画：激活时 `nav-pop`（菜单项弹一下）、`icon-pop`（图标旋转弹入）

### 2.3 页面切换动画

- `src/styles/globals.css` 的 `@keyframes page-in`：上移 16px + `scale(0.985)` + 两段式回弹
- `src/styles/shared.css` 的 `.page` / `.page-full`：`0.36s cubic-bezier(0.22, 1, 0.36, 1)`
- **注意：page-in 里不要加 `filter: blur()`**（见坑 4）

### 2.4 节点页（GroupsView）

| 元素 | 位置 | 样式 |
| --- | --- | --- |
| 测速按钮 | `GroupsView.module.css` `.url-test-button` | 橙渐变胶囊，测速中 `url-test-pulse` 脉冲 + spinner |
| 展开按钮 | `.expand-button` | 靛渐变胶囊（与测速成对） |
| 数字徽章 | `shared.css` `.badge`（全局） | 蓝渐变白字 + 柔光 |
| 节点卡片网格 | `.group-items` | `repeat(auto-fit, minmax(min(220px,100%),1fr))`，**不是 auto-fill** |
| 节点卡片悬停 | `.group-item:hover` | `scale(1.05) translateY(-3px)` + `z-index: var(--z-hover-pop)` |

### 2.5 概述页（OverviewView）

- 左上角仪表按钮：`.dashboard-items-button`（tune 图标）→ 蓝渐变圆形
- `.card-grid .card`：按 `data-icon` 加角落淡彩 `radial-gradient`，悬停 `scale(1.025)` 上浮
- 卡片头部图标：30px 渐变块（26px→30px）

### 2.6 三点菜单（连接/日志页共用）

- `shared.css` `.menu-anchor > .icon-button`：玻璃圆钮 + 描边，打开时蓝渐变填充

### 2.10 工具二级页面图标（Tailscale / OpenConnect / OpenVPN / USB/IP 等）

- `shared.css` `.nav-line > .icon:first-child`：详情卡片行图标统一为 26px 彩色渐变块
  （默认靛蓝，按 `data-icon` 映射：power=灰、qr_code=紫、terminal=青、computer=蓝、
  share=青、delete=红、open_in_new=蓝、more_horiz=灰……）
- `.empty-state .icon`：空状态图标升级为 56px 渐变圆角块（hub=青、usb=紫、route=靛、
  folder/dashboard=蓝、text_snippet=灰、warning=橙）
- `.back-button`（二级页返回）：毛玻璃圆钮，悬停弹性放大 + 蓝描边
- **改图标配色时，映射要同时覆盖三处选择器**：`.card-header > .icon[data-icon="..."]`、
  `.nav-row > .icon:first-child[data-icon="..."]`、`.nav-line > .icon:first-child[data-icon="..."]`

### 2.7 日志暂停按钮（LogsView.module.css）

- `.pause-button`：空闲=玻璃圆钮；`active`（暂停中）=橙渐变填充 + 白图标 + 光晕

### 2.8 设置 → 偏好行（SettingsView）

- 语言/外观/主题三行加了彩色图标块（`language`=蓝、`tune`=紫、`palette`=橙）
- `icon-segmented` 激活项：蓝渐变白图标（原来是灰底蓝图标）
- `.settings-row` 悬停底色、圆角

### 2.9 服务器选择按钮（侧栏底部，`App.module.css`）

- `.server-picker-button`：实色蓝→靛渐变胶囊 + 白字，悬停弹性放大
- 副文本（uptime）与箭头用半透明白，别用 `--text-faint`（会看不清）

---

## 3. 踩过的坑（下次不用再踩）

### 坑 1：CSS Modules 只导出 camelCase 键

Vite 的 CSS Modules 默认 `camelCaseOnly`：

```ts
styles["box-logo"]   // ❌ undefined！类名不生效
styles.boxLogo       // ✅ 正确
```

CSS 里类名写 kebab-case（`.box-logo`），**TSX 里一律用 camelCase 引用**。

### 坑 2：`[class*="xxx"]` 子串匹配会误伤

`[class*="group-item"]` 会同时匹配 `.group-items`（网格容器）：

```ts
// ❌ 会选到容器而不是卡片
document.querySelector('[class*="group-item"]')
// ✅ 排除容器
document.querySelector('[class*="group-item"]:not([class*="group-items"])')
```

### 坑 3：模块样式覆盖全局控件必须提权

模块 CSS 注入顺序不保证在 `shared.css` 之后，同优先级（0,1,0）会被 `.icon-button`
等全局类覆盖。**凡覆盖 `.icon-button` / `.button` / `.card` / `.badge` 的模块样式，
一律写成组合选择器提权**：

```css
/* ❌ .pause-button 会被 .icon-button 覆盖 */
.pause-button { ... }
/* ✅ 优先级 (0,2,0) */
:global(.icon-button).pause-button { ... }
```

### 坑 4：动画里加 `filter: blur()` 会破坏毛玻璃

祖先元素的 `filter` 会让后代 `backdrop-filter` 短暂失效（玻璃变实心）。`page-in`
最初加了 `blur(2px)` 后来删掉，**只保留 transform/opacity**。

### 坑 5：Dock 放大被 sticky 头部遮住

组卡片头部 `position: sticky; z-index: 10`，节点向上放大时会被它“切掉一半”。解法：

1. `.group-items` 加 `margin-top: var(--space-8)` 给放大留空间
2. 悬停元素 `z-index: var(--z-hover-pop)`（=5，**低于** sticky 头的 10，滚动时头部仍正常覆盖）
3. 放大程度克制：节点 1.05、卡片 1.025，别超过 1.1

### 坑 6：stylelint 规则（改 CSS 前先记住）

- **禁止十六进制色**（`globals.css` 除外）→ 用 `rgb(0 122 255 / 35%)` / `color-mix()`
- `font-size` / `font-weight` / `z-index` / `gap` / `padding` / `margin` **必须用 CSS 变量**
  （或 `0` / `auto` / `none` 等关键字）
- 属性顺序（recess-order）：`z-index` 在最前组，`box-shadow` 在 `filter`/`transform` 前
- keyframe 用 `0%` / `100%`，别用 `from` / `to`
- 模块类名必须 kebab-case
- 新增 z-index 等到 `globals.css` 定义 token，别写裸数字

### 坑 7：别忘全局控件（改 UI 时最容易漏）

共享控件改一处影响全部页面：`.badge`、`.icon-button`、`.menu-anchor > .icon-button`、
`.icon-segmented`、`.settings-row`、`.button`。改之前先 `grep` 谁在用。

---

## 4. 修改与验证流程（改完不用反复试）

### 4.1 改完必跑

```sh
corepack pnpm lint:css && corepack pnpm lint && corepack pnpm build
```

### 4.2 本地预览（需要两个服务）

```sh
MOCK_PORT=8099 node --experimental-transform-types mock-backend/server.ts
                                      # 新版自包含模拟后端 :8099（支持终端/Taildrop/USB-IP 流）
corepack pnpm dev --port 5173         # Vite :5173
```

> 旧的单文件模拟器在 `mock-backend/legacy/mock-daemon.mjs`（仅基础状态/节点/日志）。

注入本地服务器配置后即可登录：

```js
localStorage.setItem("sing-box-dashboard.servers", JSON.stringify({
  servers: [{ id: "mock", name: "本地模拟", url: "localhost:8099", secret: "mock" }],
  activeId: "mock",
}));
localStorage.setItem("sing-box-dashboard.theme", "dark"); // 或 "light"
```

### 4.3 验证要点（本轮踩过的测试点）

- 改样式后不要只看截图，用 `getComputedStyle` 确认生效（防止坑 3 的覆盖问题）
- 悬停效果用 CDP `Input.dispatchMouseEvent` 触发，再查 `transform`（应为 `matrix(...)`）
- 检查悬停元素是否被遮挡：`document.elementFromPoint(元素顶部)` 应命中元素本身
- 节点多的情况：临时给 mock 加 30 个节点测网格换行 + 末行悬停，测完**还原**
- 深色/浅色都要看；移动端顶栏用 390px 视口

### 4.4 发布（已配置好 gh + SSH 443）

```sh
corepack pnpm build
git tag -a vX.Y.Z -m "..." && git push github vX.Y.Z
gh release create vX.Y.Z <zip> --title "muscboard vX.Y.Z" --notes-file RELEASE_NOTES.md --repo vxzman/muscboard
```

---

## 5. 其他注意事项

- 文案改 `src/app/translations.ts`（例：`Groups` zh-Hans 已改为“节点”）
- 仓库是 GPL-3.0-or-later fork，README 保留原作者版权与“非官方”声明，LICENSE 别动
- `origin` 是上游（gh-proxy 镜像），`github` 是 muscboard（SSH 443）；上游大改时
  `git fetch origin && git merge origin/main`，定制集中在少数 CSS 文件，冲突好定位
- `latest/` 文件夹已加入 `.gitignore`，**永远不会被推送**；它是上游最新版的对照参考
