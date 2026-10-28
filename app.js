/* ═══════════════════════════════════════════════════════════
   DOMPETKU — app.js
   Vanilla JS, localStorage, no framework.
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────
   SECTION 1: KONSTANTA & DATA KONFIGURASI
   ───────────────────────────────────────────── */

const STORAGE_KEYS = {
  AKUN:       'dompetku_akun',
  TRANSAKSI:  'dompetku_transaksi',
  SUMMARY_AI: 'dompetku_summary_ai',
  THEME:      'dompetku_theme',
  SEED_LOADED:'dompetku_seed_loaded',
};

const KATEGORI_EXPENSE = [
  'Makanan & Minuman', 'Transportasi', 'Belanja', 'Hiburan',
  'Kesehatan', 'Pendidikan', 'Tagihan & Utilitas', 'Perawatan Diri',
  'Sosial & Hadiah', 'Lain-lain',
];

const KATEGORI_INCOME = [
  'Gaji', 'Freelance', 'Bisnis', 'Investasi', 'Hadiah',
  'Bonus', 'Cashback', 'Lain-lain',
];

const BULAN_NAMA = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember',
];

const WARNA_CHART = [
  '#0A7C6E','#F59E0B','#6366F1','#EC4899','#14B8A6',
  '#F97316','#8B5CF6','#22C55E','#EF4444','#3B82F6',
];

/* ─────────────────────────────────────────────
   SECTION 2: UTILITAS
   ───────────────────────────────────────────── */

/** Format angka ke Rupiah: Rp 1.500.000 */
const formatRupiah = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

/** Format tanggal ISO ke dd/mm/yyyy */
const formatTanggal = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

/** Tanggal hari ini dalam format yyyy-mm-dd */
const hariIni = () => new Date().toISOString().slice(0, 10);

/** Generate UUID sederhana */
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/** yyyy-mm -> "Januari 2024" */
const labelBulan = (yyyymm) => {
  const [y, m] = yyyymm.split('-');
  return `${BULAN_NAMA[parseInt(m, 10) - 1]} ${y}`;
};

/** Ambil prefix bulan dari tanggal ISO: "2024-06" */
const prefixBulan = (iso) => iso?.slice(0, 7) ?? '';

/* ─────────────────────────────────────────────
   SECTION 3: LAPISAN DATA (LOCALSTORAGE)
   ───────────────────────────────────────────── */

const DB = {
  /** Baca data dari localStorage dengan fallback ke default */
  _get(key, defaultVal) {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : defaultVal;
    } catch (e) {
      console.error('[DB._get]', key, e);
      return defaultVal;
    }
  },
  /** Simpan data ke localStorage */
  _set(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.error('[DB._set]', key, e);
      showToast('Gagal menyimpan data ke localStorage.', 'error');
    }
  },

  getAkun()          { return this._get(STORAGE_KEYS.AKUN, []); },
  setAkun(d)         { this._set(STORAGE_KEYS.AKUN, d); },
  getTransaksi()     { return this._get(STORAGE_KEYS.TRANSAKSI, []); },
  setTransaksi(d)    { this._set(STORAGE_KEYS.TRANSAKSI, d); },
  getSummaryAI(key)  { return this._get(STORAGE_KEYS.SUMMARY_AI, {})[key] ?? null; },
  setSummaryAI(key, val) {
    const all = this._get(STORAGE_KEYS.SUMMARY_AI, {});
    all[key] = val;
    this._set(STORAGE_KEYS.SUMMARY_AI, all);
  },
};

/* ─────────────────────────────────────────────
   SECTION 4: LOGIKA SALDO AKUN
   Saldo = saldo_awal + Σ efek semua transaksi
   ─────────────────────────────────────────────
   Prinsip: saldo tidak pernah diubah langsung.
   Selalu dihitung ulang dari transaksi. */

/**
 * Hitung saldo semua akun dari transaksi yang tersimpan.
 * Mengembalikan Map<akunId, saldo>.
 */
function hitungSaldoSemua() {
  const akunList = DB.getAkun();
  const transaksiList = DB.getTransaksi();

  // Mulai dari saldo awal masing-masing akun
  const saldoMap = new Map(akunList.map(a => [a.id, a.saldoAwal]));

  for (const trx of transaksiList) {
    const nominal = Number(trx.nominal);
    switch (trx.tipe) {
      case 'expense':
        saldoMap.set(trx.akunId, (saldoMap.get(trx.akunId) ?? 0) - nominal);
        break;
      case 'income':
        saldoMap.set(trx.akunId, (saldoMap.get(trx.akunId) ?? 0) + nominal);
        break;
      case 'transfer':
        saldoMap.set(trx.akunDari,   (saldoMap.get(trx.akunDari)   ?? 0) - nominal);
        saldoMap.set(trx.akunTujuan, (saldoMap.get(trx.akunTujuan) ?? 0) + nominal);
        break;
      case 'investasi':
        saldoMap.set(trx.akunId, (saldoMap.get(trx.akunId) ?? 0) - nominal);
        if (trx.akunInvestasiId) {
          saldoMap.set(trx.akunInvestasiId, (saldoMap.get(trx.akunInvestasiId) ?? 0) + nominal);
        }
        break;
    }
  }
  return saldoMap;
}

/** Kembalikan saldo satu akun berdasarkan id */
function getSaldo(akunId) {
  return hitungSaldoSemua().get(akunId) ?? 0;
}

