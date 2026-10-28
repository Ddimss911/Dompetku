/* ═══════════════════════════════════════════════════════════
   beranda/beranda.js
   Render Halaman Beranda — saldo, income/expense bulan ini,
   dan 7 transaksi terbaru.
   Bergantung pada: shared/db.js, shared/ui.js
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────
   RENDER BERANDA
   ───────────────────────────────────────────── */

function renderBeranda() {
  // Tanggal header
  const d = new Date();
  document.getElementById('header-date').textContent =
    d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const akunList  = DB.getAkun();
  const saldoMap  = hitungSaldoSemua();
  const transaksi = DB.getTransaksi();

  // Saldo Cash vs Digital
  const cashAkun    = akunList.filter(a => a.tipe === 'biasa' && a.nama.toLowerCase() === 'cash');
  const digitalAkun = akunList.filter(a => a.tipe === 'biasa' && a.nama.toLowerCase() !== 'cash');

  const totalCash    = cashAkun.reduce((s, a)    => s + (saldoMap.get(a.id) ?? 0), 0);
  const totalDigital = digitalAkun.reduce((s, a) => s + (saldoMap.get(a.id) ?? 0), 0);

  document.getElementById('saldo-cash').textContent    = formatRupiah(totalCash);
  document.getElementById('saldo-digital').textContent = formatRupiah(totalDigital);

  // Income & Expense bulan ini
  const now    = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  let totalIncome = 0, totalExpense = 0;
  for (const trx of transaksi) {
    if (prefixBulan(trx.tanggal) !== prefix) continue;
    if (trx.tipe === 'income')  totalIncome  += Number(trx.nominal);
    if (trx.tipe === 'expense') totalExpense += Number(trx.nominal);
  }
  document.getElementById('income-bulan').textContent  = formatRupiah(totalIncome);
  document.getElementById('expense-bulan').textContent = formatRupiah(totalExpense);

  // 7 transaksi terbaru
  const sorted = [...transaksi].sort((a, b) => {
    const dt = new Date(b.tanggal) - new Date(a.tanggal);
    if (dt !== 0) return dt;
    return (b.id > a.id) ? 1 : -1;
  }).slice(0, 7);

  const listEl = document.getElementById('list-transaksi-terbaru');
  if (sorted.length === 0) {
    listEl.innerHTML = emptyState('💸', 'Belum ada transaksi.<br>Tekan tombol + untuk mencatat.');
  } else {
    listEl.innerHTML = sorted.map(trx => renderTrxItem(trx, akunList)).join('');
  }

  // Seed banner
  const isSeed = localStorage.getItem(STORAGE_KEYS.SEED_LOADED) === '1';
  document.getElementById('seed-banner').classList.toggle('hidden', !isSeed);
}

function renderTrxItem(trx, akunList) {
  const akunNama = resolveAkunNama(trx, akunList);
  const tipeClass = trx.tipe;
  const sign      = trx.tipe === 'income' ? '+' : trx.tipe === 'expense' ? '-' : '';
  const amtClass  = trx.tipe;

  return `<div class="trx-item">
    <div class="trx-dot ${tipeClass}"></div>
    <div class="trx-info">
      <div class="trx-judul">${escHtml(trx.judul)}</div>
      <div class="trx-meta">${escHtml(trx.kategori || labelTipe(trx.tipe))} · ${escHtml(akunNama)}</div>
    </div>
    <div class="trx-right">
      <div class="trx-amount ${amtClass}">${sign}${formatRupiah(trx.nominal)}</div>
      <div class="trx-tanggal">${formatTanggal(trx.tanggal)}</div>
    </div>
  </div>`;
}

/** Nama akun untuk tampilan transaksi */
function resolveAkunNama(trx, akunList) {
  const find = (id) => akunList.find(a => a.id === id)?.nama ?? '?';
  if (trx.tipe === 'transfer')  return `${find(trx.akunDari)} → ${find(trx.akunTujuan)}`;
  if (trx.tipe === 'investasi') {
    const src = find(trx.akunId);
    return trx.akunInvestasiId ? `${src} → ${find(trx.akunInvestasiId)}` : src;
  }
  return find(trx.akunId);
}

function labelTipe(tipe) {
  return { expense: 'Pengeluaran', income: 'Pemasukan', transfer: 'Transfer', investasi: 'Investasi' }[tipe] ?? tipe;
}
