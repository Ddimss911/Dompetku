/* ═══════════════════════════════════════════════════════════
   shared/ui.js
   Modal utilities, toast, form error, tema, dan helper
   render generik. Dipakai oleh semua modul halaman.
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────
   MODAL UTILITIES
   ───────────────────────────────────────────── */

function bukaModal(id) {
  document.getElementById(id)?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function tutupModal(id) {
  document.getElementById(id)?.classList.add('hidden');
  document.body.style.overflow = '';
}

/** Konfirmasi dialog generik */
let _konfirmasiCallback = null;
function bukaKonfirmasi(pesan, callback) {
  document.getElementById('konfirmasi-pesan').textContent = pesan;
  _konfirmasiCallback = callback;
  bukaModal('modal-konfirmasi');
}

/* ─────────────────────────────────────────────
   TOAST & FORM ERROR
   ───────────────────────────────────────────── */

let _toastTimer = null;
function showToast(pesan, type = '') {
  const el = document.getElementById('toast');
  el.textContent = pesan;
  el.className   = `toast toast-${type}`;
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

function showFormError(elId, pesan) {
  const el = document.getElementById(elId);
  el.textContent = pesan;
  el.classList.remove('hidden');
}

function clearFormError(elId) {
  const el = document.getElementById(elId);
  if (el) { el.textContent = ''; el.classList.add('hidden'); }
}

/* ─────────────────────────────────────────────
   TEMA GELAP / TERANG
   ───────────────────────────────────────────── */

function toggleTheme() {
  const html   = document.documentElement;
  const isDark = html.dataset.theme === 'dark';
  html.dataset.theme = isDark ? 'light' : 'dark';
  document.querySelectorAll('.theme-icon').forEach(el => {
    el.textContent = isDark ? '🌙' : '☀️';
  });
  localStorage.setItem(STORAGE_KEYS.THEME, html.dataset.theme);
}

function applyStoredTheme() {
  const stored = localStorage.getItem(STORAGE_KEYS.THEME);
  if (stored) {
    document.documentElement.dataset.theme = stored;
    document.querySelectorAll('.theme-icon').forEach(el => {
      el.textContent = stored === 'dark' ? '☀️' : '🌙';
    });
  }
}

/* ─────────────────────────────────────────────
   HELPER RENDER
   ───────────────────────────────────────────── */

function emptyState(icon, msg) {
  return `<div class="empty-state">
    <div class="empty-state-icon">${icon}</div>
    <p>${msg}</p>
  </div>`;
}

/** Escape HTML untuk mencegah XSS */
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