/* ─────────────────────────────────────────────
   SECTION 5: DATA SEED (CONTOH)
   ───────────────────────────────────────────── */

function loadSeedData() {
  const akunSeed = [
    { id: 'akun-cash',  nama: 'Cash',  tipe: 'biasa',    saldoAwal: 500000  },
    { id: 'akun-bca',   nama: 'BCA',   tipe: 'biasa',    saldoAwal: 3000000 },
    { id: 'akun-gopay', nama: 'GoPay', tipe: 'biasa',    saldoAwal: 200000  },
    { id: 'akun-saham', nama: 'Saham', tipe: 'investasi', saldoAwal: 0      },
  ];

  const today = hariIni();
  const [y, m] = today.split('-');
  const prevMonth = m === '01'
    ? `${parseInt(y)-1}-12`
    : `${y}-${String(parseInt(m)-1).padStart(2,'0')}`;

  const transaksiSeed = [
    // Bulan berjalan
    { id: uid(), tipe: 'income',   judul: 'Gaji Bulanan',       keterangan: 'Gaji Mei', nominal: 5000000, tanggal: `${y}-${m}-01`, akunId: 'akun-bca',   kategori: 'Gaji' },
    { id: uid(), tipe: 'expense',  judul: 'Makan Siang',        keterangan: 'Warteg',   nominal: 25000,   tanggal: `${y}-${m}-02`, akunId: 'akun-cash',  kategori: 'Makanan & Minuman' },
    { id: uid(), tipe: 'expense',  judul: 'Transportasi Online',keterangan: 'Gojek',    nominal: 18000,   tanggal: `${y}-${m}-03`, akunId: 'akun-gopay', kategori: 'Transportasi' },
    { id: uid(), tipe: 'transfer', judul: 'Top-up GoPay',       keterangan: '',         nominal: 100000,  tanggal: `${y}-${m}-04`, akunDari: 'akun-bca', akunTujuan: 'akun-gopay' },
    { id: uid(), tipe: 'expense',  judul: 'Belanja Bulanan',    keterangan: 'Indomaret', nominal: 250000, tanggal: `${y}-${m}-05`, akunId: 'akun-bca',   kategori: 'Belanja' },
    { id: uid(), tipe: 'investasi',judul: 'Beli Saham BBCA',    keterangan: '10 lot',   nominal: 500000,  tanggal: `${y}-${m}-06`, akunId: 'akun-bca',   akunInvestasiId: 'akun-saham' },
    { id: uid(), tipe: 'expense',  judul: 'Netflix',            keterangan: 'Langganan', nominal: 54000,  tanggal: `${y}-${m}-07`, akunId: 'akun-bca',   kategori: 'Hiburan' },
    { id: uid(), tipe: 'income',   judul: 'Freelance Design',   keterangan: 'Klien A',  nominal: 750000,  tanggal: `${y}-${m}-10`, akunId: 'akun-bca',   kategori: 'Freelance' },
    // Bulan lalu
    { id: uid(), tipe: 'income',   judul: 'Gaji Bulanan',       keterangan: '',         nominal: 5000000, tanggal: `${prevMonth}-01`, akunId: 'akun-bca',   kategori: 'Gaji' },
    { id: uid(), tipe: 'expense',  judul: 'Kos Bulanan',        keterangan: '',         nominal: 1200000, tanggal: `${prevMonth}-03`, akunId: 'akun-bca',   kategori: 'Tagihan & Utilitas' },
    { id: uid(), tipe: 'expense',  judul: 'Makan',              keterangan: '',         nominal: 400000,  tanggal: `${prevMonth}-15`, akunId: 'akun-cash',  kategori: 'Makanan & Minuman' },
  ];

  DB.setAkun(akunSeed);
  DB.setTransaksi(transaksiSeed);
  localStorage.setItem(STORAGE_KEYS.SEED_LOADED, '1');
}

function hapusSeedData() {
  DB.setAkun([]);
  DB.setTransaksi([]);
  localStorage.removeItem(STORAGE_KEYS.SEED_LOADED);
  // Inisialisasi ulang dengan akun bawaan
  initAkunDefault();
  renderAll();
  showToast('Data contoh berhasil dihapus.', 'success');
}

/** Akun bawaan jika belum ada data sama sekali */
function initAkunDefault() {
  if (DB.getAkun().length === 0) {
    DB.setAkun([
      { id: uid(), nama: 'Cash',  tipe: 'biasa', saldoAwal: 0 },
      { id: uid(), nama: 'BCA',   tipe: 'biasa', saldoAwal: 0 },
      { id: uid(), nama: 'GoPay', tipe: 'biasa', saldoAwal: 0 },
    ]);
  }
}

/* ─────────────────────────────────────────────
   SECTION 6: NAVIGASI & HALAMAN
   ───────────────────────────────────────────── */

let currentPage = 'beranda';

function navigateTo(page) {
  // Sembunyikan semua halaman
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  // Tampilkan halaman target
  document.getElementById(`page-${page}`)?.classList.add('active');

  // Update nav items
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  // Geser bubble
  moveBubble(page);

  // FAB hanya tampil di Beranda
  document.getElementById('fab').classList.toggle('hidden', page !== 'beranda');

  currentPage = page;

  // Render ulang halaman yang dituju
  const renders = {
    beranda:   renderBeranda,
    akun:      renderHalamanAkun,
    transaksi: renderHalamanTransaksi,
    summary:   renderHalamanSummary,
  };
  renders[page]?.();
}

