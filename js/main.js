// Einstieg: Zustand laden, Router, Audio freischalten.
import { loadState, state } from './engine/state.js';
import { unlockAudio, setMasterVolume } from './audio/context.js';
import { stopAll } from './audio/player.js';
import { viewToday, viewPractice, viewStats, viewSettings } from './ui/views.js';
import { initSync } from './engine/sync.js';

const ROUTES = {
  heute: viewToday,
  ueben: viewPractice,
  statistik: viewStats,
  einstellungen: viewSettings,
};

function route() {
  const name = (location.hash || '#heute').slice(1).split('/')[0];
  const fn = ROUTES[name] || viewToday;
  const app = document.getElementById('app');
  if (app._stop) { try { app._stop(); } catch (e) { console.error(e); } app._stop = null; }
  stopAll();
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + (ROUTES[name] ? name : 'heute')));
  fn(app);
}

async function init() {
  await loadState();
  try { await initSync(); } catch (e) { console.warn('Sync', e); }
  const firstTouch = () => {
    unlockAudio().then(() => { try { setMasterVolume(state.settings.volume ?? 0.8); } catch (e) { /* noch kein Kontext */ } });
  };
  document.addEventListener('pointerdown', firstTouch, { capture: true });
  document.addEventListener('keydown', firstTouch, { capture: true });
  window.addEventListener('hashchange', route);
  // Klick auf den Reiter der laufenden Ansicht führt zu ihrer Startseite zurück (der Hash ändert sich dabei nicht)
  document.querySelectorAll('nav a').forEach((a) => a.addEventListener('click', () => {
    if (a.getAttribute('href') === (location.hash || '#heute')) route();
  }));
  route();
  if ('serviceWorker' in navigator && window.isSecureContext && !new URLSearchParams(location.search).has('nosw')) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then((reg) => { try { reg.update(); } catch (e) { /* offline */ } }).catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // neue Version aktiv: einmal neu laden, damit keine veralteten Dateien aus dem Cache kommen
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
  }
}

init();
