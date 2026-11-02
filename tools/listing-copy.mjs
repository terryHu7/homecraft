export const pair = (zh, en) => `${en}  \n${zh}`;
const dynamic = fn => {
  const def = fn();
  const f = arg => (typeof arg === 'string' && arg ? fn(arg) : def);
  for (const k of Object.getOwnPropertyNames(String.prototype)) {
    if (k !== 'constructor') {
      try { f[k] = (...args) => def[k](...args); } catch {}
    }
  }
  f[Symbol.toPrimitive] = () => def;
  f.toString = () => def;
  f.valueOf = () => def;
  return f;
};
export const copy = {
  retry: pair('编辑 Issue 或直接回复即可重新检查。', '🔄 Edit this issue or reply to rerun checks.'),
  review: pair('自动检查超时，可直接回复重试，或等待人工审核。', '⏳ Automated check timed out. Reply to retry, or wait for manual review.'),
  ready: number => pair(`检查通过！已生成 PR #${number}，等待审核合并。`, `🚀 Checks passed! PR #${number} is ready for review.`),
  approval: pair('如果 PR 提示需要批准工作流，请点击 `Approve workflows to run`。所有检查通过后再合并。', 'If workflow approval is required, select `Approve workflows to run`. Merge after all checks pass.'),
  published: pair('恭喜！网站已成功收录，传送门列表已更新。', '🎉 Congrats! Your website is listed and the portal list is updated.'),
  unpublished: pair('PR 已合并，正在同步到传送门...', '⏳ PR merged. Syncing to the portal...'),
  unchanged: pair('传送门列表中已有相同资料，无需更新。', 'The portal list already matches this submission. No update is needed.'),
  withdrawn: pair('收录申请已取消，对应 PR 已关闭。', 'The listing request has been cancelled. The related PR is closed.'),
  templateLogo: pair('建议换成自己的 Logo。', '💡 Consider using your own logo.'),
  network: dynamic(url => pair(`无法访问网站${url ? `：${url}` : ''}。`, `🌐 Website unreachable${url ? `: ${url}` : ''}.`)),
  logoNetwork: dynamic(url => pair(`Logo 加载失败${url ? `：${url}` : ''}。`, `🖼️ Logo failed to load${url ? `: ${url}` : ''}.`)),
  portalConfig: pair('请将 `home.config.js` 中的 `portal.directory` 设置为：', 'Set `portal.directory` in `home.config.js` to:'),
  portalBroken: pair('传送门跳转或返回失败，请检查配置。', '🌀 Portal navigation failed. Please check your portal setup.'),
  portalReview: pair('未检测到传送门配置。', '🚪 Portal configuration not detected.'),
  prBody: pair('公共目录和传送门互通检查已通过，覆盖中英文、桌面和手机尺寸。合并前请审核网站内容和收录资料。', 'Public directory and portal checks passed in Chinese and English at desktop and mobile sizes. Review the website content and listing details before merging.'),
};
export const portalConfig = "```js\nportal: {\n  directory: [\n    'https://terryhu7.github.io/homecraft/worlds.json'\n  ]\n}\n```";
export function portalMessage(report) {
  if (report.status === 'pass') return '';
  if (report.views.some(v => v.code === 'private_directory')) return `${copy.portalConfig}\n\n${portalConfig}`;
  return report.status === 'fail' ? copy.portalBroken : copy.portalReview;
}
export function fieldMessage(problem) {
  const field = problem.split(':')[0];
  const messages = {
    name: pair('请填写 1–60 个字符的网站名称，不要使用模板名称 My Home。', 'Enter a website name of 1–60 characters. Do not use the template name My Home.'),
    url: pair('请填写公开的 HTTPS 网址，不要带 ? 参数或 # 锚点。', 'Enter a public HTTPS URL without ? parameters or # anchors.'),
    owner: pair('请填写 1–40 个字符的作者名称。', 'Enter an author name of 1–40 characters.'),
    lang: pair('请选择网站支持的语言。', 'Select the languages supported by the website.'),
    intro: pair('请填写 1–120 个字符的简介，也可在 `homecraft.json` 中设置 `intro`。', 'Enter an introduction of 1–120 characters, or set `intro` in `homecraft.json`.'),
    logo: pair('请填写自己网站域名下的 Logo 链接（需小于 100 KB），也可在 `homecraft.json` 中设置 `logo`。', 'Enter a logo URL hosted on your own domain (< 100 KB), or set `logo` in `homecraft.json`.'),
    preview: pair('请填写自己网站域名下的预览图链接，也可留空。', 'Enter a preview image URL hosted on your own domain, or leave blank.'),
    homecraft: pair('网站需要接入可用的 Homecraft 传送门。', 'A working Homecraft portal is required.'),
    added: pair('请将 `added` 填写为 YYYY-MM-DD 格式的日期。', 'Set `added` to a date in YYYY-MM-DD format.'),
  };
  return messages[field] || pair('请参考收录说明检查填写的内容。', 'Please check your submission against the listing guide.');
}
export function listingTitle(entry, update = false) {
  const name = typeof entry.name === 'string' ? entry.name : entry.name.en || entry.name.zh;
  return `chore(directory): ${update ? 'update' : 'add'} ${name}`;
}
export const statusText = {
  'PR title': {
    success: 'Title format is valid. 标题格式正确。',
    failure: 'Use type(scope): description. 请使用 type(scope): description 标题格式。',
  },
  'Listing request': {
    success: 'Listing request check passed. 收录申请检查通过。',
    pending: 'Rechecking the listing request. 正在重新检查收录申请。',
    failure: 'Listing request check failed. 收录申请检查未通过。',
  },
};