function moveBubble(page) {
  const pages = ['beranda', 'akun', 'transaksi', 'summary'];
  const idx = pages.indexOf(page);
  const nav = document.querySelector('.bottom-nav');
  if (!nav) return;
  const navWidth = nav.offsetWidth;
  const itemWidth = navWidth / 4;
  const bubble = document.getElementById('nav-bubble');
  if (!bubble) return;
  bubble.style.left = `${idx * itemWidth + (itemWidth - 60) / 2}px`;
}

/* ─────────────────────────────────────────────
   SECTION 7: RENDER BERANDA
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
    return (b.id > a.id) ? 1 : -1; // secondary sort by id (timestamp)
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

/* ─────────────────────────────────────────────
   SECTION 8: RENDER HALAMAN AKUN
   ───────────────────────────────────────────── */

function renderHalamanAkun() {
  const akunList = DB.getAkun();
  const saldoMap = hitungSaldoSemua();
  const transaksi = DB.getTransaksi();

  const biasa     = akunList.filter(a => a.tipe === 'biasa');
  const investasi = akunList.filter(a => a.tipe === 'investasi');

  document.getElementById('list-akun-biasa').innerHTML =
    biasa.length === 0
      ? emptyState('💰', 'Belum ada akun biasa.')
      : biasa.map(a => renderAkunItem(a, saldoMap, transaksi)).join('');

  document.getElementById('list-akun-investasi').innerHTML =
    investasi.length === 0
      ? emptyState('📈', 'Belum ada akun investasi.')
      : investasi.map(a => renderAkunItem(a, saldoMap, transaksi)).join('');
}

function renderAkunItem(akun, saldoMap, transaksi) {
  const saldo = saldoMap.get(akun.id) ?? 0;
  return `<div class="akun-item">
    <div class="akun-info">
      <div class="akun-nama">${escHtml(akun.nama)}</div>
      <div class="akun-tipe-label">${akun.tipe === 'biasa' ? 'Akun Biasa' : 'Investasi'}</div>
    </div>
    <div style="display:flex;align-items:center;gap:6px">
      <div class="akun-saldo">${formatRupiah(saldo)}</div>
      <div class="akun-actions">
        <button class="btn-icon-sm" onclick="bukaEditAkun('${akun.id}')" title="Edit">✏️</button>
        <button class="btn-icon-sm" onclick="konfirmasiHapusAkun('${akun.id}')" title="Hapus">🗑️</button>
      </div>
    </div>
  </div>`;
}

/* ─────────────────────────────────────────────
   SECTION 9: RENDER HALAMAN TRANSAKSI BULANAN
   ───────────────────────────────────────────── */

let selectedBulanTransaksi = null;

function renderHalamanTransaksi() {
  const tahun = new Date().getFullYear();
  document.getElementById('transaksi-tahun').textContent = tahun;

  const grid = document.getElementById('month-grid');
  const transaksi = DB.getTransaksi();

  grid.innerHTML = BULAN_NAMA.map((nama, i) => {
    const mm = String(i + 1).padStart(2, '0');
    const key = `${tahun}-${mm}`;
    const hasData = transaksi.some(t => prefixBulan(t.tanggal) === key);
    const isActive = selectedBulanTransaksi === key;
    return `<button class="month-btn ${hasData ? 'has-data' : ''} ${isActive ? 'active' : ''}"
      onclick="tampilTransaksiBulan('${key}')">${nama}</button>`;
  }).join('');

  // Jika sudah ada bulan dipilih, render tabelnya juga
  if (selectedBulanTransaksi) {
    renderTabelTransaksi(selectedBulanTransaksi);
    document.getElementById('transaksi-detail').classList.remove('hidden');
    document.getElementById('month-grid').classList.add('hidden');
  } else {
    document.getElementById('transaksi-detail').classList.add('hidden');
    document.getElementById('month-grid').classList.remove('hidden');
  }
}

function tampilTransaksiBulan(key) {
  selectedBulanTransaksi = key;
  document.getElementById('month-grid').classList.add('hidden');
  document.getElementById('transaksi-detail').classList.remove('hidden');
  document.getElementById('transaksi-bulan-title').textContent = labelBulan(key);
  renderTabelTransaksi(key);
}

function kembaliKeMonthGrid() {
  selectedBulanTransaksi = null;
  document.getElementById('transaksi-detail').classList.add('hidden');
  document.getElementById('month-grid').classList.remove('hidden');
  renderHalamanTransaksi();
}

