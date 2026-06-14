// ── Storage helpers ───────────────────────────────────────────────────────────
const STORAGE_KEY = 'knit-assistant-v1';

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { projects: [], activeId: null }; }
  catch { return { projects: [], activeId: null }; }
}

function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      // Strip PDF data and retry — steps/counters are more important than the cached PDF
      try {
        const slim = {
          ...state,
          projects: state.projects.map(p => ({ ...p, pdfData: null, patternText: null, patternAnalysis: null }))
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
        state.projects.forEach(p => { p.pdfData = null; p.patternText = null; p.patternAnalysis = null; });
        alert('Storage was full — your PDF was removed to save your steps and counters. You can re-upload the PDF anytime.');
        renderProject();
      } catch {
        alert('Storage is completely full. Please clear some browser data and try again.');
      }
    }
  }
}

// ── State ─────────────────────────────────────────────────────────────────────
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

let state = load();
let currentView = 'projects';
let chatHistory = [];
let isChatLoading = false;
let isAnalyzing = false;

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
  p.steps.push({ id: uid(), name, checked: false, counters, pinnedTerms: [] });
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
  reader.onload = async e => {
    const p = getProject(projectId);
    if (!p) return;
    p.pdfData = e.target.result;
    p.patternText = null;
    p.patternAnalysis = null;
    save(state);
    renderProject();
    const text = await extractPdfText(e.target.result);
    const proj = getProject(projectId);
    if (text && proj) { proj.patternText = text; save(state); renderProject(); }
  };
  reader.readAsDataURL(file);
}

function removePdf(projectId) {
  const p = getProject(projectId);
  if (p) { p.pdfData = null; p.patternText = null; p.patternAnalysis = null; save(state); renderProject(); }
}

// ── Pattern recognition ───────────────────────────────────────────────────────
async function extractPdfText(dataUrl) {
  if (typeof pdfjsLib === 'undefined') return null;
  try {
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const maxPages = Math.min(pdf.numPages, 10);
    let text = '';
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(it => it.str).join(' ') + '\n\n';
    }
    return text.trim().slice(0, 8000) || null;
  } catch { return null; }
}

async function analyzePattern(projectId) {
  if (isAnalyzing) return;
  const p = getProject(projectId);
  if (!p?.patternText) return;
  const key = localStorage.getItem('orApiKey');
  if (!key) { alert('Set up your OpenRouter API key in the AI Chat tab first.'); switchView('chat'); return; }
  isAnalyzing = true;
  renderProject();
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ef-erraticpatterns.github.io/Knit-Assistant',
        'X-Title': 'Knit Assistant'
      },
      body: JSON.stringify({
        model: localStorage.getItem('orModel') || 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a knitting expert. Analyze knitting patterns concisely and practically.' },
          { role: 'user', content: `Analyze this knitting pattern and give a brief structured summary with these sections:\n**Project**: what is being made\n**Materials**: yarn weight, needle size, yardage needed\n**Gauge**: stitches/rows per 4 inches if given\n**Key abbreviations**: any custom or important ones defined\n**Pattern sections**: main parts of the pattern in order\n**Notes**: important warnings or tips\n\nPattern text:\n${p.patternText.slice(0, 4000)}` }
        ]
      })
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error?.message || `HTTP ${res.status}`); }
    const data = await res.json();
    const proj = getProject(projectId);
    if (proj) { proj.patternAnalysis = data.choices[0].message.content; save(state); }
  } catch (e) {
    alert(`Analysis failed: ${e.message}`);
  } finally {
    isAnalyzing = false;
    renderProject();
  }
}

