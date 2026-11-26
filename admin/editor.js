const login = document.querySelector('#login');
const editor = document.querySelector('#editor');
const fields = document.querySelector('#fields');
const status = document.querySelector('#admin-status');
let content;
let refreshing;
const sections = { experience: 'Experience', skills: 'Technical skills', projects: 'Projects' };
async function request(path, method = 'GET', body, retry = true) {
  const response = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined });
  if (response.status === 401 && path === '/api/admin/office' && retry) {
    refreshing ??= request('/api/admin/refresh', 'POST').finally(() => { refreshing = null; });
    await refreshing;
    return request(path, method, body, false);
  }
  const result = await response.json().catch(() => null);
  if (!result && [404, 501].includes(response.status)) {
    throw Error('Start the Node server with npm run serve:office and open /admin on its port.');
  }
  if (!response.ok || !result) throw Object.assign(new Error(result?.error || 'Office server unavailable.'), { status: response.status });
  return result;
}
function element(tag, value) {
  const node = document.createElement(tag);
  if (value) node.textContent = value;
  return node;
}
function field(parent, title, object, key, multiline = false) {
  const label = element('label', title);
  const input = element(multiline ? 'textarea' : 'input');
  input.value = object[key];
  if (multiline) input.rows = 3;
  input.oninput = () => { object[key] = input.value; };
  label.append(input);
  parent.append(label);
  return input;
}
function imageField(parent, title, object, key) {
  const url = field(parent, title + ' URL', object, key);
  const file = element('input');
  file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp';
  const label = element('label', 'Or upload PNG, JPEG or WebP');
  label.append(file);
  parent.append(label);
  file.onchange = () => {
    const picked = file.files[0];
    if (!picked) return;
    if (!['image/png','image/jpeg','image/webp'].includes(picked.type) || picked.size > 750_000) {
      status.textContent = 'Choose a PNG, JPEG, or WebP image under 750 KB.';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { url.value = object[key] = reader.result; };
    reader.readAsDataURL(picked);
  };
}
function button(parent, text, action) {
  const node = element('button', text);
  node.type = 'button'; node.onclick = action; parent.append(node);
}
function draw() {
  fields.replaceChildren();
  const resume = element('fieldset');
  resume.append(element('legend', 'Résumé'));
  for (const [key, label] of [['title','Name'],['subtitle','Role'],['summary','Summary'],['education','Education']]) {
    field(resume, label, content.resume, key, key === 'summary');
  }
  imageField(resume, 'Résumé image', content.resume, 'image');
  fields.append(resume);
  for (const [key, label] of Object.entries(sections)) {
    const set = element('fieldset');
    set.append(element('legend', label));
    for (const [index, item] of content[key].entries()) {
      const row = element('fieldset');
      row.append(element('legend', label + ' entry ' + (index + 1)));
      field(row, 'Title', item, 'title');
      field(row, 'Details', item, 'detail', true);
      field(row, 'Link', item, 'link');
      button(row, 'Delete entry', () => { content[key].splice(index, 1); draw(); });
      set.append(row);
    }
    button(set, 'Add entry', () => { content[key].push({title:'',detail:'',link:''}); draw(); });
    fields.append(set);
  }
  const photos = element('fieldset');
  photos.append(element('legend','Living-room frames'));
  for (let i=0;i<3;i++) imageField(photos, 'Frame ' + (i+1), content.photos, i);
  fields.append(photos);
  const paintings = element('fieldset');
  paintings.append(element('legend', 'Library paintings'));
  imageField(paintings, 'West wall', content.libraryPaintings, 0);
  imageField(paintings, 'East wall', content.libraryPaintings, 1);
  fields.append(paintings);
}
function show(data) {
  content = { libraryPaintings: ['', ''], ...data }; draw(); login.hidden = true; editor.hidden = false;
}
login.onsubmit = async event => {
  event.preventDefault();
  try {
    await request('/api/admin/login','POST',Object.fromEntries(new FormData(login)));
    login.reset();
    show(await request('/api/admin/office'));
    status.textContent = '';
  } catch (error) { status.textContent = error.message; }
};
editor.onsubmit = async event => {
  event.preventDefault();
  try { await request('/api/admin/office','PUT',content); status.textContent = 'Changes saved.'; }
  catch (error) {
    if (error.status === 401) { login.hidden = false; }
    status.textContent = error.message;
  }
};
document.querySelector('#logout').onclick = async () => {
  try { await request('/api/admin/logout','POST',{}); location.reload(); }
  catch (error) { status.textContent = error.message; }
};
request('/api/admin/office').then(show).catch(error => { if (error.status !== 401) status.textContent = error.message; });