function renderTabelTransaksi(key) {
  const akunList  = DB.getAkun();
  const transaksi = DB.getTransaksi().filter(t => prefixBulan(t.tanggal) === key);
  const sorted    = [...transaksi].sort((a, b) => a.tanggal.localeCompare(b.tanggal));

  const tbody = document.getElementById('tbody-transaksi');
  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">
      Tidak ada transaksi di bulan ini.</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map(trx => {
    const akunNama = resolveAkunNama(trx, akunList);
    const sign     = trx.tipe === 'income' ? '+' : trx.tipe === 'expense' ? '-' : '';
    const color    = trx.tipe === 'income' ? 'var(--income)' : trx.tipe === 'expense' ? 'var(--expense)' : 'var(--transfer)';
    return `<tr>
      <td>${formatTanggal(trx.tanggal)}</td>
      <td>${escHtml(trx.judul)}</td>
      <td>${escHtml(trx.keterangan || '—')}</td>
      <td><span class="tipe-badge ${trx.tipe}">${labelTipe(trx.tipe)}</span></td>
      <td>${escHtml(trx.kategori || '—')}</td>
      <td>${escHtml(akunNama)}</td>
      <td style="color:${color};font-weight:700;white-space:nowrap">${sign}${formatRupiah(trx.nominal)}</td>
      <td>
        <button class="btn-icon-sm" onclick="bukaEditTransaksi('${trx.id}')" title="Edit">✏️</button>
        <button class="btn-icon-sm" onclick="konfirmasiHapusTransaksi('${trx.id}')" title="Hapus">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

/** Export CSV bulan terpilih */
function exportCSV() {
  if (!selectedBulanTransaksi) return;
  const akunList  = DB.getAkun();
  const transaksi = DB.getTransaksi()
    .filter(t => prefixBulan(t.tanggal) === selectedBulanTransaksi)
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal));

  const header = ['Tanggal','Judul','Keterangan','Tipe','Kategori','Akun','Nominal'];
  const rows   = transaksi.map(trx => [
    formatTanggal(trx.tanggal),
    trx.judul,
    trx.keterangan || '',
    labelTipe(trx.tipe),
    trx.kategori || '',
    resolveAkunNama(trx, akunList),
    trx.nominal,
  ]);

  const csv = [header, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `dompetku-${selectedBulanTransaksi}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─────────────────────────────────────────────
   SECTION 10: RENDER HALAMAN SUMMARY
   ───────────────────────────────────────────── */

let selectedBulanSummary = null;
let chartExpenseInstance = null;
let chartIncomeInstance  = null;

function renderHalamanSummary() {
  const tahun = new Date().getFullYear();
  document.getElementById('summary-tahun').textContent = tahun;

  const transaksi = DB.getTransaksi();
  const grid = document.getElementById('summary-month-grid');

  grid.innerHTML = BULAN_NAMA.map((nama, i) => {
    const mm  = String(i + 1).padStart(2, '0');
    const key = `${tahun}-${mm}`;
    const hasData = transaksi.some(t => prefixBulan(t.tanggal) === key && (t.tipe === 'income' || t.tipe === 'expense'));
    const isActive = selectedBulanSummary === key;
    return `<button class="month-btn ${hasData ? 'has-data' : ''} ${isActive ? 'active' : ''}"
      onclick="tampilSummaryBulan('${key}')">${nama}</button>`;
  }).join('');

  if (selectedBulanSummary) {
    renderDetailSummary(selectedBulanSummary);
    document.getElementById('summary-detail').classList.remove('hidden');
    document.getElementById('summary-month-grid').classList.add('hidden');
  } else {
    document.getElementById('summary-detail').classList.add('hidden');
    document.getElementById('summary-month-grid').classList.remove('hidden');
  }
}

function tampilSummaryBulan(key) {
  selectedBulanSummary = key;
  document.getElementById('summary-month-grid').classList.add('hidden');
  document.getElementById('summary-detail').classList.remove('hidden');
  document.getElementById('summary-bulan-title').textContent = labelBulan(key);
  renderDetailSummary(key);
}

function kembaliKeSummaryGrid() {
  // Hancurkan chart SEBELUM selectedBulanSummary di-reset agar tidak re-render lagi
  destroyCharts();
  selectedBulanSummary = null;
  document.getElementById('summary-detail').classList.add('hidden');
  document.getElementById('summary-month-grid').classList.remove('hidden');
  renderHalamanSummary();
}

function renderDetailSummary(key) {
  const transaksi = DB.getTransaksi().filter(t => prefixBulan(t.tanggal) === key);

  // Totals (transfer tidak dihitung)
  let totalIncome = 0, totalExpense = 0;
  const perKatExpense = {};
  const perKatIncome  = {};

  for (const trx of transaksi) {
    if (trx.tipe === 'income') {
      totalIncome += Number(trx.nominal);
      const kat = trx.kategori || 'Lain-lain';
      perKatIncome[kat] = (perKatIncome[kat] ?? 0) + Number(trx.nominal);
    }
    if (trx.tipe === 'expense') {
      totalExpense += Number(trx.nominal);
      const kat = trx.kategori || 'Lain-lain';
      perKatExpense[kat] = (perKatExpense[kat] ?? 0) + Number(trx.nominal);
    }
  }

  const net = totalIncome - totalExpense;

  document.getElementById('summary-total-income').textContent  = formatRupiah(totalIncome);
  document.getElementById('summary-total-expense').textContent = formatRupiah(totalExpense);
  const netEl = document.getElementById('summary-net-cashflow');
  netEl.textContent = formatRupiah(net);
  netEl.className   = `card-amount ${net >= 0 ? 'income' : 'expense'}`;

  // Charts
  destroyCharts();
  renderDonutChart('chart-expense', 'legend-expense', perKatExpense, totalExpense);
  renderDonutChart('chart-income',  'legend-income',  perKatIncome,  totalIncome);

  // AI Summary
  renderAISummary(key, { totalIncome, totalExpense, net, perKatExpense, perKatIncome });
}

function renderDonutChart(canvasId, legendId, dataMap, total) {
  const canvas = document.getElementById(canvasId);
  const legend = document.getElementById(legendId);

  const labels = Object.keys(dataMap);
  const values = Object.values(dataMap);

  if (labels.length === 0) {
    canvas.parentElement.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:0.8rem;padding:24px 0">Tidak ada data</p>';
    legend.innerHTML = '';
    return;
  }

  const colors = labels.map((_, i) => WARNA_CHART[i % WARNA_CHART.length]);

  const chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: 'var(--surface)' }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
              return ` ${formatRupiah(ctx.raw)} (${pct}%)`;
            },
          },
        },
      },
    },
  });

  if (canvasId === 'chart-expense') chartExpenseInstance = chart;
  else chartIncomeInstance = chart;

  // Render legend manual dengan persentase
  legend.innerHTML = labels.map((lbl, i) => {
    const pct = total > 0 ? ((values[i] / total) * 100).toFixed(1) : 0;
    return `<div class="legend-item">
      <div class="legend-dot" style="background:${colors[i]}"></div>
      <span>${escHtml(lbl)}: ${pct}%</span>
    </div>`;
  }).join('');
}

