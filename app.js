// ── Storage helpers ───────────────────────────────────────────────────────────
const STORAGE_KEY = 'knit-assistant-v1';

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { projects: [], activeId: null }; }
  catch { return { projects: [], activeId: null }; }
}

function save(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) {
    if (e.name === 'QuotaExceededError') alert('Storage is almost full. Consider removing PDF patterns to free space.');
  }
}

// ── State ─────────────────────────────────────────────────────────────────────
let state = load();
let currentView = 'projects';
let chatHistory = [];
let isChatLoading = false;

function getProject(id) { return state.projects.find(p => p.id === id); }
function activeProject() { return getProject(state.activeId); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ── Project CRUD ──────────────────────────────────────────────────────────────
function createProject(name) {
  const p = { id: uid(), name, pdfData: null, steps: [] };
  state.projects.push(p);
  state.activeId = p.id;
  save(state);
  render();
}

function deleteProject(id) {
  if (!confirm('Delete this project? This cannot be undone.')) return;
  state.projects = state.projects.filter(p => p.id !== id);
  if (state.activeId === id) state.activeId = state.projects[0]?.id || null;
  save(state);
  render();
}

function renameProject(id, name) {
  const p = getProject(id);
  if (p) { p.name = name; save(state); render(); }
}

// ── Step CRUD ─────────────────────────────────────────────────────────────────
function addStep(projectId, name, counterCount) {
  const p = getProject(projectId);
  if (!p) return;
  const counters = Array.from({ length: counterCount }, (_, i) => ({
    id: uid(), label: i === 0 ? 'Row' : `Counter ${i + 1}`, value: 0
  }));
  p.steps.push({ id: uid(), name, checked: false, counters });
  save(state);
  renderProject();
}

function deleteStep(projectId, stepId) {
  const p = getProject(projectId);
  if (!p) return;
  p.steps = p.steps.filter(s => s.id !== stepId);
  save(state);
  renderProject();
}

function toggleStep(projectId, stepId) {
  const p = getProject(projectId);
  const s = p?.steps.find(s => s.id === stepId);
  if (s) { s.checked = !s.checked; save(state); renderProject(); }
}

function renameStep(projectId, stepId, name) {
  const p = getProject(projectId);
  const s = p?.steps.find(s => s.id === stepId);
  if (s) { s.name = name; save(state); renderProject(); }
}

// ── Counter ops ───────────────────────────────────────────────────────────────
function changeCounter(projectId, stepId, counterId, delta) {
  const p = getProject(projectId);
  const s = p?.steps.find(s => s.id === stepId);
  const c = s?.counters.find(c => c.id === counterId);
  if (c) {
    c.value = Math.max(0, c.value + delta);
    save(state);
    updateCounterDisplay(counterId, c.value);
    pulseCounter(counterId);
    updateStepTotal(stepId);
  }
}

function resetCounter(projectId, stepId, counterId) {
  if (!confirm('Reset this counter to 0?')) return;
  const p = getProject(projectId);
  const s = p?.steps.find(s => s.id === stepId);
  const c = s?.counters.find(c => c.id === counterId);
  if (c) { c.value = 0; save(state); updateCounterDisplay(counterId, 0); updateStepTotal(stepId); }
}

function renameCounter(projectId, stepId, counterId, label) {
  const p = getProject(projectId);
  const s = p?.steps.find(s => s.id === stepId);
  const c = s?.counters.find(c => c.id === counterId);
  if (c) { c.label = label; save(state); }
}

function updateCounterDisplay(counterId, value) {
  const el = document.getElementById(`cv-${counterId}`);
  if (el) el.textContent = value;
}

function pulseCounter(counterId) {
  const el = document.getElementById(`cv-${counterId}`);
  if (!el) return;
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
}

function updateStepTotal(stepId) {
  const el = document.getElementById(`step-total-${stepId}`);
  if (!el) return;
  const p = activeProject();
  const step = p?.steps.find(s => s.id === stepId);
  if (!step) return;
  const total = step.counters.reduce((sum, c) => sum + c.value, 0);
  el.textContent = total > 0 ? `total ${total}` : '';
}

// ── PDF handling ──────────────────────────────────────────────────────────────
function handlePdfUpload(projectId, file) {
  if (!file || file.type !== 'application/pdf') { alert('Please select a PDF file.'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const p = getProject(projectId);
    if (p) { p.pdfData = e.target.result; save(state); renderProject(); }
  };
  reader.readAsDataURL(file);
}

function removePdf(projectId) {
  const p = getProject(projectId);
  if (p) { p.pdfData = null; save(state); renderProject(); }
}

// ── Glossary data ─────────────────────────────────────────────────────────────
const GLOSSARY = [
  { abbr: 'k', name: 'Knit', desc: 'The basic knit stitch — insert needle front-to-back, wrap yarn, pull loop through.' },
  { abbr: 'p', name: 'Purl', desc: 'The purl stitch — insert needle back-to-front, wrap yarn, pull loop through.' },
  { abbr: 'yo', name: 'Yarn Over', desc: 'Wrap yarn over the needle to create a new stitch and a decorative eyelet hole.' },
  { abbr: 'sl', name: 'Slip', desc: 'Transfer a stitch from left to right needle without working it.' },
  { abbr: 'k tbl', name: 'Knit Through Back Loop', desc: 'Knit into the back loop of the stitch, twisting it slightly.' },
  { abbr: 'p tbl', name: 'Purl Through Back Loop', desc: 'Purl into the back loop of the stitch, twisting it.' },
  { abbr: 'k2tog', name: 'Knit 2 Together', desc: 'Right-leaning decrease — insert needle through 2 stitches at once and knit them together.' },
  { abbr: 'ssk', name: 'Slip, Slip, Knit', desc: 'Left-leaning decrease — slip 2 stitches knitwise, return to left needle, knit through back loops.' },
  { abbr: 'p2tog', name: 'Purl 2 Together', desc: 'Purl two stitches together as one — right-leaning decrease on the RS.' },
  { abbr: 'p2tog tbl', name: 'Purl 2 Together Through Back Loop', desc: 'Left-leaning purl decrease.' },
  { abbr: 'k3tog', name: 'Knit 3 Together', desc: 'Knit three stitches together as one — removes 2 stitches.' },
  { abbr: 'sssk', name: 'Slip, Slip, Slip, Knit', desc: 'Triple left-leaning decrease — removes 2 stitches.' },
  { abbr: 'sk2p', name: 'Slip 1, K2tog, PSSO', desc: 'Central double decrease: slip 1, knit 2 together, pass slipped stitch over.' },
  { abbr: 'cdd', name: 'Central Double Decrease', desc: 'Slip 2 together knitwise, k1, pass both slipped stitches over — removes 2 sts, centered.' },
  { abbr: 'psso', name: 'Pass Slipped Stitch Over', desc: 'Lift a previously slipped stitch over the last worked stitch and off the needle.' },
  { abbr: 'm1', name: 'Make 1', desc: 'Lift the horizontal bar between stitches onto the needle and knit it — adds 1 stitch.' },
  { abbr: 'm1l', name: 'Make 1 Left', desc: 'Left-leaning increase — lift bar from front with left needle, knit through back loop.' },
  { abbr: 'm1r', name: 'Make 1 Right', desc: 'Right-leaning increase — lift bar from back with right needle, knit through front loop.' },
  { abbr: 'm1p', name: 'Make 1 Purlwise', desc: 'Lift bar between stitches and purl it — used for purl-side increases.' },
  { abbr: 'kfb', name: 'Knit Front and Back', desc: 'Increase by knitting into the front and back of the same stitch — adds 1 stitch.' },
  { abbr: 'pfb', name: 'Purl Front and Back', desc: 'Increase by purling into the front and back of the same stitch.' },
  { abbr: 'kfbf', name: 'Knit Front, Back, Front', desc: 'Double increase — knit into front, back, then front of same stitch — adds 2 stitches.' },
  { abbr: 'CO', name: 'Cast On', desc: 'Create the initial stitches on the needle to begin knitting a piece.' },
  { abbr: 'BO', name: 'Bind Off', desc: 'Also "cast off" — remove stitches from the needle to finish a piece or edge.' },
  { abbr: 'RS', name: 'Right Side', desc: 'The public/front face of the work that will be visible when worn or displayed.' },
  { abbr: 'WS', name: 'Wrong Side', desc: 'The private/back face of the work, usually hidden inside a garment.' },
  { abbr: 'rnd', name: 'Round', desc: 'One complete circuit of stitches in circular/in-the-round knitting.' },
  { abbr: 'st', name: 'Stitch', desc: 'A single loop on the needle. Plural: sts.' },
  { abbr: 'sts', name: 'Stitches', desc: 'Plural of stitch — the loops currently on your needle.' },
  { abbr: 'rep', name: 'Repeat', desc: 'Work the indicated section again, as many times as specified.' },
  { abbr: 'alt', name: 'Alternate', desc: 'Work on every other row or stitch as directed.' },
  { abbr: 'beg', name: 'Beginning', desc: 'The start of a row, round, or section.' },
  { abbr: 'cont', name: 'Continue', desc: 'Keep working in the established pattern without changes.' },
  { abbr: 'dec', name: 'Decrease', desc: 'Reduce the stitch count by working two or more stitches together.' },
  { abbr: 'inc', name: 'Increase', desc: 'Add a new stitch to grow the total stitch count.' },
  { abbr: 'rem', name: 'Remaining', desc: 'Stitches or rows still to be worked after a given point.' },
  { abbr: 'tog', name: 'Together', desc: 'Work two or more stitches as one — common in decrease instructions.' },
  { abbr: 'approx', name: 'Approximately', desc: 'Not an exact measurement — work to roughly the stated amount.' },
  { abbr: 'patt', name: 'Pattern', desc: 'Continue the stitch pattern exactly as set up in earlier rows.' },
  { abbr: 'foll', name: 'Following', desc: 'The next row, round, or instruction after the current one.' },
  { abbr: 'LH', name: 'Left Hand', desc: 'Needle in the left hand — stitches are worked off this needle.' },
  { abbr: 'RH', name: 'Right Hand', desc: 'Needle in the right hand — completed stitches land here.' },
  { abbr: 'rev', name: 'Reverse', desc: 'Work the shaping mirrored — used for symmetrical pieces like both armholes.' },
  { abbr: 'work even', name: 'Work Even', desc: 'Continue in pattern without any increases or decreases.' },
  { abbr: 'pm', name: 'Place Marker', desc: 'Slide a stitch marker onto the needle to mark an important position.' },
  { abbr: 'sm', name: 'Slip Marker', desc: 'Move the marker from left needle to right needle when you reach it.' },
  { abbr: 'rm', name: 'Remove Marker', desc: 'Take the stitch marker off the needle — usually at the end of a section.' },
  { abbr: 'BOR', name: 'Beginning of Round', desc: 'The marker that indicates where each new round starts in circular knitting.' },
  { abbr: 'wyif', name: 'With Yarn In Front', desc: 'Hold working yarn to the front of work before slipping a stitch.' },
  { abbr: 'wyib', name: 'With Yarn In Back', desc: 'Hold working yarn to the back of work before slipping a stitch.' },
  { abbr: 'yarn fwd', name: 'Yarn Forward', desc: 'Bring working yarn to the front of the work (equivalent to yo in some patterns).' },
  { abbr: 'yarn back', name: 'Yarn Back', desc: 'Move working yarn to the back of the work.' },
  { abbr: 'MC', name: 'Main Color', desc: 'The primary yarn color in a multi-color pattern.' },
  { abbr: 'CC', name: 'Contrast Color', desc: 'A secondary yarn color used for stripes, motifs, or colorwork.' },
  { abbr: 'dpn', name: 'Double-Pointed Needles', desc: 'Short needles with points at both ends, used for small circumference circular knitting.' },
  { abbr: 'cn', name: 'Cable Needle', desc: 'Short needle used to hold stitches aside while working a cable crossing.' },
  { abbr: 'circ', name: 'Circular Needle', desc: 'Two needle tips joined by a flexible cord — used for flat or circular knitting.' },
  { abbr: 'tbl', name: 'Through Back Loop', desc: 'Insert needle through the back loop of a stitch instead of the front, twisting it.' },
  { abbr: 'w&t', name: 'Wrap and Turn', desc: 'Short-row technique — wrap yarn around next stitch, then turn to work back the other way.' },
  { abbr: 'short row', name: 'Short Row', desc: 'A partial row turned before the end, used to add shaping (shoulders, heels, bust darts).' },
  { abbr: 'kitchener', name: 'Kitchener Stitch', desc: 'Grafting technique that joins two sets of live stitches invisibly — used for sock toes.' },
  { abbr: 'magic loop', name: 'Magic Loop', desc: 'Technique for knitting small circumferences using one long circular needle.' },
  { abbr: 'intarsia', name: 'Intarsia', desc: 'Colorwork method using separate yarn bobbins for each color block — no carrying.' },
  { abbr: 'stranded', name: 'Stranded Colorwork', desc: 'Carrying multiple yarn colors across a row, creating floats on the wrong side.' },
  { abbr: 'float', name: 'Float', desc: 'The strand of yarn carried loosely across the back between color changes in stranded work.' },
  { abbr: 'steek', name: 'Steek', desc: 'Extra stitches knitted in the round that are later cut open to create an armhole or front opening.' },
  { abbr: 'i-cord', name: 'I-Cord', desc: 'A tiny tube of knitting worked on 2–4 stitches — used for ties, straps, and edgings.' },
  { abbr: 'mattress', name: 'Mattress Stitch', desc: 'Seaming technique that joins two flat pieces of knitting nearly invisibly along their edges.' },
  { abbr: '* ... *', name: 'Repeat Between Asterisks', desc: 'Work the stitches between the asterisks as many times as the pattern directs.' },
  { abbr: '[ ]', name: 'Repeat in Brackets', desc: 'Work the stitches inside brackets the number of times stated immediately after.' },
  { abbr: 'k to end', name: 'Knit to End', desc: 'Knit every remaining stitch in the current row.' },
  { abbr: 'p to end', name: 'Purl to End', desc: 'Purl every remaining stitch in the current row.' },
  { abbr: 'as set', name: 'As Set / Established', desc: 'Continue the stitch pattern exactly as it has been worked so far.' },
  { abbr: 'gauge', name: 'Gauge / Tension', desc: 'The number of stitches and rows per inch or cm — critical for getting the correct size.' },
  { abbr: 'swatch', name: 'Gauge Swatch', desc: 'A small test square knitted before starting a project to check your gauge.' },
  { abbr: 'block', name: 'Blocking', desc: 'Wetting or steaming the finished piece to even out stitches and set the final dimensions.' },
  { abbr: 'frog', name: 'Frog / Rip Out', desc: '"Rip it, rip it" — pull the yarn to unravel rows of knitting quickly.' },
  { abbr: 'tink', name: 'Tink', desc: '"Knit" backwards — carefully undo stitches one at a time to fix a mistake.' },
  { abbr: 'dk', name: 'DK Weight', desc: 'Double Knitting weight — lighter than worsted, heavier than sport. Very versatile.' },
  { abbr: 'worsted', name: 'Worsted Weight', desc: 'Medium-weight yarn — the most common weight for everyday knitting projects.' },
  { abbr: 'lace', name: 'Lace Weight', desc: 'Very fine yarn used for delicate shawls and airy lacy projects.' },
  { abbr: 'bulky', name: 'Bulky Weight', desc: 'Thick yarn that knits up quickly on large needles.' },
  { abbr: 'fingering', name: 'Fingering / Sock Weight', desc: 'Fine yarn traditionally used for socks, shawls, and delicate garments.' },
  { abbr: 'aran', name: 'Aran Weight', desc: 'Between worsted and bulky — ideal for cables, sweaters, and cosy accessories.' },
  { abbr: 'yardage', name: 'Yardage', desc: 'Total length of yarn in a skein or ball — important for estimating how much you need.' },
  { abbr: 'skein', name: 'Skein', desc: 'A loosely wound coil of yarn sold by weight — needs to be wound into a ball before use.' },
  { abbr: 'hank', name: 'Hank', desc: 'Yarn twisted into a large loop — must be wound before knitting to avoid tangles.' },
  { abbr: 'WPI', name: 'Wraps Per Inch', desc: 'A way to measure yarn weight by counting how many wraps fit in one inch.' },
  { abbr: 'S1', name: 'Slip 1 Knitwise', desc: 'Insert needle as if to knit, then slip the stitch without working it.' },
  { abbr: 'sl1p', name: 'Slip 1 Purlwise', desc: 'Insert needle as if to purl, then slip the stitch without working it.' },
  { abbr: 'cable', name: 'Cable', desc: 'Crossed stitches worked with a cable needle to create twisted rope-like patterns.' },
  { abbr: 'C4F', name: 'Cable 4 Front', desc: 'Slip 2 sts to cable needle in front, k2, then k2 from cable needle — left-crossing cable.' },
  { abbr: 'C4B', name: 'Cable 4 Back', desc: 'Slip 2 sts to cable needle in back, k2, then k2 from cable needle — right-crossing cable.' },
  { abbr: 'seed st', name: 'Seed Stitch', desc: 'Alternating k and p stitches offset each row — creates a bumpy, reversible fabric.' },
  { abbr: 'moss st', name: 'Moss Stitch', desc: 'Similar to seed stitch but offset over 2 rows — creates a denser, textured fabric.' },
  { abbr: 'garter', name: 'Garter Stitch', desc: 'Knit every row (flat) or alternate knit/purl rounds (circular) — creates horizontal ridges.' },
  { abbr: 'stockinette', name: 'Stockinette Stitch', desc: 'Knit RS rows, purl WS rows — creates the classic smooth V-stitch fabric.' },
  { abbr: 'ribbing', name: 'Ribbing', desc: 'Alternating columns of knit and purl stitches — creates stretchy elastic fabric used for cuffs and hems.' },
];

function renderGlossary(filter) {
  const results = document.getElementById('glossary-results');
  const q = (filter || '').toLowerCase().trim();
  const items = q
    ? GLOSSARY.filter(t =>
        t.abbr.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.desc.toLowerCase().includes(q))
    : GLOSSARY;

  results.innerHTML = '';
  if (items.length === 0) {
    results.innerHTML = '<p class="glossary-empty">No terms found.</p>';
    return;
  }
  items.forEach(term => {
    const card = document.createElement('div');
    card.className = 'glossary-card';
    const abbr = document.createElement('span');
    abbr.className = 'glossary-abbr';
    abbr.textContent = term.abbr;
    const body = document.createElement('div');
    body.className = 'glossary-body';
    const name = document.createElement('strong');
    name.textContent = term.name;
    const desc = document.createElement('p');
    desc.textContent = term.desc;
    body.append(name, desc);
    card.append(abbr, body);
    results.appendChild(card);
  });
}

// ── Chat ──────────────────────────────────────────────────────────────────────
function buildSystemPrompt() {
  let prompt = `You are a friendly and knowledgeable knitting expert assistant. Help with:
- Reading and understanding knitting patterns
- Explaining abbreviations and stitch techniques step by step
- Troubleshooting mistakes and fixing errors
- Yarn, needle, and tool recommendations
- Pattern math, sizing, and modifications

Be concise and practical. When using jargon, explain it clearly.`;
  const p = activeProject();
  if (p && p.steps.length > 0) {
    prompt += `\n\nThe user is currently working on a project called "${p.name}" with these steps: ${p.steps.map(s => `"${s.name}"`).join(', ')}.`;
  }
  return prompt;
}

function showChatSetup() {
  document.getElementById('chat-setup').classList.remove('hidden');
  document.getElementById('chat-main').classList.add('hidden');
}

function showChatMain() {
  document.getElementById('chat-setup').classList.add('hidden');
  document.getElementById('chat-main').classList.remove('hidden');
}

function initChat() {
  const key = localStorage.getItem('orApiKey');
  if (key) showChatMain(); else showChatSetup();
  renderChat();
}

function renderChat() {
  const thread = document.getElementById('chat-messages');
  if (!thread) return;
  thread.innerHTML = '';
  if (chatHistory.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'chat-empty';
    empty.textContent = 'Ask me anything about your pattern ✨';
    thread.appendChild(empty);
  } else {
    chatHistory.forEach(msg => {
      const bubble = document.createElement('div');
      bubble.className = `chat-bubble ${msg.role}`;
      bubble.textContent = msg.content;
      thread.appendChild(bubble);
    });
  }
  if (isChatLoading) {
    const loading = document.createElement('div');
    loading.className = 'chat-bubble assistant chat-loading';
    loading.innerHTML = '<span></span><span></span><span></span>';
    thread.appendChild(loading);
  }
  thread.scrollTop = thread.scrollHeight;
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || isChatLoading) return;
  const key = localStorage.getItem('orApiKey');
  if (!key) { showChatSetup(); return; }

  input.value = '';
  input.style.height = '';
  chatHistory.push({ role: 'user', content: text });
  isChatLoading = true;
  renderChat();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ef-erraticpatterns.github.io/Knit-Assistant',
        'X-Title': 'Knit Assistant'
      },
      body: JSON.stringify({
        model: localStorage.getItem('orModel') || 'mistralai/mistral-7b-instruct:free',
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          ...chatHistory
        ]
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    chatHistory.push({ role: 'assistant', content: data.choices[0].message.content });
  } catch (e) {
    const msg = e.name === 'AbortError'
      ? '⏱ Request timed out after 30 s. Check your connection and try again.'
      : `⚠️ ${e.message}. Check your API key in settings (⚙).`;
    chatHistory.push({ role: 'assistant', content: msg });
  } finally {
    clearTimeout(timeout);
    isChatLoading = false;
    renderChat();
  }
}

