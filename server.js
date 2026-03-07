const express    = require('express');
const cors       = require('cors');
const fetch      = require('node-fetch');
const path       = require('path');
const multer     = require('multer');
const fs         = require('fs');
const Tesseract  = require('tesseract.js');
const { PdfReader } = require('pdfreader');

const app  = express();
const PORT = 3000;

// ── YOUR GROQ API KEY ─────────────────────────────────────────────────────────
// Get your FREE key at: console.groq.com → API Keys → Create Key
const API_KEY = process.env.GROQ_API_KEY || '';
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname)));

const upload = multer({ dest: 'uploads/', limits: { fileSize: 20 * 1024 * 1024 } });

// ── CALL GROQ ─────────────────────────────────────────────────────────────────
async function callGroq(prompt) {
  const res  = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 2000,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await res.json();
  if (!data.choices || !data.choices[0]) {
    console.log('Groq error:', JSON.stringify(data));
    throw new Error(data.error?.message || 'Groq API error');
  }
  return data.choices[0].message.content || '';
}

// ── UNIVERSAL EXTRACT ROUTE ───────────────────────────────────────────────────
app.post('/api/extract', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filePath = req.file.path;
  const mimeType = req.file.mimetype;
  let extractedText = '';

  try {
    console.log('\n-----------------------------');
    console.log('File:', req.file.originalname, '| Type:', mimeType);

    // PDF
    if (mimeType === 'application/pdf') {
      console.log('Reading PDF...');
      extractedText = await new Promise((resolve, reject) => {
        let text = '';
        new PdfReader().parseFileItems(filePath, (err, item) => {
          if (err) reject(err);
          else if (!item) resolve(text);
          else if (item.text) text += item.text + ' ';
        });
      });
    }

    // Image — run OCR
    else if (mimeType.startsWith('image/')) {
      console.log('Running OCR on image...');
      const result  = await Tesseract.recognize(filePath, 'eng');
      extractedText = result.data.text;
    }

    // Plain text
    else if (mimeType === 'text/plain') {
      console.log('Reading text file...');
      extractedText = fs.readFileSync(filePath, 'utf-8');
    }

    // Unknown — try as text
    else {
      try { extractedText = fs.readFileSync(filePath, 'utf-8'); }
      catch {
        fs.unlinkSync(filePath);
        return res.status(400).json({ error: 'Unsupported file type. Use PDF, JPG, PNG, or TXT.' });
      }
    }

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    if (!extractedText || extractedText.trim().length < 20) {
      return res.status(400).json({ error: 'Could not read text from file. Try a clearer image or different file.' });
    }

    console.log('Extracted', extractedText.length, 'chars. Sending to Groq AI...');

    const prompt = `You are a resume parser. Extract information from the resume below.
Return ONLY a raw JSON object. No markdown. No code fences. No explanation. Just JSON.

Use exactly this structure:
{"name":"","title":"","email":"","phone":"","location":"","website":"","summary":"","skills":[],"experience":[{"title":"","company":"","start":"","end":"","desc":""}],"education":[{"degree":"","school":"","year":""}],"projects":[{"name":"","url":"","desc":""}]}

Resume:
${extractedText.substring(0, 6000)}`;

    const raw = await callGroq(prompt);
    console.log('Groq returned', raw.length, 'chars');
    console.log('Preview:', raw.substring(0, 150));

    let parsed;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.log('Parse failed:', e.message);
      console.log('Full response:', raw);
      return res.status(500).json({ error: 'Could not parse AI response. Please try again.' });
    }

    console.log('Success! Name:', parsed.name);
    res.json({ success: true, data: parsed });

  } catch (err) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── AI WRITING PROXY (also uses Groq) ────────────────────────────────────────
app.post('/api/claude', async (req, res) => {
  try {
    const userMessage = req.body.messages?.[0]?.content || '';
    const result = await callGroq(userMessage);
    res.json({ content: [{ text: result }] });
  } catch (err) {
    console.error('AI writing error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n  ✦ Folio Resume Builder');
  console.log('  Running at: http://localhost:' + PORT);
  console.log('  AI: Groq (Free)');
  console.log('  API Key:', API_KEY !== 'YOUR_GROQ_API_KEY_HERE' ? '✓ SET' : '✗ MISSING — add your Groq key!');
  console.log('  Accepts: PDF, JPG, PNG, TXT\n');
});