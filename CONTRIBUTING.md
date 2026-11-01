# Contributing to Homecraft

See the [public directory](docs/worlds.md) for the [Request listing](https://github.com/terryHu7/homecraft/issues/new/choose) process.

## Submitting Project Changes

- Open an issue describing the problem and proposed changes. For changes to `engine/`, explain the effect on existing websites.
- Keep the [portal protocol](docs/protocol.md) backward compatible. New fields may be added; existing fields must not be renamed, removed, or given a different meaning. After changing `engine/door-*.js`, run `node tools/sync-protocol.mjs` to sync updates to `plugin/`.
- Follow the development conventions in [AGENTS.md](AGENTS.md). Check interface changes in both Chinese and English, on desktop and mobile.
- Run `npm run check:site` before submitting. After installing dependencies, run `npm run check` and `npm run check:portal`.
- When releasing a new engine version, the maintainer runs `node tools/engine-manifest.mjs <version>` to update `engine/manifest.json`.

## PRs and Commits / PR 与提交

Keep each PR focused on one change. Use an English title in the form `type(scope): description`; retain website names in their original language. Types: feat, fix, perf, docs, test, refactor, build, ci, chore, revert. For listings, use `chore(directory): add Example`, `update Example` or `remove Example`. Submit listing data separately from code and workflow changes.

每个 PR 处理一项独立改动。标题使用英文格式 `type(scope): description`，网站名称保留原名。类型包括 feat、fix、perf、docs、test、refactor、build、ci、chore、revert。收录标题使用 `chore(directory): add Example`、`update Example` 或 `remove Example`。收录数据与代码、工作流改动分开提交。

Describe the change and validation in the PR. Contributors may write in Chinese or English. Public forms, bot replies and shared instructions provide English first, followed by Chinese. Maintainers use Squash and merge with the PR title as the final commit title; intermediate commits do not need to be rewritten just for formatting.

PR 中说明改动及验证结果，贡献者可以使用中文或英文。公共表单、机器人回复和通用说明提供英文在前、中文在后的完整内容。维护者使用 Squash and merge，最终 commit 使用 PR 标题；不要求贡献者仅为统一格式重写中间提交。