function minMarkdown(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

// ── Pinned glossary terms ─────────────────────────────────────────────────────
let _pinTerm = null;

function openPinTermModal(term) {
  _pinTerm = term;
  const p = activeProject();
  document.getElementById('pin-modal-title').textContent = `Add "${term.name}" to a step`;
  document.getElementById('pin-modal-desc').textContent = term.desc;
  const stepsDiv = document.getElementById('pin-modal-steps');
  stepsDiv.innerHTML = '';
  if (!p || p.steps.length === 0) {
    stepsDiv.innerHTML = '<p class="pin-modal-empty">No steps yet — add a step to your project first.</p>';
  } else {
    p.steps.forEach(step => {
      const already = (step.pinnedTerms || []).some(t => t.abbr === term.abbr);
      const btn = document.createElement('button');
      btn.className = 'pin-step-btn' + (already ? ' pinned' : '');
      btn.disabled = already;
      btn.innerHTML = `<span>${step.name}</span>${already ? '<span class="pin-check">✓ Added</span>' : ''}`;
      btn.addEventListener('click', () => { pinTermToStep(step.id, term); closePinTermModal(); });
      stepsDiv.appendChild(btn);
    });
  }
  document.getElementById('pin-modal-overlay').classList.remove('hidden');
}

function closePinTermModal() {
  document.getElementById('pin-modal-overlay').classList.add('hidden');
  _pinTerm = null;
}

function pinTermToStep(stepId, term) {
  const p = activeProject();
  const step = p?.steps.find(s => s.id === stepId);
  if (!step) return;
  if (!step.pinnedTerms) step.pinnedTerms = [];
  if (!step.pinnedTerms.some(t => t.abbr === term.abbr)) {
    step.pinnedTerms.push({ abbr: term.abbr, name: term.name, desc: term.desc });
    save(state);
    if (currentView === 'projects') renderProject();
  }
}

function unpinTermFromStep(stepId, abbr) {
  const p = activeProject();
  const step = p?.steps.find(s => s.id === stepId);
  if (!step) return;
  step.pinnedTerms = (step.pinnedTerms || []).filter(t => t.abbr !== abbr);
  save(state);
  renderProject();
}

// ── Pattern Guide ─────────────────────────────────────────────────────────────

let wizardProjectId = null;
let wizardPatternText = null;
let wizardMeta = null;

function parseAIJson(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw.trim()); } catch {}
  const stripped = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
  try { return JSON.parse(stripped); } catch {}
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
  if (s !== -1 && e > s) try { return JSON.parse(raw.slice(s, e + 1)); } catch {}
  return null;
}

async function callAI(userContent, systemContent, maxTokens) {
  const key = localStorage.getItem('orApiKey');
  if (!key) return null;
  try {
    const body = {
      model: localStorage.getItem('orModel') || 'google/gemini-2.5-flash',
      messages: [{ role: 'system', content: systemContent }, { role: 'user', content: userContent }],
      temperature: 0.1
    };
    if (maxTokens) body.max_tokens = maxTokens;
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ef-erraticpatterns.github.io/Knit-Assistant',
        'X-Title': 'Knit Assistant'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d.choices[0].message.content;
  } catch { return null; }
}

async function runPhase1(text) {
  const raw = await callAI(
    `Analyse this knitting pattern carefully. Return ONLY valid JSON (no markdown, no explanation):
{
  "patternName": "name",
  "garmentType": "sweater/hat/shawl/etc",
  "description": "1-2 sentence description",
  "materials": { "yarn": "...", "needles": "...", "gauge": "..." },
  "questions": [
    { "id": "size", "question": "Which size?", "type": "choice", "options": ["XS","S","M","L","XL"] }
  ]
}
Only include questions actually needed (sizes if multiple exist, versions if the pattern has variants). Use empty array if no questions needed.

Pattern text:
${text.slice(0, 5000)}`,
    'You are an expert knitting pattern analyst. Extract information accurately. Return ONLY valid JSON.'
  );
  return parseAIJson(raw);
}

// Pass A: read the full pattern and return ONLY the section plan (titles, types, row targets).
// Tiny output — never truncated.
async function runPhase2Plan(text, meta, answers) {
  const answerStr = Object.entries(answers).map(([k,v]) => `${k}: ${v}`).join(', ') || 'no choices needed';
  const raw = await callAI(
    `Read this knitting pattern completely. User size choices: ${answerStr}.

List EVERY section from start to bind-off in order. Include gauge, cast-on, every body section, front/back/sleeve panels, neckline, finishing — everything. Do not skip any section.

Return ONLY valid JSON:
{
  "patternName": "name",
  "sizeChosen": "chosen size or One Size",
  "sections": [
    { "id": "s1", "title": "Gauge Swatch", "type": "setup", "badge": "Gauge",
      "description": "One plain-English sentence describing what this section does.",
      "progress": { "type": "rows", "target": 4, "label": "rows" } }
  ]
}

No "instructions" field yet — just the section list.
For progress.type: "rows", "rounds", "stitches", or "none".
For type: cast-on, ribbing, stockinette, increases, decreases, short-rows, cables, shaping, colorwork, finishing, setup.

Pattern:
${text.slice(0, 24000)}`,
    'You are an expert knitting pattern analyst. Return ONLY valid JSON with the complete section list.'
  );
  const plan = parseAIJson(raw);
  if (!plan?.sections?.length) return null;
  plan.sections = plan.sections.map((s, i) => ({
    ...s,
    id: s.id || `s${i}`,
    instructions: [],
    currentProgress: 0,
    isComplete: false,
    _loading: true   // flag: instructions not yet generated
  }));
  return plan;
}

