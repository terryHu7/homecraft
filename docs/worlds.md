# Public Directory

The directory connects independently deployed websites through Homecraft portals. You can use the Homecraft template or add the [portal plugin](../plugin/) to an existing website.

## Request listing

1. Deploy your website at a public HTTPS URL. Keep the shared directory and working cross-site navigation, return navigation and character transfer.
2. Open the [Request listing form](https://github.com/terryHu7/homecraft/issues/new?template=join.yml). Enter the website name, URL, author and supported languages. English translations are optional.
3. Provide an introduction and logo in the form or in [homecraft.json](site-metadata.md). If your website has no homecraft.json, fill in both fields. Host the logo on the same website, keep it within 100 KB, and use a square image; 128×128 is recommended. The template logo produces a suggestion and does not block listing.
4. The bot checks the details and portal, then creates a PR for review. You do not need to submit another PR. If changes are needed, edit the same issue or reply after redeploying to run the checks again.
5. After the PR is merged and the published directory is verified, the bot updates the issue with the publication result.

The bot credits the GitHub account that opened the accepted request as the commit author and adds a source-linked acknowledgment to [Community Contributors](../CONTRIBUTORS.md). Maintainers use **Rebase and merge** to retain that authorship. GitHub calculates the native Contributors list from qualifying commits on the default branch; its statistics may take time to refresh and have display limits.

You may also submit a PR directly. Add one JSON file to directory/, using [terry.json](../directory/terry.json) as a reference. Include name, url, owner, lang, intro, logo and homecraft: true. Keep other changes in separate PRs. Use a title such as `chore(directory): add Example`.

## Updates and removal

To update listing details, submit the form again with the same URL. To remove a listing, open an issue or submit a PR deleting its JSON file. The directory stores reviewed details; it does not automatically copy later changes from your website.

Availability is checked on publication and every Monday. Unreachable websites are temporarily omitted and return after a later check succeeds. Updating the shared directory does not update code deployed on individual websites.

See [directory maintenance](../directory/README.md) for maintainer steps and [the protocol](protocol.md) for compatibility requirements.
