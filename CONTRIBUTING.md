# Contributing to Homecraft

See the [public directory](docs/worlds.md) for the [Request listing](https://github.com/terryHu7/homecraft/issues/new/choose) process.

## Submitting Project Changes

- Open an issue describing the problem and proposed changes. For changes to `engine/`, explain the effect on existing websites.
- Keep the [portal protocol](docs/protocol.md) backward compatible. New fields may be added; existing fields must not be renamed, removed, or given a different meaning. After changing `engine/door-*.js`, run `node tools/sync-protocol.mjs` to sync updates to `plugin/`.
- Follow the development conventions in [AGENTS.md](AGENTS.md). Check interface changes in both Chinese and English, on desktop and mobile.
- Run `npm run check:site` before submitting. After installing dependencies, run `npm run check` and `npm run check:portal`.
- When releasing a new engine version, the maintainer runs `node tools/engine-manifest.mjs <version>` to update `engine/manifest.json`.

## PRs and Commits

Keep each PR focused on one change. Use an English title in the form `type(scope): description`; retain website names in their original language. Types: feat, fix, perf, docs, test, refactor, build, ci, chore, revert. For listings, use `chore(directory): add Example`, `update Example` or `remove Example`. Submit listing data separately from code and workflow changes.

Describe the change and validation in concise English. Write technical documentation, Agent and skill instructions, workflow descriptions, and release notes in English. Public forms and bot replies provide complete English and Chinese text, with English first.

Wait for PR title, Listing request and Checks to pass before merging. Use Squash and merge with the PR title for normal changes. Use Rebase and merge for listing PRs and listing-contributor backfills to preserve applicant authorship; keep one commit per listing or acknowledged applicant. Verify the published result before reporting completion.
