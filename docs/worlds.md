# Public Directory / 公共目录

The directory connects independently deployed websites through Homecraft portals. You can use the Homecraft template or add the [portal plugin](../plugin/) to an existing website.

公共目录通过 Homecraft 传送门连接独立部署的网站。你可以使用 Homecraft 模板，也可以在已有网站中安装[传送门插件](../plugin/)。

## Request listing / 申请收录

1. Deploy your website at a public HTTPS URL. Keep the shared directory and working cross-site navigation, return navigation and character transfer.
2. Open the [Request listing form](https://github.com/terryHu7/homecraft/issues/new?template=join.yml). Enter the website name, URL, author and supported languages. English translations are optional.
3. Provide an introduction and logo in the form or in [homecraft.json](site-metadata.md). If your website has no homecraft.json, fill in both fields. Host the logo on the same website, keep it within 100 KB, and use a square image; 128×128 is recommended. The template logo produces a suggestion and does not block listing.
4. The bot checks the details and portal, then creates a PR for review. You do not need to submit another PR. If changes are needed, edit the same issue or reply after redeploying to run the checks again.
5. After the PR is merged and the published directory is verified, the bot updates the issue with the publication result.

1. 将网站部署到可公开访问的 HTTPS 网址。保留公共目录，以及跨站跳转、返回和角色传递功能。
2. 填写[申请收录表单](https://github.com/terryHu7/homecraft/issues/new?template=join.yml)，提供网站名称、网址、作者和支持的语言。英文翻译可选。
3. 在表单或 [homecraft.json](site-metadata.md) 中提供简介和 Logo。网站没有 homecraft.json 时，请填写这两项。Logo 使用同一网站下的方形图片，大小不超过 100 KB，建议 128×128。模板 Logo 会收到替换建议，不影响收录检查。
4. 机器人检查资料和传送门后生成 PR，等待维护者审核，无需再提交 PR。需要修改时，编辑原 Issue；修改网站并重新部署后，也可直接回复原 Issue 触发复查。
5. PR 合并且发布后的目录核验通过后，机器人会更新 Issue 中的发布结果。

You may also submit a PR directly. Add one JSON file to directory/, using [terry.json](../directory/terry.json) as a reference. Include name, url, owner, lang, intro, logo and homecraft: true. Keep other changes in separate PRs. Use a title such as `chore(directory): add Example`.

也可以直接提交 PR：参考 [terry.json](../directory/terry.json)，在 directory/ 中新增一个 JSON 文件，包含 name、url、owner、lang、intro、logo，并设置 homecraft: true。其他改动另开 PR。标题示例：`chore(directory): add Example`。

## Updates and removal / 更新与移除

To update listing details, submit the form again with the same URL. To remove a listing, open an issue or submit a PR deleting its JSON file. The directory stores reviewed details; it does not automatically copy later changes from your website.

更新收录资料时，使用同一网址重新填写表单。移除收录时，提交 Issue，或提交删除对应 JSON 文件的 PR。目录保存审核后的资料，不会自动同步网站后续的内容变化。

Availability is checked on publication and every Monday. Unreachable websites are temporarily omitted and return after a later check succeeds. Updating the shared directory does not update code deployed on individual websites.

每次发布及每周一会检查网站是否可访问。暂时无法访问的网站会从发布目录中隐藏，后续检查通过后恢复。公共目录更新不会更新各网站已部署的代码。

See [directory maintenance](../directory/README.md) for maintainer steps and [the protocol](protocol.md) for compatibility requirements.

维护者操作见[目录维护说明](../directory/README.md)，互通要求见[传送门协议](protocol.md)。