function destroyCharts() {
  if (chartExpenseInstance) { chartExpenseInstance.destroy(); chartExpenseInstance = null; }
  if (chartIncomeInstance)  { chartIncomeInstance.destroy();  chartIncomeInstance = null; }
}

/* ─────────────────────────────────────────────
   SECTION 11: AI SUMMARY (MOCK)
   ─────────────────────────────────────────────
   Fungsi ini sengaja dipisah agar mudah diganti
   dengan panggilan backend nyata nanti.
   Data yang dikirim: hanya rekap agregat, BUKAN
   data mentah transaksi. API Key tidak boleh
   ada di kode frontend.

   Untuk sambungkan ke backend:
     1. Hapus isi fungsi generateAISummary()
     2. Ganti dengan: fetch('/api/ai-summary', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(rekapBulanan)
        }).then(r => r.json()).then(d => d.teks)
     3. Backend-lah yang menyimpan & menggunakan API Key.
   ───────────────────────────────────────────── */

/**
 * @param {object} rekapBulanan - { totalIncome, totalExpense, net, perKatExpense, perKatIncome }
 * @returns {Promise<string>} Teks narasi/saran keuangan
 */
async function generateAISummary(rekapBulanan) {
  // ── MOCK: ganti blok ini dengan fetch ke backend ──
  await new Promise(r => setTimeout(r, 900)); // simulasi delay

  const { totalIncome, totalExpense, net, perKatExpense } = rekapBulanan;
  const rasio = totalIncome > 0 ? ((totalExpense / totalIncome) * 100).toFixed(0) : 0;

  const topExpense = Object.entries(perKatExpense)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k, v]) => `${k} (${formatRupiah(v)})`)
    .join(' dan ');

  const emoji = net >= 0 ? '✅' : '⚠️';
  const status = net >= 0
    ? `Kamu surplus ${formatRupiah(net)} bulan ini — kerja bagus!`
    : `Pengeluaranmu melebihi pemasukan sebesar ${formatRupiah(Math.abs(net))}. Perlu evaluasi.`;

  return `${emoji} ${status}

📊 Rasio pengeluaran: ${rasio}% dari total pemasukan.
${rasio > 80 ? '⚠️  Rasio ini cukup tinggi. Idealnya di bawah 70%.' : '👍  Rasio pengeluaranmu masih terkontrol.'}

${topExpense ? `💸 Pengeluaran terbesar kamu ada di kategori ${topExpense}. Periksa apakah bisa dihemat.` : ''}

💡 Saran:
• Sisihkan minimal 20% dari pemasukan untuk tabungan/investasi setiap bulan.
• Catat setiap pengeluaran kecil — pengeluaran kecil yang sering bisa berdampak besar.
• Buat anggaran per kategori untuk bulan depan berdasarkan data bulan ini.

🤖 Ringkasan ini dibuat otomatis dari data transaksimu.`;
}

async function renderAISummary(key, rekapBulanan, forceRegenerate = false) {
  const contentEl = document.getElementById('ai-summary-content');
  const cached    = DB.getSummaryAI(key);

  if (cached && !forceRegenerate) {
    contentEl.textContent = cached;
    return;
  }

  // Loading state
  contentEl.innerHTML = `<div class="ai-loading"><span></span><span></span><span></span></div>`;

  try {
    const teks = await generateAISummary(rekapBulanan);
    DB.setSummaryAI(key, teks);
    contentEl.textContent = teks;
  } catch (e) {
    contentEl.textContent = 'Gagal membuat ringkasan. Coba lagi nanti.';
  }
}

/* ─────────────────────────────────────────────
   SECTION 12: MODAL TRANSAKSI
   ───────────────────────────────────────────── */

