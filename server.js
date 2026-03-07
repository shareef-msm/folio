const express    = require('express');
const cors       = require('cors');
const fetch      = require('node-fetch');
const path       = require('path');
const multer     = require('multer');
const fs         = require('fs');
const crypto     = require('crypto');
const Tesseract  = require('tesseract.js');
const { PdfReader } = require('pdfreader');

const app  = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GROQ_API_KEY || '';

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname)));

const upload = multer({ dest: 'uploads/', limits: { fileSize: 20 * 1024 * 1024 } });

// ── USER DATABASE ─────────────────────────────────────────────────────────────
const DB_FILE = path.join(__dirname, 'users.json');

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch(e) {}
  return { users: {} };
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'folio_salt_2024').digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ── AUTH ROUTES ───────────────────────────────────────────────────────────────

// SIGNUP
app.post('/api/signup', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const db = loadDB();
  const emailKey = email.toLowerCase().trim();

  if (db.users[emailKey]) return res.status(400).json({ error: 'Email already registered. Please login.' });

  const token = generateToken();
  db.users[emailKey] = {
    name,
    email: emailKey,
    password: hashPassword(password),
    token,
    createdAt: new Date().toISOString(),
    resumes: []
  };
  saveDB(db);

  res.json({ success: true, token, name, email: emailKey });
});

// LOGIN
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const db = loadDB();
  const emailKey = email.toLowerCase().trim();
  const user = db.users[emailKey];

  if (!user) return res.status(400).json({ error: 'Email not found. Please sign up.' });
  if (user.password !== hashPassword(password)) return res.status(400).json({ error: 'Wrong password. Try again.' });

  // Generate new token on each login
  const token = generateToken();
  user.token = token;
  saveDB(db);

  res.json({ success: true, token, name: user.name, email: emailKey });
});

// VERIFY TOKEN
app.post('/api/verify', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(401).json({ error: 'No token' });

  const db = loadDB();
  const user = Object.values(db.users).find(u => u.token === token);
  if (!user) return res.status(401).json({ error: 'Invalid session. Please login again.' });

  res.json({ success: true, name: user.name, email: user.email });
});

// SAVE RESUME
app.post('/api/save-resume', (req, res) => {
  const { token, resumeData } = req.body;
  if (!token) return res.status(401).json({ error: 'Not logged in' });

  const db = loadDB();
  const user = Object.values(db.users).find(u => u.token === token);
  if (!user) return res.status(401).json({ error: 'Invalid session' });

  // Save latest resume for this user
  const emailKey = user.email;
  db.users[emailKey].lastResume = resumeData;
  db.users[emailKey].savedAt = new Date().toISOString();
  saveDB(db);

  res.json({ success: true });
});

// GET RESUME
app.post('/api/get-resume', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(401).json({ error: 'Not logged in' });

  const db = loadDB();
  const user = Object.values(db.users).find(u => u.token === token);
  if (!user) return res.status(401).json({ error: 'Invalid session' });

  res.json({ success: true, resumeData: user.lastResume || null, name: user.name });
});

// ── DEBUG ─────────────────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({
    apiKey: API_KEY ? '✓ SET (' + API_KEY.substring(0,8) + '...)' : '✗ MISSING',
    model: 'llama-3.3-70b-versatile'
  });
});

// ── GROQ ──────────────────────────────────────────────────────────────────────
async function callGroq(prompt) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 2000, temperature: 0,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await res.json();
  console.log('Groq status:', res.status);
  console.log('Groq response:', JSON.stringify(data).substring(0, 200));
  if (!data.choices || !data.choices[0]) throw new Error(data.error?.message || 'Groq API error');
  return data.choices[0].message.content || '';
}

// ── EXTRACT ROUTE ─────────────────────────────────────────────────────────────
app.post('/api/extract', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const filePath = req.file.path;
  const mimeType = req.file.mimetype;
  let extractedText = '';

  try {
    if (mimeType === 'application/pdf') {
      extractedText = await new Promise((resolve, reject) => {
        let text = '';
        new PdfReader().parseFileItems(filePath, (err, item) => {
          if (err) reject(err);
          else if (!item) resolve(text);
          else if (item.text) text += item.text + ' ';
        });
      });
    } else if (mimeType.startsWith('image/')) {
      const result = await Tesseract.recognize(filePath, 'eng');
      extractedText = result.data.text;
    } else if (mimeType === 'text/plain') {
      extractedText = fs.readFileSync(filePath, 'utf-8');
    } else {
      try { extractedText = fs.readFileSync(filePath, 'utf-8'); }
      catch { fs.unlinkSync(filePath); return res.status(400).json({ error: 'Unsupported file type.' }); }
    }

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    if (!extractedText || extractedText.trim().length < 20)
      return res.status(400).json({ error: 'Could not read text from file.' });

    const prompt = `You are a resume parser. Extract information from the resume below.
Return ONLY a raw JSON object. No markdown. No code fences. No explanation. Just JSON.
Use exactly this structure:
{"name":"","title":"","email":"","phone":"","location":"","website":"","summary":"","skills":[],"experience":[{"title":"","company":"","start":"","end":"","desc":""}],"education":[{"degree":"","school":"","year":""}],"projects":[{"name":"","url":"","desc":""}]}
Resume:
${extractedText.substring(0, 6000)}`;

    const raw = await callGroq(prompt);
    let parsed;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      parsed = JSON.parse(jsonMatch[0]);
    } catch(e) {
      return res.status(500).json({ error: 'Could not parse AI response.' });
    }
    res.json({ success: true, data: parsed });
  } catch(err) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ error: err.message });
  }
});

// ── AI WRITING ────────────────────────────────────────────────────────────────
app.post('/api/claude', async (req, res) => {
  try {
    const userMessage = req.body.messages?.[0]?.content || '';
    const result = await callGroq(userMessage);
    res.json({ content: [{ text: result }] });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('\n  ✦ Folio Resume Builder');
  console.log('  Running at: http://localhost:' + PORT);
  console.log('  API Key:', API_KEY ? '✓ SET' : '✗ MISSING');
});