// Pass B: fill one section's instructions. Called once per section after the plan is shown.
async function runPhase2Section(text, section) {
  const raw = await callAI(
    `Fill in the step-by-step instructions for this section of a knitting pattern.

Section: "${section.title}" (${section.type})

Rules:
- Write for a BEGINNER. Plain English for every instruction.
- For every row or round with a stitch pattern, add a "highlight" with the exact notation (e.g. "Row 1: k2, p2 to end").
- Keep exact original text in "original". Write a friendly version in "plain".
- Include every abbreviation used with a clear beginner explanation.

Return ONLY valid JSON for this one section (same shape as before):
{
  "instructions": [
    {
      "step": 1,
      "original": "exact text from pattern",
      "plain": "friendly plain-English for a beginner",
      "highlight": "Row 1: k2, p2 repeat to end",
      "abbreviations": [{"abbr": "k2", "meaning": "Knit 2 stitches — insert needle, wrap yarn, pull through"}]
    }
  ]
}

Omit "highlight" only if the instruction has no specific stitch pattern notation.

Full pattern text (find the "${section.title}" section and extract its instructions):
${text.slice(0, 24000)}`,
    'You are an expert knitting guide creator writing for beginners. Return ONLY valid JSON.',
    4000
  );
  const result = parseAIJson(raw);
  return result?.instructions || [];
}

// Orchestrate plan + per-section fill. Calls onSectionReady(updatedProject) after each section.
async function runPhase2(text, meta, answers, projectId, onSectionReady) {
  const plan = await runPhase2Plan(text, meta, answers);
  if (!plan) return null;

  // Save plan immediately so sections are visible right away
  const p = getProject(projectId);
  if (!p) return null;
  p.guide = plan;
  p.patternText = text;
  save(state);
  if (onSectionReady) onSectionReady();

  // Fill each section one by one
  for (let i = 0; i < plan.sections.length; i++) {
    const s = plan.sections[i];
    const instructions = await runPhase2Section(text, s);
    s.instructions = instructions;
    s._loading = false;
    save(state);
    if (onSectionReady) onSectionReady();
  }

  return plan;
}

// ── Wizard ────────────────────────────────────────────────────────────────────

function openWizard(projectId) {
  wizardProjectId = projectId;
  wizardPatternText = null;
  wizardMeta = null;
  document.getElementById('wizard-overlay').classList.remove('hidden');
  showWizardStep('upload');
}

function closeWizard() {
  document.getElementById('wizard-overlay').classList.add('hidden');
  wizardProjectId = null; wizardPatternText = null; wizardMeta = null;
}

function setWizardBar(pct) {
  document.getElementById('wizard-bar').style.width = pct + '%';
}