// ── Render: tabs ──────────────────────────────────────────────────────────────
function renderTabs() {
  const nav = document.getElementById('project-tabs');
  nav.innerHTML = '';
  state.projects.forEach(p => {
    const tab = document.createElement('div');
    tab.className = 'tab' + (p.id === state.activeId ? ' active' : '');
    tab.setAttribute('role', 'tab');

    const nameSpan = document.createElement('span');
    nameSpan.textContent = p.name;
    nameSpan.style.cursor = 'pointer';
    nameSpan.addEventListener('click', () => { state.activeId = p.id; save(state); render(); });

    const renameBtn = document.createElement('button');
    renameBtn.className = 'tab-rename'; renameBtn.title = 'Rename'; renameBtn.textContent = '✎';
    renameBtn.addEventListener('click', e => { e.stopPropagation(); openRenameModal(p.id, p.name); });

    const delBtn = document.createElement('button');
    delBtn.className = 'tab-delete'; delBtn.title = 'Delete project'; delBtn.textContent = '✕';
    delBtn.addEventListener('click', e => { e.stopPropagation(); deleteProject(p.id); });

    tab.append(nameSpan, renameBtn, delBtn);
    nav.appendChild(tab);
  });
}

// ── Render: project body ──────────────────────────────────────────────────────
function renderProject() {
  const main = document.getElementById('project-view');
  const p = activeProject();

  if (!p) {
    main.innerHTML = '<div id="empty-state"><p>No projects yet.<br/>Tap <strong>＋</strong> to create your first project.</p></div>';
    return;
  }

  main.innerHTML = '';

  // PDF section
  const pdfSec = document.createElement('div');
  pdfSec.className = 'pdf-section';
  const pdfHeader = document.createElement('div');
  pdfHeader.className = 'pdf-section-header';
  const pdfLabel = document.createElement('span');
  pdfLabel.textContent = 'Pattern PDF';
  pdfHeader.appendChild(pdfLabel);
  pdfSec.appendChild(pdfHeader);

  if (p.pdfData) {
    const wrap = document.createElement('div');
    wrap.className = 'pdf-viewer-wrap';
    const iframe = document.createElement('iframe');
    iframe.src = p.pdfData;
    iframe.title = 'Pattern PDF';
    const removeBtn = document.createElement('button');
    removeBtn.className = 'pdf-remove-btn';
    removeBtn.textContent = '✕ Remove';
    removeBtn.addEventListener('click', () => removePdf(p.id));
    wrap.append(iframe, removeBtn);
    pdfSec.appendChild(wrap);
  } else {
    const uploadArea = document.createElement('label');
    uploadArea.className = 'pdf-upload-area';
    uploadArea.innerHTML = `<span>📄 Tap to upload your pattern PDF</span><input type="file" accept="application/pdf" />`;
    uploadArea.querySelector('input').addEventListener('change', e => handlePdfUpload(p.id, e.target.files[0]));
    pdfSec.appendChild(uploadArea);
  }
  main.appendChild(pdfSec);

  // Steps section
  const stepsSec = document.createElement('div');
  stepsSec.className = 'steps-section';
  const stepsHeader = document.createElement('div');
  stepsHeader.className = 'steps-header';
  const stepsTitle = document.createElement('h3');
  stepsTitle.textContent = 'Steps';
  const addStepBtn = document.createElement('button');
  addStepBtn.className = 'btn primary small';
  addStepBtn.textContent = '＋ Add Step';
  addStepBtn.addEventListener('click', () => openStepModal(p.id));
  stepsHeader.append(stepsTitle, addStepBtn);
  stepsSec.appendChild(stepsHeader);

  p.steps.forEach(step => stepsSec.appendChild(buildStepCard(p.id, step)));
  main.appendChild(stepsSec);
}

