// ── Feedback widget ────────────────────────────────────────────────────────────
(function () {
  const STATUS_URL = 'https://raw.githubusercontent.com/ef-erraticpatterns/Knit-Assistant/main/_status.json';
  const ISSUES_URL = 'https://api.github.com/repos/ef-erraticpatterns/Knit-Assistant/issues';

  let fbOpen = false;
  let pickerActive = false;
  let pickedEl = null;
  let pollTimer = null;
  let hlBox = null;

  function $(id) { return document.getElementById(id); }

  // ── Highlight box ──────────────────────────────────────────────────────────
  function getHlBox() {
    if (!hlBox) {
      hlBox = document.createElement('div');
      hlBox.id = 'fb-hl';
      document.body.appendChild(hlBox);
    }
    return hlBox;
  }

  function moveHl(el) {
    const box = getHlBox();
    if (!el) { box.style.display = 'none'; return; }
    const r = el.getBoundingClientRect();
    box.style.top    = r.top + 'px';
    box.style.left   = r.left + 'px';
    box.style.width  = r.width + 'px';
    box.style.height = r.height + 'px';
    box.style.display = 'block';
  }

  // ── Element picker ─────────────────────────────────────────────────────────
  function startPicker() {
    pickerActive = true;
    pickedEl = null;
    $('fb-pick').textContent = '✕ Cancel';
    $('fb-pick').classList.add('picking');
    $('fb-pick-info').textContent = 'Click any element on the page…';
    $('fb-pick-info').className = 'fb-pick-info active';
    document.body.classList.add('fb-picking');
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    getHlBox().style.display = 'block';
  }

  function stopPicker() {
    pickerActive = false;
    document.body.classList.remove('fb-picking');
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    getHlBox().style.display = 'none';
    $('fb-pick').textContent = '🎯 Pick an element';
    $('fb-pick').classList.remove('picking');
  }

  function onMove(e) {
    if ($('fb-panel').contains(e.target)) return;
    if (e.target === $('fb-btn')) return;
    moveHl(e.target);
  }

  function onClick(e) {
    if ($('fb-panel').contains(e.target)) return;
    if (e.target === $('fb-btn')) return;
    e.preventDefault(); e.stopPropagation();
    pickedEl = e.target;
    stopPicker();
    $('fb-pick-info').textContent = describeEl(pickedEl);
    $('fb-pick-info').className = 'fb-pick-info selected';
  }

  function onKey(e) { if (e.key === 'Escape') stopPicker(); }

  function describeEl(el) {
    const tag = el.tagName.toLowerCase();
    const id  = el.id ? '#' + el.id : '';
    const cls = (typeof el.className === 'string' && el.className.trim())
      ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).map(c => '.' + c).join('')
      : '';
    const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    let s = `<${tag}${id}${cls}>`;
    if (txt) s += ` "${txt}"`;
    const p = el.parentElement;
    if (p && p !== document.body) {
      const ptag = p.tagName.toLowerCase();
      const pcls = (typeof p.className === 'string' && p.className.trim())
        ? '.' + p.className.trim().split(/\s+/)[0] : '';
      s += ` inside <${ptag}${pcls}>`;
    }
    return s;
  }

  // ── Status polling ─────────────────────────────────────────────────────────
  async function pollStatus() {
    try {
      const res = await fetch(STATUS_URL + '?nc=' + Date.now());
      if (!res.ok) throw new Error();
      const d = await res.json();
      $('fb-dot').className = 'fb-dot ' + (d.status || 'idle');
      $('fb-dot').title = d.status || 'idle';
      $('fb-task').textContent = d.current_task || '—';
      $('fb-done').textContent = d.last_completed || '—';
    } catch {
      $('fb-dot').className = 'fb-dot offline';
      $('fb-dot').title = 'offline';
      $('fb-task').textContent = 'Cannot reach server';
    }
  }

  // ── Setup / Main views ─────────────────────────────────────────────────────
  function showSetup() {
    $('fb-setup').classList.remove('hidden');
    $('fb-main').classList.add('hidden');
    $('fb-gear').style.visibility = 'hidden';
  }

  function showMain() {
    $('fb-setup').classList.add('hidden');
    $('fb-main').classList.remove('hidden');
    $('fb-gear').style.visibility = 'visible';
  }

  // ── Open / Close ───────────────────────────────────────────────────────────
  function open() {
    fbOpen = true;
    $('fb-panel').classList.remove('hidden');
    $('fb-btn').classList.add('open');
    const token = localStorage.getItem('ghToken');
    if (token) {
      showMain();
      pollStatus();
      pollTimer = setInterval(pollStatus, 15000);
    } else {
      showSetup();
    }
  }

  function close() {
    fbOpen = false;
    $('fb-panel').classList.add('hidden');
    $('fb-btn').classList.remove('open');
    if (pickerActive) stopPicker();
    clearInterval(pollTimer);
  }

  // ── Submit issue ───────────────────────────────────────────────────────────
  async function submitIssue() {
    const text = $('fb-text').value.trim();
    if (!text) { $('fb-text').focus(); return; }
    const token = localStorage.getItem('ghToken');
    if (!token) { showSetup(); return; }

    const elementCtx = pickedEl
      ? '\n\n**Selected element:** `' + describeEl(pickedEl) + '`'
      : '';
    const issueBody  = text + elementCtx + '\n\n---\n*Sent from Knit Assistant feedback widget*';
    const issueTitle = text.slice(0, 72) + (text.length > 72 ? '…' : '');

    const btn = $('fb-send');
    btn.textContent = 'Sending…';
    btn.disabled = true;

    try {
      const res = await fetch(ISSUES_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({ title: issueTitle, body: issueBody })
      });

      if (res.status === 401) {
        localStorage.removeItem('ghToken');
        showSetup();
        btn.textContent = '📨 Send to Claude';
        btn.disabled = false;
        alert('Token invalid or expired — please re-enter your PAT.');
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `GitHub error ${res.status}`);
      }

      const issue = await res.json();
      btn.textContent = `✓ Sent — Issue #${issue.number}`;
      btn.classList.add('sent');

      setTimeout(() => {
        btn.textContent = '📨 Send to Claude';
        btn.classList.remove('sent');
        btn.disabled = false;
        $('fb-text').value = '';
        pickedEl = null;
        $('fb-pick-info').textContent = '';
        $('fb-pick-info').className = 'fb-pick-info';
      }, 3000);
    } catch (e) {
      alert(`Failed to send: ${e.message}`);
      btn.textContent = '📨 Send to Claude';
      btn.disabled = false;
    }
  }

  // ── Wire up ────────────────────────────────────────────────────────────────
  $('fb-btn').addEventListener('click', () => fbOpen ? close() : open());
  $('fb-close').addEventListener('click', close);

  $('fb-pick').addEventListener('click', () => pickerActive ? stopPicker() : startPicker());
  $('fb-send').addEventListener('click', submitIssue);
  $('fb-text').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitIssue();
  });

  $('fb-token-save').addEventListener('click', () => {
    const t = $('fb-token-input').value.trim();
    if (!t) return;
    localStorage.setItem('ghToken', t);
    $('fb-token-input').value = '';
    showMain();
    pollStatus();
    pollTimer = setInterval(pollStatus, 15000);
  });
  $('fb-token-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('fb-token-save').click();
  });

  $('fb-gear').addEventListener('click', () => {
    if (confirm('Remove your GitHub token and disconnect?')) {
      localStorage.removeItem('ghToken');
      clearInterval(pollTimer);
      if (pickerActive) stopPicker();
      showSetup();
    }
  });
})();
