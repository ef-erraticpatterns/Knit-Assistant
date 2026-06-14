/* ── Notifications & Badge API ── */
const Notifications = (() => {

  function isSupported() {
    return 'Notification' in window;
  }

  async function requestPermission() {
    if (!isSupported()) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }

  async function scheduleReminders(appState) {
    if (!isSupported() || Notification.permission !== 'granted') return;
    const sw = await navigator.serviceWorker.ready;
    const now = new Date();
    const notifTime = appState.user.notificationTime || '12:00';
    const [h, m] = notifTime.split(':').map(Number);

    // Schedule noon reminder if not done
    const noon = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
    const evening = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0, 0);
    const lastCall = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 22, 0, 0);

    const goal = appState.user.dailyGoal;
    const done = appState.today.wordsCompleted;
    if (done >= goal) {
      updateBadge(0);
      return;
    }

    const remaining = goal - done;
    updateBadge(remaining);

    // Schedule via SW message
    if (sw && sw.active) {
      sw.active.postMessage({
        type: 'SCHEDULE_NOTIFICATION',
        reminders: [
          { time: noon.getTime(),    remaining, type: 'noon' },
          { time: evening.getTime(), remaining, type: 'evening' },
          { time: lastCall.getTime(), remaining, type: 'lastcall' }
        ].filter(r => r.time > Date.now())
      });
    }
  }

  function updateBadge(count) {
    if ('setAppBadge' in navigator) {
      if (count > 0) navigator.setAppBadge(count).catch(() => {});
      else           navigator.clearAppBadge().catch(() => {});
    }
  }

  function getIconState(wordsCompleted, dailyGoal) {
    const hour = Utils.getHour();
    const pct = dailyGoal > 0 ? wordsCompleted / dailyGoal : 0;
    if (pct >= 1.0) return 'green';
    if (hour >= 22) return 'red';
    if (hour >= 21) return 'yellow';
    if (hour >= 19 && pct < 0.5) return 'yellow';
    return 'default';
  }

  async function registerPeriodicSync() {
    if (!('periodicSync' in ServiceWorkerRegistration.prototype)) return;
    try {
      const sw = await navigator.serviceWorker.ready;
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (status.state === 'granted') {
        await sw.periodicSync.register('daily-reminder', { minInterval: 3600000 });
      }
    } catch (e) { /* not supported, fallback to on-open scheduling */ }
  }

  function showBanner(appState) {
    const banner = document.getElementById('notif-banner');
    if (!banner) return;
    if (!isSupported()) { banner.classList.add('hidden'); return; }
    if (Notification.permission === 'granted') { banner.classList.add('hidden'); return; }
    if (Notification.permission === 'denied')  { banner.classList.add('hidden'); return; }
    if (appState.user.notifDismissed)           { banner.classList.add('hidden'); return; }
    banner.classList.remove('hidden');
  }

  return { isSupported, requestPermission, scheduleReminders, updateBadge,
           getIconState, registerPeriodicSync, showBanner };
})();
