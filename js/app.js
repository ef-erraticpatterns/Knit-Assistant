/* ── App — Router, Dashboard, State Manager ── */
const App = (() => {

  let state = null;
  let patternWeakness = null;
  let currentScreen = 'home';
  let previewTimer = null;

  const SCREENS = ['home','dict','pro','stats','grammar'];

  /* ── State ── */
  function getState() { return state; }
  function setState(newState) {
    state = newState;
    Store.save(state);
    updateHeader();
  }

  /* ── Init ── */
  async function init() {
    state = Store.load();
    state = Store.checkDateRollover(state);
    Store.save(state);

    // Open IndexedDB eagerly
    await Store.openDB().catch(() => {});

    // Load word data
    await loadWords();

    // Init screens
    initNav();
    initDashboard();
    initPracticeScreen();
    initDictScreen();
    initProScreen();
    initStatsScreen();
    initGrammarScreen();
    initSettingsModal();
    initConfirmDialog();
    initBadgeOverlay();

    // Notifications
    Notifications.showBanner(state);
    Notifications.updateBadge(Math.max(0, state.user.dailyGoal - state.today.wordsCompleted));
    if (state.user.notificationsEnabled) {
      await Notifications.registerPeriodicSync();
      Notifications.scheduleReminders(state);
    }

    // Detect error patterns in background
    Adaptive.detectErrorPatterns().then(p => { patternWeakness = p; });

    // Handle URL shortcut ?screen=practice
    const params = new URLSearchParams(location.search);
    if (params.get('screen') === 'practice') {
      setTimeout(() => startPractice(), 300);
    } else {
      showScreen('home');
    }

    // Service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    // Intercept Android back button — set up AFTER DOM is ready and initConfirmDialog has run
    history.pushState({ app: 'artikel-trainer' }, '');
    window.addEventListener('popstate', () => {
      history.pushState({ app: 'artikel-trainer' }, '');
      if (document.body.classList.contains('practice-mode')) {
        Practice.confirmExit();
      } else if (currentScreen && currentScreen !== 'home') {
        showScreen('home');
      } else {
        showConfirm(
          'App schließen? / Close app?',
          'Möchtest du die App wirklich schließen? · Do you want to close the app?',
          () => window.close()
        );
      }
    });
  }

  async function loadWords() {
    // Words are loaded via <script> tags assigning to window.GermanData
    // Merge all word sources
    const gd = window.GermanData || {};
    const core = gd.wordsCore || [];
    const pro  = gd.wordsProfessional || [];
    const ext  = gd.wordsExtended || [];
    window._allWords = [...core, ...pro, ...ext];
    // Init dictionary with core + pro for now
    Dictionary.init([...core, ...pro]);
  }

  /* ── Navigation ── */
  function initNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const screen = btn.dataset.screen;
        if (screen) showScreen(screen);
      });
    });
    document.getElementById('btn-settings').addEventListener('click', openSettings);
  }

  function startPreviewRotation() {
    stopPreviewRotation();
    previewTimer = setInterval(() => {
      const card = document.getElementById('preview-card');
      if (!card) return;
      card.classList.add('preview-flip-out');
      setTimeout(() => {
        refreshPreviewCard();
        card.classList.remove('preview-flip-out');
        void card.offsetWidth;
        card.classList.add('preview-flip-in');
        setTimeout(() => card.classList.remove('preview-flip-in'), 350);
      }, 220);
    }, 5000);
  }

  function stopPreviewRotation() {
    if (previewTimer) { clearInterval(previewTimer); previewTimer = null; }
  }

  function showScreen(name) {
    if (name === 'home') {
      refreshDashboard();
      startPreviewRotation();
    } else {
      stopPreviewRotation();
      if (name === 'stats') Stats.render(state);
      else if (name === 'grammar') Grammar.init();
    }

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`screen-${name}`);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.screen === name);
    });

    currentScreen = name;
    // Keep a dummy history entry so the Android back button fires popstate
    // instead of leaving the app
    history.replaceState({ app: 'artikel-trainer' }, '');
  }

  /* ── Header ── */
  function updateHeader() {
    const xpEl = document.querySelector('.header-xp');
    const streakEl = document.querySelector('.header-streak');
    if (xpEl) xpEl.textContent = `${Utils.formatNumber(state.user.xp)} XP`;
    if (streakEl) {
      const s = state.user.currentStreak;
      streakEl.textContent = s > 0 ? `🔥 ${s}` : '0';
    }
  }

  /* ── Dashboard ── */
  function initDashboard() {
    document.getElementById('btn-start-practice').addEventListener('click', () => startPractice());

    const previewCard = document.getElementById('preview-card');
    if (previewCard) previewCard.addEventListener('click', () => startPractice());

    document.getElementById('btn-enable-notif').addEventListener('click', async () => {
      const granted = await Notifications.requestPermission();
      if (granted) {
        state.user.notificationsEnabled = true;
        setState(state);
        document.getElementById('notif-banner').classList.add('hidden');
        toast('Erinnerungen aktiviert · Reminders enabled ✓');
        Notifications.registerPeriodicSync();
        Notifications.scheduleReminders(state);
      } else {
        toast('Benachrichtigungen blockiert · Notifications blocked');
      }
    });

    document.getElementById('btn-dismiss-notif').addEventListener('click', () => {
      state.user.notifDismissed = true;
      setState(state);
      document.getElementById('notif-banner').classList.add('hidden');
    });

    document.querySelectorAll('.quick-card').forEach(card => {
      card.addEventListener('click', () => {
        const screen = card.dataset.screen;
        if (screen) showScreen(screen);
      });
    });
  }

  function refreshDashboard() {
    if (!state) return;
    updateHeader();

    const done = state.today.wordsCompleted;
    const goal = state.user.dailyGoal;
    const pct = goal > 0 ? done / goal : 0;

    // Progress ring
    const ring = document.querySelector('.hero-ring svg .ring-fill');
    if (ring) {
      const r = 58; // radius (should match SVG)
      const circ = 2 * Math.PI * r;
      ring.style.strokeDasharray = circ;
      ring.style.strokeDashoffset = circ * (1 - Math.min(pct, 1));
      ring.style.stroke = pct >= 1 ? 'var(--accent)' : pct >= 0.5 ? 'var(--das)' : 'var(--die)';
    }

    // Ring center
    const ringCount = document.querySelector('.ring-count');
    if (ringCount) ringCount.textContent = done;
    const ringGoal = document.querySelector('.ring-goal');
    if (ringGoal) ringGoal.textContent = `/ ${goal}`;

    // CTA button
    const btn = document.getElementById('btn-start-practice');
    if (btn) {
      if (pct >= 1) {
        btn.className = 'btn-cta done';
        btn.innerHTML = `Fertig für heute! · Done for today! ✓<span class="cta-sub">Bonus-Übung starten · Start bonus practice</span>`;
      } else if (done > 0) {
        btn.className = 'btn-cta';
        btn.innerHTML = `Weiter üben · Continue practice<span class="cta-sub">${goal - done} Wörter übrig · ${goal - done} words left</span>`;
      } else {
        btn.className = 'btn-cta';
        btn.innerHTML = `Übung starten · Start Practice<span class="cta-sub">Täglich ${goal} Wörter · ${goal} words daily</span>`;
      }
    }

    // Stat chips
    const streakSpan = document.getElementById('chip-streak');
    if (streakSpan) streakSpan.textContent = `${state.user.currentStreak} ${state.user.currentStreak === 1 ? 'Tag' : 'Tage'}`;
    const xpSpan = document.getElementById('chip-xp');
    if (xpSpan) xpSpan.textContent = Utils.formatNumber(state.user.xp) + ' XP';
    const levelSpan = document.getElementById('chip-level');
    if (levelSpan) levelSpan.textContent = Utils.getLevel(state.user.xp).name;

    // Today stats
    const tc = document.getElementById('today-correct');
    const tw = document.getElementById('today-wrong');
    const ta = document.getElementById('today-accuracy');
    if (tc) tc.textContent = state.today.correctAnswers;
    if (tw) tw.textContent = state.today.wrongAnswers;
    const acc = state.today.wordsCompleted > 0
      ? Utils.pct(state.today.correctAnswers, state.today.wordsCompleted)
      : 0;
    if (ta) ta.textContent = acc + '%';

    // Notification banner
    Notifications.showBanner(state);

    // Update badge
    Notifications.updateBadge(Math.max(0, goal - done));

    // Preview word card
    refreshPreviewCard();
  }

  function refreshPreviewCard() {
    const card = document.getElementById('preview-card');
    const nounEl = document.getElementById('preview-noun');
    const caseEl = document.getElementById('preview-case');
    if (!card || !nounEl || !caseEl) return;
    const words = window.GermanData && window.GermanData.core;
    if (!words || words.length === 0) return;
    const CASES = ['nominative','accusative','dative','genitive'];
    const CASE_LABELS = {
      nominative: 'Nominativ · Nominative',
      accusative: 'Akkusativ · Accusative',
      dative:     'Dativ · Dative',
      genitive:   'Genitiv · Genitive'
    };
    const word = words[Math.floor(Math.random() * Math.min(words.length, 200))];
    const cas  = CASES[Math.floor(Math.random() * CASES.length)];
    nounEl.textContent = word.noun;
    caseEl.textContent = CASE_LABELS[cas];
  }

  function renderBadgeStrip() {
    const strip = document.querySelector('.badge-strip');
    if (!strip) return;
    const earned = new Set((state.badges || []).map(b => b.id));
    const allBadges = Gamification.BADGES;
    // Show earned first, then unearned (greyed)
    const toShow = [
      ...allBadges.filter(b => earned.has(b.id)).slice(-4),
      ...allBadges.filter(b => !earned.has(b.id)).slice(0, 4)
    ].slice(0, 6);

    strip.innerHTML = toShow.map(b => `
      <div class="badge-chip">
        <div class="badge-icon-wrap ${earned.has(b.id) ? 'earned' : ''}">${b.icon}</div>
        <div class="badge-name">${b.name}</div>
      </div>
    `).join('');
  }

  /* ── Practice ── */
  function initPracticeScreen() {
    document.getElementById('btn-exit-practice').addEventListener('click', () => {
      Practice.confirmExit();
    });
    document.getElementById('btn-continue').addEventListener('click', () => {
      Practice.showQuestion();
    });
    document.getElementById('btn-done').addEventListener('click', () => {
      document.getElementById('session-complete').classList.add('hidden');
      Practice.exitSession();
    });
    ['der','die','das'].forEach(art => {
      document.getElementById(`btn-${art}`).addEventListener('click', () => {
        Practice.handleAnswer(art);
      });
    });
  }

  async function startPractice(ruleId = null) {
    const gd = window.GermanData || {};
    let pool = [...(gd.wordsCore || [])];

    if (state.settings.includeProfessional) {
      const proWords = gd.wordsProfessional || [];
      const domains = state.settings.professionalDomains || [];
      const filtered = domains.length > 0
        ? proWords.filter(w => domains.includes(w.subDomain))
        : proWords;
      pool = [...pool, ...filtered];
    }

    // Rule-filtered practice
    if (ruleId) {
      const rules = gd.grammarRules || [];
      const rule = rules.find(r => r.id === ruleId);
      if (rule && rule.pattern) {
        const re = new RegExp(rule.pattern.source || rule.pattern);
        pool = pool.filter(w => re.test(w.noun) || w.article === rule.article);
      }
    }

    // Add custom queue words
    if (state.customQueue && state.customQueue.length > 0) {
      const allWords = window._allWords || [];
      const customWords = allWords.filter(w => state.customQueue.includes(w.id));
      pool = [...customWords, ...pool.filter(w => !state.customQueue.includes(w.id))];
    }

    if (pool.length === 0) {
      toast('Keine Wörter verfügbar · No words available');
      return;
    }

    const queue = await Adaptive.buildSessionQueue(pool, state.user.dailyGoal, patternWeakness);
    showScreen('practice');
    Practice.startSession(queue, state);
  }

  function startRulePractice(ruleId) {
    showScreen('home');
    setTimeout(() => startPractice(ruleId), 100);
  }

  /* ── Dictionary screen ── */
  function initDictScreen() {
    const input = document.getElementById('dict-search-input');
    const clearBtn = document.getElementById('btn-clear-search');
    const onInput = Utils.debounce(() => {
      clearBtn.classList.toggle('hidden', !input.value);
      Dictionary.filter(input.value, getActiveFilter());
    }, 200);
    input.addEventListener('input', onInput);
    clearBtn.addEventListener('click', () => { input.value = ''; clearBtn.classList.add('hidden'); Dictionary.filter('', getActiveFilter()); });

    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        Dictionary.filter(input.value, chip.dataset.filter);
      });
    });

    document.getElementById('btn-back-dict').addEventListener('click', () => {
      Dictionary.closeDetail();
    });
  }

  function getActiveFilter() {
    const active = document.querySelector('.filter-chip.active');
    return active ? active.dataset.filter : 'all';
  }

  /* ── Professional screen ── */
  function initProScreen() {
    document.querySelectorAll('.pro-cat-card').forEach(card => {
      card.addEventListener('click', () => {
        const domain = card.dataset.domain;
        openProDomain(domain, card.querySelector('.pro-cat-name').textContent);
      });
    });
  }

  function openProDomain(domain, title) {
    const listScreen = document.getElementById('pro-word-list');
    if (!listScreen) return;
    listScreen.querySelector('.pro-word-list-title').textContent = title;
    listScreen.style.display = '';

    const gd = window.GermanData || {};
    const words = (gd.wordsProfessional || []).filter(w => w.subDomain === domain || w.domain === domain);
    renderProList(words, listScreen);
  }

  function renderProList(words, container) {
    const list = container.querySelector('.pro-word-list');
    if (!list) return;
    list.innerHTML = words.map(w => `
      <div class="dict-item" style="position:relative;height:auto;padding:12px 16px;">
        <span class="article-badge badge-${w.article}">${w.article}</span>
        <div class="dict-item-text">
          <div class="dict-item-noun">${w.noun}</div>
          <div class="dict-item-sub">${w.plural ? `Pl: ${w.plural}` : ''}</div>
        </div>
        <span class="dict-item-arrow">›</span>
      </div>
    `).join('');
    list.querySelectorAll('.dict-item').forEach((el, i) => {
      el.addEventListener('click', () => Dictionary.showWordDetail(words[i]));
    });
  }

  /* ── Stats screen ── */
  function initStatsScreen() {
    document.getElementById('btn-export-data').addEventListener('click', exportData);
    document.getElementById('btn-reset-data').addEventListener('click', () => {
      showConfirm(
        'Alle Daten löschen? · Delete all data?',
        'Dein Fortschritt, Streifen und Abzeichen werden gelöscht. · Your progress, streaks and badges will be deleted.',
        async () => {
          await Store.clearAllWordProgress();
          state = Store.load();
          Store.save(state);
          toast('Daten gelöscht · Data deleted');
          Stats.render(state);
        }
      );
    });
  }

  function exportData() {
    const data = {
      exportedAt: new Date().toISOString(),
      state,
      version: 1
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `artikel-trainer-backup-${Utils.todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Daten exportiert · Data exported');
  }

  /* ── Grammar screen ── */
  function initGrammarScreen() {
    document.querySelectorAll('.grammar-tab').forEach(tab => {
      tab.addEventListener('click', () => Grammar.setTab(tab.dataset.tab));
    });
    const gInput = document.getElementById('grammar-search-input');
    if (gInput) {
      gInput.addEventListener('input', Utils.debounce(() => Grammar.setSearch(gInput.value), 250));
    }
  }

  /* ── Settings modal ── */
  function initSettingsModal() {
    const modal = document.getElementById('settings-modal');
    document.getElementById('btn-close-settings').addEventListener('click', closeSettings);
    modal.addEventListener('click', e => { if (e.target === modal) closeSettings(); });

    // Daily goal input
    const goalInput = document.getElementById('settings-goal');
    if (goalInput) {
      goalInput.value = state.user.dailyGoal;
      goalInput.addEventListener('change', () => {
        const val = parseInt(goalInput.value);
        if (val >= 5 && val <= 100) {
          state.user.dailyGoal = val;
          setState(state);
        }
      });
    }

    // Pro vocabulary toggle
    const proToggle = document.getElementById('toggle-pro');
    if (proToggle) {
      proToggle.classList.toggle('on', state.settings.includeProfessional);
      proToggle.addEventListener('click', () => {
        state.settings.includeProfessional = !state.settings.includeProfessional;
        proToggle.classList.toggle('on', state.settings.includeProfessional);
        setState(state);
      });
    }

    // Case depth toggle
    const caseToggle = document.getElementById('toggle-cases');
    if (caseToggle) {
      caseToggle.classList.toggle('on', state.settings.caseDepth === 'all');
      caseToggle.addEventListener('click', () => {
        state.settings.caseDepth = state.settings.caseDepth === 'all' ? 'nominative' : 'all';
        caseToggle.classList.toggle('on', state.settings.caseDepth === 'all');
        setState(state);
        toast(state.settings.caseDepth === 'all'
          ? 'Alle 4 Fälle aktiv · All 4 cases active'
          : 'Nur Nominativ · Nominative only');
      });
    }
  }

  function openSettings() {
    document.getElementById('settings-modal').classList.remove('hidden');
    // Update level bar in settings
    const level = Utils.getLevel(state.user.xp);
    const prog = Utils.getLevelProgress(state.user.xp);
    const lvlName = document.getElementById('level-name');
    const lvlFill = document.getElementById('level-bar-fill');
    const lvlXP = document.getElementById('level-xp-label');
    if (lvlName) lvlName.textContent = `${level.name} · ${level.nameEn}`;
    if (lvlFill) lvlFill.style.width = (prog * 100) + '%';
    if (lvlXP) lvlXP.textContent = `${state.user.xp} XP`;
  }

  function closeSettings() {
    document.getElementById('settings-modal').classList.add('hidden');
  }

  /* ── Confirm dialog ── */
  function initConfirmDialog() {
    const dialog = document.getElementById('confirm-dialog');
    document.getElementById('btn-confirm-cancel').addEventListener('click', () => dialog.classList.add('hidden'));
    document.getElementById('btn-confirm-ok').addEventListener('click', () => {
      dialog.classList.add('hidden');
      if (dialog._onConfirm) dialog._onConfirm();
    });
  }

  function showConfirm(title, text, onConfirm) {
    const dialog = document.getElementById('confirm-dialog');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-text').textContent = text;
    dialog._onConfirm = onConfirm;
    dialog.classList.remove('hidden');
  }

  /* ── Badge overlay ── */
  function initBadgeOverlay() {
    document.getElementById('btn-badge-close').addEventListener('click', () => {
      document.getElementById('badge-overlay').classList.add('hidden');
    });
  }

  function showBadgeUnlock(badgeId) {
    const badge = Gamification.getBadgeDef(badgeId);
    if (!badge) return;
    const overlay = document.getElementById('badge-overlay');
    document.getElementById('badge-unlock-icon').textContent = badge.icon;
    document.getElementById('badge-unlock-title').textContent = `Abzeichen freigeschaltet! · Badge unlocked!`;
    document.getElementById('badge-unlock-name').textContent = `${badge.name} · ${badge.nameEn}`;
    overlay.classList.remove('hidden');
  }

  /* ── Toast ── */
  let toastTimer = null;
  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
  }

  return {
    init, getState, setState, showScreen, refreshDashboard,
    startPractice, startRulePractice, showConfirm, showBadgeUnlock, toast
  };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