function buildStepCard(projectId, step) {
  const card = document.createElement('div');
  card.className = 'step-card' + (step.checked ? ' done' : '');
  card.id = `step-${step.id}`;

  const top = document.createElement('div');
  top.className = 'step-top';

  const cb = document.createElement('input');
  cb.type = 'checkbox'; cb.className = 'step-checkbox'; cb.checked = step.checked;
  cb.addEventListener('change', () => toggleStep(projectId, step.id));

  const nameWrap = document.createElement('div');
  nameWrap.className = 'step-name-wrap';

  const nameEl = document.createElement('span');
  nameEl.className = 'step-name'; nameEl.textContent = step.name;

  const totalEl = document.createElement('span');
  totalEl.className = 'step-total'; totalEl.id = `step-total-${step.id}`;
  const initialTotal = step.counters.reduce((sum, c) => sum + c.value, 0);
  totalEl.textContent = initialTotal > 0 ? `total ${initialTotal}` : '';

  const actions = document.createElement('div');
  actions.className = 'step-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'step-edit-btn'; editBtn.title = 'Rename step'; editBtn.textContent = '✎';
  editBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.className = 'step-name-input'; input.value = step.name;
    nameWrap.replaceChild(input, nameEl);
    input.focus(); input.select();
    const finish = () => {
      const val = input.value.trim() || step.name;
      renameStep(projectId, step.id, val);
    };
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = step.name; input.blur(); } });
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'step-delete-btn'; delBtn.title = 'Delete step'; delBtn.textContent = '🗑';
  delBtn.addEventListener('click', () => {
    if (confirm(`Delete step "${step.name}"?`)) deleteStep(projectId, step.id);
  });

  actions.append(editBtn, delBtn);
  nameWrap.append(nameEl, totalEl);
  top.append(cb, nameWrap, actions);
  card.appendChild(top);

  const countersEl = document.createElement('div');
  countersEl.className = 'counters';
  step.counters.forEach(counter => countersEl.appendChild(buildCounter(projectId, step.id, counter)));
  card.appendChild(countersEl);
  return card;
}

