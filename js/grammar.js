/* ── Grammar Reference Screen ── */
const Grammar = (() => {

  let currentTab = 'rules';
  let searchQuery = '';

  function init() {
    render('rules');
  }

  function setTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.grammar-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    render(tab);
  }

  function setSearch(q) {
    searchQuery = (q || '').toLowerCase();
    render(currentTab);
  }

  function render(tab) {
    const content = document.getElementById('grammar-content');
    if (!content) return;

    if (tab === 'rules')   renderRules(content);
    else if (tab === 'cases') renderCasesTable(content);
    else if (tab === 'exceptions') renderExceptions(content);
  }

  function renderRules(content) {
    const rules = (window.GermanData || {}).grammarRules || [];
    const suffix = rules.filter(r => r.category === 'suffix' || r.category === 'semantic' || r.category === 'loan-word');
    const q = searchQuery;

    const filtered = q
      ? suffix.filter(r => r.title.toLowerCase().includes(q) || (r.description && r.description.toLowerCase().includes(q)))
      : suffix;

    content.innerHTML = filtered.length === 0
      ? '<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-title">Keine Ergebnisse · No results</div></div>'
      : filtered.map(r => renderRuleCard(r)).join('');
  }

  function renderRuleCard(r) {
    const articleClass = r.article ? `badge-${r.article}` : '';
    const confidenceLabel = { 'very-high': 'Sehr sicher · Very reliable', 'high': 'Sicher · Reliable', 'medium': 'Meistens · Usually' }[r.confidence] || '';
    const examplesHtml = (r.examples || []).map(ex =>
      `<span class="rule-example-pill">${ex}</span>`
    ).join('');
    const exceptionHtml = r.exceptions && r.exceptions.length > 0
      ? `<div class="rule-exception">⚠ Ausnahmen · Exceptions: ${r.exceptions.join(', ')}</div>`
      : '';

    return `
      <div class="rule-card" data-rule-id="${r.id}">
        <div class="rule-header">
          ${r.article ? `<span class="rule-article-badge article-badge ${articleClass}">${r.article}</span>` : ''}
          <div>
            <div class="rule-title">${r.title}</div>
            ${r.titleEn ? `<div class="rule-title-en">${r.titleEn}</div>` : ''}
          </div>
        </div>
        ${examplesHtml ? `<div class="rule-examples">${examplesHtml}</div>` : ''}
        <div class="rule-description">${r.description || ''}${r.descriptionEn ? `<br><span style="font-size:0.78rem;color:var(--text-faint)">${r.descriptionEn}</span>` : ''}</div>
        ${exceptionHtml}
        ${r.confidence ? `<div class="rule-confidence"><span class="confidence-dot ${r.confidence}"></span>${confidenceLabel}</div>` : ''}
        <button class="btn-practice-rule" onclick="Grammar.practiceRule('${r.id}')">
          🎯 Diese Regel üben · Practice this rule
        </button>
      </div>
    `;
  }

  function renderCasesTable(content) {
    content.innerHTML = `
      <div class="case-overview-card">
        <div class="case-overview-title">Bestimmte Artikel · Definite Articles (der/die/das)</div>
        <div class="declension-table-wrap">
          <table class="case-table">
            <thead>
              <tr>
                <th>Fall · Case</th>
                <th>Mask. (der)</th>
                <th>Fem. (die)</th>
                <th>Neut. (das)</th>
                <th>Pl. (die)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="case-name">Nominativ <span class="en-label">Nominative</span></td>
                <td class="der-cell">der</td>
                <td class="die-cell">die</td>
                <td class="das-cell">das</td>
                <td class="die-cell">die</td>
              </tr>
              <tr class="changed">
                <td class="case-name">Akkusativ <span class="en-label">Accusative</span></td>
                <td class="der-cell" style="font-weight:800;color:var(--die)">den</td>
                <td class="die-cell">die</td>
                <td class="das-cell">das</td>
                <td class="die-cell">die</td>
              </tr>
              <tr class="changed">
                <td class="case-name">Dativ <span class="en-label">Dative</span></td>
                <td class="der-cell">dem</td>
                <td class="die-cell" style="font-weight:800;color:var(--die)">der</td>
                <td class="das-cell">dem</td>
                <td class="die-cell" style="font-weight:800;color:var(--die)">den</td>
              </tr>
              <tr class="changed">
                <td class="case-name">Genitiv <span class="en-label">Genitive</span></td>
                <td class="der-cell">des</td>
                <td class="die-cell">der</td>
                <td class="das-cell">des</td>
                <td class="die-cell">der</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="case-overview-card" style="margin-top:12px">
        <div class="case-overview-title">Unbestimmte Artikel · Indefinite Articles (ein/eine)</div>
        <div class="declension-table-wrap">
          <table class="case-table">
            <thead>
              <tr>
                <th>Fall · Case</th>
                <th>Mask.</th>
                <th>Fem.</th>
                <th>Neut.</th>
              </tr>
            </thead>
            <tbody>
              <tr><td class="case-name">Nominativ</td><td>ein</td><td>eine</td><td>ein</td></tr>
              <tr class="changed"><td class="case-name">Akkusativ</td><td style="font-weight:800;color:var(--die)">einen</td><td>eine</td><td>ein</td></tr>
              <tr class="changed"><td class="case-name">Dativ</td><td>einem</td><td>einer</td><td>einem</td></tr>
              <tr class="changed"><td class="case-name">Genitiv</td><td>eines</td><td>einer</td><td>eines</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card" style="margin-top:12px">
        <div style="font-size:0.85rem;font-weight:700;margin-bottom:8px">💡 Wichtigste Regel · Key rule</div>
        <div style="font-size:0.85rem;color:var(--text-muted);line-height:1.6">
          Im <strong style="color:var(--die)">Akkusativ</strong> ändert sich nur der Artikel für <strong>maskuline</strong> Nomen:
          <span style="color:var(--der)">der</span> → <span style="color:var(--die)">den</span>.
          Feminine und neutrale Artikel bleiben gleich!<br>
          <span style="color:var(--text-faint);font-size:0.78rem">In the Accusative, only masculine nouns change their article: der → den. Feminine and neuter stay the same!</span>
        </div>
      </div>
    `;
  }

  function renderExceptions(content) {
    const rules = (window.GermanData || {}).grammarRules || [];
    const exceptions = rules.filter(r => r.category === 'exception' || (r.exceptions && r.exceptions.length > 0));
    const q = searchQuery;
    const filtered = q ? exceptions.filter(r => r.title.toLowerCase().includes(q)) : exceptions;

    if (filtered.length === 0) {
      content.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✨</div><div class="empty-state-title">Keine Ausnahmen · No exceptions found</div></div>';
      return;
    }
    content.innerHTML = filtered.map(r => renderRuleCard(r)).join('');
  }

  function practiceRule(ruleId) {
    const rules = (window.GermanData || {}).grammarRules || [];
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;
    App.startRulePractice(ruleId);
  }

  return { init, setTab, setSearch, practiceRule };
})();
