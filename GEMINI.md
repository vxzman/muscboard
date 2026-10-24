# Agent brief

项目约定以 [docs/ENGINEERING.md](docs/ENGINEERING.md) 为准。

- 改完代码、样式、文档后做**本地 git commit**。
- **用户没明确说推送，就不要 `git push`。** 需要推时只推远端 `muboard`，不要推 `origin`。
- UI / 功能改完跑：`corepack pnpm lint:css && corepack pnpm lint && corepack pnpm exec tsc -b`。涉及界面时还要在浏览器里看浅色、深色和主路径。
