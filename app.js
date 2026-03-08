// ── SUPABASE ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://imrsjhxczbcsepbawhwr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltcnNqaHhjemJjc2VwYmF3aHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4ODk0NTEsImV4cCI6MjA4ODQ2NTQ1MX0.JfwoJh5ssQTkI_iy9aPZECu4nSl2TgwXs2DVtcXe2o0';

// Supabase client — loaded from CDN in index.html
let _supabase = null;
function getSB() {
  if (!_supabase && window.supabase) _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return _supabase;
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem('folio_token'); }
function getUser()  { try { return JSON.parse(localStorage.getItem('folio_user') || '{}'); } catch(e) { return {}; } }

function updateNavUser() {
  const user = getUser();
  const userEl = document.getElementById('nav-user');
  if (user.name && userEl) { userEl.textContent = '👤 ' + user.name; userEl.style.display = 'flex'; }
  const logoutBtn = document.getElementById('nav-logout-btn');
  if (logoutBtn && user.name) logoutBtn.style.display = 'block';
}

async function logout() {
  const sb = getSB();
  if (sb) await sb.auth.signOut();
  localStorage.removeItem('folio_token');
  localStorage.removeItem('folio_user');
  localStorage.removeItem('folio_portfolio');
  window.location.href = '/';
}

async function autoSaveResume(data) {
  const user = getUser();
  if (!user.id) return;
  try {
    const sb = getSB();
    if (!sb) return;
    await sb.from('profiles').update({ resume_data: data }).eq('id', user.id);
  } catch(e) {}
}

async function loadSavedResume() {
  const user = getUser();
  if (!user.id) return;
  try {
    const sb = getSB();
    if (!sb) return;
    const { data } = await sb.from('profiles').select('resume_data').eq('id', user.id).single();
    if (data?.resume_data) { autofill(data.resume_data); setTimeout(() => updateLivePreview(), 100); }
  } catch(e) {}
}

// ── STATE ─────────────────────────────────────────────────────────────────────
let selectedTemplate = 'classic';
let skills = [];
let maxStepReached = 1;
let expCount = 0, eduCount = 0, projCount = 0, certCount = 0, langCount = 0, achieveCount = 0;
const certImages = {};
let shareId = Math.random().toString(36).substr(2, 8);

// ── TEMPLATES LIST ────────────────────────────────────────────────────────────
const RESUME_TEMPLATES = [
  { id:'classic',  name:'Classic',     badge:'ATS #1',
    prev:`background:#fff`,
    nameStyle:`color:#111;font-family:Arial,sans-serif;font-size:13px;font-weight:700`,
    barStyle:`background:#111`,
    tagStyle:`background:#f0f0f0;color:#333` },
  { id:'modern',   name:'Modern Dark', badge:'ATS Top',
    prev:`background:#0f0f1a`,
    nameStyle:`color:#fff;font-family:Arial,sans-serif;font-size:13px;font-weight:700`,
    barStyle:`background:linear-gradient(90deg,#6c63ff,#9b55ff)`,
    tagStyle:`background:rgba(108,99,255,0.2);color:#a090ff` },
  { id:'harvard',  name:'Harvard',     badge:'ATS #1',
    prev:`background:#fff`,
    nameStyle:`color:#111;font-family:Georgia,serif;font-size:13px;font-weight:700;text-align:center`,
    barStyle:`background:#111`,
    tagStyle:`background:#f5f5f5;color:#333;border:1px solid #ddd` },
  { id:'google',   name:'Google Style',badge:'ATS #2',
    prev:`background:#f8f9fa`,
    nameStyle:`color:#1a73e8;font-family:Arial,sans-serif;font-size:13px;font-weight:700`,
    barStyle:`background:#1a73e8`,
    tagStyle:`background:#e8f0fe;color:#1a73e8` },
  { id:'exec',     name:'Executive',   badge:'ATS #3',
    prev:`background:#1a1a2e`,
    nameStyle:`color:#fff;font-family:Arial,sans-serif;font-size:13px;font-weight:700`,
    barStyle:`background:rgba(255,255,255,0.3)`,
    tagStyle:`background:#f0f0f4;color:#1a1a2e` },
  { id:'tech',     name:'Tech / Dev',  badge:'Dev ✓',
    prev:`background:#0d1117`,
    nameStyle:`color:#e6edf3;font-family:'Courier New',monospace;font-size:12px;font-weight:700`,
    barStyle:`background:#3fb950`,
    tagStyle:`background:#21262d;color:#58a6ff;border:1px solid #30363d` },
];

// ── START APP ─────────────────────────────────────────────────────────────────
function goHome() {
  document.getElementById("hero").style.display = "block";
  document.getElementById("app").style.display = "none";
  document.getElementById("nav-home-btn").style.display = "none";
  document.getElementById('steps-bar').style.display = 'none';
  document.querySelectorAll('.full-split-panel').forEach(p => p.classList.remove('active'));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startApp(mode) {
  if (!getToken()) { window.location.href = "/login.html?redirect=/"; return; }
  document.getElementById("nav-home-btn").style.display = "block";
  document.getElementById('hero').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('steps-bar').style.display = 'flex';
  if (mode === 'manual') { addExp(); addEdu(); showStep(2); }
  else showStep(1);
}
function skipUpload() { addExp(); addEdu(); showStep(2); }

// ── STEP NAVIGATION ───────────────────────────────────────────────────────────
function showStep(n) {
  // Hide all step-panels (1–4)
  document.querySelectorAll('.step-panel').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });

  // Hide all full-split-panels (5–6)
  document.querySelectorAll('.full-split-panel').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });

  const panel = document.getElementById('step-' + n);

  if (n <= 4) {
    // Show split-layout for steps 1-4
    const sl = document.querySelector('.split-layout');
    if (sl) sl.style.display = '';
    if (panel) { panel.classList.add('active'); panel.style.display = 'block'; }
  } else {
    // Hide split-layout for steps 5-6
    const sl = document.querySelector('.split-layout');
    if (sl) sl.style.display = 'none';
    // Show the full panel with inline style
    if (panel) {
      panel.classList.add('active');
      panel.style.cssText = 'display:flex !important; position:fixed; top:140px; left:0; right:0; bottom:0; z-index:50; background:#0a0a10;';
    }
  }

  if (n > maxStepReached) maxStepReached = n;
  for (let i = 1; i <= 6; i++) {
    const dot = document.getElementById('dot-' + i);
    if (!dot) continue;
    dot.classList.remove('active', 'done');
    if (i < n) dot.classList.add('done');
    if (i === n) dot.classList.add('active');
  }
  for (let i = 1; i <= 5; i++) {
    const line = document.getElementById('line-' + i);
    if (line) line.classList.toggle('done', i < n);
  }
  if (n === 5) buildTemplatePanel();
  if (n === 6) buildPortfolioStep();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function goStep(n) { showStep(n); }

