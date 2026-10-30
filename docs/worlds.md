# Public Directory

The public directory lists website links for portals to display. Each website is independently deployed by its author.

## Request listing

Before applying, prepare the following:

- An accessible HTTPS URL.
- An active portal. Homecraft websites keep the template's built-in portal; other websites can install the [portal plugin](../plugin/).
- A website name, author name, language, introduction and logo. The introduction and logo can be supplied in the request form or read from the website's [`homecraft.json`](site-metadata.md). Host the square logo on the same website; 128×128 is recommended, with a maximum size of 100 KB.

Complete the [Request listing](https://github.com/terryHu7/homecraft/issues/new/choose) form in the main repository. Automated checks create a pull request for the maintainer to review. If a check fails, the issue lists the required changes; editing the issue runs the checks again.

You can also submit a pull request directly: add a JSON file to `directory/`, using `terry.json` as a reference. Include `name`, `url`, `owner`, `lang`, `intro` and `logo`, and set `homecraft: true`. The pull request should contain only this file.

## Updating and Removing

The directory shows reviewed information and does not automatically follow later changes to your website. To update the name, introduction, logo or preview image, submit the Request listing form again with the same URL. To remove a listing, open an issue or submit a pull request that deletes the corresponding file.

The directory updates when the main repository is published. Temporarily unreachable websites are automatically hidden and restored after a subsequent check succeeds.

See [directory/README.md](../directory/README.md) for maintenance details and the [portal protocol](protocol.md) for the data format.
