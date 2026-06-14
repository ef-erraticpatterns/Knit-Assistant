/* ── Statistics Screen ── */
const Stats = (() => {

  async function render(appState) {
    await renderCalendar(appState);
    await renderErrorCharts(appState);
    renderAllTime(appState);
    await renderTopMistakes();
    await renderInsight(appState);
  }

  function renderAllTime(state) {
    const u = state.user;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('stat-streak',   u.currentStreak);
    set('stat-longest',  u.longestStreak);
    set('stat-xp',       Utils.formatNumber(u.xp));
    set('stat-words',    Utils.formatNumber(u.totalWordsAnswered));
    const acc = u.totalWordsAnswered > 0 ? Utils.pct(u.totalCorrect, u.totalWordsAnswered) : 0;
    set('stat-accuracy', acc + '%');
    set('stat-mastered', '—'); // updated after DB load

    // Level progress bar
    const level = Utils.getLevel(u.xp);
    const prog = Utils.getLevelProgress(u.xp);
    const levelName = document.getElementById('level-name');
    const levelFill = document.getElementById('level-bar-fill');
    const levelXP = document.getElementById('level-xp-label');
    const levelNext = document.getElementById('level-next');
    if (levelName) levelName.textContent = `${level.name} · ${level.nameEn}`;
    if (levelFill) levelFill.style.width = (prog * 100) + '%';
    const nextXP = Utils.getLevelNext(u.xp);
    if (levelXP) levelXP.textContent = `${u.xp.toLocaleString()} / ${nextXP === u.xp ? '∞' : nextXP.toLocaleString()} XP`;
    if (levelNext) levelNext.textContent = nextXP > u.xp ? `${nextXP - u.xp} XP bis nächstes Level` : 'Max level!';
  }

  async function renderCalendar(state) {
    const wrap = document.getElementById('streak-calendar-grid');
    if (!wrap) return;

    const today = Utils.todayISO();
    const cells = [];
    for (let i = 90; i >= 0; i--) {
      const date = Utils.addDays(today, -i);
      cells.push(date);
    }

    wrap.innerHTML = '';
    for (const date of cells) {
      const div = document.createElement('div');
      div.className = 'cal-cell';
      const dayData = state.streakCalendar[date];
      if (date === today) div.classList.add('today');
      if (dayData) {
        const pct = dayData.goal > 0 ? dayData.completed / dayData.goal : 0;
        if (dayData.perfect) div.classList.add('perfect');
        else if (pct >= 1)   div.classList.add('done');
        else if (pct > 0)    div.classList.add('partial');
      }
      div.title = date;
      wrap.appendChild(div);
    }
  }

  async function renderErrorCharts(state) {
    const patterns = await Adaptive.detectErrorPatterns();

    // Article errors bar chart
    const articleChart = document.getElementById('article-error-chart');
    if (articleChart) {
      const max = Math.max(...Object.values(patterns.articleTotals), 1);
      articleChart.innerHTML = ['der','die','das'].map(art => `
        <div class="bar-row">
          <span class="bar-label article-${art}">${art}</span>
          <div class="bar-track">
            <div class="bar-fill ${art}" style="width:${(patterns.articleTotals[art]/max*100).toFixed(1)}%"></div>
          </div>
          <span class="bar-count">${patterns.articleTotals[art]}</span>
        </div>
      `).join('');
    }

    // Case errors bar chart
    const caseChart = document.getElementById('case-error-chart');
    if (caseChart) {
      const CASES = ['nominative','accusative','dative','genitive'];
      const CASE_DE = { nominative:'Nominativ', accusative:'Akkusativ', dative:'Dativ', genitive:'Genitiv' };
      const max = Math.max(...CASES.map(c => patterns.caseTotals[c]), 1);
      caseChart.innerHTML = CASES.map(c => `
        <div class="bar-row">
          <span class="bar-label">${CASE_DE[c]}</span>
          <div class="bar-track">
            <div class="bar-fill ${c}" style="width:${(patterns.caseTotals[c]/max*100).toFixed(1)}%"></div>
          </div>
          <span class="bar-count">${patterns.caseTotals[c]}</span>
        </div>
      `).join('');
    }
  }

  async function renderTopMistakes() {
    const allProgress = await Store.getAllWordProgress();
    const sorted = allProgress
      .filter(p => p.timesWrong > 0)
      .sort((a,b) => b.timesWrong - a.timesWrong)
      .slice(0, 10);

    const table = document.getElementById('top-mistakes-table');
    if (!table) return;
    if (sorted.length === 0) {
      table.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted)">Noch keine Fehler · No mistakes yet 🎉</td></tr>';
      return;
    }

    // Look up words by ID
    const allWords = (window.GermanData || {}).wordsCore || [];
    const extWords = (window.GermanData || {}).wordsExtended || [];
    const proWords = (window.GermanData || {}).wordsProfessional || [];
    const allWordsList = [...allWords, ...extWords, ...proWords];
    const wordById = {};
    allWordsList.forEach(w => { wordById[w.id] = w; });

    table.innerHTML = sorted.map((p, i) => {
      const w = wordById[p.wordId];
      const noun = w ? w.noun : `ID:${p.wordId}`;
      const article = w ? `<span class="article-badge badge-${w.article}" style="font-size:0.7rem">${w.article}</span>` : '—';
      const lastSeen = p.lastSeen ? new Date(p.lastSeen).toLocaleDateString('de-DE', {day:'numeric',month:'short'}) : '—';
      return `
        <tr>
          <td>${i+1}. <span class="mistake-noun">${noun}</span></td>
          <td class="mistake-article">${article}</td>
          <td class="mistake-count">${p.timesWrong}×</td>
          <td class="mistake-last">${lastSeen}</td>
        </tr>
      `;
    }).join('');
  }

  async function renderInsight(state) {
    const patterns = await Adaptive.detectErrorPatterns();
    const card = document.getElementById('insight-card');
    if (!card) return;

    if (patterns.totalCaseErrors === 0 && patterns.totalArticleErrors === 0) {
      card.className = 'insight-card good';
      card.innerHTML = `
        <div class="insight-icon">🎉</div>
        <div class="insight-title">Keine Fehler-Muster · No error patterns</div>
        <div class="insight-text">Keep it up — great accuracy so far!</div>
      `;
      return;
    }

    const CASE_DE = { nominative:'Nominativ', accusative:'Akkusativ', dative:'Dativ', genitive:'Genitiv' };
    const CASE_EN = { nominative:'Nominative', accusative:'Accusative', dative:'Dative', genitive:'Genitive' };
    card.className = 'insight-card';

    let title = '', text = '';
    if (patterns.weakestCase) {
      const cn = patterns.caseTotals[patterns.weakestCase];
      title = `Schwäche: ${CASE_DE[patterns.weakestCase]} · Weakness: ${CASE_EN[patterns.weakestCase]}`;
      text = `Du machst die meisten Fehler im ${CASE_DE[patterns.weakestCase]} (${cn} Fehler). Die nächste Übungseinheit wird mehr ${CASE_DE[patterns.weakestCase]}-Fragen enthalten. · You make the most mistakes in the ${CASE_EN[patterns.weakestCase]} (${cn} errors). Your next session will focus on this.`;
    }
    if (patterns.weakestArticle && patterns.articleTotals[patterns.weakestArticle] > 2) {
      const an = patterns.articleTotals[patterns.weakestArticle];
      title += (title ? ' | ' : '') + `Artikel: "${patterns.weakestArticle}" (${an} Fehler)`;
    }

    card.innerHTML = `
      <div class="insight-icon">💡</div>
      <div class="insight-title">${title}</div>
      <div class="insight-text">${text}</div>
    `;
  }

  return { render, renderCalendar, renderAllTime };
})();