function bukaModalTransaksi(trxId = null) {
  const form  = document.getElementById('form-transaksi');
  const title = document.getElementById('modal-transaksi-title');

  form.reset();
  clearFormError('form-error');

  if (trxId) {
    // Mode Edit
    title.textContent = 'Edit Transaksi';
    const trx = DB.getTransaksi().find(t => t.id === trxId);
    if (!trx) return;

    document.getElementById('trx-id').value         = trx.id;
    document.getElementById('trx-judul').value       = trx.judul;
    document.getElementById('trx-keterangan').value  = trx.keterangan || '';
    document.getElementById('trx-nominal').value     = trx.nominal;
    document.getElementById('trx-tanggal').value     = trx.tanggal;
    setTipeTabs(trx.tipe);

    // Isi select setelah tipe di-set
    populateAkunSelects(trx.tipe);

    if (trx.tipe === 'transfer') {
      document.getElementById('trx-dari').value    = trx.akunDari;
      document.getElementById('trx-tujuan').value  = trx.akunTujuan;
    } else if (trx.tipe === 'investasi') {
      document.getElementById('trx-akun').value    = trx.akunId;
      document.getElementById('trx-akun-investasi').value = trx.akunInvestasiId || '';
    } else {
      document.getElementById('trx-akun').value    = trx.akunId;
      document.getElementById('trx-kategori').value = trx.kategori || '';
    }
  } else {
    // Mode Tambah
    title.textContent = 'Tambah Transaksi';
    document.getElementById('trx-id').value    = '';
    document.getElementById('trx-tanggal').value = hariIni();
    setTipeTabs('expense');
    populateAkunSelects('expense');
  }

  bukaModal('modal-transaksi');
}

function setTipeTabs(tipe) {
  document.getElementById('trx-tipe').value = tipe;
  document.querySelectorAll('.type-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tipe === tipe);
  });
  updateFormFields(tipe);
}

function updateFormFields(tipe) {
  const groupKategori       = document.getElementById('group-kategori');
  const groupAkun           = document.getElementById('group-akun');
  const groupTransfer       = document.getElementById('group-transfer');
  const groupAkunInvestasi  = document.getElementById('group-akun-investasi');

  // Reset semua tersembunyi dulu
  groupKategori.classList.add('hidden');
  groupAkun.classList.add('hidden');
  groupTransfer.classList.add('hidden');
  groupAkunInvestasi.classList.add('hidden');

  if (tipe === 'expense' || tipe === 'income') {
    groupKategori.classList.remove('hidden');
    groupAkun.classList.remove('hidden');
    populateKategori(tipe);
  } else if (tipe === 'transfer') {
    groupTransfer.classList.remove('hidden');
  } else if (tipe === 'investasi') {
    groupAkun.classList.remove('hidden');
    groupAkunInvestasi.classList.remove('hidden');
  }
  populateAkunSelects(tipe);
}

function populateKategori(tipe) {
  const select = document.getElementById('trx-kategori');
  const list   = tipe === 'expense' ? KATEGORI_EXPENSE : KATEGORI_INCOME;
  select.innerHTML = `<option value="">— Pilih Kategori —</option>` +
    list.map(k => `<option value="${k}">${k}</option>`).join('');
}

function populateAkunSelects(tipe) {
  const akunList = DB.getAkun();
  const biasa    = akunList.filter(a => a.tipe === 'biasa');
  const inv      = akunList.filter(a => a.tipe === 'investasi');

  const optBiasa = biasa.map(a => `<option value="${a.id}">${escHtml(a.nama)}</option>`).join('');
  const optInv   = inv.map(a  => `<option value="${a.id}">${escHtml(a.nama)}</option>`).join('');

  const mkSelect = (opts) => `<option value="">— Pilih Akun —</option>${opts}`;

  if (tipe === 'transfer') {
    document.getElementById('trx-dari').innerHTML    = mkSelect(optBiasa);
    document.getElementById('trx-tujuan').innerHTML  = mkSelect(optBiasa + optInv);
  } else if (tipe === 'investasi') {
    document.getElementById('trx-akun').innerHTML    = mkSelect(optBiasa);
    document.getElementById('trx-akun-investasi').innerHTML =
      `<option value="">— Pilih (opsional) —</option>${optInv}`;
  } else {
    document.getElementById('trx-akun').innerHTML    = mkSelect(optBiasa + optInv);
  }
}

