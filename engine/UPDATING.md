# Update Homecraft

Use official releases to update the shared engine while preserving site customizations. Updates apply to local source files; redeploy the website for them to take effect. Directory listing does not update deployed code.

## Check or update

Use Node.js 22 or newer. Run these commands in the **source project folder**, where `package.json`, `home.config.js`, and `engine/` live. Do not run them in `dist/`.

New forks include these shortcuts:

```sh
npm run update -- --check
npm run update
```

An older fork does not need to merge upstream or add a script first. Use the same official standalone tool:

```sh
npx --yes https://github.com/terryHu7/homecraft/releases/latest/download/homecraft-updater.tgz --check
npx --yes https://github.com/terryHu7/homecraft/releases/latest/download/homecraft-updater.tgz
```

Online commands require a published engine release. A missing Release or failed download leaves the site unchanged. `--check` only reports availability and conflicts; it does not create backups or change project files. The updater always uses the official `terryHu7/homecraft` Releases, regardless of your fork's remotes.

To request a particular stable version, add `--to v0.1.1`. To use a downloaded official engine bundle without another GitHub request, add `--bundle /path/to/homecraft-engine.json`. The tool verifies file hashes in a downloaded bundle; for an offline file, also compare its SHA-256 with the official Release's `SHA256SUMS`.

## Files and backups

The tool changes `engine/` and, on first adoption, appends a marked update instruction block to `AGENTS.md`. Existing project rules are kept. It does not replace `world/`, `index.html`, root `assets/`, `home.config.js`, `homecraft.json`, package scripts, or deployment files. Old mailbox forms without a subject control still work: the new frontend derives a subject from the message. Forms that have a subject control still require it. No-JavaScript forms remain as authored in `index.html`.

Before applying an update, the tool saves the existing engine and any affected Agent instructions under `~/.homecraft/updates/` (the user's home folder on each OS). It checks the recorded official baseline and actual historical upstream file hashes, including early official changes whose manifest still said `0.1.0`. Local changes to files unchanged upstream are preserved.

If the installed manifest does not match an official baseline, automatic updates stop. Verify the original version from Git history before retrying. Local deletions of tracked engine files require conflict resolution, even when upstream has not changed those files.

When both you and upstream changed a file differently, nothing is applied. Give your Agent the printed report folder: `base/`, `local/`, `incoming/`, and `report.json`. Missing files indicate additions or deletions. If the baseline is unknown, the Agent must establish it from Git history before merging. Resolve the whole upgrade together, inspect the diff, and test; do not skip a conflicted file and install an incomplete engine. Keep the release manifest as the official baseline, so local customizations remain visible in checks.

The report also contains a `prepared/` engine directory. Merge only the reported conflicting files there and restore any missing files required by the target release. Then run the same update command with `--apply-resolution "<report folder>"`. This applies the complete prepared engine and saves a backup. It stops if required files are missing, source files changed after the report, or unreported files in `prepared/` were edited. Do not copy prepared files into the source engine individually or rerun the original update after a partial manual merge.

To undo an applied update, run the same update command with `--rollback "<printed backup folder>"`. It saves the current engine before restoring. If Agent instructions were edited after the update, preserve those edits before rolling back. Do not delete a backup until you have checked the deployed result.

## Agent workflow

1. When the owner asks to update or upgrade a Release, inspect local changes and run the check above. Read the official stable Release notes at <https://github.com/terryHu7/homecraft/releases>; explain the fixes and any migration that affects this site. During diagnosis of a shared engine issue, check once for a related upstream fix and mention it. A read-only check is not authorization to apply unrelated changes; use the owner's current request to determine scope. Avoid repeated notices for an unchanged Release.
2. Use the official updater for the requested update. Preserve unfinished work and individual design choices. Inspect the diff and any conflict report; do not reset the fork or overwrite its entire template. Follow this file for older forks whose local tools or rules do not mention upgrades. The first update adds a pointer in their `AGENTS.md`, so later Agents can find this workflow.
3. Run the site's existing checks and preview it. At minimum, verify startup, movement, Portal opening/listings, cards, the enabled mailbox mode, and all enabled languages at desktop and mobile sizes. Existing early checks may not test mailbox submission; test that path separately without sending real mail. Explain failures rather than changing personal metadata just to clear warnings.
4. Commit and redeploy through the site's existing hosting when authorized. A source update alone is not a live update. Verify the deployed behavior before saying the public site has been updated. The optional mailbox Worker and regular-website Portal plugin are separate deployments; this command does not update them.
