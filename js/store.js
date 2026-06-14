/* ── Store — localStorage + IndexedDB persistence ── */
const Store = (() => {
  const LS_KEY = 'artikel-trainer';
  const DB_NAME = 'artikel-trainer-words';
  const DB_VERSION = 1;
  let db = null;

  /* ── Default state ── */
  function defaultState() {
    return {
      version: 1,
      user: {
        xp: 0, level: 0,
        totalWordsAnswered: 0, totalCorrect: 0,
        currentStreak: 0, longestStreak: 0,
        lastPracticeDate: null,
        notificationsEnabled: false,
        notifDismissed: false,
        notificationTime: '12:00',
        dailyGoal: 20,
        theme: 'dark'
      },
      today: {
        date: Utils.todayISO(),
        wordsCompleted: 0,
        correctAnswers: 0,
        wrongAnswers: 0,
        xpEarned: 0,
        sessionStarted: false
      },
      streakCalendar: {},
      badges: [],
      settings: {
        practiceMode: 'adaptive',
        caseDepth: 'all',
        includeExtended: false,
        includeProfessional: false,
        professionalDomains: []
      },
      sessionQueue: [],
      customQueue: []
    };
  }

  /* ── localStorage ── */
  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return defaultState();
      const data = JSON.parse(raw);
      // Merge with defaults to handle new fields after updates
      const def = defaultState();
      return deepMerge(def, data);
    } catch (e) {
      console.warn('Store.load error', e);
      return defaultState();
    }
  }

  function save(state) {
    try {
      // Prune calendar to last 91 days
      const cal = state.streakCalendar || {};
      const cutoff = Utils.addDays(Utils.todayISO(), -91);
      for (const k of Object.keys(cal)) {
        if (k < cutoff) delete cal[k];
      }
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Store.save error', e);
    }
  }

  function deepMerge(target, source) {
    const out = { ...target };
    for (const k of Object.keys(source)) {
      if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k])
          && target[k] && typeof target[k] === 'object') {
        out[k] = deepMerge(target[k], source[k]);
      } else {
        out[k] = source[k];
      }
    }
    return out;
  }

  /* ── Date rollover ── */
  function checkDateRollover(state) {
    const today = Utils.todayISO();
    if (state.today.date === today) return state;

    // Save yesterday to calendar
    const yesterday = state.today.date;
    if (yesterday && state.today.wordsCompleted > 0) {
      state.streakCalendar[yesterday] = {
        completed: state.today.wordsCompleted,
        goal: state.user.dailyGoal,
        perfect: state.today.wrongAnswers === 0 && state.today.wordsCompleted >= state.user.dailyGoal
      };
    }

    // Check streak continuity
    if (state.user.lastPracticeDate) {
      const gap = Utils.daysBetween(state.user.lastPracticeDate, today);
      if (gap > 1) {
        // Missed a day - only reset streak if they didn't complete yesterday
        const didYesterday = state.streakCalendar[Utils.addDays(today, -1)];
        if (!didYesterday || didYesterday.completed < state.user.dailyGoal) {
          state.user.currentStreak = 0;
        }
      }
    }

    // Reset today
    state.today = {
      date: today,
      wordsCompleted: 0,
      correctAnswers: 0,
      wrongAnswers: 0,
      xpEarned: 0,
      sessionStarted: false
    };
    state.sessionQueue = [];

    return state;
  }

  /* ── IndexedDB ── */
  function openDB() {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('wordProgress')) {
          d.createObjectStore('wordProgress', { keyPath: 'wordId' });
        }
        if (!d.objectStoreNames.contains('sessions')) {
          const ss = d.createObjectStore('sessions', { keyPath: 'id' });
          ss.createIndex('date', 'date', { unique: false });
        }
      };
      req.onsuccess = e => { db = e.target.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  function defaultWordProgress(wordId) {
    return {
      wordId, timesAnswered: 0, timesCorrect: 0, timesWrong: 0,
      lastSeen: null, nextReviewAt: new Date().toISOString(),
      easeFactor: 2.5, interval: 0,
      errorsByCase: { nominative:0, accusative:0, dative:0, genitive:0 },
      errorsByArticle: { der:0, die:0, das:0 },
      inCustomQueue: false, mastered: false
    };
  }

  async function getWordProgress(wordId) {
    const d = await openDB();
    return new Promise((resolve) => {
      const tx = d.transaction('wordProgress', 'readonly');
      const req = tx.objectStore('wordProgress').get(wordId);
      req.onsuccess = () => resolve(req.result || defaultWordProgress(wordId));
      req.onerror = () => resolve(defaultWordProgress(wordId));
    });
  }

  async function setWordProgress(progress) {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('wordProgress', 'readwrite');
      tx.objectStore('wordProgress').put(progress);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getAllWordProgress() {
    const d = await openDB();
    return new Promise((resolve) => {
      const tx = d.transaction('wordProgress', 'readonly');
      const req = tx.objectStore('wordProgress').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  async function getBulkWordProgress(wordIds) {
    const d = await openDB();
    return new Promise((resolve) => {
      const tx = d.transaction('wordProgress', 'readonly');
      const store = tx.objectStore('wordProgress');
      const results = {};
      let pending = wordIds.length;
      if (pending === 0) { resolve(results); return; }
      wordIds.forEach(id => {
        const req = store.get(id);
        req.onsuccess = () => {
          results[id] = req.result || defaultWordProgress(id);
          if (--pending === 0) resolve(results);
        };
        req.onerror = () => {
          results[id] = defaultWordProgress(id);
          if (--pending === 0) resolve(results);
        };
      });
    });
  }

  async function saveSession(session) {
    const d = await openDB();
    return new Promise((resolve) => {
      const tx = d.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').put(session);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  }

  async function getRecentSessions(n = 30) {
    const d = await openDB();
    return new Promise((resolve) => {
      const tx = d.transaction('sessions', 'readonly');
      const req = tx.objectStore('sessions').getAll();
      req.onsuccess = () => {
        const all = (req.result || []).sort((a,b) => b.startedAt.localeCompare(a.startedAt));
        resolve(all.slice(0, n));
      };
      req.onerror = () => resolve([]);
    });
  }

  async function clearAllWordProgress() {
    const d = await openDB();
    return new Promise((resolve) => {
      const tx = d.transaction(['wordProgress','sessions'], 'readwrite');
      tx.objectStore('wordProgress').clear();
      tx.objectStore('sessions').clear();
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  }

  return {
    load, save, checkDateRollover, openDB,
    getWordProgress, setWordProgress, getAllWordProgress,
    getBulkWordProgress, saveSession, getRecentSessions,
    clearAllWordProgress, defaultWordProgress
  };
})();