function showWizardStep(step, data) {
  const body = document.getElementById('wizard-body');
  const titleEl = document.getElementById('wizard-title');
  const closeBtn = document.getElementById('wizard-close');
  body.innerHTML = '';

  if (step === 'upload') {
    titleEl.textContent = 'Import Your Pattern';
    closeBtn.classList.remove('hidden');
    setWizardBar(0);
    const desc = el('p', 'wizard-desc', 'Upload your PDF pattern. The AI will read it carefully, ask about your size, then build a personal step-by-step guide — no PDF stored.');
    const lbl = document.createElement('label');
    lbl.className = 'wizard-upload-area';
    lbl.innerHTML = '<span>📄 Tap to choose your pattern PDF</span><input type="file" accept="application/pdf" />';
    lbl.querySelector('input').addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      showWizardStep('extracting');
      const reader = new FileReader();
      reader.onload = async ev => {
        const text = await extractPdfText(ev.target.result);
        if (!text) { showWizardStep('error', 'Could not read text from this PDF. It may be a scanned image.'); return; }
        wizardPatternText = text;
        showWizardStep('analyzing');
        const meta = await runPhase1(text);
        if (!meta) { showWizardStep('error', 'Could not analyse the pattern. Check your OpenRouter key in the Chat tab and try again.'); return; }
        wizardMeta = meta;
        // Auto-name the project from the extracted pattern name
        const proj = getProject(wizardProjectId);
        if (proj && meta.patternName && proj.name === 'New Pattern') {
          proj.name = meta.patternName;
          save(state);
        }
        showWizardStep('questions', meta);
      };
      reader.readAsDataURL(file);
    });
    body.append(desc, lbl);

  } else if (step === 'extracting') {
    titleEl.textContent = 'Reading PDF…'; closeBtn.classList.add('hidden'); setWizardBar(15);
    body.innerHTML = wizardLoadingHTML('Extracting text from your pattern…');

  } else if (step === 'analyzing') {
    titleEl.textContent = 'Analysing Pattern…'; closeBtn.classList.add('hidden'); setWizardBar(35);
    body.innerHTML = wizardLoadingHTML('AI is reading your pattern, identifying sections and sizes…');

  } else if (step === 'questions') {
    const meta = data;
    titleEl.textContent = meta.patternName || 'Your Pattern';
    closeBtn.classList.remove('hidden'); setWizardBar(60);

    if (meta.description) body.appendChild(el('p', 'wizard-desc', meta.description));

    if (meta.materials) {
      const mat = document.createElement('div'); mat.className = 'wizard-materials';
      const m = meta.materials;
      if (m.yarn)    mat.innerHTML += `<span>🧶 <strong>Yarn:</strong> ${m.yarn}</span>`;
      if (m.needles) mat.innerHTML += `<span>🪡 <strong>Needles:</strong> ${m.needles}</span>`;
      if (m.gauge)   mat.innerHTML += `<span>📐 <strong>Gauge:</strong> ${m.gauge}</span>`;
      body.appendChild(mat);
    }

    const answers = {};
    if (meta.questions?.length > 0) {
      const qSec = document.createElement('div'); qSec.className = 'wizard-questions';
      meta.questions.forEach(q => {
        const qDiv = document.createElement('div'); qDiv.className = 'wizard-question';
        qDiv.appendChild(el('p', 'wizard-q-label', q.question));
        if (q.type === 'choice' && q.options) {
          const opts = document.createElement('div'); opts.className = 'wizard-options';
          q.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'wizard-option-btn'; btn.textContent = opt;
            btn.addEventListener('click', () => {
              opts.querySelectorAll('.wizard-option-btn').forEach(b => b.classList.remove('selected'));
              btn.classList.add('selected'); answers[q.id] = opt;
            });
            opts.appendChild(btn);
          });
          qDiv.appendChild(opts);
        } else {
          const inp = document.createElement('input');
          inp.className = 'wizard-text-input'; inp.placeholder = 'Your answer…';
          inp.addEventListener('input', () => { answers[q.id] = inp.value; });
          qDiv.appendChild(inp);
        }
        qSec.appendChild(qDiv);
      });
      body.appendChild(qSec);
    }

    const genBtn = document.createElement('button');
    genBtn.className = 'btn primary wizard-gen-btn'; genBtn.textContent = '✨ Build My Guide';
    genBtn.addEventListener('click', async () => {
      showWizardStep('generating');
      const pid = wizardProjectId;
      const patText = wizardPatternText;
      const metaSnap = wizardMeta;
      const answersSnap = { ...answers };
      closeWizard();
      render(); // show project view while sections load in background
      const guide = await runPhase2(patText, metaSnap, answersSnap, pid, () => {
        const proj = getProject(pid);
        if (proj && state.activeId === pid) renderProject();
      });
      if (!guide) {
        const proj = getProject(pid);
        if (proj) { proj.guide = null; save(state); renderProject(); }
        alert('Could not generate the guide. Check your OpenRouter key in the AI Chat tab and try again.');
      }
    });
    body.appendChild(genBtn);

  } else if (step === 'generating') {
    titleEl.textContent = 'Building Your Guide…'; closeBtn.classList.add('hidden'); setWizardBar(80);
    body.innerHTML = wizardLoadingHTML('Creating your personalised step-by-step guide — this may take up to a minute…');

  } else if (step === 'error') {
    titleEl.textContent = 'Something went wrong'; closeBtn.classList.remove('hidden'); setWizardBar(0);
    const errDiv = document.createElement('div'); errDiv.className = 'wizard-error';
    errDiv.appendChild(el('p', '', `⚠️ ${data}`));
    const retry = document.createElement('button'); retry.className = 'btn secondary'; retry.textContent = 'Start over';
    retry.addEventListener('click', () => showWizardStep('upload'));
    errDiv.appendChild(retry); body.appendChild(errDiv);
  }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function wizardLoadingHTML(msg) {
  return `<div class="wizard-loading"><div class="wizard-spinner"></div><p>${msg}</p></div>`;
}