function buildCounter(projectId, stepId, counter) {
  const el = document.createElement('div');
  el.className = 'counter';

  const nameRow = document.createElement('div');
  nameRow.className = 'counter-name-row';

  const nameEl = document.createElement('span');
  nameEl.className = 'counter-name'; nameEl.textContent = counter.label;

  const nameEditBtn = document.createElement('button');
  nameEditBtn.className = 'counter-name-edit-btn'; nameEditBtn.title = 'Rename counter'; nameEditBtn.textContent = '✎';
  nameEditBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.className = 'counter-name-edit-input'; input.value = counter.label;
    nameRow.replaceChild(input, nameEl);
    nameRow.removeChild(nameEditBtn);
    input.focus(); input.select();
    const finish = () => {
      const val = input.value.trim() || counter.label;
      renameCounter(projectId, stepId, counter.id, val);
      nameEl.textContent = val;
      nameRow.replaceChild(nameEl, input);
      nameRow.appendChild(nameEditBtn);
    };
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = counter.label; input.blur(); } });
  });

  nameRow.append(nameEl, nameEditBtn);

  const valueEl = document.createElement('div');
  valueEl.className = 'counter-value'; valueEl.id = `cv-${counter.id}`; valueEl.textContent = counter.value;

  const btnsRow = document.createElement('div');
  btnsRow.className = 'counter-btns';

  const decBtn = document.createElement('button');
  decBtn.className = 'counter-btn dec'; decBtn.textContent = '−'; decBtn.title = 'Decrease';
  decBtn.addEventListener('click', () => changeCounter(projectId, stepId, counter.id, -1));

  const incBtn = document.createElement('button');
  incBtn.className = 'counter-btn inc'; incBtn.textContent = '+'; incBtn.title = 'Tap +1 · Hold +10';

  let longPressTimer = null;
  let longPressFired = false;
  incBtn.addEventListener('pointerdown', () => {
    longPressFired = false;
    longPressTimer = setTimeout(() => {
      longPressFired = true;
      changeCounter(projectId, stepId, counter.id, +10);
    }, 600);
  });
  incBtn.addEventListener('click', () => {
    if (!longPressFired) changeCounter(projectId, stepId, counter.id, +1);
  });
  const cancelLP = () => clearTimeout(longPressTimer);
  incBtn.addEventListener('pointerup', cancelLP);
  incBtn.addEventListener('pointercancel', cancelLP);
  incBtn.addEventListener('pointerleave', cancelLP);

  btnsRow.append(decBtn, incBtn);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'counter-reset-btn'; resetBtn.textContent = 'reset';
  resetBtn.addEventListener('click', () => resetCounter(projectId, stepId, counter.id));

  el.append(nameRow, valueEl, btnsRow, resetBtn);
  return el;
}

