/* Claude Feedback Widget — vanilla JS, no dependencies */
(function () {
  'use strict';

  // ── Styles ──────────────────────────────────────────────────────────────────
  const CSS = `
    .cfb-btn {
      position: fixed; bottom: 20px; right: 16px; z-index: 9000;
      width: 44px; height: 44px; border-radius: 50%;
      background: #1a0f2e; color: #fff; border: none;
      font-size: 20px; cursor: pointer; display: flex; align-items: center;
      justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      transition: transform 0.15s; user-select: none;
    }
    .cfb-btn:hover { transform: scale(1.08); }
    .cfb-done-badge {
      position: absolute; top: -5px; right: -5px;
      background: #22c55e; color: #fff; border-radius: 50%;
      width: 18px; height: 18px; font-size: 10px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      pointer-events: none; border: 2px solid #fff;
    }
    .cfb-panel {
      position: fixed; bottom: 74px; right: 12px; z-index: 9000;
      width: 300px; max-height: 520px;
      background: #fff; border-radius: 10px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.18);
      display: flex; flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 12.5px; overflow: hidden;
    }
    .cfb-head {
      padding: 10px 14px 9px; background: #1a0f2e; color: #fff;
      display: flex; align-items: center; gap: 8px; flex-shrink: 0;
    }
    .cfb-head-title { font-weight: 600; font-size: 13px; flex: 1; }
    .cfb-head-status { font-size: 11px; opacity: 0.7; }
    .cfb-close {
      background: none; border: none; color: rgba(255,255,255,0.7);
      cursor: pointer; font-size: 16px; line-height: 1; padding: 0 2px;
    }
    .cfb-close:hover { color: #fff; }
    .cfb-section {
      padding: 10px 12px; border-bottom: 1px solid #e5e7eb;
    }
    .cfb-label {
      font-size: 10.5px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.04em; color: #6b7280; margin-bottom: 6px;
    }
    .cfb-pick-btn {
      width: 100%; padding: 7px 10px; border-radius: 6px;
      border: 1.5px dashed #d1d5db; background: #f9fafb;
      cursor: pointer; font-size: 12px; color: #6b7280;
      text-align: left; display: flex; align-items: center; gap: 6px;
      font-family: inherit;
    }
    .cfb-pick-btn.active { border-color: #3b82f6; background: #eff6ff; color: #1d4ed8; }
    .cfb-ctx {
      margin-top: 6px; padding: 5px 8px; border-radius: 5px;
      background: #f3f4f6; font-size: 11px; color: #374151;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .cfb-row { display: flex; gap: 6px; align-items: flex-end; }
    .cfb-textarea {
      flex: 1; border: 1px solid #d1d5db; border-radius: 6px;
      padding: 7px 8px; font-size: 16px; font-family: inherit;
      resize: none; min-height: 60px; line-height: 1.5;
      box-sizing: border-box;
    }
    .cfb-textarea:focus { border-color: #6b7280; outline: none; }
    .cfb-textarea.recording { border-color: #ef4444; background: #fff5f5; }
    .cfb-mic-btn {
      width: 38px; height: 38px; border-radius: 50%;
      border: 1.5px solid #d1d5db; background: #f9fafb;
      cursor: pointer; font-size: 11px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      flex: none; user-select: none; font-family: inherit;
    }
    .cfb-mic-btn.recording {
      background: #ef4444; border-color: #ef4444; color: #fff;
      animation: cfb-pulse 0.9s ease-in-out infinite;
    }
    @keyframes cfb-pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.45); }
      50%      { box-shadow: 0 0 0 7px rgba(239,68,68,0); }
    }
    .cfb-send {
      margin-top: 7px; width: 100%; padding: 7px;
      border-radius: 6px; border: none; background: #1a0f2e;
      color: #fff; font-size: 12.5px; font-weight: 600;
      cursor: pointer; font-family: inherit;
    }
    .cfb-send:disabled { opacity: 0.5; cursor: default; }
    .cfb-send:not(:disabled):hover { background: #2d1b4e; }
    .cfb-queue { flex: 1; overflow-y: auto; padding: 8px 12px; min-height: 0; }
    .cfb-queue-empty {
      color: #9ca3af; font-size: 12px; text-align: center; padding: 12px 0;
    }
    .cfb-task {
      padding: 6px 8px; border-radius: 6px; margin-bottom: 5px;
      border: 1px solid #e5e7eb; background: #f9fafb;
    }
    .cfb-task.in_progress { background: rgba(245,158,11,0.04); border-color: rgba(245,158,11,0.2); }
    .cfb-task.done, .cfb-task.completed { border-color: rgba(34,197,94,0.15); }
    .cfb-task-row { display: flex; align-items: flex-start; gap: 7px; }
    .cfb-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; margin-top: 3px; }
    .cfb-dot.pending { background: #9ca3af; }
    .cfb-dot.in_progress { background: #f59e0b; animation: cfb-dot-pulse 1.2s ease-in-out infinite; }
    @keyframes cfb-dot-pulse {
      0%,100%{ box-shadow: 0 0 0 2px #fef3c7; }
      50%    { box-shadow: 0 0 0 5px rgba(245,158,11,0.1); }
    }
    .cfb-dot.done, .cfb-dot.completed { background: #22c55e; }
    .cfb-dot.failed { background: #ef4444; }
    .cfb-dot.needs_clarification { background: #6940a5; }
    .cfb-task-text { font-size: 12px; color: #111827; line-height: 1.4; flex: 1; }
    .cfb-task-note {
      font-size: 11px; color: #1d4ed8; margin-top: 4px;
      padding: 5px 8px; border-radius: 6px;
      background: rgba(29,78,216,0.06); line-height: 1.5;
    }
    .cfb-task-note.clarif { background: rgba(105,64,165,0.08); color: #6940a5; }
    .cfb-task-label {
      font-size: 10px; color: #9ca3af; margin-top: 3px;
      display: flex; align-items: center; gap: 5px;
    }
    .cfb-task-label .done-label { color: #16a34a; font-weight: 600; }
    .cfb-task-label .work-label { color: #b45309; }
    .cfb-task-label .clarif-label { color: #6940a5; }
    .cfb-task-ts { margin-left: auto; }
    .cfb-reply-area {
      margin-top: 6px;
    }
    .cfb-reply-input {
      width: 100%; font-size: 13px; padding: 6px 8px;
      border-radius: 6px; border: 1px solid rgba(105,64,165,0.3);
      outline: none; font-family: inherit; resize: none;
      background: #fff; box-sizing: border-box;
    }
    .cfb-reply-btn {
      margin-top: 4px; width: 100%; padding: 6px 0;
      background: #6940a5; color: #fff; border: none;
      border-radius: 6px; font-size: 12.5px; font-weight: 600;
      cursor: pointer; font-family: inherit;
    }
    .cfb-reply-btn:disabled { opacity: 0.5; cursor: default; }
    .cfb-pick-hint {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 8999;
      background: #1c1b18; color: #fff; padding: 14px 16px;
      display: flex; align-items: center;
      border-top: 2px solid #3b82f6;
      box-shadow: 0 -2px 12px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .cfb-pick-hint button {
      margin-left: auto; background: none;
      border: 1px solid rgba(255,255,255,0.35);
      color: #fff; padding: 5px 12px; border-radius: 6px;
      cursor: pointer; font-size: 12px; font-family: inherit;
    }
    .cfb-highlight-ring {
      position: fixed; pointer-events: none; z-index: 8998;
      border: 2px solid #3b82f6; border-radius: 4px;
      box-shadow: 0 0 0 3000px rgba(0,0,0,0.08);
      transition: top 0.05s, left 0.05s, width 0.05s, height 0.05s;
    }
    @media (max-width: 768px) {
      .cfb-panel { width: calc(100vw - 24px); right: 12px; bottom: 74px; }
    }
  `;

  // ── State ────────────────────────────────────────────────────────────────────
  let open = false;
  let pickMode = false;
  let ctx = null;        // { label, detail }
  let hoverBox = null;
  let text = '';
  let sending = false;
  let tasks = [];
  let recording = false;
  let taskDoneNotif = 0;
  let recognition = null;
  let voiceBase = '';
  let pollTimer = null;
  let bgTimer = null;

  const isMobile = 'ontouchstart' in window;
  const hasSpeech = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // ── DOM ──────────────────────────────────────────────────────────────────────
  function injectStyles() {
    const s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  // ── Root elements ─────────────────────────────────────────────────────────
  let btnEl, panelEl, hintEl, ringEl, badgeEl;

  function createShell() {
    btnEl = el('button', 'cfb-btn');
    btnEl.title = 'Send feedback to Claude';
    btnEl.textContent = '◎';
    btnEl.addEventListener('click', toggleOpen);
    document.body.appendChild(btnEl);

    hintEl = el('div', 'cfb-pick-hint');
    hintEl.style.display = 'none';
    hintEl.innerHTML = `<span>${isMobile ? 'Tap any element to select' : 'Click any element to select'}</span>`;
    const cancelBtn = el('button'); cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', cancelPick);
    hintEl.appendChild(cancelBtn);
    document.body.appendChild(hintEl);

    ringEl = el('div', 'cfb-highlight-ring');
    ringEl.style.display = 'none';
    document.body.appendChild(ringEl);
  }

  function renderBtn() {
    btnEl.textContent = open ? '×' : '◎';
    // badge
    if (badgeEl) badgeEl.remove();
    if (!open && taskDoneNotif > 0) {
      badgeEl = el('span', 'cfb-done-badge', String(taskDoneNotif));
      btnEl.appendChild(badgeEl);
    }
  }

  function renderPanel() {
    if (panelEl) panelEl.remove();
    if (!open) return;

    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const pending    = tasks.filter(t => t.status === 'pending').length;
    const statusLine = inProgress ? 'Working…' : pending ? `${pending} queued` : tasks.length ? 'All done' : 'Queue empty';

    panelEl = el('div', 'cfb-panel');

    // Head
    const head = el('div', 'cfb-head');
    head.innerHTML = `<span class="cfb-head-title">Claude Feedback</span>
      <span class="cfb-head-status">${statusLine}</span>`;
    const close = el('button', 'cfb-close', '×');
    close.addEventListener('click', () => { open = false; render(); });
    head.appendChild(close);
    panelEl.appendChild(head);

    // Context picker section
    const ctxSection = el('div', 'cfb-section');
    const ctxLabel = el('div', 'cfb-label', 'Context');
    ctxSection.appendChild(ctxLabel);
    const pickBtn = el('button', 'cfb-pick-btn' + (pickMode ? ' active' : ''));
    pickBtn.textContent = ctx ? 'Change selection' : (isMobile ? 'Tap to select element' : 'Click to select element');
    pickBtn.addEventListener('click', enterPick);
    ctxSection.appendChild(pickBtn);
    if (ctx) {
      const ctxDiv = el('div', 'cfb-ctx', escHtml(ctx.label));
      ctxSection.appendChild(ctxDiv);
    }
    panelEl.appendChild(ctxSection);

    // Feedback section
    const fbSection = el('div', 'cfb-section');
    const fbLabel = el('div', 'cfb-label', 'Feedback');
    fbSection.appendChild(fbLabel);
    const row = el('div', 'cfb-row');
    const ta = el('textarea', 'cfb-textarea' + (recording ? ' recording' : ''));
    ta.placeholder = 'Describe a bug, request a feature, or ask a question…';
    ta.rows = 3;
    ta.value = text;
    ta.addEventListener('input', e => { text = e.target.value; sendBtn.disabled = !text.trim() || sending; });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
    });
    row.appendChild(ta);
    if (hasSpeech) {
      const mic = el('button', 'cfb-mic-btn' + (recording ? ' recording' : ''), recording ? '■' : '🎤');
      mic.title = recording ? 'Stop recording' : 'Voice input';
      mic.addEventListener('click', recording ? stopVoice : startVoice);
      row.appendChild(mic);
    }
    fbSection.appendChild(row);
    const sendBtn = el('button', 'cfb-send', sending ? 'Sending…' : 'Send to Claude ↵');
    sendBtn.disabled = !text.trim() || sending;
    sendBtn.addEventListener('click', doSend);
    fbSection.appendChild(sendBtn);
    panelEl.appendChild(fbSection);

    // Queue
    const queue = el('div', 'cfb-queue');
    if (tasks.length === 0) {
      queue.appendChild(el('div', 'cfb-queue-empty', 'No tasks yet'));
    } else {
      tasks.forEach(t => queue.appendChild(renderTask(t)));
    }
    panelEl.appendChild(queue);

    document.body.appendChild(panelEl);
    // Focus textarea
    setTimeout(() => ta && ta.focus(), 50);
  }

  function renderTask(t) {
    const isClarif = t.status === 'needs_clarification';
    const div = el('div', 'cfb-task ' + t.status + (isClarif ? ' needs_clarification' : ''));
    if (isClarif) div.style.cssText = 'border-color:rgba(105,64,165,0.3);background:rgba(105,64,165,0.04)';

    const row = el('div', 'cfb-task-row');
    const dot = el('span', 'cfb-dot ' + t.status);
    if (isClarif) dot.style.background = '#6940a5';
    const txt = el('span', 'cfb-task-text', escHtml(t.feedback));
    row.appendChild(dot); row.appendChild(txt);
    div.appendChild(row);

    if (t.status === 'in_progress' && !t.claude_note) {
      div.appendChild(el('div', '', '<span style="font-size:11px;color:#b45309;font-style:italic">⟳ Claude is working on this…</span>'));
    }
    if (t.claude_note) {
      const note = el('div', 'cfb-task-note' + (isClarif ? ' clarif' : ''), (isClarif ? '❓ ' : '✦ ') + escHtml(t.claude_note));
      div.appendChild(note);
    }
    if (isClarif) {
      const ra = el('div', 'cfb-reply-area');
      const ri = el('textarea', 'cfb-reply-input');
      ri.rows = 2; ri.placeholder = 'Type your answer…';
      ra.appendChild(ri);
      const rb = el('button', 'cfb-reply-btn', 'Reply ↵');
      rb.disabled = true;
      ri.addEventListener('input', () => { rb.disabled = !ri.value.trim(); });
      ri.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doReply(t.id, ri, rb); }
      });
      rb.addEventListener('click', () => doReply(t.id, ri, rb));
      ra.appendChild(rb);
      div.appendChild(ra);
    }
    if (t.user_reply && !isClarif) {
      div.appendChild(el('div', '', `<span style="font-size:11px;color:#6b7280;font-style:italic">You: ${escHtml(t.user_reply)}</span>`));
    }

    const label = el('div', 'cfb-task-label');
    let statusSpan;
    if (t.status === 'done' || t.status === 'completed') {
      statusSpan = el('span', 'done-label', '✓ Done');
    } else if (t.status === 'in_progress') {
      statusSpan = el('span', 'work-label', '⟳ Working');
    } else if (isClarif) {
      statusSpan = el('span', 'clarif-label', '❓ Needs your answer');
    } else {
      statusSpan = el('span', '', '● Queued');
    }
    label.appendChild(statusSpan);
    label.appendChild(el('span', '', `· #${t.id}`));
    const ts = el('span', 'cfb-task-ts', t.created_at ? new Date(t.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '');
    label.appendChild(ts);
    div.appendChild(label);
    return div;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function render() {
    renderBtn();
    renderPanel();
    hintEl.style.display = pickMode ? 'flex' : 'none';
    ringEl.style.display = (pickMode && hoverBox) ? 'block' : 'none';
    if (pickMode && hoverBox) {
      ringEl.style.top    = hoverBox.top + 'px';
      ringEl.style.left   = hoverBox.left + 'px';
      ringEl.style.width  = hoverBox.width + 'px';
      ringEl.style.height = hoverBox.height + 'px';
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  function toggleOpen() {
    open = !open;
    if (open) {
      taskDoneNotif = 0;
      fetchTasks();
      startPoll();
    } else {
      stopPoll();
    }
    pickMode = false;
    render();
  }

  function enterPick() {
    pickMode = true;
    if (isMobile) open = false;
    render();
    document.body.style.cursor = 'crosshair';
    attachPickListeners();
  }

  function cancelPick() {
    pickMode = false; hoverBox = null;
    document.body.style.cursor = '';
    detachPickListeners();
    if (isMobile) { open = true; }
    render();
  }

  // pick listeners
  let _onMove, _onClick, _onTouchEnd;

  function attachPickListeners() {
    _onMove = e => {
      if (isMobile) return;
      const target = findTarget(e.clientX, e.clientY);
      if (!target) { hoverBox = null; }
      else {
        const r = target.getBoundingClientRect();
        hoverBox = { top: r.top, left: r.left, width: r.width, height: r.height };
      }
      render();
    };
    _onClick = e => {
      const target = findTarget(e.clientX, e.clientY);
      if (!target) return;
      e.preventDefault(); e.stopPropagation();
      selectEl(target);
    };
    _onTouchEnd = e => {
      const t = e.changedTouches[0];
      if (!t) return;
      const target = findTarget(t.clientX, t.clientY);
      if (!target) return;
      e.preventDefault();
      selectEl(target);
    };
    window.addEventListener('mousemove', _onMove);
    window.addEventListener('click', _onClick, { capture: true });
    if (isMobile) window.addEventListener('touchend', _onTouchEnd, { capture: true, passive: false });
  }

  function detachPickListeners() {
    if (_onMove) window.removeEventListener('mousemove', _onMove);
    if (_onClick) window.removeEventListener('click', _onClick, { capture: true });
    if (_onTouchEnd) window.removeEventListener('touchend', _onTouchEnd, { capture: true });
    document.body.style.cursor = '';
  }

  function findTarget(x, y) {
    const e = document.elementFromPoint(x, y);
    if (!e || e.closest('.cfb-panel') || e.closest('.cfb-btn') || e.closest('.cfb-highlight-ring') || e.closest('.cfb-pick-hint')) return null;
    let cur = e;
    for (let i = 0; i < 8; i++) {
      if (!cur || cur === document.body || cur === document.documentElement) break;
      const tag = cur.tagName?.toLowerCase();
      if (['button','a','input','select','textarea'].includes(tag)) return cur;
      if (cur.getAttribute('aria-label') || cur.getAttribute('role')) return cur;
      if (cur.id) return cur;
      const cls = (cur.getAttribute('class') || '').split(' ').filter(c => c && !c.startsWith('cfb-'));
      if (cls.length > 0 && (cur.innerText || '').trim().length > 0) return cur;
      cur = cur.parentElement;
    }
    return e;
  }

  function buildCtx(e) {
    const tag  = e.tagName.toLowerCase();
    const txt  = (e.innerText || e.textContent || '').trim().replace(/\s+/g,' ').slice(0, 100);
    const cls  = (e.getAttribute('class') || '').split(' ').filter(c => c && !c.startsWith('cfb-')).slice(0, 3).join('.');
    const aria = e.getAttribute('aria-label') || '';
    const label = aria || txt.slice(0, 60) || `<${tag}${cls ? '.' + cls : ''}>`;
    let detail = `tag:${tag}`;
    if (e.id) detail += ` id:${e.id}`;
    if (cls) detail += ` class:${cls}`;
    if (aria) detail += ` aria:"${aria}"`;
    if (txt) detail += ` text:"${txt}"`;
    return { label, detail };
  }

  function selectEl(e) {
    ctx = buildCtx(e);
    pickMode = false; hoverBox = null;
    detachPickListeners();
    if (isMobile) open = true;
    render();
  }

  // In-place updates — avoid rebuilding the panel (which kills the mobile keyboard)
  function updateSendBtn() {
    const btn = panelEl && panelEl.querySelector('.cfb-send');
    if (btn) { btn.disabled = !text.trim() || sending; btn.textContent = sending ? 'Sending…' : 'Send to Claude ↵'; }
  }
  function updateTextareaValue() {
    const ta = panelEl && panelEl.querySelector('.cfb-textarea');
    if (ta && ta !== document.activeElement) ta.value = text;
  }
  function updateMicState() {
    const mic = panelEl && panelEl.querySelector('.cfb-mic-btn');
    if (!mic) return;
    mic.className = 'cfb-mic-btn' + (recording ? ' recording' : '');
    mic.textContent = recording ? '■' : '🎤';
    const ta = panelEl && panelEl.querySelector('.cfb-textarea');
    if (ta) ta.className = 'cfb-textarea' + (recording ? ' recording' : '');
  }

  async function doSend() {
    if (!text.trim() || sending) return;
    sending = true; updateSendBtn();
    try {
      const res = await fetch('/api/claude-tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ element_context: ctx ? ctx.detail : '', feedback: text.trim() }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.id) {
          const pending = JSON.parse(localStorage.getItem('cfb_pending_vibrate') || '[]');
          pending.push(data.id);
          localStorage.setItem('cfb_pending_vibrate', JSON.stringify(pending));
        }
      }
    } catch (e) { /* ignore */ }
    text = ''; ctx = null; sending = false;
    open = false;
    window.dispatchEvent(new CustomEvent('cfb-sent'));
    fetchTasks().then(() => render());
  }

  async function doReply(taskId, inputEl, btnEl) {
    const reply = inputEl.value.trim();
    if (!reply) return;
    btnEl.disabled = true; btnEl.textContent = 'Sending…';
    await fetch(`/api/claude-tasks/${taskId}/reply`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply }),
    }).catch(() => {});
    await fetchTasks();
    render();
  }

  // ── Voice ─────────────────────────────────────────────────────────────────
  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || recognition) return;
    const rec = new SR();
    rec.continuous = false; rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';
    voiceBase = text;
    rec.onstart  = () => { recording = true; updateMicState(); };
    rec.onresult = e => {
      const t = Array.from(e.results).map(r => r[0].transcript).join('');
      text = (voiceBase ? voiceBase + ' ' : '') + t;
      updateTextareaValue();
      updateSendBtn();
    };
    rec.onend  = () => { recording = false; recognition = null; updateMicState(); };
    rec.onerror = () => { recording = false; recognition = null; updateMicState(); };
    recognition = rec;
    rec.start();
  }
  function stopVoice() { recognition && recognition.stop(); }

  // ── Polling ───────────────────────────────────────────────────────────────
  async function fetchTasks() {
    try {
      const d = await fetch('/api/claude-tasks').then(r => r.json());
      tasks = d.tasks || [];
    } catch (e) { /* ignore */ }
  }

  function startPoll() {
    if (pollTimer) return;
    pollTimer = setInterval(() => fetchTasks().then(() => {
      if (!open) return;
      // Update queue and status line in-place — don't destroy the textarea/keyboard
      if (panelEl) {
        const inProgress = tasks.filter(t => t.status === 'in_progress').length;
        const pending    = tasks.filter(t => t.status === 'pending').length;
        const statusLine = inProgress ? 'Working…' : pending ? `${pending} queued` : tasks.length ? 'All done' : 'Queue empty';
        const statusEl = panelEl.querySelector('.cfb-head-status');
        if (statusEl) statusEl.textContent = statusLine;
        const queueEl = panelEl.querySelector('.cfb-queue');
        if (queueEl) {
          queueEl.innerHTML = '';
          if (tasks.length === 0) {
            queueEl.appendChild(el('div', 'cfb-queue-empty', 'No tasks yet'));
          } else {
            tasks.forEach(t => queueEl.appendChild(renderTask(t)));
          }
        }
      } else {
        render();
      }
    }), 3000);
  }
  function stopPoll() {
    clearInterval(pollTimer); pollTimer = null;
  }

  // Background poll: vibrate when a submitted task finishes
  function startBgPoll() {
    bgTimer = setInterval(async () => {
      const pending = JSON.parse(localStorage.getItem('cfb_pending_vibrate') || '[]');
      if (!pending.length) return;
      await fetchTasks();
      const done = tasks.filter(t => pending.includes(t.id) && t.status === 'done');
      if (done.length > 0) {
        navigator.vibrate && navigator.vibrate([200, 100, 200, 100, 200]);
        taskDoneNotif += done.length;
        const remaining = pending.filter(id => !done.some(t => t.id === id));
        localStorage.setItem('cfb_pending_vibrate', JSON.stringify(remaining));
        render();
      }
    }, 30000);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    injectStyles();
    createShell();
    render();
    startBgPoll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