// ── Guide rendering ───────────────────────────────────────────────────────────

function renderGuideInto(p, container) {
  const guide = p.guide;
  const total = guide.sections.length;
  const done = guide.sections.filter(s => s.isComplete).length;
  const pct = total ? Math.round(done / total * 100) : 0;

  // Header
  const hdr = document.createElement('div'); hdr.className = 'guide-header';
  const titleWrap = document.createElement('div'); titleWrap.className = 'guide-title';
  const nameEl = document.createElement('strong'); nameEl.textContent = guide.patternName || 'Pattern';
  const sizeEl = document.createElement('span'); sizeEl.textContent = guide.sizeChosen || '';
  titleWrap.append(nameEl, sizeEl);
  const reimportBtn = document.createElement('button');
  reimportBtn.className = 'btn small secondary'; reimportBtn.textContent = 'Re-import';
  reimportBtn.addEventListener('click', () => {
    if (confirm('Replace this guide with a new pattern import?')) { p.guide = null; save(state); renderProject(); }
  });
  hdr.append(titleWrap, reimportBtn);
  container.appendChild(hdr);

  // Overall progress
  const progWrap = document.createElement('div'); progWrap.className = 'guide-overall-progress';
  progWrap.innerHTML = `<div class="guide-prog-track"><div class="guide-prog-fill" id="guide-overall-fill" style="width:${pct}%"></div></div><span id="guide-overall-label">${done}/${total} sections complete</span>`;
  container.appendChild(progWrap);

  // Section cards — sequential: active = first incomplete, locked = anything after it
  const anyLoading = guide.sections.some(s => s._loading);
  const firstIncompleteIdx = guide.sections.findIndex(s => !s.isComplete);
  guide.sections.forEach((section, i) => {
    const isActive = !anyLoading && i === firstIncompleteIdx;
    const isLocked = !anyLoading && firstIncompleteIdx !== -1 && i > firstIncompleteIdx;
    container.appendChild(buildGuideSection(p.id, section, isActive, isLocked));
  });

  if (anyLoading) {
    const loadNote = el('div', '', '');
    loadNote.style.cssText = 'text-align:center;font-size:.8rem;color:var(--text-muted);margin-top:8px;';
    loadNote.textContent = '⟳ Filling in instructions… sections will appear as they load';
    container.appendChild(loadNote);
  }
}

