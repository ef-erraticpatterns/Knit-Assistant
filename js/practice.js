/* ── Practice Screen — Session State Machine ── */
const Practice = (() => {

  let session = null;
  let currentItem = null;
  let questionStartTime = 0;
  let answered = false;
  let transitioning = false;
  let speedStreak = 0;

  const CASE_LABELS = {
    nominative: { de: 'Nominativ', en: 'Nominative (Subject)' },
    accusative: { de: 'Akkusativ', en: 'Accusative (Direct Object)' },
    dative:     { de: 'Dativ',     en: 'Dative (Indirect Object)' },
    genitive:   { de: 'Genitiv',   en: 'Genitive (Possession)' }
  };

  const els = () => ({
    screen:         document.getElementById('screen-practice'),
    progressFill:   document.getElementById('practice-prog-fill'),
    progressText:   document.getElementById('practice-prog-text'),
    xpDisplay:      document.getElementById('practice-xp'),
    caseChip:       document.getElementById('q-case-chip'),
    noun:           document.getElementById('q-noun'),
    plural:         document.getElementById('q-plural'),
    sentence:       document.getElementById('q-sentence'),
    card:           document.getElementById('question-card'),
    tipCard:        document.getElementById('tip-card'),
    tipRule:        document.getElementById('tip-rule'),
    tipEn:          document.getElementById('tip-en'),
    derBtn:         document.getElementById('btn-der'),
    dieBtn:         document.getElementById('btn-die'),
    dasBtn:         document.getElementById('btn-das'),
    continueBtn:    document.getElementById('btn-continue'),
    completeScreen: document.getElementById('session-complete'),
    completeEmoji:  document.getElementById('session-emoji'),
    completeTitle:  document.getElementById('session-title'),
    completeSub:    document.getElementById('session-sub'),
    ssCorrect:      document.getElementById('ss-correct'),
    ssWrong:        document.getElementById('ss-wrong'),
    ssXP:           document.getElementById('ss-xp'),
    confettiWrap:   document.getElementById('confetti-wrap')
  });

  /* ── Start session ── */
  async function startSession(words, appState) {
    const e = els();
    session = {
      id: 'session-' + Utils.todayISO() + '-' + Date.now(),
      date: Utils.todayISO(),
      startedAt: new Date().toISOString(),
      endedAt: null,
      queue: words,
      index: 0,
      correct: 0,
      wrong: 0,
      xpEarned: 0,
      speedStreak: 0,
      wordsDetail: []
    };
    speedStreak = 0;
    answered = false;
    transitioning = false;

    document.body.classList.add('practice-mode');
    e.completeScreen.classList.add('hidden');
    e.xpDisplay.textContent = '0 XP';
    showQuestion();
  }

  /* ── Card flip ── */
  function flipCard(callback) {
    const e = els();
    if (e.card) e.card.classList.add('flip-out');
    setTimeout(() => {
      try { callback(); } catch (err) { console.error('flipCard callback error:', err); }
      if (e.card) {
        e.card.classList.remove('flip-out');
        void e.card.offsetWidth;
        e.card.classList.add('flip-in');
      }
      setTimeout(() => {
        if (e.card) e.card.classList.remove('flip-in');
        transitioning = false; // always resets — no code path can leave it stuck
      }, 300);
    }, 180);
  }

  /* ── Show question ── */
  function showQuestion() {
    if (transitioning) return; // prevent double-tap on Continue
    transitioning = true;

    const e = els();

    // Hide continue immediately so it can't be tapped again
    e.continueBtn.classList.remove('show');

    if (session.index >= session.queue.length) {
      transitioning = false;
      endSession();
      return;
    }

    flipCard(() => {
      currentItem = session.queue[session.index];
      answered = false;
      questionStartTime = Date.now();

      const { word, cas } = currentItem;
      const label = CASE_LABELS[cas] || CASE_LABELS.nominative;

      e.card.className = 'question-card';
      e.tipCard.classList.add('hidden');

      e.sentence.style.display = 'none';
      e.sentence.style.borderLeft = '';
      e.sentence.style.color = '';
      e.sentence.style.background = '';
      e.sentence.textContent = '';

      [e.derBtn, e.dieBtn, e.dasBtn].forEach(btn => {
        btn.classList.remove('selected-correct', 'selected-wrong', 'disabled');
      });

      e.caseChip.textContent = `${label.de} · ${label.en}`;
      e.noun.textContent = word.noun || '?';
      e.plural.textContent = word.plural ? `Pl: ${word.plural}` : '';

      updateProgress();
    });
  }

  function updateProgress() {
    const e = els();
    const total = session.queue.length;
    const done = session.index;
    e.progressFill.style.width = total > 0 ? (done / total * 100) + '%' : '0%';
    e.progressText.textContent = `${done} / ${total}`;
    e.xpDisplay.textContent = session.xpEarned + ' XP';
  }

  /* ── Handle answer ── */
  async function handleAnswer(chosenArticle) {
    if (answered) return;
    answered = true;

    const e = els();

    // Resolve correct answer safely — never crash even on bad word data
    let correctArticle = 'der';
    try {
      const { word, cas } = currentItem;
      const caseData = (word.cases && (word.cases[cas] || word.cases.nominative))
                     || { article: word.article || 'der' };
      correctArticle = caseData.article;
    } catch (_) { /* bad word data — fall through with default */ }

    const { word, cas } = currentItem;
    const responseMs = Date.now() - questionStartTime;
    const wasCorrect = chosenArticle === correctArticle;
    const xp = calcXPForAnswer(wasCorrect, responseMs);

    // Visual feedback
    const btnMap = { der: e.derBtn, die: e.dieBtn, das: e.dasBtn };
    if (btnMap[chosenArticle]) btnMap[chosenArticle].classList.add(wasCorrect ? 'selected-correct' : 'selected-wrong');
    if (!wasCorrect && btnMap[correctArticle]) btnMap[correctArticle].classList.add('selected-correct');
    Object.values(btnMap).forEach(btn => btn && btn.classList.add('disabled'));

    if (wasCorrect) {
      e.card.classList.add('correct');
      speedStreak++;
      floatXP(e.card, xp);
    } else {
      e.card.classList.add('wrong');
      speedStreak = 0;
    }

    // Update session counts SYNCHRONOUSLY — index advances immediately
    if (wasCorrect) { session.correct++; session.xpEarned += xp; }
    else            { session.wrong++; }
    session.speedStreak = Math.max(session.speedStreak, speedStreak);
    session.wordsDetail.push({ wordId: word.id, correct: wasCorrect, case: cas, timeTaken: responseMs / 1000 });
    session.index++;

    // Show post-answer content
    showPostAnswerContent(word, cas, correctArticle, wasCorrect);

    // Show continue button
    const isLast = session.index >= session.queue.length;
    e.continueBtn.classList.add('show');
    e.continueBtn.textContent = isLast ? 'Fertig! / Done! 🎉' : 'Weiter / Continue ›';
    e.xpDisplay.textContent = session.xpEarned + ' XP';

    // Persist in background — never blocks UI
    try {
      const progress = await Store.getWordProgress(word.id);
      progress.errorsByCase    = progress.errorsByCase    || { nominative:0, accusative:0, dative:0, genitive:0 };
      progress.errorsByArticle = progress.errorsByArticle || { der:0, die:0, das:0 };
      if (!wasCorrect) {
        progress.errorsByCase[cas] = (progress.errorsByCase[cas] || 0) + 1;
        progress.errorsByArticle[chosenArticle] = (progress.errorsByArticle[chosenArticle] || 0) + 1;
      }
      Adaptive.updateSM2(progress, wasCorrect, responseMs);
      await Store.setWordProgress(progress);

      const appState = App.getState();
      appState.today.wordsCompleted++;
      appState.today.xpEarned += xp;
      if (wasCorrect) appState.today.correctAnswers++;
      else            appState.today.wrongAnswers++;
      appState.user.totalWordsAnswered++;
      appState.user.totalCorrect += wasCorrect ? 1 : 0;
      appState.user.xp += xp;
      App.setState(appState);
    } catch (err) {
      console.warn('handleAnswer storage error (non-fatal):', err);
    }
  }

  /* ── Post-answer content ── */
  function showPostAnswerContent(word, cas, correctArticle, wasCorrect) {
    const e = els();
    const casLabel = CASE_LABELS[cas] || CASE_LABELS.nominative;
    const example = word.examples && word.examples.length > 0 ? word.examples[0] : null;

    if (wasCorrect) {
      if (example) {
        e.sentence.textContent = example;
        e.sentence.style.display = '';
        e.sentence.style.borderLeft = '3px solid var(--accent)';
        e.sentence.style.color = 'var(--accent)';
        e.sentence.style.background = 'rgba(6,214,160,0.08)';
      }
    } else {
      e.tipCard.classList.remove('hidden');
      e.tipRule.innerHTML = `
        Im ${casLabel.de}: <span class="correct-answer ${correctArticle}">${correctArticle}</span> ${word.noun}
        ${example ? `<span style="display:block;margin-top:6px;font-weight:400;font-size:0.82rem;opacity:0.8">${example}</span>` : ''}
        ${word.tip ? `<span style="display:block;margin-top:4px;font-style:italic;font-size:0.78rem;color:var(--das);opacity:0.8">${word.tip}</span>` : ''}
      `;
      e.tipEn.textContent = `In the ${casLabel.en}: "${correctArticle} ${word.noun}"`;
    }
  }

  function calcXPForAnswer(wasCorrect, responseMs) {
    try {
      return Gamification.calcXP(wasCorrect, responseMs, App.getState().user.currentStreak, true);
    } catch (_) { return wasCorrect ? 10 : 0; }
  }

  function floatXP(card, xp) {
    if (xp <= 0) return;
    const el = document.createElement('div');
    el.className = 'xp-float';
    el.textContent = '+' + xp + ' XP';
    card.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  /* ── End session ── */
  async function endSession() {
    const e = els();
    session.endedAt = new Date().toISOString();

    try {
      await Store.saveSession({
        id: session.id, date: session.date,
        startedAt: session.startedAt, endedAt: session.endedAt,
        wordsAttempted: session.index, correct: session.correct,
        wrong: session.wrong, xpEarned: session.xpEarned,
        speedStreak: session.speedStreak
      });
    } catch (err) { console.warn('saveSession error', err); }

    let appState = App.getState();
    if (session.correct > 0) appState = Gamification.updateStreak(appState);

    const goalMet = appState.today.wordsCompleted >= appState.user.dailyGoal;
    if (goalMet) {
      appState.streakCalendar[Utils.todayISO()] = {
        completed: appState.today.wordsCompleted,
        goal: appState.user.dailyGoal,
        perfect: appState.today.wrongAnswers === 0
      };
    }

    const newBadges = Gamification.checkBadges(appState, session);
    if (newBadges.length > 0) appState.badges = [...(appState.badges || []), ...newBadges];
    App.setState(appState);

    const accuracy = session.index > 0 ? Math.round((session.correct / session.index) * 100) : 0;
    e.ssCorrect.textContent = session.correct;
    e.ssWrong.textContent = session.wrong;
    e.ssXP.textContent = '+' + session.xpEarned;

    if (session.wrong === 0 && session.correct >= 10) {
      e.completeEmoji.textContent = '🌟';
      e.completeTitle.textContent = 'Perfekt! / Perfect!';
      e.completeSub.textContent = 'Kein einziger Fehler! · Not a single mistake!';
      spawnConfetti();
    } else if (goalMet) {
      e.completeEmoji.textContent = '🎉';
      e.completeTitle.textContent = 'Tagesziel erreicht! / Daily goal done!';
      e.completeSub.textContent = `${accuracy}% Genauigkeit · ${accuracy}% accuracy`;
      spawnConfetti();
    } else {
      e.completeEmoji.textContent = '👍';
      e.completeTitle.textContent = 'Gut gemacht! / Well done!';
      e.completeSub.textContent = `${session.correct}/${session.index} richtig · ${accuracy}% accuracy`;
    }

    e.completeScreen.classList.remove('hidden');
    if (newBadges.length > 0) setTimeout(() => App.showBadgeUnlock(newBadges[0].id), 1500);
  }

  function spawnConfetti() {
    const e = els();
    if (!e.confettiWrap) return;
    const colors = ['#06d6a0','#ffd166','#ff6b8a','#4a9eff'];
    for (let i = 0; i < 60; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-piece';
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[Math.floor(Math.random() * colors.length)];
      p.style.animationDuration = (1.5 + Math.random() * 2) + 's';
      p.style.animationDelay = Math.random() * 0.5 + 's';
      p.style.width = p.style.height = (6 + Math.random() * 6) + 'px';
      e.confettiWrap.appendChild(p);
      setTimeout(() => p.remove(), 4000);
    }
  }

  function exitSession() {
    document.body.classList.remove('practice-mode');
    session = null;
    answered = false;
    transitioning = false;
    App.showScreen('home');
    App.refreshDashboard();
  }

  function confirmExit() {
    App.showConfirm(
      'Übung beenden? / End session?',
      'Dein bisheriger Fortschritt wird gespeichert. · Your progress so far will be saved.',
      () => {
        if (session && session.index > 0) endSession();
        else exitSession();
      }
    );
  }

  return { startSession, handleAnswer, showQuestion, exitSession, confirmExit };
})();