// ── View switching ────────────────────────────────────────────────────────────
function switchView(view) {
  currentView = view;

  const isProjects = view === 'projects';
  const isGlossary = view === 'glossary';
  const isChat = view === 'chat';

  document.getElementById('project-view').classList.toggle('hidden', !isProjects);
  document.getElementById('project-tabs').classList.toggle('hidden', !isProjects);
  document.getElementById('glossary-view').classList.toggle('hidden', !isGlossary);
  document.getElementById('chat-view').classList.toggle('hidden', !isChat);
  document.getElementById('add-project-btn').classList.toggle('hidden', !isProjects);
  document.getElementById('chat-settings-btn').classList.toggle('hidden', !isChat);

  document.querySelectorAll('#bottom-nav button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  if (isGlossary) {
    const search = document.getElementById('glossary-search');
    renderGlossary(search?.value || '');
  }
  if (isChat) initChat();
}

// ── Full render ───────────────────────────────────────────────────────────────
function render() {
  renderTabs();
  renderProject();
}

// ── Modals ────────────────────────────────────────────────────────────────────
let _modalMode = 'create';
let _renameId = null;

function openCreateModal() {
  _modalMode = 'create'; _renameId = null;
  document.getElementById('modal-title').textContent = 'New Project';
  document.getElementById('modal-confirm').textContent = 'Create';
  document.getElementById('modal-input').value = '';
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-input').focus();
}