function buildGuideSection(projectId, section, isActive, isLocked) {
  const card = document.createElement('div');
  card.className = `guide-card${section.isComplete ? ' complete' : ''}${isLocked ? ' locked' : ''}${isActive ? ' active' : ''}`;
  card.id = `gs-${section.id}`;

  // Card header
  const head = document.createElement('div'); head.className = 'guide-card-head';

  const badge = document.createElement('span');
  badge.className = `guide-badge type-${(section.type || 'setup').replace(/[^a-z-]/g, '')}`;
  badge.textContent = isLocked ? '🔒' : (section.badge || section.type || 'Step');

  const titleCol = document.createElement('div'); titleCol.className = 'guide-card-title';
  const titleText = document.createElement('strong'); titleText.textContent = section.title;
  titleText.style.opacity = isLocked ? '0.45' : '1';
  titleCol.appendChild(titleText);
  if (!isLocked && section.progress?.type !== 'none' && section.progress?.target) {
    const mini = document.createElement('span'); mini.className = 'guide-mini-prog'; mini.id = `gmp-${section.id}`;
    mini.textContent = `${section.currentProgress || 0} / ${section.progress.target} ${section.progress.label || 'rows'}`;
    titleCol.appendChild(mini);
  }

  const checkBtn = document.createElement('button');
  checkBtn.className = `guide-check${section.isComplete ? ' done' : ''}`;
  checkBtn.setAttribute('aria-label', section.isComplete ? 'Mark incomplete' : 'Mark complete');
  checkBtn.textContent = section.isComplete ? '✓' : '○';
  checkBtn.disabled = isLocked;
  checkBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (isLocked) return;
    const p = getProject(projectId);
    const s = p?.guide?.sections.find(s => s.id === section.id);
    if (!s) return;
    s.isComplete = !s.isComplete;
    save(state); renderProject();
  });

  head.append(badge, titleCol, checkBtn);
  card.appendChild(head);

  // Collapsible body — locked sections stay collapsed, active section starts open
  const body = document.createElement('div');
  const startCollapsed = isLocked || section.isComplete;
  body.className = `guide-card-body${startCollapsed ? ' collapsed' : ''}`;

  if (section.description) body.appendChild(el('p', 'guide-section-desc', section.description));

  if (section._loading) {
    const shimmer = el('div', 'guide-loading-shimmer', 'Loading instructions…');
    body.appendChild(shimmer);
  }

  // Instructions
  if (section.instructions?.length > 0) {
    const ol = document.createElement('ol'); ol.className = 'guide-instructions';
    section.instructions.forEach(instr => {
      const li = document.createElement('li'); li.className = 'guide-instr';
      li.appendChild(el('p', 'guide-instr-plain', instr.plain));
      if (instr.highlight) li.appendChild(el('code', 'guide-instr-highlight', instr.highlight));
      li.appendChild(el('p', 'guide-instr-original', instr.original));
      if (instr.abbreviations?.length > 0) {
        const row = document.createElement('div'); row.className = 'guide-abbr-row';
        instr.abbreviations.forEach(a => {
          const chip = document.createElement('span'); chip.className = 'guide-abbr-chip';
          const strong = document.createElement('strong'); strong.textContent = a.abbr;
          const tip = document.createElement('span'); tip.className = 'guide-abbr-tip'; tip.textContent = a.meaning;
          chip.append(strong, tip); row.appendChild(chip);
        });
        li.appendChild(row);
      }
      ol.appendChild(li);
    });
    body.appendChild(ol);
  }

  // Row/round progress counter
  if (section.progress?.type !== 'none' && section.progress?.target) {
    const ps = document.createElement('div'); ps.className = 'guide-progress-block';
    const track = document.createElement('div'); track.className = 'guide-prog-track';
    const fill = document.createElement('div'); fill.className = 'guide-prog-fill';
    fill.id = `gpf-${section.id}`;
    const pct = Math.min(100, Math.round((section.currentProgress || 0) / section.progress.target * 100));
    fill.style.width = pct + '%';
    track.appendChild(fill);

    const controls = document.createElement('div'); controls.className = 'guide-prog-controls';
    const dec = document.createElement('button'); dec.className = 'counter-btn dec'; dec.textContent = '−';
    dec.addEventListener('click', () => updateSectionProgress(projectId, section.id, -1));
    const val = document.createElement('span'); val.className = 'guide-prog-val'; val.id = `gpv-${section.id}`;
    val.textContent = `${section.currentProgress || 0} / ${section.progress.target} ${section.progress.label || 'rows'}`;
    const inc = document.createElement('button'); inc.className = 'counter-btn inc'; inc.textContent = '+';
    inc.addEventListener('click', () => updateSectionProgress(projectId, section.id, +1));

    controls.append(dec, val, inc);
    ps.append(track, controls);
    body.appendChild(ps);
  }

  // Skip button on locked sections — lets user fast-forward past already-done work
  if (isLocked) {
    const skipBtn = document.createElement('button');
    skipBtn.className = 'btn secondary small guide-skip-btn';
    skipBtn.textContent = 'Already done — skip';
    skipBtn.addEventListener('click', e => {
      e.stopPropagation();
      const p = getProject(projectId);
      if (!p?.guide) return;
      // Mark all sections up to and including this one as complete
      const idx = p.guide.sections.findIndex(s => s.id === section.id);
      p.guide.sections.forEach((s, i) => { if (i <= idx) s.isComplete = true; });
      save(state); renderProject();
    });
    body.appendChild(skipBtn);
  }

  // Mark done button — prominent, at bottom of active section
  if (isActive && !section.isComplete) {
    const doneBtn = document.createElement('button');
    doneBtn.className = 'btn primary full-width guide-mark-done-btn';
    doneBtn.textContent = '✓ Mark this section done';
    doneBtn.addEventListener('click', e => {
      e.stopPropagation();
      const p = getProject(projectId);
      const s = p?.guide?.sections.find(s => s.id === section.id);
      if (!s) return;
      s.isComplete = true;
      save(state); renderProject();
    });
    body.appendChild(doneBtn);
  }

  head.addEventListener('click', () => { if (!isLocked) body.classList.toggle('collapsed'); });
  card.appendChild(body);
  return card;
}

