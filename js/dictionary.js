/* ── Dictionary — search, virtual scroll, word detail ── */
const Dictionary = (() => {

  let allWords = [];
  let filteredWords = [];
  let currentFilter = 'all';
  let searchQuery = '';
  let scrollTop = 0;
  const ITEM_HEIGHT = 64;
  const BUFFER = 5;

  const CASE_LABELS = {
    nominative: { de:'Nominativ',  en:'Nominative'  },
    accusative: { de:'Akkusativ',  en:'Accusative'  },
    dative:     { de:'Dativ',      en:'Dative'       },
    genitive:   { de:'Genitiv',    en:'Genitive'     }
  };

  function init(words) {
    allWords = words.map(w => Utils.expandWord(w));
    filteredWords = [...allWords];

    const list = document.getElementById('dict-list');
    if (list) list.addEventListener('scroll', () => {
      scrollTop = list.scrollTop;
      renderVisible(list);
    }, { passive: true });

    renderCount();
    renderVisible(document.getElementById('dict-list'));
  }

  function filter(query, article) {
    searchQuery = (query || '').toLowerCase().trim();
    currentFilter = article || 'all';
    filteredWords = allWords.filter(w => {
      const matchQuery = !searchQuery ||
        w.noun.toLowerCase().includes(searchQuery) ||
        (w.tip && w.tip.toLowerCase().includes(searchQuery));
      const matchArticle = currentFilter === 'all' || w.article === currentFilter;
      const matchDomain = !w.subDomain; // professional words only in pro screen
      return matchQuery && matchArticle && matchDomain;
    });
    scrollTop = 0;
    const list = document.getElementById('dict-list');
    if (list) list.scrollTop = 0;
    renderCount();
    renderVisible(list);
  }

  function filterPro(query, domain) {
    searchQuery = (query || '').toLowerCase().trim();
    return allWords.filter(w => {
      const matchQuery = !searchQuery || w.noun.toLowerCase().includes(searchQuery);
      const matchDomain = !domain || w.subDomain === domain || w.domain === domain;
      return matchQuery && matchDomain && (w.domain !== 'general');
    });
  }

  function renderCount() {
    const el = document.getElementById('dict-count');
    if (el) el.textContent = `${filteredWords.length.toLocaleString()} Wörter · words`;
  }

  function renderVisible(list) {
    if (!list) return;
    const inner = list.querySelector('.dict-list-inner');
    if (!inner) return;

    const total = filteredWords.length;
    inner.style.height = (total * ITEM_HEIGHT) + 'px';

    const viewportHeight = list.clientHeight;
    const firstVisible = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER);
    const lastVisible  = Math.min(total - 1, Math.ceil((scrollTop + viewportHeight) / ITEM_HEIGHT) + BUFFER);

    // Recycle existing items
    const existing = {};
    inner.querySelectorAll('.dict-item').forEach(el => {
      const idx = parseInt(el.dataset.idx);
      if (idx >= firstVisible && idx <= lastVisible) { existing[idx] = el; }
      else el.remove();
    });

    for (let i = firstVisible; i <= lastVisible; i++) {
      if (existing[i]) continue;
      const w = filteredWords[i];
      if (!w) continue;
      const el = document.createElement('div');
      el.className = 'dict-item';
      el.dataset.idx = i;
      el.style.top = (i * ITEM_HEIGHT) + 'px';
      el.innerHTML = `
        <span class="article-badge article-badge-${w.article} badge-${w.article}">${w.article}</span>
        <div class="dict-item-text">
          <div class="dict-item-noun">${w.noun}</div>
          <div class="dict-item-sub">${w.plural ? `Pl: ${w.plural}` : ''}${w.subDomain ? ` · ${w.subDomain}` : ''}</div>
        </div>
        <span class="dict-item-arrow">›</span>
      `;
      el.addEventListener('click', () => showWordDetail(w));
      inner.appendChild(el);
    }
  }

  function showWordDetail(w) {
    const panel = document.getElementById('word-detail');
    if (!panel) return;

    const expanded = Utils.expandWord(w);

    // Word hero
    panel.querySelector('.word-hero-article').innerHTML =
      `<span class="article-badge badge-${expanded.article}">${expanded.article}</span>`;
    panel.querySelector('.word-hero-noun').textContent = expanded.noun;
    panel.querySelector('.word-hero-noun').className = `word-hero-noun article-${expanded.article}`;
    panel.querySelector('.word-hero-plural').textContent = expanded.plural ? `Pl: ${expanded.plural}` : '';
    panel.querySelector('.word-hero-domain').textContent =
      expanded.subDomain || expanded.domain || 'Allgemein · General';

    // Declension table
    buildDeclensionTable(panel, expanded);

    // Examples
    const exList = panel.querySelector('.examples-list');
    if (exList) {
      exList.innerHTML = (expanded.examples || []).slice(0, 3).map(ex =>
        `<div class="example-item"><div class="example-de">${ex}</div></div>`
      ).join('');
    }

    // Tip
    const tipEl = panel.querySelector('.word-tip-card .tip-text');
    if (tipEl) tipEl.textContent = expanded.tip || '';
    const tipCard = panel.querySelector('.word-tip-card');
    if (tipCard) tipCard.style.display = expanded.tip ? '' : 'none';

    // Add-to-queue button
    const addBtn = panel.querySelector('.btn-add-queue');
    if (addBtn) {
      const appState = App.getState();
      const inQueue = (appState.customQueue || []).includes(expanded.id);
      addBtn.textContent = inQueue
        ? '✓ In der Übungs-Warteschlange · In practice queue'
        : '+ Zur Übung hinzufügen · Add to practice queue';
      addBtn.className = 'btn-add-queue' + (inQueue ? ' added' : '');
      addBtn.onclick = () => {
        const s = App.getState();
        s.customQueue = s.customQueue || [];
        if (!s.customQueue.includes(expanded.id)) {
          s.customQueue.push(expanded.id);
          App.setState(s);
          addBtn.textContent = '✓ In der Übungs-Warteschlange · In practice queue';
          addBtn.classList.add('added');
          App.toast('Zum Üben hinzugefügt · Added to practice');
        }
      };
    }

    panel.classList.add('open');
  }

  function buildDeclensionTable(panel, w) {
    const table = panel.querySelector('.declension-table');
    if (!table) return;

    const CASES = ['nominative','accusative','dative','genitive'];
    const CASE_DE = ['Nominativ','Akkusativ','Dativ','Genitiv'];
    const CASE_EN = ['Nominative','Accusative','Dative','Genitive'];

    let html = `
      <thead>
        <tr>
          <th>Fall · Case</th>
          <th>Artikel · Article</th>
          <th>Form</th>
          <th>Plural</th>
        </tr>
      </thead>
      <tbody>
    `;

    CASES.forEach((cas, i) => {
      const cd = (w.cases && w.cases[cas]) || { article: '—', form: w.noun };
      const pd = (w.pluralCases && w.pluralCases[cas]) || { article: 'die', form: w.plural || '—' };
      const isChanged = (cas === 'accusative' && w.gender === 'masculine');
      html += `
        <tr${isChanged ? ' class="changed"' : ''}>
          <td class="case-label">
            <span class="case-name">${CASE_DE[i]}</span>
            <span class="en-label">${CASE_EN[i]}</span>
          </td>
          <td class="cell-article ${cd.article}">${cd.article}</td>
          <td class="cell-form">${cd.form}</td>
          <td class="cell-form">${pd.article} ${pd.form}</td>
        </tr>
      `;
    });
    html += '</tbody>';
    table.innerHTML = html;

    // Color article cells
    table.querySelectorAll('.cell-article').forEach(el => {
      const art = el.textContent.trim();
      if (art === 'der') el.style.color = 'var(--der)';
      else if (art === 'die') el.style.color = 'var(--die)';
      else if (art === 'das') el.style.color = 'var(--das)';
      else if (art === 'den') el.style.color = 'var(--der)';
      else if (art === 'dem') el.style.color = 'var(--der)';
      else if (art === 'des') el.style.color = 'var(--der)';
    });
  }

  function closeDetail() {
    const panel = document.getElementById('word-detail');
    if (panel) panel.classList.remove('open');
  }

  return { init, filter, filterPro, showWordDetail, closeDetail, renderVisible };
})();
