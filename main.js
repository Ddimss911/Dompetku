/* ═══════════════════════════════════════════════════════════
   main.js
   Navigasi, event listeners global, renderAll, dan inisialisasi
   aplikasi. Harus di-load TERAKHIR setelah semua modul lain.
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────
   NAVIGASI & HALAMAN
   ───────────────────────────────────────────── */

let currentPage = 'beranda';

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  moveBubble(page);

  // FAB hanya tampil di Beranda (dan hanya di mobile/tablet)
  const isLaptop = window.matchMedia('(min-width: 1024px)').matches;
  document.getElementById('fab').classList.toggle('hidden', page !== 'beranda' || isLaptop);

  currentPage = page;

  const renders = {
    beranda:   renderBeranda,
    akun:      renderHalamanAkun,
    transaksi: renderHalamanTransaksi,
    summary:   renderHalamanSummary,
  };
  renders[page]?.();
}

/* ─────────────────────────────────────────────
   BUBBLE INDICATOR
   Horizontal on bottom-nav (mobile), vertical on sidebar (laptop)
   ───────────────────────────────────────────── */
function moveBubble(page) {
  const isLaptop = window.matchMedia('(min-width: 1024px)').matches;

  if (isLaptop) {
    // ── Sidebar: move vertically using real DOM measurements ──
    // Double rAF: first frame commits .active class, second reads stable layout rects
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const sidebarBubble  = document.getElementById('sidebar-bubble');
      const itemsContainer = document.querySelector('.sidebar-items-container');
      const activeItem     = document.querySelector('#sidebar-items-wrapper .nav-item.active');
      if (sidebarBubble && itemsContainer && activeItem) {
        const containerTop = itemsContainer.getBoundingClientRect().top;
        const itemRect     = activeItem.getBoundingClientRect();
        const newTop       = itemRect.top - containerTop;
        const newHeight    = itemRect.height;
        sidebarBubble.style.top    = `${newTop}px`;
        sidebarBubble.style.height = `${newHeight}px`;
      }
    }));
  } else {
    // ── Bottom nav: move horizontally (original behaviour) ──
    const pages = ['beranda', 'akun', 'transaksi', 'summary'];
    const idx   = pages.indexOf(page);
    const wrapper = document.getElementById('nav-items-wrapper');
    if (!wrapper) return;
    const bubble    = document.getElementById('nav-bubble');
    if (!bubble) return;
    const itemWidth = wrapper.offsetWidth / 4;
    const bubbleW   = 56;
    bubble.style.left = `${idx * itemWidth + (itemWidth - bubbleW) / 2}px`;
  }
}

/* ─────────────────────────────────────────────
   RENDER ALL (dipanggil setelah mutasi data)
   ───────────────────────────────────────────── */

function renderAll() {
  if (currentPage === 'beranda')   renderBeranda();
  if (currentPage === 'akun')      renderHalamanAkun();
  if (currentPage === 'transaksi') renderHalamanTransaksi();
  if (currentPage === 'summary')   renderHalamanSummary();
}

/* ─────────────────────────────────────────────
   EVENT LISTENERS
   ───────────────────────────────────────────── */

function initEventListeners() {
  // ── Navigasi (both bottom-nav and sidebar) ──
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  // ── Sidebar theme toggle (toggleTheme already syncs all .theme-icon) ──
  document.getElementById('btn-toggle-theme-sidebar')?.addEventListener('click', toggleTheme);

  // ── FAB: buka modal transaksi ──
  document.getElementById('fab')?.addEventListener('click', () => bukaModalTransaksi());

  // ── Form Transaksi ──
  document.getElementById('form-transaksi')?.addEventListener('submit', simpanTransaksi);

  // ── Type tabs ──
  document.getElementById('tipe-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.type-tab');
    if (!btn) return;
    const tipe = btn.dataset.tipe;
    document.getElementById('trx-tipe').value = tipe;
    document.querySelectorAll('.type-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updateFormFields(tipe);
    clearFormError('form-error');
  });

  // ── Form Akun ──
  document.getElementById('btn-tambah-akun')?.addEventListener('click', bukaModalAkun);
  document.getElementById('form-akun')?.addEventListener('submit', simpanAkun);

  // ── Tombol tutup modal ──
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => tutupModal(btn.dataset.close));
  });

  // ── Klik di luar modal sheet untuk tutup ──
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) tutupModal(overlay.id);
    });
  });

  // ── Konfirmasi dialog ──
  document.getElementById('btn-konfirmasi-ok')?.addEventListener('click', () => {
    _konfirmasiCallback?.();
    tutupModal('modal-konfirmasi');
  });
  document.getElementById('btn-konfirmasi-batal')?.addEventListener('click', () => {
    tutupModal('modal-konfirmasi');
  });

  // ── Toggle tema ──
  document.getElementById('btn-toggle-theme')?.addEventListener('click', toggleTheme);

  // ── Hapus data contoh ──
  document.getElementById('btn-hapus-seed')?.addEventListener('click', hapusSeedData);

  // ── Tombol kembali halaman transaksi ──
  document.getElementById('btn-back-months')?.addEventListener('click', kembaliKeMonthGrid);

  // ── Export CSV ──
  document.getElementById('btn-export-csv')?.addEventListener('click', exportCSV);

  // ── Tombol kembali halaman summary ──
  document.getElementById('btn-back-summary')?.addEventListener('click', kembaliKeSummaryGrid);

  // ── Buat ulang AI summary ──
  document.getElementById('btn-regenerate-ai')?.addEventListener('click', () => {
    if (!selectedBulanSummary) return;
    const transaksi = DB.getTransaksi().filter(t => prefixBulan(t.tanggal) === selectedBulanSummary);
    let totalIncome = 0, totalExpense = 0;
    const perKatExpense = {}, perKatIncome = {};
    for (const trx of transaksi) {
      if (trx.tipe === 'income')  { totalIncome  += Number(trx.nominal); perKatIncome[trx.kategori  || 'Lain-lain'] = (perKatIncome[trx.kategori  || 'Lain-lain'] ?? 0) + Number(trx.nominal); }
      if (trx.tipe === 'expense') { totalExpense += Number(trx.nominal); perKatExpense[trx.kategori || 'Lain-lain'] = (perKatExpense[trx.kategori || 'Lain-lain'] ?? 0) + Number(trx.nominal); }
    }
    renderAISummary(selectedBulanSummary, { totalIncome, totalExpense, net: totalIncome - totalExpense, perKatExpense, perKatIncome }, true);
  });

  // ── Keyboard ESC tutup modal ──
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      ['modal-transaksi', 'modal-akun', 'modal-konfirmasi'].forEach(tutupModal);
    }
  });

  // ── Resize: update bubble position (also handles sidebar ↔ bottom-nav switch) ──
  window.addEventListener('resize', () => moveBubble(currentPage));
}

/* ─────────────────────────────────────────────
   INISIALISASI APP
   ───────────────────────────────────────────── */

function init() {
  applyStoredTheme();

  const hasAkun    = DB.getAkun().length > 0;
  const hasTrx     = DB.getTransaksi().length > 0;
  const seedLoaded = localStorage.getItem(STORAGE_KEYS.SEED_LOADED);

  if (!hasAkun && !hasTrx && !seedLoaded) {
    loadSeedData();
  } else if (!hasAkun) {
    initAkunDefault();
  }

  initEventListeners();

  navigateTo('beranda');

  requestAnimationFrame(() => requestAnimationFrame(() => moveBubble('beranda')));
}

// Jalankan saat DOM siap
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