function updateSectionProgress(projectId, sectionId, delta) {
  const p = getProject(projectId);
  const s = p?.guide?.sections.find(s => s.id === sectionId);
  if (!s || !s.progress?.target) return;
  s.currentProgress = Math.max(0, Math.min(s.progress.target, (s.currentProgress || 0) + delta));
  save(state);
  const valEl = document.getElementById(`gpv-${sectionId}`);
  const miniEl = document.getElementById(`gmp-${sectionId}`);
  const fillEl = document.getElementById(`gpf-${sectionId}`);
  const label = s.progress.label || 'rows';
  if (valEl)  valEl.textContent  = `${s.currentProgress} / ${s.progress.target} ${label}`;
  if (miniEl) miniEl.textContent = `${s.currentProgress} / ${s.progress.target} ${label}`;
  if (fillEl) fillEl.style.width = Math.round(s.currentProgress / s.progress.target * 100) + '%';

  // Auto-complete prompt when counter reaches target
  if (s.currentProgress >= s.progress.target && !s.isComplete) {
    setTimeout(() => {
      const confirmed = confirm(`You've reached ${s.progress.target} ${label}!\n\nDo you have ${s.progress.target} ${label} on your needles?`);
      if (confirmed) {
        s.isComplete = true;
        save(state); renderProject();
      } else {
        alert(`Don't worry — count your stitches from the beginning of this section. A missed yarn over or extra decrease is the most common cause. You can also ask the AI Chat tab to help you troubleshoot.`);
      }
    }, 100);
  }
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
    const pinBtn = document.createElement('button');
    pinBtn.className = 'glossary-pin-btn';
    pinBtn.title = 'Add to step';
    pinBtn.textContent = '＋ Step';
    pinBtn.addEventListener('click', () => openPinTermModal(term));
    card.append(abbr, body, pinBtn);
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
    prompt += `\n\nThe user is working on a project called "${p.name}" with these steps: ${p.steps.map(s => `"${s.name}"`).join(', ')}.`;
  }
  if (p?.patternText) {
    prompt += `\n\nThe user has uploaded a knitting pattern. Here is the pattern text (may be truncated):\n\n${p.patternText.slice(0, 3000)}`;
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
    const proj = activeProject();
    if (proj?.patternText) {
      const chips = document.createElement('div');
      chips.className = 'chat-chips';
      ['Summarize this pattern', 'What abbreviations are used?', 'What materials do I need?', 'What skill level is this?'].forEach(q => {
        const chip = document.createElement('button');
        chip.className = 'chat-chip';
        chip.textContent = q;
        chip.addEventListener('click', () => {
          const input = document.getElementById('chat-input');
          input.value = q;
          sendChatMessage();
        });
        chips.appendChild(chip);
      });
      thread.appendChild(chips);
    }
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

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ef-erraticpatterns.github.io/Knit-Assistant',
        'X-Title': 'Knit Assistant'
      },
      body: JSON.stringify({
        model: localStorage.getItem('orModel') || 'google/gemini-2.5-flash',
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
    chatHistory.push({ role: 'assistant', content: `⚠️ ${e.message}. Check your API key in settings (⚙).` });
  } finally {
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

  // Guide / Pattern section
  if (p.guide) {
    renderGuideInto(p, main);
  } else {
    const importSec = document.createElement('div');
    importSec.className = 'guide-import-section';
    const importBtn = document.createElement('button');
    importBtn.className = 'btn primary full-width';
    importBtn.innerHTML = '📄 Import Pattern from PDF';
    importBtn.addEventListener('click', () => {
      if (!localStorage.getItem('orApiKey')) {
        alert('Set up your OpenRouter API key in the AI Chat tab first — it\'s needed to read your pattern.');
        switchView('chat'); return;
      }
      openWizard(p.id);
    });
    importSec.appendChild(importBtn);
    main.appendChild(importSec);
  }

  // Manual steps — only shown when there's no AI guide
  if (!p.guide) {
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

  const refs = step.pinnedTerms || [];
  if (refs.length > 0) {
    const refsEl = document.createElement('div');
    refsEl.className = 'step-refs';
    const refsHdr = document.createElement('div');
    refsHdr.className = 'step-refs-header';
    refsHdr.textContent = 'References';
    refsEl.appendChild(refsHdr);
    refs.forEach(term => {
      const row = document.createElement('div');
      row.className = 'step-ref';
      const abbrEl = document.createElement('span');
      abbrEl.className = 'glossary-abbr step-ref-abbr';
      abbrEl.textContent = term.abbr;
      const bodyEl = document.createElement('div');
      bodyEl.className = 'step-ref-body';
      const nameEl = document.createElement('strong');
      nameEl.textContent = term.name;
      const descEl = document.createElement('p');
      descEl.textContent = term.desc;
      bodyEl.append(nameEl, descEl);
      const removeBtn = document.createElement('button');
      removeBtn.className = 'step-ref-remove';
      removeBtn.title = 'Remove reference';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => unpinTermFromStep(step.id, term.abbr));
      row.append(abbrEl, bodyEl, removeBtn);
      refsEl.appendChild(row);
    });
    card.appendChild(refsEl);
  }

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
document.getElementById('add-project-btn').addEventListener('click', () => {
  if (!localStorage.getItem('orApiKey')) {
    alert('Set up your OpenRouter API key in the AI Chat tab first — it\'s needed to read your pattern.');
    switchView('chat'); return;
  }
  // Create a placeholder project, then immediately open the PDF wizard
  const p = { id: uid(), name: 'New Pattern', pdfData: null, steps: [] };
  state.projects.push(p);
  state.activeId = p.id;
  save(state);
  openWizard(p.id);
});
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('modal-confirm').addEventListener('click', confirmModal);
document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
document.getElementById('modal-input').addEventListener('keydown', e => { if (e.key === 'Enter') confirmModal(); if (e.key === 'Escape') closeModal(); });

document.getElementById('wizard-close').addEventListener('click', closeWizard);
document.getElementById('wizard-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeWizard(); });

document.getElementById('pin-modal-cancel').addEventListener('click', closePinTermModal);
document.getElementById('pin-modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closePinTermModal(); });

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

// When the mobile keyboard dismisses, scroll chat back to bottom so the
// input row and send button are fully visible again.
if (window.visualViewport) {
  let lastVH = window.visualViewport.height;
  window.visualViewport.addEventListener('resize', () => {
    const vh = window.visualViewport.height;
    const keyboardClosed = vh > lastVH + 100;
    lastVH = vh;
    if (keyboardClosed) {
      const msgs = document.getElementById('chat-messages');
      if (msgs) setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 100);
      // Also reset any residual scroll on the page itself
      window.scrollTo(0, 0);
    }
  });
}

// Populate model select from saved value
(function () {
  const saved = localStorage.getItem('orModel');
  const sel = document.getElementById('or-model-select');
  if (saved) {
    const opt = Array.from(sel.options).find(o => o.value === saved);
    if (opt) opt.selected = true;
  }
})();

document.getElementById('or-key-save').addEventListener('click', () => {
  const key = document.getElementById('or-key-input').value.trim();
  if (!key) return;
  localStorage.setItem('orApiKey', key);
  const model = document.getElementById('or-model-select').value;
  if (model) localStorage.setItem('orModel', model);
  document.getElementById('or-key-input').value = '';
  showChatMain();
});
document.getElementById('or-key-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('or-key-save').click();
});

document.getElementById('chat-settings-btn').addEventListener('click', () => {
  const current = localStorage.getItem('orModel') || 'meta-llama/llama-3.1-8b-instruct:free';
  const choice = prompt(`Current model: ${current}\n\nEnter a model ID to switch, or leave blank to just remove your API key.\nFree options:\n• meta-llama/llama-3.1-8b-instruct:free\n• google/gemma-2-9b-it:free\n• qwen/qwen-2-7b-instruct:free`, current);
  if (choice === null) return;
  if (choice.trim()) {
    localStorage.setItem('orModel', choice.trim());
    alert(`Model switched to: ${choice.trim()}`);
  } else {
    if (confirm('Remove your OpenRouter API key?')) {
      localStorage.removeItem('orApiKey');
      chatHistory = [];
      showChatSetup();
    }
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
render();
switchView('projects');
