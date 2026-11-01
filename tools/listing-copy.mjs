export const pair = (zh, en) => `${en}\n\n${zh}`;
export const copy = {
  changes: pair('请修改以下项目，完成后编辑此 Issue 或回复以重新检查。', 'Update the items below, then edit this issue or reply to rerun the checks.'),
  review: pair('暂时无法完成检查，等待维护者复查。', 'The checks could not be completed. Maintainer review is required.'),
  ready: number => pair(`已生成 PR #${number}，等待审核。`, `PR #${number} is ready for review.`),
  approval: pair('维护者：如 PR 显示等待批准，请先点击 Approve workflows to run，检查通过后再合并。', 'Maintainer: if the PR is awaiting approval, select Approve workflows to run and wait for the checks to pass before merging.'),
  published: pair('已收录，目录已更新。', 'The website is listed and the directory has been updated.'),
  unpublished: pair('PR 已合并，网站尚未显示在发布目录中。维护者将检查发布结果。', 'The PR has been merged, but the website is not yet in the published directory. The maintainer will check the deployment.'),
  unchanged: pair('目录中已有相同资料，无需重复提交。', 'The directory already contains these details. No new submission is needed.'),
  withdrawn: pair('此申请已关闭或移除收录标签，对应 PR 已关闭。', 'This request was closed or its listing label was removed. The related PR has been closed.'),
  templateLogo: pair('Logo 仍使用模板图片，建议替换为网站自己的 Logo。此项不影响收录检查。', 'The logo is still the template image. Consider using your own website logo. This does not block listing checks.'),
  network: pair('暂时无法访问网站，请稍后在此回复以重新检查。', 'The website could not be reached. Reply here later to rerun the checks.'),
  logoNetwork: pair('暂时无法读取 Logo，请确认图片地址后在此回复以重新检查。', 'The logo could not be loaded. Check the image URL and reply here to rerun the checks.'),
  portalConfig: pair('请将 home.config.js 中的 portal.directory 改为以下地址，重新部署后在此回复。', 'Set portal.directory in home.config.js to the URLs below, redeploy the website, then reply here.'),
  portalBroken: pair('传送门的跨站跳转或角色传递未通过检查，请修复后重新部署，并在此回复。', 'Cross-site navigation or character transfer did not pass the check. Fix the portal, redeploy the website, then reply here.'),
  portalReview: pair('自动检查未能确认传送门互通，等待维护者复查。', 'The automated check could not verify portal compatibility. Maintainer review is required.'),
  prBody: pair('已检查公共目录、跨站跳转、返回和角色传递，使用中英文浏览器语言及桌面、手机尺寸。合并前请审核网站内容和提交资料。', 'Public directory access, cross-site navigation, return navigation and character transfer were checked with Chinese and English browser languages at desktop and mobile sizes. Review the website content and submitted details before merging.'),
};
export const portalConfig = "```js\nportal: {\n  directory: [\n    'https://homecraft.terryhu.cn/worlds.json',\n    'https://terryhu7.github.io/homecraft/worlds.json'\n  ]\n}\n```";
export function portalMessage(report) {
  if (report.status === 'pass') return '';
  if (report.views.some(v => v.code === 'private_directory')) return `${copy.portalConfig}\n\n${portalConfig}`;
  return report.status === 'fail' ? copy.portalBroken : copy.portalReview;
}
export function fieldMessage(problem) {
  const field = problem.split(':')[0];
  const messages = {
    name: pair('网站名称需为 1–60 个字符，请替换模板名称 My Home。', 'Use a website name of 1–60 characters and replace the template name My Home.'),
    url: pair('请填写可公开访问的 HTTPS 网址，不包含账号、密码、查询参数或片段。', 'Enter a public HTTPS URL without credentials, query parameters or a fragment.'),
    owner: pair('作者名称需为 1–40 个字符。', 'Use an author name of 1–40 characters.'),
    lang: pair('请选择网站支持的语言。', 'Select the languages supported by the website.'),
    intro: pair('请填写 1–120 个字符的简介，或在 homecraft.json 中填写 intro。', 'Enter an introduction of 1–120 characters, or set intro in homecraft.json.'),
    logo: pair('请填写同一网站下的 HTTPS Logo 地址，或在 homecraft.json 中填写 logo。图片需小于或等于 100 KB。', 'Enter an HTTPS logo URL on the same website, or set logo in homecraft.json. The image must be no larger than 100 KB.'),
    preview: pair('预览图需为同一网站下的 HTTPS 图片地址，也可留空。', 'Use an HTTPS preview image URL on the same website, or leave it blank.'),
    homecraft: pair('请安装并保留可用的 Homecraft 传送门。', 'Install and keep a working Homecraft portal.'),
    added: pair('added 需使用 YYYY-MM-DD 日期格式。', 'Use the YYYY-MM-DD date format for added.'),
  };
  return messages[field] || pair('请按收录说明检查 JSON 字段。', 'Check the JSON fields against the listing guide.');
}
export function listingTitle(entry, update = false) {
  const name = typeof entry.name === 'string' ? entry.name : entry.name.en || entry.name.zh;
  return `chore(directory): ${update ? 'update' : 'add'} ${name}`;
}
export const statusText = {
  'PR title': {
    success: 'Title format is valid. / 标题格式正确。',
    failure: 'Use type(scope): description. / 请使用 type(scope): description 标题格式。',
  },
  'Listing request': {
    success: 'Request checked. / 申请已检查。',
    pending: 'Rechecking the request. / 正在重新检查申请。',
    failure: 'Request needs changes or another check. / 申请需修改或重新检查。',
  },
};
