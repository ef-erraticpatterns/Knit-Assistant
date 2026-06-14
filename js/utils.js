/* ── Utilities ── */
const Utils = (() => {

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function addDays(isoDate, n) {
    const d = new Date(isoDate + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function daysBetween(isoA, isoB) {
    const a = new Date(isoA + 'T12:00:00');
    const b = new Date(isoB + 'T12:00:00');
    return Math.round((b - a) / 86400000);
  }

  function uid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }

  function pct(a, b) { return b === 0 ? 0 : Math.round((a / b) * 100); }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* Compute regular German declension forms algorithmically as fallback */
  function computeGenitiveSuffix(noun, gender) {
    if (gender === 'feminine') return noun; // no ending
    if (noun.endsWith('s') || noun.endsWith('ß') || noun.endsWith('x') || noun.endsWith('z')) return noun + 'es';
    if (noun.length <= 2) return noun + 'es';
    return noun + 's';
  }

  function computeDativePluralSuffix(plural) {
    if (plural.endsWith('n') || plural.endsWith('s')) return plural;
    return plural + 'n';
  }

  function articleForCase(gender, cas) {
    const table = {
      masculine: { nominative:'der', accusative:'den', dative:'dem', genitive:'des' },
      feminine:  { nominative:'die', accusative:'die', dative:'der', genitive:'der' },
      neuter:    { nominative:'das', accusative:'das', dative:'dem', genitive:'des' }
    };
    return (table[gender] || table.neuter)[cas] || '—';
  }

  function pluralArticleForCase(cas) {
    const t = { nominative:'die', accusative:'die', dative:'den', genitive:'der' };
    return t[cas] || 'die';
  }

  /* Expand word to fill missing case data from gender if not explicit */
  function expandWord(w) {
    if (w.cases) return w;
    const g = w.gender || 'neuter';
    const noun = w.noun;
    const pl = w.plural || noun + 'e';
    return {
      ...w,
      cases: {
        nominative: { article: articleForCase(g,'nominative'), form: noun },
        accusative: { article: articleForCase(g,'accusative'), form: noun },
        dative:     { article: articleForCase(g,'dative'),     form: noun },
        genitive:   { article: articleForCase(g,'genitive'),   form: computeGenitiveSuffix(noun, g) }
      },
      pluralCases: {
        nominative: { article: 'die', form: pl },
        accusative: { article: 'die', form: pl },
        dative:     { article: 'den', form: computeDativePluralSuffix(pl) },
        genitive:   { article: 'der', form: pl }
      }
    };
  }

  function formatNumber(n) {
    if (n >= 1000) return (n/1000).toFixed(1).replace(/\.0$/,'') + 'k';
    return String(n);
  }

  function getHour() { return new Date().getHours(); }

  const LEVELS = [
    { min:0,    max:99,   name:'Anfänger',      nameEn:'Beginner' },
    { min:100,  max:299,  name:'Lerner',         nameEn:'Learner' },
    { min:300,  max:599,  name:'Fortgeschritten',nameEn:'Intermediate' },
    { min:600,  max:999,  name:'Geübt',          nameEn:'Practiced' },
    { min:1000, max:1999, name:'Erfahren',        nameEn:'Experienced' },
    { min:2000, max:3999, name:'Kompetent',       nameEn:'Competent' },
    { min:4000, max:7999, name:'Meister',         nameEn:'Master' },
    { min:8000, max:Infinity, name:'Experte',     nameEn:'Expert' }
  ];

  function getLevel(xp) {
    return LEVELS.find(l => xp >= l.min && xp <= l.max) || LEVELS[LEVELS.length-1];
  }

  function getLevelProgress(xp) {
    const lvl = getLevel(xp);
    if (lvl.max === Infinity) return 1;
    const range = lvl.max - lvl.min + 1;
    return (xp - lvl.min) / range;
  }

  function getLevelNext(xp) {
    const lvl = getLevel(xp);
    if (lvl.max === Infinity) return xp;
    return lvl.max + 1;
  }

  return { todayISO, addDays, daysBetween, uid, debounce, clamp, pct, shuffle,
           expandWord, articleForCase, pluralArticleForCase, formatNumber, getHour,
           getLevel, getLevelProgress, getLevelNext, LEVELS };
})();
