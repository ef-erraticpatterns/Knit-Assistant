/* ── Gamification — XP, streaks, badges ── */
const Gamification = (() => {

  const BADGES = [
    { id:'first-word',   icon:'🎯', name:'Erster Schritt',    nameEn:'First Step',       desc:'Answer your first word correctly.',       check: s => s.user.totalCorrect >= 1 },
    { id:'streak-3',     icon:'🔥', name:'3 Tage in Folge',   nameEn:'3-Day Streak',     desc:'Keep a 3-day practice streak.',           check: s => s.user.currentStreak >= 3 },
    { id:'streak-7',     icon:'🔥', name:'Eine Woche!',        nameEn:'One Week!',        desc:'Keep a 7-day practice streak.',           check: s => s.user.currentStreak >= 7 },
    { id:'streak-14',    icon:'⚡', name:'Zwei Wochen!',        nameEn:'Two Weeks!',       desc:'Keep a 14-day practice streak.',          check: s => s.user.currentStreak >= 14 },
    { id:'streak-30',    icon:'🌟', name:'Ein Monat!',          nameEn:'One Month!',       desc:'Keep a 30-day practice streak.',          check: s => s.user.currentStreak >= 30 },
    { id:'streak-100',   icon:'💎', name:'100 Tage!',           nameEn:'100 Days!',        desc:'Keep a 100-day practice streak.',         check: s => s.user.currentStreak >= 100 },
    { id:'words-100',    icon:'📚', name:'100 Wörter',          nameEn:'100 Words',        desc:'Answer 100 words total.',                  check: s => s.user.totalWordsAnswered >= 100 },
    { id:'words-500',    icon:'📖', name:'500 Wörter',          nameEn:'500 Words',        desc:'Answer 500 words total.',                  check: s => s.user.totalWordsAnswered >= 500 },
    { id:'words-1000',   icon:'🏆', name:'1000 Wörter',         nameEn:'1000 Words',       desc:'Answer 1000 words total.',                 check: s => s.user.totalWordsAnswered >= 1000 },
    { id:'perfect-day',  icon:'⭐', name:'Perfekter Tag',       nameEn:'Perfect Day',      desc:'Complete a session with zero mistakes.',   check: (s,session) => session && session.wrong === 0 && session.correct >= 10 },
    { id:'perfect-5',    icon:'✨', name:'5 Perfekte Tage',     nameEn:'5 Perfect Days',   desc:'Earn 5 perfect-day badges.',               check: s => (s.badges||[]).filter(b=>b.id==='perfect-day').length >= 5 },
    { id:'speed-demon',  icon:'⚡', name:'Blitzschnell',         nameEn:'Lightning Fast',   desc:'Answer 5 words under 2 seconds in a row.', check: (s,session) => session && session.speedStreak >= 5 },
    { id:'level-3',      icon:'🎓', name:'Fortgeschritten',     nameEn:'Intermediate',     desc:'Reach the Fortgeschritten level.',         check: s => s.user.xp >= 300 },
    { id:'level-5',      icon:'🎓', name:'Erfahren',            nameEn:'Experienced',      desc:'Reach the Erfahren level.',               check: s => s.user.xp >= 1000 },
    { id:'accuracy-80',  icon:'🎯', name:'Treffsicher',         nameEn:'Sharp Shooter',    desc:'Reach 80%+ total accuracy with 50+ words.', check: s => s.user.totalWordsAnswered >= 50 && Utils.pct(s.user.totalCorrect, s.user.totalWordsAnswered) >= 80 }
  ];

  function calcXP(wasCorrect, responseMs, streakDays, isFirstTry) {
    if (!wasCorrect) return 0;
    let base = isFirstTry ? 10 : 5;
    if (responseMs < 2000) base += 2;
    const multiplier = Math.min(1 + streakDays * 0.05, 2.0);
    return Math.round(base * multiplier);
  }

  function checkBadges(state, session = null) {
    const earned = (state.badges || []).map(b => b.id);
    const newBadges = [];
    for (const badge of BADGES) {
      if (earned.includes(badge.id)) continue;
      try {
        if (badge.check(state, session)) {
          newBadges.push({ id: badge.id, unlockedAt: new Date().toISOString() });
        }
      } catch(e) { /* ignore */ }
    }
    return newBadges;
  }

  function getBadgeDef(id) { return BADGES.find(b => b.id === id); }
  function getAllBadges() { return BADGES; }

  function updateStreak(state) {
    const today = Utils.todayISO();
    const last = state.user.lastPracticeDate;
    if (!last) {
      state.user.currentStreak = 1;
    } else if (last === today) {
      // Already counted today
    } else if (Utils.daysBetween(last, today) === 1) {
      state.user.currentStreak += 1;
    } else {
      state.user.currentStreak = 1;
    }
    state.user.lastPracticeDate = today;
    state.user.longestStreak = Math.max(state.user.longestStreak, state.user.currentStreak);
    return state;
  }

  const ENCOURAGEMENTS_DE = [
    'Du schaffst das! 💪', 'Weiter so!', 'Jeden Tag ein bisschen besser!',
    'Artikel meistern dauert seine Zeit — du bist auf dem richtigen Weg!',
    'Grammatik ist kein Sprint, sondern ein Marathon.', 'Sehr gut!',
    'Dein Deutsch wird jeden Tag besser!', 'Toll gemacht!',
    'Bleib dran — du merkst den Unterschied!', 'Jeden Tag zählt!'
  ];
  const ENCOURAGEMENTS_EN = [
    'You can do it! 💪', 'Keep going!', 'Getting a little better every day!',
    'Mastering articles takes time — you\'re on the right path!',
    'Grammar is a marathon, not a sprint.', 'Very good!',
    'Your German improves every day!', 'Well done!',
    'Stick with it — you\'ll feel the difference!', 'Every day counts!'
  ];

  function randomEncouragement() {
    const i = Math.floor(Math.random() * ENCOURAGEMENTS_DE.length);
    return `${ENCOURAGEMENTS_DE[i]}\n${ENCOURAGEMENTS_EN[i]}`;
  }

  const LEVEL_NAMES = Utils.LEVELS.map(l => l.name);

  return { calcXP, checkBadges, getBadgeDef, getAllBadges, updateStreak,
           randomEncouragement, BADGES };
})();
