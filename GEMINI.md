# 项目指令与记忆规则 (Memory & Rules)

## 1. Git 提交规范（重要记忆）
- **自动本地提交**：每次完成项目代码、样式、文档等修改后，自动执行 `git add` 并提交到本地 Git（`git commit`）。
- **严禁推送到远程仓库**：**切勿执行 `git push` 推送到 GitHub** 或其他远程仓库。所有改动仅保存在本地 Git 历史中。
- **提交信息格式**：保持简明扼要，遵循 Conventional Commits 风格（如 `fix: ...`, `feat: ...`, `style: ...`）。

## 2. 质量与验证规范
- 任何 UI 或功能调整后，务必运行：
  ```sh
  pnpm lint:css && pnpm lint && pnpm build
  ```
  确保零 stylelint 错误、零 eslint 错误，且生产打包顺利通过。
