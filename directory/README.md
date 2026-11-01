# Directory Maintenance / 目录维护

This directory is maintained in the main Homecraft repository. Each website has one JSON file; Pages publishes worlds.json from these files. Website authors can use the [Request listing form](https://github.com/terryHu7/homecraft/issues/new?template=join.yml).

此目录由 Homecraft 主仓库维护。每个网站对应一个 JSON 文件，Pages 根据这些文件发布 worlds.json。网站作者可填写[申请收录表单](https://github.com/terryHu7/homecraft/issues/new?template=join.yml)。

## Review and merge / 审核与合并

- If a PR is awaiting workflow approval, select **Approve workflows to run**. Wait for **PR title**, **Listing request** and **Checks** to pass.
- Review the website content, author and changed entry. Automated checks verify data and portal behavior; they do not establish site ownership or approve its content.
- Merge one listing per PR using **Squash and merge**. Keep the final commit title the same as the PR title. Include `Closes #issue-number` in the PR body when there is an application issue.
- Confirm the Pages result. The bot reports publication only after the deployed directory matches the generated data and includes the reviewed entry. A merged PR alone does not confirm publication.

- PR 等待运行批准时，先点击 **Approve workflows to run**，等待 **PR title**、**Listing request** 和 **Checks** 全部通过。
- 审核网站内容、作者和变更资料。自动检查验证数据和传送门行为，不能证明网站归属，也不代替内容审核。
- 每个 PR 处理一个网站的收录，使用 **Squash and merge**，最终 commit 标题与 PR 标题一致。有申请 Issue 时，在 PR 正文中添加 `Closes #Issue编号`。
- 确认 Pages 发布结果。部署目录与生成数据一致，且包含审核后的条目时，机器人才能报告已发布。PR 合并不等于发布完成。

## Changes and checks / 修改与检查

- Edit a website's JSON to update its details; delete it to remove the listing. Manage pinned order, blocked URLs and directory links in _settings.json through a separate PR.
- An edited application invalidates its previous result. Closing the issue or removing its join label closes its open bot PR. Replies from the applicant or a maintainer trigger another check; other comments do not.
- The template logo is a suggestion. Invalid data or confirmed portal failures block new listings. Network failures and unrecognized custom interfaces require review and another check; they are not automatically accepted.
- Existing websites are checked for availability on publication and every Monday. Unreachable sites are temporarily omitted; logo and portal declaration problems are reported in the Actions summary. New and updated entries also run the browser compatibility check before merging.

- 编辑网站 JSON 可更新资料，删除文件可移除收录。置顶顺序、屏蔽网址和目录入口由 _settings.json 管理，另开 PR 修改。
- 编辑申请后，原检查结果失效。关闭 Issue 或移除 join 标签会关闭尚未合并的机器人 PR。申请人或维护者回复会重新检查，其他评论不会触发复查。
- 模板 Logo 仅提示替换。无效资料和已确认的传送门错误会阻止新增收录。网络异常或无法识别的自定义界面需要复查和重新检查，不会自动通过。
- 每次发布及每周一检查已有网站的可访问性。无法访问的网站暂时隐藏；Logo 和传送门声明的问题写入 Actions 摘要。新增和更新的条目在合并前还会执行浏览器互通检查。

```sh
npm ci
npx playwright install chromium
npm run directory
node tools/directory.mjs check --online --portal directory/example.json
```