function jumpStep(n) { showStep(n); }

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
  document.getElementById('cert-list').innerHTML = '';
  document.getElementById('lang-list').innerHTML = '';
  document.getElementById('achieve-list').innerHTML = '';
  expCount = 0; eduCount = 0; projCount = 0; certCount = 0; langCount = 0; achieveCount = 0;

  if (Array.isArray(data.experience) && data.experience.length) data.experience.forEach(addExp);
  else addExp();

  if (Array.isArray(data.education) && data.education.length) data.education.forEach(addEdu);
  else addEdu();

  if (Array.isArray(data.projects) && data.projects.length) data.projects.forEach(addProj);

  // Update live preview after AI fills the form
  setTimeout(() => updateLivePreview(), 100);
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
      <div class="field"><label>School / University</label><input type="text" id="edu-school-${id}" placeholder="MIT" value="${esc(p.school)}"/></div>
      <div class="field"><label>Year</label><input type="text" id="edu-year-${id}" placeholder="2018 – 2022" value="${esc(p.year)}"/></div>
      <div class="field"><label>Percentage / CGPA <span class="opt">optional</span></label><input type="text" id="edu-grade-${id}" placeholder="8.5 CGPA or 85%" value="${esc(p.grade)}"/></div>
    </div>`;
  document.getElementById('edu-list').appendChild(div);
}

// cert images stored as base64
function addCert(p = {}) {
  const id = certCount++;
  const div = document.createElement('div');
  div.className = 'repeater-item'; div.id = 'cert-' + id;
  div.innerHTML = `
    <button class="remove-btn" onclick="document.getElementById('cert-${id}').remove()">Remove</button>
    <div class="form-grid">
      <div class="field"><label>Certificate Name</label><input type="text" id="cert-name-${id}" placeholder="AWS Cloud Practitioner" value="${esc(p.name)}"/></div>
      <div class="field"><label>Issuer</label><input type="text" id="cert-issuer-${id}" placeholder="Amazon Web Services" value="${esc(p.issuer)}"/></div>
      <div class="field"><label>Year</label><input type="text" id="cert-year-${id}" placeholder="2024" value="${esc(p.year)}"/></div>
      <div class="field">
        <label>Upload Certificate Image <span class="opt">optional</span></label>
        <div class="cert-upload-zone" onclick="document.getElementById('cert-file-${id}').click()" id="cert-zone-${id}">
          <span class="cert-upload-icon">🏆</span>
          <span class="cert-upload-text">Click to upload certificate image</span>
          <span class="cert-upload-sub">JPG, PNG, WEBP — high quality</span>
        </div>
        <input type="file" id="cert-file-${id}" accept="image/*" style="display:none" onchange="loadCertImage(${id}, this)"/>
        <div class="cert-preview" id="cert-preview-${id}" style="display:none">
          <img id="cert-img-${id}" style="width:100%;border-radius:8px;border:1px solid rgba(255,255,255,0.1)"/>
          <button class="remove-btn" style="position:relative;margin-top:8px" onclick="removeCertImage(${id})">✕ Remove Image</button>
        </div>
      </div>
    </div>`;
  document.getElementById('cert-list').appendChild(div);
}

function loadCertImage(id, input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    certImages[id] = e.target.result;
    document.getElementById('cert-preview-' + id).style.display = 'block';
    document.getElementById('cert-img-' + id).src = e.target.result;
    document.getElementById('cert-zone-' + id).style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function removeCertImage(id) {
  delete certImages[id];
  document.getElementById('cert-preview-' + id).style.display = 'none';
  document.getElementById('cert-zone-' + id).style.display = 'flex';
  document.getElementById('cert-file-' + id).value = '';
}

function addLang(p = {}) {
  const id = langCount++;
  const div = document.createElement('div');
  div.className = 'repeater-item'; div.id = 'lang-' + id;
  div.innerHTML = `
    <button class="remove-btn" onclick="document.getElementById('lang-${id}').remove()">Remove</button>
    <div class="form-grid">
      <div class="field"><label>Language</label><input type="text" id="lang-name-${id}" placeholder="English" value="${esc(p.name)}"/></div>
      <div class="field">
        <label>Proficiency</label>
        <select id="lang-level-${id}" style="width:100%;padding:10px 14px;border-radius:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#e0e0ff;font-family:inherit;font-size:0.88rem">
          <option value="Native" ${(p.level||'Native')==='Native'?'selected':''}>Native</option>
          <option value="Fluent" ${p.level==='Fluent'?'selected':''}>Fluent</option>
          <option value="Advanced" ${p.level==='Advanced'?'selected':''}>Advanced</option>
          <option value="Intermediate" ${p.level==='Intermediate'?'selected':''}>Intermediate</option>
          <option value="Basic" ${p.level==='Basic'?'selected':''}>Basic</option>
        </select>
      </div>
    </div>`;
  document.getElementById('lang-list').appendChild(div);
}

function addAchieve(p = {}) {
  const id = achieveCount++;
  const div = document.createElement('div');
  div.className = 'repeater-item'; div.id = 'achieve-' + id;
  div.innerHTML = `
    <button class="remove-btn" onclick="document.getElementById('achieve-${id}').remove()">Remove</button>
    <div class="form-grid">
      <div class="field full"><label>Achievement Title</label><input type="text" id="achieve-title-${id}" placeholder="1st Place — National Hackathon 2024" value="${esc(p.title)}"/></div>
      <div class="field full">
        <label>Description <span class="opt">optional</span></label>
        <textarea id="achieve-desc-${id}" placeholder="Brief description of the achievement…" style="min-height:70px">${esc(p.desc)}</textarea>
      </div>
    </div>`;
  document.getElementById('achieve-list').appendChild(div);
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

// ── STEP 5: TEMPLATE PANEL ───────────────────────────────────────────────────
function buildTemplatePanel() {
  const list = document.getElementById('tmpl-panel-list');
  if (!list) return;
  const d = collectData();
  const nm = d.name && d.name !== 'Your Name' ? d.name : 'Alex Johnson';
  list.innerHTML = RESUME_TEMPLATES.map(t => `
    <div class="tc ${t.id === selectedTemplate ? 'active' : ''}" id="tc-${t.id}" onclick="selectResumeTmpl('${t.id}')">
      <div class="tc-preview" style="${t.prev}">
        <div class="tc-prev-name" style="${t.nameStyle}">${nm}</div>
        <div class="tc-prev-bar" style="${t.barStyle}"></div>
        <div class="tc-prev-tags">
          ${['React','Node','AWS'].map(s=>`<span class="tc-prev-tag" style="${t.tagStyle}">${s}</span>`).join('')}
        </div>
      </div>
      <div class="tc-meta">
        <div>
          <div class="tc-name">${t.name}</div>
          <span class="tc-badge">${t.badge}</span>
        </div>
        <button class="tc-select" onclick="event.stopPropagation();selectResumeTmpl('${t.id}')">
          ${t.id === selectedTemplate ? '✓' : 'Use'}
        </button>
      </div>
    </div>
  `).join('');
  refreshResumePrev();
}

function selectResumeTmpl(id) {
  selectedTemplate = id;
  document.querySelectorAll('.tc').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tc-select').forEach(b => b.textContent = 'Use');
  const active = document.getElementById('tc-' + id);
  if (active) {
    active.classList.add('active');
    active.querySelector('.tc-select').textContent = '✓';
    active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  refreshResumePrev();
  updateLivePreview();
}

function refreshResumePrev() {
  const el = document.getElementById('step5-resume-preview');
  if (!el) return;
  el.innerHTML = buildResume(collectData());
}

// ── STEP 6: PORTFOLIO PANEL ───────────────────────────────────────────────────
let portfolioTheme = 'cyber';

const PORTFOLIO_THEMES = [
  {id:'cyber',    name:'Cyber',          cat:'Dark',
   preview:`background:#050a10;background-image:linear-gradient(rgba(0,255,204,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,204,.06) 1px,transparent 1px);background-size:20px 20px`,
   nameStyle:`font-family:'Bebas Neue',cursive;color:#00ffcc;font-size:13px`,
   bar:`background:linear-gradient(90deg,#00ffcc,#7b2fff)`,
   tag:`background:rgba(123,47,255,.3);color:#c084fc;border:1px solid rgba(123,47,255,.5)`},
  {id:'noir',     name:'Noir',           cat:'Dark',
   preview:`background:#080808;border-top:3px solid #fff`,
   nameStyle:`font-family:Georgia,serif;color:#fff;font-size:12px;font-weight:700`,
   bar:`background:#333`,tag:`background:#111;color:#666;border:1px solid #222`},
  {id:'midnight', name:'Midnight',       cat:'Dark',
   preview:`background:linear-gradient(135deg,#0a0a1a,#0d0d2b)`,
   nameStyle:`font-family:Georgia,serif;color:#e8dcc8;font-size:12px`,
   bar:`background:linear-gradient(90deg,#c9a84c,#e8c97a)`,
   tag:`background:rgba(201,168,76,.15);color:#c9a84c;border:1px solid rgba(201,168,76,.3)`},
  {id:'obsidian', name:'Obsidian',       cat:'Dark',
   preview:`background:#0c0c0c`,
   nameStyle:`font-family:'Space Mono',monospace;color:#e0e0e0;font-size:11px`,
   bar:`background:#333`,tag:`background:#1a1a1a;color:#888;border:1px solid #2a2a2a`},
  {id:'steel',    name:'Steel',          cat:'Dark',
   preview:`background:#111416`,
   nameStyle:`font-family:'Unbounded',sans-serif;color:#f0f0f0;font-size:10px`,
   bar:`background:#dc2626`,tag:`background:#1c1f22;color:#9ca3af;border:1px solid #2d3035`},
  {id:'linen',    name:'Linen',          cat:'Light',
   preview:`background:#faf7f2`,
   nameStyle:`font-family:'Cormorant Garamond',serif;color:#2c2416;font-size:13px`,
   bar:`background:#8b7355`,tag:`background:#e8e0d4;color:#6b5a45;border:1px solid #d4c9b8`},
  {id:'chalk',    name:'Chalk',          cat:'Light',
   preview:`background:#f5f3ef`,
   nameStyle:`font-family:'DM Sans',sans-serif;color:#1a1a1a;font-size:12px`,
   bar:`background:#ccc`,tag:`background:#eee;color:#555;border:1px solid #ddd`},
  {id:'paper',    name:'Paper',          cat:'Light',
   preview:`background:#fdfcfa`,
   nameStyle:`font-family:Georgia,serif;color:#111;font-size:12px`,
   bar:`background:#999`,tag:`background:#f0ede8;color:#666;border:1px solid #e0ddd8`},
  {id:'cotton',   name:'Cotton',         cat:'Professional',
   preview:`background:#f8fafc`,
   nameStyle:`font-family:'Outfit',sans-serif;color:#0f172a;font-size:12px;font-weight:600`,
   bar:`background:#3b82f6`,tag:`background:#eff6ff;color:#3b82f6;border:1px solid #bfdbfe`},
  {id:'velvet',   name:'Velvet',         cat:'Creative',
   preview:`background:#1a0a2e`,
   nameStyle:`font-family:'Playfair Display',serif;color:#e8c97a;font-size:12px`,
   bar:`background:linear-gradient(90deg,#9333ea,#e8c97a)`,
   tag:`background:rgba(147,51,234,.2);color:#c084fc;border:1px solid rgba(147,51,234,.4)`},
  {id:'amber',    name:'Amber',          cat:'Dark',
   preview:`background:#0f0900`,
   nameStyle:`font-family:'Syne',sans-serif;color:#fbbf24;font-size:12px`,
   bar:`background:linear-gradient(90deg,#f59e0b,#fbbf24)`,
   tag:`background:rgba(251,191,36,.1);color:#fbbf24;border:1px solid rgba(251,191,36,.3)`},
  {id:'coral',    name:'Coral',          cat:'Colorful',
   preview:`background:#fff5f3`,
   nameStyle:`font-family:'Fraunces',serif;color:#c0392b;font-size:12px`,
   bar:`background:linear-gradient(90deg,#e74c3c,#f39c12)`,
   tag:`background:#fff0ee;color:#c0392b;border:1px solid #fbd0ca`},
  {id:'dusk',     name:'Dusk',           cat:'Colorful',
   preview:`background:linear-gradient(135deg,#1a0533,#0d1433)`,
   nameStyle:`font-family:'Outfit',sans-serif;color:#f8b4ff;font-size:12px`,
   bar:`background:linear-gradient(90deg,#f8b4ff,#93c5fd)`,
   tag:`background:rgba(248,180,255,.1);color:#f8b4ff;border:1px solid rgba(248,180,255,.3)`},
  {id:'aurora',   name:'Aurora',         cat:'Creative',
   preview:`background:#0a1628`,
   nameStyle:`font-family:'Syne',sans-serif;color:#67e8f9;font-size:12px`,
   bar:`background:linear-gradient(90deg,#67e8f9,#a78bfa,#34d399)`,
   tag:`background:rgba(103,232,249,.1);color:#67e8f9;border:1px solid rgba(103,232,249,.3)`},
  {id:'neon',     name:'Neon',           cat:'Creative',
   preview:`background:#050505`,
   nameStyle:`font-family:'Space Mono',monospace;color:#39ff14;font-size:11px`,
   bar:`background:#39ff14`,tag:`background:rgba(57,255,20,.1);color:#39ff14;border:1px solid rgba(57,255,20,.3)`},
  {id:'retro',    name:'Retro',          cat:'Creative',
   preview:`background:#1a0a00`,
   nameStyle:`font-family:'Space Mono',monospace;color:#ff6b35;font-size:11px`,
   bar:`background:#ff6b35`,tag:`background:rgba(255,107,53,.15);color:#ff6b35;border:1px solid rgba(255,107,53,.4)`},
  {id:'glass',    name:'Glassmorphism',  cat:'Creative',
   preview:`background:linear-gradient(135deg,#1a1a2e,#16213e)`,
   nameStyle:`font-family:'DM Sans',sans-serif;color:rgba(255,255,255,.9);font-size:12px`,
   bar:`background:rgba(255,255,255,.3)`,tag:`background:rgba(255,255,255,.1);color:rgba(255,255,255,.8);border:1px solid rgba(255,255,255,.2)`},
  {id:'navy',     name:'Navy',           cat:'Professional',
   preview:`background:#0a1628`,
   nameStyle:`font-family:'IBM Plex Mono',monospace;color:#e2e8f0;font-size:11px`,
   bar:`background:#3b82f6`,tag:`background:rgba(59,130,246,.15);color:#93c5fd;border:1px solid rgba(59,130,246,.3)`},
  {id:'grove',    name:'Grove',          cat:'Professional',
   preview:`background:#0a1a0f`,
   nameStyle:`font-family:'Fraunces',serif;color:#a3e635;font-size:12px`,
   bar:`background:linear-gradient(90deg,#4ade80,#a3e635)`,
   tag:`background:rgba(74,222,128,.1);color:#4ade80;border:1px solid rgba(74,222,128,.3)`},
  {id:'slate',    name:'Slate',          cat:'Professional',
   preview:`background:#0f172a`,
   nameStyle:`font-family:'Outfit',sans-serif;color:#94a3b8;font-size:12px`,
   bar:`background:#475569`,tag:`background:#1e293b;color:#94a3b8;border:1px solid #334155`},
];