function openRenameModal(id, currentName) {
  _modalMode = 'rename'; _renameId = id;
  document.getElementById('modal-title').textContent = 'Rename Project';
  document.getElementById('modal-confirm').textContent = 'Rename';
  document.getElementById('modal-input').value = currentName;
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-input').focus();
  document.getElementById('modal-input').select();
}

function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }

function confirmModal() {
  const name = document.getElementById('modal-input').value.trim();
  if (!name) return;
  if (_modalMode === 'create') createProject(name);
  else if (_modalMode === 'rename') renameProject(_renameId, name);
  closeModal();
}

let _stepProjectId = null;
function openStepModal(projectId) {
  _stepProjectId = projectId;
  document.getElementById('step-modal-input').value = '';
  document.getElementById('step-counter-count').value = '2';
  document.getElementById('step-modal-overlay').classList.remove('hidden');
  document.getElementById('step-modal-input').focus();
}

function closeStepModal() { document.getElementById('step-modal-overlay').classList.add('hidden'); }

function confirmStepModal() {
  const name = document.getElementById('step-modal-input').value.trim();
  if (!name) return;
  const count = parseInt(document.getElementById('step-counter-count').value, 10);
  addStep(_stepProjectId, name, count);
  closeStepModal();
}

// ── Event wiring ──────────────────────────────────────────────────────────────
document.getElementById('add-project-btn').addEventListener('click', openCreateModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('modal-confirm').addEventListener('click', confirmModal);
document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
document.getElementById('modal-input').addEventListener('keydown', e => { if (e.key === 'Enter') confirmModal(); if (e.key === 'Escape') closeModal(); });

document.getElementById('step-modal-cancel').addEventListener('click', closeStepModal);
document.getElementById('step-modal-confirm').addEventListener('click', confirmStepModal);
document.getElementById('step-modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeStepModal(); });
document.getElementById('step-modal-input').addEventListener('keydown', e => { if (e.key === 'Enter') confirmStepModal(); if (e.key === 'Escape') closeStepModal(); });

document.querySelectorAll('#bottom-nav button').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

document.getElementById('glossary-search').addEventListener('input', e => renderGlossary(e.target.value));

document.getElementById('chat-send').addEventListener('click', sendChatMessage);
document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
});
document.getElementById('chat-input').addEventListener('input', function () {
  this.style.height = '';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

document.getElementById('or-key-save').addEventListener('click', () => {
  const key = document.getElementById('or-key-input').value.trim();
  if (!key) return;
  localStorage.setItem('orApiKey', key);
  document.getElementById('or-key-input').value = '';
  showChatMain();
});
document.getElementById('or-key-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('or-key-save').click();
});

document.getElementById('chat-settings-btn').addEventListener('click', () => {
  if (confirm('Remove your OpenRouter API key?')) {
    localStorage.removeItem('orApiKey');
    chatHistory = [];
    showChatSetup();
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
render();
switchView('projects');
