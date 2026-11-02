# Directory Maintenance

This directory is maintained in the main Homecraft repository. Each website has one JSON file; Pages publishes worlds.json from these files. Website authors can use the [Request listing form](https://github.com/terryHu7/homecraft/issues/new?template=join.yml).

## Review and merge

- If a PR is awaiting workflow approval, select **Approve workflows to run**. Wait for **PR title**, **Listing request** and **Checks** to pass.
- Review the website content, author and changed entry. Automated checks verify data and portal behavior; they do not establish site ownership or approve its content.
- Merge one listing per PR using **Squash and merge**. Keep the final commit title the same as the PR title. Include `Closes #issue-number` in the PR body when there is an application issue.
- Confirm the Pages result. The bot reports publication only after the deployed directory matches the generated data and includes the reviewed entry. A merged PR alone does not confirm publication.

## Changes and checks

- Edit a website's JSON to update its details; delete it to remove the listing. Manage pinned order, blocked URLs and directory links in _settings.json through a separate PR.
- An edited application invalidates its previous result. Closing the issue or removing its join label closes its open bot PR. Replies from the applicant or a maintainer trigger another check; other comments do not.
- The template logo is a suggestion. Invalid data or confirmed portal failures block new listings. Network failures and unrecognized custom interfaces require review and another check; they are not automatically accepted.
- Existing websites are checked for availability on publication and every Monday. Unreachable sites are temporarily omitted; logo and portal declaration problems are reported in the Actions summary. New and updated entries also run the browser compatibility check before merging.

```sh
npm ci
npx playwright install chromium
npm run directory
node tools/directory.mjs check --online --portal directory/example.json
```