function buildPortfolioStep() {
  // Save data so portfolio preview can use it
  const data = collectData();
  try { localStorage.setItem('folio_portfolio', JSON.stringify(data)); } catch(e) {}
  autoSaveResume(data);

  // Build theme panel
  const list = document.getElementById('theme-panel-list');
  if (!list) return;
  const nm = data.name && data.name !== 'Your Name' ? data.name : 'Alex Johnson';
  list.innerHTML = PORTFOLIO_THEMES.map(t => `
    <div class="tc ${t.id === portfolioTheme ? 'active' : ''}" id="pth-${t.id}" onclick="selectPortfolioTheme('${t.id}')">
      <div class="tc-preview" style="${t.preview}">
        <div class="tc-prev-name" style="${t.nameStyle}">${nm}</div>
        <div class="tc-prev-bar" style="${t.bar}"></div>
        <div class="tc-prev-tags">
          ${['React','Node','AWS'].map(s=>`<span class="tc-prev-tag" style="${t.tag}">${s}</span>`).join('')}
        </div>
      </div>
      <div class="tc-meta">
        <div>
          <div class="tc-name">${t.name}</div>
          <span class="tc-badge">${t.cat}</span>
        </div>
        <button class="tc-select" onclick="event.stopPropagation();selectPortfolioTheme('${t.id}')">
          ${t.id === portfolioTheme ? '✓' : 'Use'}
        </button>
      </div>
    </div>
  `).join('');
  refreshPortfolioPrev();
}