function simpanTransaksi(e) {
  e.preventDefault();
  clearFormError('form-error');

  const id         = document.getElementById('trx-id').value;
  const judul      = document.getElementById('trx-judul').value.trim();
  const keterangan = document.getElementById('trx-keterangan').value.trim();
  const nominalRaw = parseFloat(document.getElementById('trx-nominal').value);
  const tanggal    = document.getElementById('trx-tanggal').value;
  const tipe       = document.getElementById('trx-tipe').value;
  const kategori   = document.getElementById('trx-kategori').value;
  const akunId     = document.getElementById('trx-akun').value;
  const akunDari   = document.getElementById('trx-dari').value;
  const akunTujuan = document.getElementById('trx-tujuan').value;
  const akunInvId  = document.getElementById('trx-akun-investasi').value;

  // ── Validasi ──
  if (!judul)           return showFormError('form-error', 'Judul tidak boleh kosong.');
  if (!tanggal)         return showFormError('form-error', 'Tanggal harus diisi.');
  if (isNaN(nominalRaw) || nominalRaw <= 0)
    return showFormError('form-error', 'Nominal harus lebih dari 0.');

  if (tipe === 'transfer') {
    if (!akunDari)   return showFormError('form-error', 'Pilih akun asal.');
    if (!akunTujuan) return showFormError('form-error', 'Pilih akun tujuan.');
    if (akunDari === akunTujuan)
      return showFormError('form-error', 'Akun asal dan tujuan tidak boleh sama.');
  } else if (tipe === 'investasi') {
    if (!akunId) return showFormError('form-error', 'Pilih akun sumber.');
  } else {
    if (!akunId) return showFormError('form-error', 'Pilih akun.');
  }

  const nominal = Math.round(nominalRaw);

  // ── Cek saldo cukup ──
  const saldoMap = hitungSaldoSemua();
  // Jika edit, batalkan efek transaksi lama dulu (virtual)
  const isEdit = !!id;
  if (isEdit) {
    const oldTrx = DB.getTransaksi().find(t => t.id === id);
    if (oldTrx) {
      // reversi saldo lama agar pengecekan akurat
      reversiSaldo(saldoMap, oldTrx, -1);
    }
  }

  if (tipe === 'expense' || tipe === 'investasi') {
    const srcId = tipe === 'expense' ? akunId : akunId;
    const saldo = saldoMap.get(srcId) ?? 0;
    if (saldo < nominal) {
      return showFormError('form-error',
        `Saldo akun tidak cukup. Tersedia: ${formatRupiah(saldo)}`);
    }
  }
  if (tipe === 'transfer') {
    const saldo = saldoMap.get(akunDari) ?? 0;
    if (saldo < nominal) {
      return showFormError('form-error',
        `Saldo akun asal tidak cukup. Tersedia: ${formatRupiah(saldo)}`);
    }
  }

  // ── Buat objek transaksi ──
  const trxObj = { id: id || uid(), judul, keterangan, nominal, tanggal, tipe, kategori };
  if (tipe === 'transfer') {
    trxObj.akunDari   = akunDari;
    trxObj.akunTujuan = akunTujuan;
  } else if (tipe === 'investasi') {
    trxObj.akunId         = akunId;
    trxObj.akunInvestasiId = akunInvId || null;
  } else {
    trxObj.akunId = akunId;
  }

  // ── Simpan ──
  let list = DB.getTransaksi();
  if (isEdit) {
    list = list.map(t => t.id === id ? trxObj : t);
    showToast('Transaksi berhasil diperbarui.', 'success');
  } else {
    list.push(trxObj);
    showToast('Transaksi berhasil ditambahkan.', 'success');
  }
  DB.setTransaksi(list);

  tutupModal('modal-transaksi');
  renderAll();
}

/** Reversi efek saldo transaksi pada saldoMap (mutable) — digunakan untuk validasi */
function reversiSaldo(saldoMap, trx, multiplier = 1) {
  const n = Number(trx.nominal) * multiplier;
  switch (trx.tipe) {
    case 'expense':
      saldoMap.set(trx.akunId, (saldoMap.get(trx.akunId) ?? 0) + n);
      break;
    case 'income':
      saldoMap.set(trx.akunId, (saldoMap.get(trx.akunId) ?? 0) - n);
      break;
    case 'transfer':
      saldoMap.set(trx.akunDari,   (saldoMap.get(trx.akunDari)   ?? 0) + n);
      saldoMap.set(trx.akunTujuan, (saldoMap.get(trx.akunTujuan) ?? 0) - n);
      break;
    case 'investasi':
      saldoMap.set(trx.akunId, (saldoMap.get(trx.akunId) ?? 0) + n);
      if (trx.akunInvestasiId)
        saldoMap.set(trx.akunInvestasiId, (saldoMap.get(trx.akunInvestasiId) ?? 0) - n);
      break;
  }
}

/* ─────────────────────────────────────────────
   SECTION 13: HAPUS & EDIT TRANSAKSI
   ───────────────────────────────────────────── */

function bukaEditTransaksi(id) {
  bukaModalTransaksi(id);
}

function konfirmasiHapusTransaksi(id) {
  const trx = DB.getTransaksi().find(t => t.id === id);
  if (!trx) return;
  bukaKonfirmasi(
    `Hapus transaksi "${trx.judul}" (${formatRupiah(trx.nominal)})? Tindakan ini tidak dapat dibatalkan.`,
    () => hapusTransaksi(id)
  );
}

function hapusTransaksi(id) {
  const list = DB.getTransaksi().filter(t => t.id !== id);
  DB.setTransaksi(list);
  showToast('Transaksi dihapus.', 'success');
  // renderAll() untuk halaman transaksi sudah memanggil renderHalamanTransaksi
  // yang di dalamnya akan memanggil renderTabelTransaksi jika bulan terpilih
  renderAll();
}

/* ─────────────────────────────────────────────
   SECTION 14: MODAL AKUN
   ───────────────────────────────────────────── */

function bukaModalAkun() {
  document.getElementById('form-akun').reset();
  document.getElementById('akun-id').value = '';
  document.getElementById('modal-akun-title').textContent = 'Tambah Akun';
  clearFormError('form-akun-error');
  bukaModal('modal-akun');
}

function bukaEditAkun(id) {
  const akun = DB.getAkun().find(a => a.id === id);
  if (!akun) return;
  document.getElementById('akun-id').value        = akun.id;
  document.getElementById('akun-nama').value       = akun.nama;
  document.getElementById('akun-tipe').value       = akun.tipe;
  document.getElementById('akun-saldo-awal').value = akun.saldoAwal;
  document.getElementById('modal-akun-title').textContent = 'Edit Akun';
  clearFormError('form-akun-error');
  bukaModal('modal-akun');
}

