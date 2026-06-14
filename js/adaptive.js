/* ── Adaptive Learning — session queue + spaced repetition ── */
const Adaptive = (() => {

  const CASES = ['nominative','accusative','dative','genitive'];

  /* ── SM-2 spaced repetition update ── */
  function updateSM2(progress, wasCorrect, responseMs) {
    const quality = wasCorrect
      ? (responseMs < 2000 ? 5 : responseMs < 5000 ? 4 : 3)
      : 0;

    if (wasCorrect) {
      if (progress.interval === 0)      progress.interval = 1;
      else if (progress.interval === 1) progress.interval = 6;
      else progress.interval = Math.round(progress.interval * progress.easeFactor);

      progress.easeFactor = Utils.clamp(
        progress.easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
        1.3, 4.0
      );
    } else {
      progress.interval = 1;
      progress.easeFactor = Utils.clamp(progress.easeFactor - 0.2, 1.3, 4.0);
    }

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + progress.interval);
    progress.nextReviewAt = nextDate.toISOString();
    progress.lastSeen = new Date().toISOString();
    progress.timesAnswered += 1;
    if (wasCorrect) progress.timesCorrect += 1;
    else            progress.timesWrong += 1;

    // Mastery check
    progress.mastered = (
      progress.timesAnswered >= 5 &&
      progress.timesWrong / progress.timesAnswered < 0.1 &&
      progress.interval >= 21 &&
      progress.easeFactor >= 2.5
    );

    return progress;
  }

  /* ── Build session queue of `count` word IDs ── */
  async function buildSessionQueue(allWords, count, patternWeakness) {
    const progressMap = await Store.getAllWordProgress();
    const progById = {};
    for (const p of progressMap) progById[p.wordId] = p;

    const now = new Date();

    // Categorise words
    const dueForReview = [];
    const highErrorRate = [];
    const neverSeen = [];

    for (const w of allWords) {
      const p = progById[w.id] || Store.defaultWordProgress(w.id);
      const overdue = p.nextReviewAt ? new Date(p.nextReviewAt) <= now : true;

      if (p.timesAnswered === 0) {
        neverSeen.push(w);
      } else {
        if (overdue) dueForReview.push({ word:w, prog:p, overdueDays: (now - new Date(p.nextReviewAt)) / 86400000 });
        if (p.timesAnswered >= 3 && p.timesWrong / p.timesAnswered > 0.4) highErrorRate.push({ word:w, prog:p });
      }
    }

    // Sort buckets
    dueForReview.sort((a,b) => b.overdueDays - a.overdueDays);
    highErrorRate.sort((a,b) => (b.prog.timesWrong/b.prog.timesAnswered) - (a.prog.timesWrong/a.prog.timesAnswered));

    const used = new Set();
    const queue = [];

    function addWords(source, max, extractor) {
      let added = 0;
      for (const item of source) {
        if (added >= max) break;
        const w = extractor ? extractor(item) : item;
        if (!used.has(w.id)) { used.add(w.id); queue.push(w); added++; }
      }
    }

    // Bucket 1: due for review (40%)
    addWords(dueForReview, Math.ceil(count * 0.4), x => x.word);

    // Bucket 2: high error rate (30%)
    addWords(highErrorRate, Math.ceil(count * 0.3), x => x.word);

    // Bucket 3: pattern weakness words (20%)
    if (patternWeakness) {
      const { weakestCase, weakestArticle } = patternWeakness;
      const patternWords = allWords.filter(w => {
        if (used.has(w.id)) return false;
        const expanded = Utils.expandWord(w);
        if (weakestCase && expanded.cases[weakestCase]) return true;
        if (weakestArticle && expanded.article === weakestArticle) return true;
        return false;
      });
      addWords(Utils.shuffle(patternWords), Math.ceil(count * 0.2));
    }

    // Bucket 4: new words (fill remaining)
    const remaining = count - queue.length;
    if (remaining > 0) {
      addWords(Utils.shuffle(neverSeen).slice(0, remaining * 3), remaining);
    }

    // Pad with random if still short
    if (queue.length < count) {
      const others = Utils.shuffle(allWords.filter(w => !used.has(w.id)));
      addWords(others, count - queue.length);
    }

    // For each word, pick which case to quiz (adaptive: prefer weak cases)
    return queue.map(w => {
      const expanded = Utils.expandWord(w);
      const p = progById[w.id] || Store.defaultWordProgress(w.id);
      let cas = 'nominative';
      if (patternWeakness && patternWeakness.weakestCase) {
        cas = patternWeakness.weakestCase;
      } else {
        // Weight cases by error count
        const errors = p.errorsByCase;
        const totalErrors = Object.values(errors).reduce((a,b) => a+b, 0);
        if (totalErrors > 0) {
          const r = Math.random() * totalErrors;
          let acc = 0;
          for (const c of CASES) { acc += errors[c]; if (r < acc) { cas = c; break; } }
        } else {
          // Random case but bias toward nominative for beginners
          const r = Math.random();
          cas = r < 0.4 ? 'nominative' : r < 0.65 ? 'accusative' : r < 0.85 ? 'dative' : 'genitive';
        }
      }
      return { word: expanded, cas };
    });
  }

  /* ── Error pattern detection ── */
  async function detectErrorPatterns() {
    const allProgress = await Store.getAllWordProgress();
    const caseTotals = { nominative:0, accusative:0, dative:0, genitive:0 };
    const articleTotals = { der:0, die:0, das:0 };

    for (const p of allProgress) {
      if (p.errorsByCase) {
        for (const c of CASES) caseTotals[c] += p.errorsByCase[c] || 0;
      }
      if (p.errorsByArticle) {
        for (const a of ['der','die','das']) articleTotals[a] += p.errorsByArticle[a] || 0;
      }
    }

    const totalCaseErrors = Object.values(caseTotals).reduce((a,b)=>a+b,0);
    const totalArticleErrors = Object.values(articleTotals).reduce((a,b)=>a+b,0);

    const weakestCase = totalCaseErrors > 0
      ? CASES.reduce((a,b) => caseTotals[a] > caseTotals[b] ? a : b)
      : null;
    const weakestArticle = totalArticleErrors > 0
      ? ['der','die','das'].reduce((a,b) => articleTotals[a] > articleTotals[b] ? a : b)
      : null;

    return { weakestCase, weakestArticle, caseTotals, articleTotals, totalCaseErrors, totalArticleErrors };
  }

  return { buildSessionQueue, updateSM2, detectErrorPatterns, CASES };
})();
