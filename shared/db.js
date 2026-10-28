/* ═══════════════════════════════════════════════════════════
   shared/db.js
   Konstanta, utilitas, lapisan data (localStorage), logika
   saldo, dan data seed. Dipakai oleh semua modul halaman.
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────
   KONSTANTA & DATA KONFIGURASI
   ───────────────────────────────────────────── */

const STORAGE_KEYS = {
  AKUN:        'dompetku_akun',
  TRANSAKSI:   'dompetku_transaksi',
  SUMMARY_AI:  'dompetku_summary_ai',
  THEME:       'dompetku_theme',
  SEED_LOADED: 'dompetku_seed_loaded',
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

/* [REV2] Palet biru bertingkat + warna pelengkap serasi */
const WARNA_CHART = [
  '#1D4ED8', /* biru royal */
  '#3B82F6', /* biru aksen */
  '#60A5FA', /* biru medium */
  '#93C5FD', /* biru muda */
  '#0B1F3A', /* navy */
  '#6366F1', /* indigo */
  '#818CF8', /* indigo muda */
  '#C9A227', /* emas */
  '#15803D', /* hijau (income) */
  '#B91C1C', /* merah (expense) */
  '#0EA5E9', /* biru langit */
  '#7C3AED', /* ungu */
];

/* ─────────────────────────────────────────────
   UTILITAS
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
   LAPISAN DATA (LOCALSTORAGE)
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
   LOGIKA SALDO AKUN
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
   DATA SEED (CONTOH)
   ───────────────────────────────────────────── */

function loadSeedData() {
  const akunSeed = [
    { id: 'akun-cash',  nama: 'Cash',  tipe: 'biasa',     saldoAwal: 500000  },
    { id: 'akun-bca',   nama: 'BCA',   tipe: 'biasa',     saldoAwal: 3000000 },
    { id: 'akun-gopay', nama: 'GoPay', tipe: 'biasa',     saldoAwal: 200000  },
    { id: 'akun-saham', nama: 'Saham', tipe: 'investasi', saldoAwal: 0       },
  ];

  const today = hariIni();
  const [y, m] = today.split('-');
  const prevMonth = m === '01'
    ? `${parseInt(y)-1}-12`
    : `${y}-${String(parseInt(m)-1).padStart(2,'0')}`;

  const transaksiSeed = [
    // Bulan berjalan
    { id: uid(), tipe: 'income',   judul: 'Gaji Bulanan',        keterangan: 'Gaji Mei',   nominal: 5000000, tanggal: `${y}-${m}-01`, akunId: 'akun-bca',   kategori: 'Gaji' },
    { id: uid(), tipe: 'expense',  judul: 'Makan Siang',         keterangan: 'Warteg',     nominal: 25000,   tanggal: `${y}-${m}-02`, akunId: 'akun-cash',  kategori: 'Makanan & Minuman' },
    { id: uid(), tipe: 'expense',  judul: 'Transportasi Online', keterangan: 'Gojek',      nominal: 18000,   tanggal: `${y}-${m}-03`, akunId: 'akun-gopay', kategori: 'Transportasi' },
    { id: uid(), tipe: 'transfer', judul: 'Top-up GoPay',        keterangan: '',           nominal: 100000,  tanggal: `${y}-${m}-04`, akunDari: 'akun-bca', akunTujuan: 'akun-gopay' },
    { id: uid(), tipe: 'expense',  judul: 'Belanja Bulanan',     keterangan: 'Indomaret',  nominal: 250000,  tanggal: `${y}-${m}-05`, akunId: 'akun-bca',   kategori: 'Belanja' },
    { id: uid(), tipe: 'investasi',judul: 'Beli Saham BBCA',     keterangan: '10 lot',     nominal: 500000,  tanggal: `${y}-${m}-06`, akunId: 'akun-bca',   akunInvestasiId: 'akun-saham' },
    { id: uid(), tipe: 'expense',  judul: 'Netflix',             keterangan: 'Langganan',  nominal: 54000,   tanggal: `${y}-${m}-07`, akunId: 'akun-bca',   kategori: 'Hiburan' },
    { id: uid(), tipe: 'income',   judul: 'Freelance Design',    keterangan: 'Klien A',    nominal: 750000,  tanggal: `${y}-${m}-10`, akunId: 'akun-bca',   kategori: 'Freelance' },
    // Bulan lalu
    { id: uid(), tipe: 'income',   judul: 'Gaji Bulanan',        keterangan: '',           nominal: 5000000, tanggal: `${prevMonth}-01`, akunId: 'akun-bca',  kategori: 'Gaji' },
    { id: uid(), tipe: 'expense',  judul: 'Kos Bulanan',         keterangan: '',           nominal: 1200000, tanggal: `${prevMonth}-03`, akunId: 'akun-bca',  kategori: 'Tagihan & Utilitas' },
    { id: uid(), tipe: 'expense',  judul: 'Makan',               keterangan: '',           nominal: 400000,  tanggal: `${prevMonth}-15`, akunId: 'akun-cash', kategori: 'Makanan & Minuman' },
  ];

  DB.setAkun(akunSeed);
  DB.setTransaksi(transaksiSeed);
  localStorage.setItem(STORAGE_KEYS.SEED_LOADED, '1');
}

function hapusSeedData() {
  DB.setAkun([]);
  DB.setTransaksi([]);
  localStorage.removeItem(STORAGE_KEYS.SEED_LOADED);
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