function simpanAkun(e) {
  e.preventDefault();
  clearFormError('form-akun-error');

  const id        = document.getElementById('akun-id').value;
  const nama      = document.getElementById('akun-nama').value.trim();
  const tipe      = document.getElementById('akun-tipe').value;
  const saldoAwal = parseFloat(document.getElementById('akun-saldo-awal').value) || 0;

  if (!nama) return showFormError('form-akun-error', 'Nama akun tidak boleh kosong.');

  let list = DB.getAkun();

  // Cek nama duplikat
  const duplikat = list.find(a => a.nama.toLowerCase() === nama.toLowerCase() && a.id !== id);
  if (duplikat) return showFormError('form-akun-error', 'Nama akun sudah digunakan.');

  if (id) {
    list = list.map(a => a.id === id ? { ...a, nama, tipe, saldoAwal } : a);
    showToast('Akun berhasil diperbarui.', 'success');
  } else {
    list.push({ id: uid(), nama, tipe, saldoAwal });
    showToast('Akun berhasil ditambahkan.', 'success');
  }

  DB.setAkun(list);
  tutupModal('modal-akun');
  renderHalamanAkun();
  renderBeranda();
}

function konfirmasiHapusAkun(id) {
  const akun      = DB.getAkun().find(a => a.id === id);
  if (!akun) return;
  const transaksi = DB.getTransaksi();
  const pakai     = transaksi.some(t =>
    t.akunId === id || t.akunDari === id || t.akunTujuan === id || t.akunInvestasiId === id
  );
  if (pakai) {
    showToast('Akun ini memiliki transaksi dan tidak bisa dihapus.', 'error');
    return;
  }
  bukaKonfirmasi(
    `Hapus akun "${akun.nama}"? Tindakan ini tidak dapat dibatalkan.`,
    () => hapusAkun(id)
  );
}

function hapusAkun(id) {
  DB.setAkun(DB.getAkun().filter(a => a.id !== id));
  showToast('Akun dihapus.', 'success');
  renderHalamanAkun();
  renderBeranda();
}

/* ─────────────────────────────────────────────
   SECTION 15: MODAL UTILITIES
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
   SECTION 16: TOAST & FORM ERROR
   ───────────────────────────────────────────── */

let _toastTimer = null;
function showToast(pesan, type = '') {
  const el = document.getElementById('toast');
  el.textContent  = pesan;
  el.className    = `toast toast-${type}`;
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
   SECTION 17: TEMA GELAP / TERANG
   ───────────────────────────────────────────── */

function toggleTheme() {
  const html   = document.documentElement;
  const isDark = html.dataset.theme === 'dark';
  html.dataset.theme = isDark ? 'light' : 'dark';
  document.querySelector('.theme-icon').textContent = isDark ? '🌙' : '☀️';
  localStorage.setItem(STORAGE_KEYS.THEME, html.dataset.theme);
}

function applyStoredTheme() {
  const stored = localStorage.getItem(STORAGE_KEYS.THEME);
  if (stored) {
    document.documentElement.dataset.theme = stored;
    document.querySelector('.theme-icon').textContent = stored === 'dark' ? '☀️' : '🌙';
  }
}

/* ─────────────────────────────────────────────
   SECTION 18: HELPER RENDER
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

/** Render semua bagian beranda + menyegarkan state umum */
function renderAll() {
  if (currentPage === 'beranda')    renderBeranda();
  if (currentPage === 'akun')       renderHalamanAkun();
  if (currentPage === 'transaksi')  renderHalamanTransaksi();
  if (currentPage === 'summary')    renderHalamanSummary();
}

/* ─────────────────────────────────────────────
   SECTION 19: EVENT LISTENERS
   ───────────────────────────────────────────── */

function initEventListeners() {
  // ── Navigasi ──
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

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
    // Ambil ulang rekap dari transaksi dan regenerate
    const transaksi = DB.getTransaksi().filter(t => prefixBulan(t.tanggal) === selectedBulanSummary);
    let totalIncome = 0, totalExpense = 0;
    const perKatExpense = {}, perKatIncome = {};
    for (const trx of transaksi) {
      if (trx.tipe === 'income')  { totalIncome  += Number(trx.nominal); perKatIncome[trx.kategori || 'Lain-lain']  = (perKatIncome[trx.kategori || 'Lain-lain']  ?? 0) + Number(trx.nominal); }
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

  // ── Resize: update bubble position ──
  window.addEventListener('resize', () => moveBubble(currentPage));
}

/* ─────────────────────────────────────────────
   SECTION 20: INISIALISASI APP
   ───────────────────────────────────────────── */

function init() {
  applyStoredTheme();

  // Muat seed data jika belum ada data sama sekali
  const hasAkun    = DB.getAkun().length > 0;
  const hasTrx     = DB.getTransaksi().length > 0;
  const seedLoaded = localStorage.getItem(STORAGE_KEYS.SEED_LOADED);

  if (!hasAkun && !hasTrx && !seedLoaded) {
    loadSeedData();
  } else if (!hasAkun) {
    initAkunDefault();
  }

  initEventListeners();

  // Render halaman awal
  navigateTo('beranda');

  // Posisi bubble awal setelah layout selesai
  requestAnimationFrame(() => moveBubble('beranda'));
}

// Jalankan saat DOM siap
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