function selectPortfolioTheme(id) {
  portfolioTheme = id;
  document.querySelectorAll('#theme-panel-list .tc').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('#theme-panel-list .tc-select').forEach(b => b.textContent = 'Use');
  const active = document.getElementById('pth-' + id);
  if (active) {
    active.classList.add('active');
    active.querySelector('.tc-select').textContent = '✓';
    active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  refreshPortfolioPrev();
}

function refreshPortfolioPrev() {
  const wrap = document.getElementById('step6-portfolio-preview');
  if (!wrap) return;
  // Render portfolio inline using an iframe so all portfolio.html CSS applies correctly
  const data = collectData();
  try { localStorage.setItem('folio_portfolio', JSON.stringify(data)); } catch(e) {}
  // Use iframe pointing to portfolio.html with theme param
  const existing = wrap.querySelector('iframe');
  const src = `/portfolio.html?theme=${portfolioTheme}&t=${Date.now()}`;
  if (existing) {
    existing.src = src;
  } else {
    wrap.innerHTML = `<iframe src="${src}" style="width:100%;height:100%;border:none;min-height:calc(100vh - 160px)" frameborder="0"></iframe>`;
  }
}

function copyPortfolioLink() {
  const url = window.location.origin + `/portfolio.html?theme=${portfolioTheme}`;
  navigator.clipboard.writeText(url).then(() => showToast('🔗 Portfolio link copied!'));
}

function savePortfolioPDF() {
  const data = collectData();
  try { localStorage.setItem('folio_portfolio', JSON.stringify(data)); } catch(e) {}
  const win = window.open(`/portfolio.html?theme=${portfolioTheme}&print=1`, '_blank');
  setTimeout(() => { try { win.print(); } catch(e) {} }, 1200);
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
  document.querySelectorAll('[id^="proj-name-"]').forEach(el => {
    const id = el.id.replace('proj-name-','');
    projs.push({ name: el.value, url: document.getElementById('proj-url-'+id)?.value||'', desc: document.getElementById('proj-desc-'+id)?.value||'' });
  });
  // education — now includes grade
  document.querySelectorAll('[id^="edu-degree-"]').forEach(el => {
    const id = el.id.replace('edu-degree-','');
    edus.push({
      degree: el.value,
      school: document.getElementById('edu-school-'+id)?.value||'',
      year:   document.getElementById('edu-year-'+id)?.value||'',
      grade:  document.getElementById('edu-grade-'+id)?.value||''
    });
  });

  // certs
  const certs = [];
  document.querySelectorAll('[id^="cert-name-"]').forEach(el => {
    const id = el.id.replace('cert-name-','');
    certs.push({
      name:   el.value,
      issuer: document.getElementById('cert-issuer-'+id)?.value||'',
      year:   document.getElementById('cert-year-'+id)?.value||'',
      image:  certImages[id]||''
    });
  });

  // languages
  const langs = [];
  document.querySelectorAll('[id^="lang-name-"]').forEach(el => {
    const id = el.id.replace('lang-name-','');
    langs.push({
      name:  el.value,
      level: document.getElementById('lang-level-'+id)?.value||'Fluent'
    });
  });

  // achievements
  const achievements = [];
  document.querySelectorAll('[id^="achieve-title-"]').forEach(el => {
    const id = el.id.replace('achieve-title-','');
    achievements.push({
      title: el.value,
      desc:  document.getElementById('achieve-desc-'+id)?.value||''
    });
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
    skills, exps, edus, projs, certs, langs, achievements
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
  const contact = [d.email,d.phone,d.location,d.website].filter(Boolean).join(' · ');
  const social  = socialLinksHtml(d);

  const expHtml = (d.exps||[]).filter(e=>e.title).map(e=>`
    <div class="entry">
      <div class="entry-head"><span>${e.title}${e.company?' — '+e.company:''}</span><span>${[e.start,e.end].filter(Boolean).join(' – ')}</span></div>
      ${e.desc?`<div class="entry-desc">${e.desc}</div>`:''}
    </div>`).join('');

  const eduHtml = (d.edus||[]).filter(e=>e.degree).map(e=>`
    <div class="entry">
      <div class="entry-head"><span>${e.degree}</span><span>${e.year||''}</span></div>
      ${e.school||e.grade?`<div class="entry-sub">${[e.school,e.grade].filter(Boolean).join(' · ')}</div>`:''}
    </div>`).join('');

  const projHtml = (d.projs||[]).filter(p=>p.name).map(p=>`
    <div class="entry">
      <div class="entry-head"><span>${p.name}</span>${p.url?`<span style="font-size:0.85em;opacity:0.6">${p.url}</span>`:''}</div>
      ${p.desc?`<div class="entry-desc">${p.desc}</div>`:''}
    </div>`).join('');

  const certHtml = (d.certs||[]).filter(c=>c.name).map(c=>`
    <div class="entry">
      <div class="entry-head"><span>🏆 ${c.name}</span><span>${c.year||''}</span></div>
      ${c.issuer?`<div class="entry-sub">${c.issuer}</div>`:''}
    </div>`).join('');

  const achieveHtml = (d.achievements||[]).filter(a=>a.title).map(a=>`
    <div class="entry">
      <div class="entry-head"><span>⭐ ${a.title}</span></div>
      ${a.desc?`<div class="entry-desc">${a.desc}</div>`:''}
    </div>`).join('');

  const langList = (d.langs||[]).filter(l=>l.name).map(l=>`${l.name} (${l.level})`).join(' · ');

  const tmpl = selectedTemplate;

  /* CLASSIC */
  if (tmpl==='classic') {
    const s=(d.skills||[]).map(x=>`<span class="skill-tag classic-skill">${x}</span>`).join('');
    return `<div class="resume-classic">
      <h1>${d.name}</h1>
      <div class="subtitle">${d.title||''}</div>
      <div class="contact">${contact}</div>${social}
      ${d.summary?`<h2>Summary</h2><p style="font-size:12px;color:#444;line-height:1.6;margin-bottom:8px">${d.summary}</p>`:''}
      ${expHtml?`<h2>Experience</h2>${expHtml}`:''}
      ${eduHtml?`<h2>Education</h2>${eduHtml}`:''}
      ${projHtml?`<h2>Projects</h2>${projHtml}`:''}
      ${certHtml?`<h2>Certifications</h2>${certHtml}`:''}
      ${achieveHtml?`<h2>Achievements</h2>${achieveHtml}`:''}
      ${s?`<h2>Skills</h2><div class="skill-list">${s}</div>`:''}
      ${langList?`<h2>Languages</h2><p style="font-size:12px;color:#444">${langList}</p>`:''}
    </div>`;
  }

  /* MODERN DARK */
  if (tmpl==='modern') {
    const s=(d.skills||[]).map(x=>`<span class="skill-tag modern-skill">${x}</span>`).join('');
    return `<div class="resume-modern">
      <div class="rm-header">
        <h1>${d.name}</h1>
        <div class="subtitle">${d.title||''}</div>
        <div class="contact">${contact}</div>${social}
      </div>
      <div class="rm-body">
        ${d.summary?`<h2>About</h2><p style="font-size:12px;color:#bbb;line-height:1.6;margin-bottom:8px">${d.summary}</p>`:''}
        ${expHtml?`<h2>Experience</h2>${expHtml}`:''}
        ${eduHtml?`<h2>Education</h2>${eduHtml}`:''}
        ${projHtml?`<h2>Projects</h2>${projHtml}`:''}
        ${certHtml?`<h2>Certifications</h2>${certHtml}`:''}
        ${achieveHtml?`<h2>Achievements</h2>${achieveHtml}`:''}
        ${s?`<h2>Skills</h2><div class="skill-list">${s}</div>`:''}
        ${langList?`<h2>Languages</h2><p style="font-size:12px;color:#aaa">${langList}</p>`:''}
      </div>
    </div>`;
  }

  /* HARVARD */
  if (tmpl==='harvard') {
    const s=(d.skills||[]).map(x=>`<span class="skill-tag harvard-skill">${x}</span>`).join('');
    return `<div class="resume-harvard">
      <h1>${d.name}</h1>
      ${d.title?`<div class="subtitle">${d.title}</div>`:''}
      <div class="contact">${contact}</div><hr/>
      ${d.summary?`<h2>Profile</h2><p style="font-size:12px;color:#333;line-height:1.6;margin-bottom:8px">${d.summary}</p>`:''}
      ${expHtml?`<h2>Experience</h2>${expHtml}`:''}
      ${eduHtml?`<h2>Education</h2>${eduHtml}`:''}
      ${projHtml?`<h2>Projects</h2>${projHtml}`:''}
      ${certHtml?`<h2>Certifications</h2>${certHtml}`:''}
      ${achieveHtml?`<h2>Achievements</h2>${achieveHtml}`:''}
      ${s?`<h2>Skills</h2><div class="skill-list">${s}</div>`:''}
      ${langList?`<h2>Languages</h2><p style="font-size:12px;color:#444">${langList}</p>`:''}
    </div>`;
  }

  /* GOOGLE */
  if (tmpl==='google') {
    const s=(d.skills||[]).map(x=>`<span class="skill-tag google-skill">${x}</span>`).join('');
    const langItems=(d.langs||[]).filter(l=>l.name).map(l=>`<div class="rg-item">${l.name} — ${l.level}</div>`).join('');
    const skillItems=(d.skills||[]).map(x=>`<div class="rg-item">${x}</div>`).join('');
    const contactItems=[d.email,d.phone,d.location].filter(Boolean).map(c=>`<div class="rg-item">${c}</div>`).join('');
    return `<div class="resume-google">
      <div class="rg-side">
        <div class="rg-name">${d.name}</div>
        <div class="rg-title">${d.title||''}</div>
        ${contactItems?`<div class="rg-sh">Contact</div>${contactItems}`:''}
        ${skillItems?`<div class="rg-sh">Skills</div>${skillItems}`:''}
        ${langItems?`<div class="rg-sh">Languages</div>${langItems}`:''}
      </div>
      <div class="rg-main">
        ${d.summary?`<div class="rg-mh">About</div><p style="font-size:11px;color:#3c4043;line-height:1.6;margin-bottom:8px">${d.summary}</p>`:''}
        ${expHtml?`<div class="rg-mh">Experience</div>${expHtml}`:''}
        ${eduHtml?`<div class="rg-mh">Education</div>${eduHtml}`:''}
        ${projHtml?`<div class="rg-mh">Projects</div>${projHtml}`:''}
        ${certHtml?`<div class="rg-mh">Certifications</div>${certHtml}`:''}
        ${achieveHtml?`<div class="rg-mh">Achievements</div>${achieveHtml}`:''}
      </div>
    </div>`;
  }

  /* EXECUTIVE */
  if (tmpl==='exec') {
    const s=(d.skills||[]).map(x=>`<span class="skill-tag exec-skill">${x}</span>`).join('');
    const sec=label=>`<div class="rx-sec"><span class="rx-sec-label">${label}</span><div class="rx-sec-line"></div></div>`;
    return `<div class="resume-exec">
      <div class="rx-header">
        <h1>${d.name}</h1>
        <div class="subtitle">${d.title||''}</div>
        <div class="contact">${contact}</div>${social}
      </div>
      <div class="rx-body">
        ${d.summary?`${sec('Profile')}<p style="font-size:12px;color:#444;line-height:1.6;margin-bottom:8px">${d.summary}</p>`:''}
        ${expHtml?`${sec('Experience')}${expHtml}`:''}
        ${eduHtml?`${sec('Education')}${eduHtml}`:''}
        ${projHtml?`${sec('Projects')}${projHtml}`:''}
        ${certHtml?`${sec('Certifications')}${certHtml}`:''}
        ${achieveHtml?`${sec('Achievements')}${achieveHtml}`:''}
        ${s?`${sec('Skills')}<div class="skill-list">${s}</div>`:''}
        ${langList?`${sec('Languages')}<p style="font-size:12px;color:#444">${langList}</p>`:''}
      </div>
    </div>`;
  }

  /* TECH/DEV */
  const s=(d.skills||[]).map(x=>`<span class="skill-tag tech-skill">${x}</span>`).join('');
  return `<div class="resume-tech">
    <div class="tech-comment">// ${(d.name||'name').toLowerCase().replace(/ /g,'_')}.resume.js</div>
    <h1>${d.name}</h1>
    <div class="subtitle">${d.title||''}</div>
    <div class="contact">${contact}</div>${social}
    ${d.summary?`<h2>about</h2><p style="font-size:11px;color:#c9d1d9;line-height:1.65;margin-bottom:8px">${d.summary}</p>`:''}
    ${expHtml?`<h2>experience</h2>${expHtml}`:''}
    ${eduHtml?`<h2>education</h2>${eduHtml}`:''}
    ${projHtml?`<h2>projects</h2>${projHtml}`:''}
    ${certHtml?`<h2>certifications</h2>${certHtml}`:''}
    ${achieveHtml?`<h2>achievements</h2>${achieveHtml}`:''}
    ${s?`<h2>skills</h2><div class="skill-list">${s}</div>`:''}
    ${langList?`<h2>languages</h2><p style="font-size:11px;color:#8b949e">${langList}</p>`:''}
  </div>`;
}

// ── GENERATE ──────────────────────────────────────────────────────────────────
// ── DOWNLOAD PDF ──────────────────────────────────────────────────────────────
function downloadPDF() {
  const data = collectData();
  const html = buildResume(data);
  const win  = window.open('', '_blank');
  const css = `
    *{box-sizing:border-box;margin:0;padding:0}body{margin:0}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    .social-links{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
    .social-btn{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:16px;font-size:0.75rem;font-weight:600;text-decoration:none}
    .social-btn.linkedin{background:#0077b5;color:#fff}.social-btn.github{background:#24292e;color:#fff}
    .social-btn.instagram{background:#e1306c;color:#fff}.social-btn.whatsapp{background:#25d366;color:#fff}
    .skill-list{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
    .skill-tag{padding:3px 10px;border-radius:4px;font-size:0.78rem}
    /* Classic */
    .resume-classic{background:#fff;color:#111;padding:44px 48px;font-family:Arial,Helvetica,sans-serif;line-height:1.55;font-size:13px}
    .resume-classic h1{font-size:24px;font-weight:700;margin-bottom:2px}
    .resume-classic .subtitle{font-size:13px;color:#444;font-weight:500;margin-bottom:3px}
    .resume-classic .contact{font-size:11.5px;color:#666;margin-bottom:14px}
    .resume-classic h2{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#111;border-bottom:1.5px solid #111;padding-bottom:3px;margin:18px 0 8px}
    .resume-classic .entry{margin-bottom:10px}.resume-classic .entry-head{display:flex;justify-content:space-between;font-weight:700;font-size:13px}
    .resume-classic .entry-sub{font-size:12px;color:#555;font-style:italic;margin-top:1px}
    .resume-classic .entry-desc{margin-top:4px;font-size:12px;color:#333;white-space:pre-line}
    .classic-skill{background:#f0f0f0;color:#333;border-radius:3px}
    /* Modern */
    .resume-modern{background:#0f0f1a;color:#e8e8ff;font-family:Arial,Helvetica,sans-serif;line-height:1.55;font-size:13px}
    .resume-modern .rm-header{background:linear-gradient(135deg,#6c63ff,#9b55ff);padding:28px 32px}
    .resume-modern .rm-header h1{font-size:24px;font-weight:700;color:#fff;margin-bottom:2px}
    .resume-modern .rm-header .subtitle{font-size:13px;color:rgba(255,255,255,0.82)}
    .resume-modern .rm-header .contact{font-size:11.5px;color:rgba(255,255,255,0.6);margin-top:6px}
    .resume-modern .rm-body{padding:24px 32px}
    .resume-modern h2{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#9b72ff;border-left:3px solid #6c63ff;padding-left:8px;margin:18px 0 10px}
    .resume-modern .entry{margin-bottom:12px;padding-left:11px;border-left:1px solid #2a2a3a}
    .resume-modern .entry-head{display:flex;justify-content:space-between;font-weight:700;font-size:13px}
    .resume-modern .entry-sub{font-size:12px;color:#888;margin-top:1px}
    .resume-modern .entry-desc{margin-top:4px;font-size:12px;color:#bbb;white-space:pre-line}
    .modern-skill{background:rgba(108,99,255,0.18);color:#a090ff;border:1px solid rgba(108,99,255,0.3)}
    /* Harvard */
    .resume-harvard{background:#fff;color:#111;padding:44px 48px;font-family:'Times New Roman',Georgia,serif;line-height:1.6;font-size:13px}
    .resume-harvard h1{font-size:22px;font-weight:700;text-align:center;margin-bottom:3px}
    .resume-harvard .subtitle{text-align:center;font-size:12px;color:#444;font-style:italic;margin-bottom:3px}
    .resume-harvard .contact{text-align:center;font-size:11.5px;color:#555;font-family:Arial,sans-serif;margin-bottom:14px}
    .resume-harvard hr{border:none;border-top:1.5px solid #111;margin:0 0 12px}
    .resume-harvard h2{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;border-bottom:1px solid #111;margin:16px 0 8px;padding-bottom:2px;font-family:Arial,sans-serif}
    .resume-harvard .entry{margin-bottom:9px}.resume-harvard .entry-head{display:flex;justify-content:space-between;font-weight:700;font-size:13px}
    .resume-harvard .entry-sub{font-size:12px;color:#555;font-style:italic;margin-top:1px}
    .resume-harvard .entry-desc{margin-top:4px;font-size:12px;color:#333;white-space:pre-line}
    .harvard-skill{background:#f5f5f5;color:#333;border:1px solid #ddd;border-radius:2px}
    /* Google */
    .resume-google{background:#fff;color:#1a1a1a;display:grid;grid-template-columns:190px 1fr;font-family:Arial,Helvetica,sans-serif;line-height:1.55;font-size:12px;min-height:600px}
    .resume-google .rg-side{background:#f8f9fa;padding:28px 18px;border-right:1px solid #e0e0e0}
    .resume-google .rg-name{font-size:18px;font-weight:700;color:#1a73e8;margin-bottom:2px}
    .resume-google .rg-title{font-size:11.5px;color:#5f6368;margin-bottom:14px}
    .resume-google .rg-sh{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1a73e8;margin:12px 0 5px}
    .resume-google .rg-item{font-size:11px;color:#3c4043;margin-bottom:3px}
    .resume-google .rg-main{padding:28px 24px}
    .resume-google .rg-mh{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1a73e8;border-bottom:2px solid #1a73e8;margin:14px 0 8px;padding-bottom:2px}
    .resume-google .entry{margin-bottom:10px}.resume-google .entry-head{display:flex;justify-content:space-between;font-weight:700;font-size:12px}
    .resume-google .entry-sub{font-size:11px;color:#5f6368;font-style:italic;margin-top:1px}
    .resume-google .entry-desc{margin-top:3px;font-size:11px;color:#3c4043;white-space:pre-line}
    .google-skill{background:#e8f0fe;color:#1a73e8;border-radius:3px}
    /* Executive */
    .resume-exec{background:#fff;color:#1a1a1a;font-family:Arial,Helvetica,sans-serif;line-height:1.55;font-size:13px}
    .resume-exec .rx-header{background:#1a1a2e;padding:30px 40px}
    .resume-exec .rx-header h1{font-size:26px;font-weight:700;color:#fff;letter-spacing:0.5px;margin-bottom:4px}
    .resume-exec .rx-header .subtitle{font-size:12px;color:rgba(255,255,255,0.65);letter-spacing:2px;text-transform:uppercase;margin-bottom:5px}
    .resume-exec .rx-header .contact{font-size:11.5px;color:rgba(255,255,255,0.45)}
    .resume-exec .rx-body{padding:28px 40px}
    .resume-exec .rx-sec{display:flex;align-items:center;gap:10px;margin:16px 0 9px}
    .resume-exec .rx-sec-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#1a1a2e;white-space:nowrap}
    .resume-exec .rx-sec-line{flex:1;height:1px;background:#1a1a2e;opacity:0.25}
    .resume-exec .entry{margin-bottom:10px}.resume-exec .entry-head{display:flex;justify-content:space-between;font-weight:700;font-size:13px}
    .resume-exec .entry-sub{font-size:12px;color:#555;font-style:italic;margin-top:1px}
    .resume-exec .entry-desc{margin-top:4px;font-size:12px;color:#333;white-space:pre-line}
    .exec-skill{background:#f0f0f4;color:#1a1a2e;border:1px solid #d0d0e0;border-radius:3px}
    /* Tech */
    .resume-tech{background:#0d1117;color:#c9d1d9;padding:36px 40px;font-family:'Courier New',Courier,monospace;line-height:1.65;font-size:12px}
    .resume-tech .tech-comment{color:#8b949e;font-size:11px;margin-bottom:4px}
    .resume-tech h1{font-size:22px;font-weight:700;color:#e6edf3;margin-bottom:2px}
    .resume-tech .subtitle{color:#ffa657;font-size:12px;margin-bottom:3px}
    .resume-tech .contact{color:#8b949e;font-size:11px;margin-bottom:14px}
    .resume-tech h2{color:#3fb950;font-size:11px;font-weight:700;margin:16px 0 8px}
    .resume-tech h2::before{content:'## '}
    .resume-tech .entry{border-left:2px solid #21262d;padding-left:12px;margin-bottom:10px}
    .resume-tech .entry-head{display:flex;justify-content:space-between;font-weight:700;color:#ffa657;font-size:12px}
    .resume-tech .entry-sub{font-size:11px;color:#8b949e;margin-top:1px}
    .resume-tech .entry-desc{margin-top:4px;font-size:11px;color:#c9d1d9;white-space:pre-line}
    .tech-skill{background:#21262d;color:#58a6ff;border:1px solid #30363d;font-family:monospace;border-radius:3px}
  `;
  win.document.write(`<!DOCTYPE html><html><head><style>${css}</style><script>window.onload=()=>window.print()<\/script></head><body>${html}</body></html>`);
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
  try { localStorage.setItem('folio_portfolio', JSON.stringify(data)); } catch(e) {}
  window.open('/portfolio.html', '_blank');
}

// ── LIVE PREVIEW ──────────────────────────────────────────────────────────────
let previewTimer = null;

function updateLivePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const el = document.getElementById('live-preview-output');
    if (!el) return;
    const data = collectData();
    const hasData = data.name !== 'Your Name' || data.title !== 'Professional Title' || data.email || data.summary;
    if (!hasData) return;
    el.classList.add('preview-updating');
    el.innerHTML = buildResume(data);
    setTimeout(() => el.classList.remove('preview-updating'), 400);
  }, 300);
}

// Attach live preview listeners after DOM ready
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('app').addEventListener('input', updateLivePreview);
  document.getElementById('app').addEventListener('change', updateLivePreview);
});