// ── AUTH ──────────────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem('folio_token'); }
function getUser()  { try { return JSON.parse(localStorage.getItem('folio_user') || '{}'); } catch(e) { return {}; } }

function updateNavUser() {
  const user = getUser();
  const userEl = document.getElementById('nav-user');
  if (user.name && userEl) userEl.textContent = '👤 ' + user.name;
}

function logout() {
  localStorage.removeItem('folio_token');
  localStorage.removeItem('folio_user');
  localStorage.removeItem('folio_portfolio');
  window.location.href = '/';
}

async function autoSaveResume(data) {
  const token = getToken();
  if (!token) return;
  try {
    await fetch('/api/save-resume', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ token, resumeData: data })
    });
  } catch(e) {}
}

async function loadSavedResume() {
  const token = getToken();
  if (!token) return;
  try {
    const res = await fetch('/api/get-resume', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ token })
    });
    const data = await res.json();
    if (data.success && data.resumeData) fillForm(data.resumeData);
  } catch(e) {}
}

// ── STATE ─────────────────────────────────────────────────────────────────────
let selectedTemplate = 'classic';
let skills = [];
let expCount = 0, eduCount = 0, projCount = 0;
let shareId = Math.random().toString(36).substr(2, 8);

// ── START APP ─────────────────────────────────────────────────────────────────
function goHome() {
  document.getElementById("hero").style.display = "block";
  document.getElementById("app").style.display = "none";
  document.getElementById("nav-home-btn").style.display = "none";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startApp(mode) {
  if (!getToken()) { window.location.href = "/login.html?redirect=/"; return; }
  document.getElementById("nav-home-btn").style.display = "block";
  document.getElementById('hero').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  if (mode === 'manual') { addExp(); addEdu(); showStep(2); }
  else showStep(1);
}
function skipUpload() { addExp(); addEdu(); showStep(2); }

// ── STEP NAVIGATION ───────────────────────────────────────────────────────────
function showStep(n) {
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('step-' + n).classList.add('active');
  if (n > maxStepReached) maxStepReached = n;
  for (let i = 1; i <= 6; i++) {
    const dot = document.getElementById('dot-' + i);
    if (!dot) continue;
    dot.classList.remove('active', 'done');
    if (i < n) dot.classList.add('done');
    if (i === n) dot.classList.add('active');
    // Show pointer cursor only on reachable steps
    dot.style.cursor = i <= maxStepReached ? 'pointer' : 'default';
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function goStep(n) { showStep(n); }

// Click on step dot to jump — only allow visited steps
let maxStepReached = 1;
function jumpStep(n) {
  if (n <= maxStepReached) showStep(n);
}

// ── UNIVERSAL UPLOAD ──────────────────────────────────────────────────────────
const ACCEPTED_EXT = ['.pdf','.jpg','.jpeg','.png','.webp','.tiff','.bmp','.txt'];

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'pdf') return '📄';
  if (['jpg','jpeg','png','webp','bmp','tiff'].includes(ext)) return '🖼️';
  return '📝';
}

function dragOver(e) {
  e.preventDefault();
  document.getElementById('upload-zone').classList.add('drag-over');
}
function dragLeave(e) {
  document.getElementById('upload-zone').classList.remove('drag-over');
}
function dropFile(e) {
  e.preventDefault();
  document.getElementById('upload-zone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
}
function handleFile(e) {
  const file = e.target.files[0];
  if (file) loadFile(file);
}
function loadFile(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!ACCEPTED_EXT.includes(ext)) {
    showToast('❌ Unsupported file. Use PDF, JPG, PNG, or TXT');
    return;
  }
  document.getElementById('file-icon-display').textContent = getFileIcon(file.name);
  document.getElementById('file-name').textContent = file.name;
  document.getElementById('file-size').textContent = (file.size / 1024).toFixed(0) + ' KB  ·  ' + ext.toUpperCase().replace('.','');
  document.getElementById('file-selected').classList.add('show');
  document.getElementById('upload-zone').style.display = 'none';
  document.getElementById('extract-area').classList.add('show');
  document.getElementById('extract-success').classList.remove('show');
  document.getElementById('next-from-upload').style.display = 'none';
  window._uploadFile = file;
}
function removeFile() {
  document.getElementById('file-selected').classList.remove('show');
  document.getElementById('upload-zone').style.display = '';
  document.getElementById('extract-area').classList.remove('show');
  document.getElementById('extract-progress').classList.remove('show');
  document.getElementById('extract-success').classList.remove('show');
  document.getElementById('next-from-upload').style.display = 'none';
  document.getElementById('pdf-input').value = '';
  window._uploadFile = null;
}

// ── EXTRACT & AUTOFILL ────────────────────────────────────────────────────────
async function extractFromPDF() {
  if (!window._uploadFile) { showToast('Please select a file first!'); return; }

  const btn = document.getElementById('extract-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Extracting…';

  const prog = document.getElementById('extract-progress');
  const fill = document.getElementById('progress-fill');
  const msg  = document.getElementById('progress-msg');
  prog.classList.add('show');

  try {
    setProgress(fill, msg, 15, 'Uploading file to server…');

    const formData = new FormData();
    formData.append('file', window._uploadFile);

    setProgress(fill, msg, 35, 'Reading & extracting text (OCR if image)…');

    const res  = await fetch('/api/extract', { method: 'POST', body: formData });
    const json = await res.json();

    if (!res.ok || !json.success) throw new Error(json.error || 'Extraction failed');

    setProgress(fill, msg, 80, 'Auto-filling all fields…');
    await autofill(json.data);

    setProgress(fill, msg, 100, 'Done!');
    setTimeout(() => {
      prog.classList.remove('show');
      document.getElementById('extract-success').classList.add('show');
      document.getElementById('next-from-upload').style.display = 'inline-flex';
      btn.innerHTML = '✦ Re-extract';
      btn.disabled  = false;
    }, 500);

    showToast('✦ Resume auto-filled successfully!');

  } catch (err) {
    prog.classList.remove('show');
    btn.innerHTML = '✦ Extract & Auto-Fill with AI';
    btn.disabled  = false;
    showToast('❌ ' + err.message);
  }
}

function setProgress(fill, msg, pct, text) {
  fill.style.width = pct + '%';
  msg.textContent  = text;
}

// ── AUTOFILL ──────────────────────────────────────────────────────────────────
async function autofill(data) {
  if (data.name)     document.getElementById('name').value     = data.name;
  if (data.title)    document.getElementById('title').value    = data.title;
  if (data.email)    document.getElementById('email').value    = data.email;
  if (data.phone)    document.getElementById('phone').value    = data.phone;
  if (data.location) document.getElementById('location').value = data.location;
  if (data.website)  document.getElementById('website').value  = data.website;
  if (data.summary)  document.getElementById('summary').value  = data.summary;

  if (Array.isArray(data.skills) && data.skills.length) {
    skills = data.skills;
    renderSkills();
  }

  document.getElementById('exp-list').innerHTML  = '';
  document.getElementById('edu-list').innerHTML  = '';
  document.getElementById('proj-list').innerHTML = '';
  expCount = 0; eduCount = 0; projCount = 0;

  if (Array.isArray(data.experience) && data.experience.length) data.experience.forEach(addExp);
  else addExp();

  if (Array.isArray(data.education) && data.education.length) data.education.forEach(addEdu);
  else addEdu();

  if (Array.isArray(data.projects) && data.projects.length) data.projects.forEach(addProj);
}

// ── SKILLS TAGS ───────────────────────────────────────────────────────────────
function addSkill(e) {
  if (e.key !== 'Enter') return;
  const val = e.target.value.trim();
  if (!val || skills.includes(val)) { e.target.value = ''; return; }
  skills.push(val);
  renderSkills();
  e.target.value = '';
}
function removeSkill(s) { skills = skills.filter(x => x !== s); renderSkills(); }
function renderSkills() {
  const wrap  = document.getElementById('skills-wrap');
  const input = document.getElementById('skills-input');
  wrap.innerHTML = '';
  skills.forEach(s => {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `${s} <button onclick="removeSkill('${s.replace(/'/g,"\\'")}')">×</button>`;
    wrap.appendChild(tag);
  });
  wrap.appendChild(input);
}

// ── REPEATERS ─────────────────────────────────────────────────────────────────
function addExp(p = {}) {
  const id = expCount++;
  const div = document.createElement('div');
  div.className = 'repeater-item'; div.id = 'exp-' + id;
  div.innerHTML = `
    <button class="remove-btn" onclick="document.getElementById('exp-${id}').remove()">Remove</button>
    <div class="form-grid">
      <div class="field"><label>Job Title</label><input type="text" id="exp-title-${id}" placeholder="Software Engineer" value="${esc(p.title)}"/></div>
      <div class="field"><label>Company</label><input type="text" id="exp-company-${id}" placeholder="Acme Corp" value="${esc(p.company)}"/></div>
      <div class="field"><label>Start Date</label><input type="text" id="exp-start-${id}" placeholder="Jan 2022" value="${esc(p.start)}"/></div>
      <div class="field"><label>End Date</label><input type="text" id="exp-end-${id}" placeholder="Present" value="${esc(p.end)}"/></div>
      <div class="field full">
        <label>Description</label>
        <textarea id="exp-desc-${id}" placeholder="Describe your role…">${esc(p.desc)}</textarea>
        <button class="ai-btn" onclick="aiJobDesc(${id}, this)">✦ AI Write Bullets</button>
      </div>
    </div>`;
  document.getElementById('exp-list').appendChild(div);
}
function addEdu(p = {}) {
  const id = eduCount++;
  const div = document.createElement('div');
  div.className = 'repeater-item'; div.id = 'edu-' + id;
  div.innerHTML = `
    <button class="remove-btn" onclick="document.getElementById('edu-${id}').remove()">Remove</button>
    <div class="form-grid">
      <div class="field"><label>Degree</label><input type="text" id="edu-degree-${id}" placeholder="B.Sc. Computer Science" value="${esc(p.degree)}"/></div>
      <div class="field"><label>School</label><input type="text" id="edu-school-${id}" placeholder="MIT" value="${esc(p.school)}"/></div>
      <div class="field full"><label>Year</label><input type="text" id="edu-year-${id}" placeholder="2018 – 2022" value="${esc(p.year)}"/></div>
    </div>`;
  document.getElementById('edu-list').appendChild(div);
}
function addProj(p = {}) {
  const id = projCount++;
  const div = document.createElement('div');
  div.className = 'repeater-item'; div.id = 'proj-' + id;
  div.innerHTML = `
    <button class="remove-btn" onclick="document.getElementById('proj-${id}').remove()">Remove</button>
    <div class="form-grid">
      <div class="field"><label>Project Name</label><input type="text" id="proj-name-${id}" placeholder="My App" value="${esc(p.name)}"/></div>
      <div class="field"><label>URL</label><input type="text" id="proj-url-${id}" placeholder="github.com/…" value="${esc(p.url)}"/></div>
      <div class="field full">
        <label>Description</label>
        <textarea id="proj-desc-${id}" placeholder="What did you build?">${esc(p.desc)}</textarea>
        <button class="ai-btn" onclick="aiProjDesc(${id}, this)">✦ AI Enhance</button>
      </div>
    </div>`;
  document.getElementById('proj-list').appendChild(div);
}
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── TEMPLATE SELECTION ────────────────────────────────────────────────────────
function selectTemplate(card) {
  document.querySelectorAll('.tmpl-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  selectedTemplate = card.dataset.tmpl;
}

// ── CLAUDE API ────────────────────────────────────────────────────────────────
async function callClaude(prompt) {
  const res  = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
  });
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function aiSummary(btn) {
  const name  = document.getElementById('name').value;
  const title = document.getElementById('title').value;
  if (!title) { showToast('Add your job title first!'); return; }
  setBtnLoading(btn, true);
  const text = await callClaude(`Write a 3-sentence professional resume summary for ${name||'a professional'}, a ${title}. Skills: ${skills.join(', ')}. Be confident and specific. Just the summary, no labels.`);
  document.getElementById('summary').value = text.trim();
  setBtnLoading(btn, false);
  showToast('✦ Summary generated!');
}
async function aiJobDesc(id, btn) {
  const title   = document.getElementById('exp-title-' + id).value;
  const company = document.getElementById('exp-company-' + id).value;
  if (!title) { showToast('Add job title first!'); return; }
  setBtnLoading(btn, true);
  const text = await callClaude(`Write 3 strong resume bullet points for a ${title} at ${company||'a company'}. Use action verbs, quantify impact. Start each with "• ".`);
  document.getElementById('exp-desc-' + id).value = text.trim();
  setBtnLoading(btn, false);
  showToast('✦ Bullets generated!');
}
async function aiProjDesc(id, btn) {
  const name = document.getElementById('proj-name-' + id).value;
  const desc = document.getElementById('proj-desc-' + id).value;
  if (!name && !desc) { showToast('Add project name first!'); return; }
  setBtnLoading(btn, true);
  const text = await callClaude(`Enhance this project description for a resume: "${desc||name}". 2-3 sentences, technical, impressive. Just the text.`);
  document.getElementById('proj-desc-' + id).value = text.trim();
  setBtnLoading(btn, false);
  showToast('✦ Enhanced!');
}
function setBtnLoading(btn, on) {
  if (on) { btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Writing…'; }
  else { btn.disabled = false; btn.innerHTML = '✦ Done ✓'; setTimeout(() => btn.innerHTML = '✦ AI Write', 2000); }
}

// ── COLLECT DATA ──────────────────────────────────────────────────────────────
function collectData() {
  const exps = [], edus = [], projs = [];
  document.querySelectorAll('[id^="exp-title-"]').forEach(el => {
    const id = el.id.replace('exp-title-','');
    exps.push({ title: el.value, company: document.getElementById('exp-company-'+id)?.value||'', start: document.getElementById('exp-start-'+id)?.value||'', end: document.getElementById('exp-end-'+id)?.value||'', desc: document.getElementById('exp-desc-'+id)?.value||'' });
  });
  document.querySelectorAll('[id^="edu-degree-"]').forEach(el => {
    const id = el.id.replace('edu-degree-','');
    edus.push({ degree: el.value, school: document.getElementById('edu-school-'+id)?.value||'', year: document.getElementById('edu-year-'+id)?.value||'' });
  });
  document.querySelectorAll('[id^="proj-name-"]').forEach(el => {
    const id = el.id.replace('proj-name-','');
    projs.push({ name: el.value, url: document.getElementById('proj-url-'+id)?.value||'', desc: document.getElementById('proj-desc-'+id)?.value||'' });
  });
  return {
    name: document.getElementById('name').value||'Your Name',
    title: document.getElementById('title').value||'Professional Title',
    email: document.getElementById('email').value,
    phone: document.getElementById('phone').value,
    location: document.getElementById('location').value,
    website: document.getElementById('website').value,
    summary: document.getElementById('summary').value,
    linkedin: document.getElementById('linkedin').value,
    github: document.getElementById('github').value,
    instagram: document.getElementById('instagram').value,
    whatsapp: document.getElementById('whatsapp').value,
    skills, exps, edus, projs
  };
}

// ── SOCIAL LINKS ──────────────────────────────────────────────────────────────
function socialLinksHtml(d) {
  const links = [];
  if (d.linkedin)  links.push(`<a class="social-btn linkedin"  href="https://${d.linkedin.replace(/^https?:\/\//,'')}"  target="_blank">💼 LinkedIn</a>`);
  if (d.github)    links.push(`<a class="social-btn github"    href="https://${d.github.replace(/^https?:\/\//,'')}"    target="_blank">🐙 GitHub</a>`);
  if (d.instagram) links.push(`<a class="social-btn instagram" href="https://instagram.com/${d.instagram.replace(/.*instagram\.com\//,'').replace('@','')}" target="_blank">📸 Instagram</a>`);
  if (d.whatsapp)  links.push(`<a class="social-btn whatsapp"  href="https://wa.me/${d.whatsapp.replace(/\D/g,'')}"     target="_blank">💬 WhatsApp</a>`);
  return links.length ? `<div class="social-links">${links.join('')}</div>` : '';
}

// ── BUILD RESUME ──────────────────────────────────────────────────────────────
function buildResume(d) {
  const contact  = [d.email,d.phone,d.location,d.website].filter(Boolean).join(' · ');
  const social   = socialLinksHtml(d);
  const expHtml  = d.exps.filter(e=>e.title).map(e=>`<div class="entry"><div class="entry-head"><span>${e.title}${e.company?' — '+e.company:''}</span><span>${[e.start,e.end].filter(Boolean).join(' – ')}</span></div>${e.desc?`<div class="entry-desc">${e.desc}</div>`:''}</div>`).join('');
  const eduHtml  = d.edus.filter(e=>e.degree).map(e=>`<div class="entry"><div class="entry-head"><span>${e.degree}</span><span>${e.year}</span></div>${e.school?`<div class="entry-sub">${e.school}</div>`:''}</div>`).join('');
  const projHtml = d.projs.filter(p=>p.name).map(p=>`<div class="entry"><div class="entry-head"><span>${p.name}</span>${p.url?`<span style="font-size:0.8em;opacity:0.6">${p.url}</span>`:''}</div>${p.desc?`<div class="entry-desc">${p.desc}</div>`:''}</div>`).join('');

  const tmpl = selectedTemplate;
  if (tmpl==='classic') { const s=d.skills.map(x=>`<span class="skill-tag classic-skill">${x}</span>`).join(''); return `<div class="resume-classic"><h1>${d.name}</h1><div class="subtitle">${d.title}</div><div class="contact">${contact}</div>${social}${d.summary?`<h2>Summary</h2><p>${d.summary}</p>`:''}${expHtml?`<h2>Experience</h2>${expHtml}`:''}${eduHtml?`<h2>Education</h2>${eduHtml}`:''}${projHtml?`<h2>Projects</h2>${projHtml}`:''}${s?`<h2>Skills</h2><div class="skill-list">${s}</div>`:''}</div>`; }
  if (tmpl==='modern')  { const s=d.skills.map(x=>`<span class="skill-tag modern-skill">${x}</span>`).join(''); return `<div class="resume-modern"><div class="rm-header"><h1>${d.name}</h1><div class="subtitle">${d.title}</div><div class="contact">${contact}</div>${social}</div><div class="rm-body">${d.summary?`<h2>About</h2><p style="color:#ccc">${d.summary}</p>`:''}${expHtml?`<h2>Experience</h2>${expHtml}`:''}${eduHtml?`<h2>Education</h2>${eduHtml}`:''}${projHtml?`<h2>Projects</h2>${projHtml}`:''}${s?`<h2>Skills</h2><div class="skill-list">${s}</div>`:''}</div></div>`; }
  if (tmpl==='minimal') { const s=d.skills.map(x=>`<span class="skill-tag minimal-skill">${x}</span>`).join(''); return `<div class="resume-minimal"><h1>${d.name}</h1><div class="subtitle">${d.title}</div><div class="contact">${contact}</div>${social}${d.summary?`<h2>Profile</h2><p>${d.summary}</p>`:''}${expHtml?`<h2>Experience</h2>${expHtml}`:''}${eduHtml?`<h2>Education</h2>${eduHtml}`:''}${projHtml?`<h2>Projects</h2>${projHtml}`:''}${s?`<h2>Skills</h2><div class="skill-list">${s}</div>`:''}</div>`; }
  if (tmpl==='bold')    { const s=d.skills.map(x=>`<span class="skill-tag bold-skill">${x}</span>`).join(''); return `<div class="resume-bold"><div class="bold-header"><h1>${d.name}</h1><div class="bold-bar"></div><div class="subtitle">${d.title}</div><div class="contact">${contact}</div>${social}</div><div class="bold-body">${d.summary?`<h2>About</h2><p style="color:#ccc">${d.summary}</p>`:''}${expHtml?`<h2>Experience</h2>${expHtml}`:''}${eduHtml?`<h2>Education</h2>${eduHtml}`:''}${projHtml?`<h2>Projects</h2>${projHtml}`:''}${s?`<h2>Skills</h2><div class="skill-list">${s}</div>`:''}</div></div>`; }
  if (tmpl==='elegant') { const s=d.skills.map(x=>`<span class="skill-tag elegant-skill">${x}</span>`).join(''); return `<div class="resume-elegant"><h1>${d.name}</h1><div class="subtitle">${d.title}</div><div class="contact">${contact}</div>${social}${d.summary?`<h2>Profile</h2><p>${d.summary}</p>`:''}${expHtml?`<h2>Experience</h2>${expHtml}`:''}${eduHtml?`<h2>Education</h2>${eduHtml}`:''}${projHtml?`<h2>Projects</h2>${projHtml}`:''}${s?`<h2>Skills</h2><div class="skill-list">${s}</div>`:''}</div>`; }
  const s=d.skills.map(x=>`<span class="skill-tag tech-skill">${x}</span>`).join(''); return `<div class="resume-tech"><div class="tech-comment">// ${d.name.toLowerCase().replace(/ /g,'_')}.resume.js</div><h1>${d.name}</h1><div class="subtitle">${d.title}</div><div class="contact">${contact}</div>${social}${d.summary?`<h2>about</h2><p>${d.summary}</p>`:''}${expHtml?`<h2>experience</h2>${expHtml}`:''}${eduHtml?`<h2>education</h2>${eduHtml}`:''}${projHtml?`<h2>projects</h2>${projHtml}`:''}${s?`<h2>skills</h2><div class="skill-list">${s}</div>`:''}</div>`;
}

// ── GENERATE ──────────────────────────────────────────────────────────────────
function generateResume() {
  // Save for portfolio
  autoSaveResume(collectData());
  try { localStorage.setItem("folio_portfolio", JSON.stringify(collectData())); } catch(e) {}
  const data = collectData();
  document.getElementById('resume-output').innerHTML = buildResume(data);
  document.getElementById('share-url').textContent = `folio.app/r/${shareId}`;
  goStep(6);
}

// ── DOWNLOAD PDF ──────────────────────────────────────────────────────────────
function downloadPDF() {
  const html = buildResume(collectData());
  const win  = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><style>*{box-sizing:border-box;margin:0;padding:0}body{margin:0}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}.social-links{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.social-btn{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:16px;font-size:0.75rem;font-weight:600;text-decoration:none}.social-btn.linkedin{background:#0077b5;color:#fff}.social-btn.github{background:#24292e;color:#fff}.social-btn.instagram{background:#e1306c;color:#fff}.social-btn.whatsapp{background:#25d366;color:#fff}.skill-list{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.skill-tag{padding:3px 10px;border-radius:10px;font-size:0.78rem}.resume-classic{background:#fff;color:#111;padding:40px;font-family:Georgia,serif;line-height:1.6;font-size:0.9rem}.resume-classic h1{font-size:1.9rem;margin-bottom:3px}.resume-classic .subtitle{font-weight:600;color:#444;margin-bottom:4px}.resume-classic .contact{color:#666;font-size:0.82rem;margin-bottom:10px}.resume-classic h2{font-size:0.82rem;text-transform:uppercase;letter-spacing:1px;border-bottom:1.5px solid #333;margin:16px 0 8px}.resume-classic .entry{margin-bottom:10px}.resume-classic .entry-head{display:flex;justify-content:space-between;font-weight:700}.resume-classic .entry-desc{margin-top:4px;font-size:0.85rem;white-space:pre-line}.classic-skill{background:#f0f0f0;color:#333}.resume-modern{background:#0f0f1a;color:#e8e8ff;font-family:sans-serif;line-height:1.6;font-size:0.9rem}.resume-modern .rm-header{background:linear-gradient(135deg,#6c63ff,#9b55ff);padding:28px 32px;color:#fff}.resume-modern .rm-header h1{font-size:1.9rem;font-weight:800;margin-bottom:3px}.resume-modern .rm-body{padding:24px 32px}.resume-modern h2{color:#9b72ff;font-size:0.75rem;text-transform:uppercase;letter-spacing:1.5px;margin:18px 0 10px}.resume-modern .entry{border-left:2px solid #2a2a3a;padding-left:12px;margin-bottom:12px}.resume-modern .entry-head{display:flex;justify-content:space-between;font-weight:600}.resume-modern .entry-desc{margin-top:4px;font-size:0.85rem;color:#ccc;white-space:pre-line}.modern-skill{background:rgba(108,99,255,0.2);color:#9b72ff;border:1px solid rgba(108,99,255,0.3)}.resume-minimal{background:#fafaf8;color:#2a2a2a;padding:44px;font-family:sans-serif;line-height:1.6;font-size:0.9rem}.resume-minimal h1{font-size:1.6rem;font-weight:300;letter-spacing:4px;text-transform:uppercase;margin-bottom:3px}.resume-minimal .subtitle{color:#888;font-size:0.85rem;margin-bottom:4px}.resume-minimal .contact{color:#999;font-size:0.78rem;letter-spacing:1px;margin-bottom:10px}.resume-minimal h2{font-size:0.65rem;text-transform:uppercase;letter-spacing:3px;color:#bbb;margin:18px 0 8px;border-bottom:1px solid #eee;padding-bottom:5px}.resume-minimal .entry{margin-bottom:12px}.resume-minimal .entry-head{display:flex;justify-content:space-between;font-weight:500}.resume-minimal .entry-desc{margin-top:4px;font-size:0.85rem;color:#555;white-space:pre-line}.minimal-skill{background:#eeede8;color:#666}.resume-bold{background:#1a1a1a;color:#fff;font-family:sans-serif;line-height:1.6;font-size:0.9rem}.resume-bold .bold-header{padding:32px;border-bottom:3px solid #ff6584}.resume-bold h1{font-size:2.2rem;font-weight:900;text-transform:uppercase;color:#ff6584;margin-bottom:4px}.resume-bold .bold-bar{height:3px;background:linear-gradient(90deg,#ff6584,#6c63ff);margin:8px 0}.resume-bold .subtitle{font-weight:600;color:#ccc;margin-bottom:4px}.resume-bold .bold-body{padding:24px 32px}.resume-bold h2{color:#ff6584;font-size:0.75rem;text-transform:uppercase;letter-spacing:2px;margin:18px 0 10px}.resume-bold .entry{margin-bottom:12px}.resume-bold .entry-head{display:flex;justify-content:space-between;font-weight:700}.resume-bold .entry-desc{margin-top:4px;font-size:0.85rem;color:#ccc;white-space:pre-line}.bold-skill{background:rgba(255,101,132,0.15);color:#ff6584;border:1px solid rgba(255,101,132,0.3)}.resume-elegant{background:#1c1610;color:#e8dcc8;padding:44px;font-family:Georgia,serif;line-height:1.6;font-size:0.9rem}.resume-elegant h1{font-size:1.9rem;font-weight:700;color:#c9a84c;letter-spacing:1px;margin-bottom:3px}.resume-elegant .subtitle{color:#a08040;font-size:0.88rem;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px}.resume-elegant h2{font-size:0.72rem;text-transform:uppercase;letter-spacing:3px;color:#c9a84c;margin:18px 0 8px;border-top:1px solid #c9a84c;border-bottom:1px solid #c9a84c;padding:4px 0;text-align:center}.resume-elegant .entry{margin-bottom:12px}.resume-elegant .entry-head{display:flex;justify-content:space-between;font-weight:700}.resume-elegant .entry-desc{margin-top:4px;font-size:0.85rem;color:#c8b89a;white-space:pre-line}.elegant-skill{background:rgba(201,168,76,0.15);color:#c9a84c;border:1px solid rgba(201,168,76,0.3)}.resume-tech{background:#0d1117;color:#c9d1d9;padding:40px;font-family:'Courier New',monospace;line-height:1.7;font-size:0.88rem}.resume-tech .tech-comment{color:#58a6ff;font-size:0.82rem;margin-bottom:6px}.resume-tech h1{font-size:1.8rem;font-weight:700;color:#e6edf3;margin-bottom:3px}.resume-tech .subtitle{color:#ffa657;font-size:0.88rem;margin-bottom:4px}.resume-tech h2{color:#3fb950;font-size:0.82rem;margin:16px 0 8px}.resume-tech h2::before{content:'## '}.resume-tech .entry{margin-bottom:12px;padding-left:12px;border-left:2px solid #21262d}.resume-tech .entry-head{display:flex;justify-content:space-between;font-weight:700;color:#ffa657}.resume-tech .entry-desc{margin-top:4px;font-size:0.83rem;white-space:pre-line}.tech-skill{background:#21262d;color:#58a6ff;border:1px solid #30363d;font-family:monospace}</style><script>window.onload=()=>window.print()<\/script></head><body>${html}</body></html>`);
  win.document.close();
}

// ── SHARE & TOAST ─────────────────────────────────────────────────────────────
function copyLink() {
  navigator.clipboard.writeText(document.getElementById('share-url').textContent).catch(()=>{});
  showToast('✦ Link copied!');
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

// ── PORTFOLIO ─────────────────────────────────────────────────────────────────
function viewPortfolio() {
  const data = collectData();
  // Save to localStorage so portfolio.html can read it
  try { localStorage.setItem('folio_portfolio', JSON.stringify(data)); } catch(e) {}
  // Open portfolio — uses localStorage, no btoa needed
  window.open('/portfolio.html', '_blank');
}