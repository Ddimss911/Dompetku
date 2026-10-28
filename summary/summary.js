/* ═══════════════════════════════════════════════════════════
   summary/summary.js
   Render Halaman Summary Bulanan, donut chart, dan AI summary.
   Bergantung pada: shared/db.js, shared/ui.js
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────
   STATE HALAMAN SUMMARY
   ───────────────────────────────────────────── */

let selectedBulanSummary  = null;
let chartExpenseInstance  = null;
let chartIncomeInstance   = null;

/* ─────────────────────────────────────────────
   RENDER HALAMAN SUMMARY
   ───────────────────────────────────────────── */

function renderHalamanSummary() {
  const tahun = new Date().getFullYear();
  document.getElementById('summary-tahun').textContent = tahun;

  const transaksi = DB.getTransaksi();
  const grid      = document.getElementById('summary-month-grid');

  grid.innerHTML = BULAN_NAMA.map((nama, i) => {
    const mm  = String(i + 1).padStart(2, '0');
    const key = `${tahun}-${mm}`;
    const hasData  = transaksi.some(t => prefixBulan(t.tanggal) === key && (t.tipe === 'income' || t.tipe === 'expense'));
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
  destroyCharts();
  selectedBulanSummary = null;
  document.getElementById('summary-detail').classList.add('hidden');
  document.getElementById('summary-month-grid').classList.remove('hidden');
  renderHalamanSummary();
}

function renderDetailSummary(key) {
  const transaksi = DB.getTransaksi().filter(t => prefixBulan(t.tanggal) === key);

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
  const netEl   = document.getElementById('summary-net-cashflow');
  netEl.textContent = formatRupiah(net);
  netEl.className   = `card-amount ${net >= 0 ? 'income' : 'expense'}`;

  destroyCharts();
  // [REV1] Ripulihkan container sebelum render (kalau sebelumnya tampil chart-empty)
  restoreChartContainer('chart-expense');
  restoreChartContainer('chart-income');
  renderDonutChart('chart-expense', 'legend-expense', perKatExpense, totalExpense);
  renderDonutChart('chart-income',  'legend-income',  perKatIncome,  totalIncome);

  renderAISummary(key, { totalIncome, totalExpense, net, perKatExpense, perKatIncome });
}

/**
 * [REV1] Pastikan .chart-container berisi <canvas> yang segar.
 * Dibutuhkan jika sebelumnya container diganti dengan chart-empty.
 */
function restoreChartContainer(canvasId) {
  const existing = document.getElementById(canvasId);
  if (existing) return; // canvas masih ada, tidak perlu restore
  // Cari chart-card berdasarkan legend id yang berpasangan
  const legendId = canvasId === 'chart-expense' ? 'legend-expense' : 'legend-income';
  const legend   = document.getElementById(legendId);
  if (!legend) return;
  const card = legend.closest('.chart-card');
  if (!card) return;
  // Ganti kembali konten chart-container
  const oldContainer = card.querySelector('.chart-container');
  if (oldContainer) {
    oldContainer.innerHTML = `<canvas id="${canvasId}"></canvas>`;
  } else {
    // container hilang sepenuhnya (chart-empty menggantikan), buat ulang
    const chartEmpty = card.querySelector('.chart-empty');
    if (chartEmpty) {
      const newContainer = document.createElement('div');
      newContainer.className = 'chart-container';
      newContainer.innerHTML = `<canvas id="${canvasId}"></canvas>`;
      chartEmpty.replaceWith(newContainer);
    }
  }
}

function renderDonutChart(canvasId, legendId, dataMap, total) {
  const canvas = document.getElementById(canvasId);
  const legend = document.getElementById(legendId);
  // Bersihkan teks tengah lama jika ada
  const existingCenter = canvas.parentElement.querySelector('.chart-center-text');
  if (existingCenter) existingCenter.remove();

  const labels = Object.keys(dataMap);
  const values = Object.values(dataMap);

  // [REV1] Pesan "Belum ada data" yang rapi
  if (labels.length === 0) {
    canvas.parentElement.innerHTML = `
      <div class="chart-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 8v4M12 16h.01"/>
        </svg>
        <span>Belum ada data</span>
      </div>`;
    legend.innerHTML = '';
    return;
  }

  const colors = labels.map((_, i) => WARNA_CHART[i % WARNA_CHART.length]);

  // [REV1] borderColor = warna surface kartu agar tidak ada garis hitam
  // Ambil dari computed style agar berfungsi di dark mode
  const surfaceColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--surface').trim() || '#ffffff';

  const chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        // [REV1] borderWidth kecil, warna border = latar kartu
        borderWidth: 2,
        borderColor: surfaceColor,
        hoverBorderWidth: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
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

  // [REV1] Teks tengah donut: label "Total" + nilai ringkas
  const centerDiv = document.createElement('div');
  centerDiv.className = 'chart-center-text';
  centerDiv.innerHTML = `
    <span class="center-label">Total</span>
    <span class="center-value">${formatRingkas(total)}</span>`;
  canvas.parentElement.appendChild(centerDiv);

  // [REV1] Legenda rapi: nama + persentase, satu baris per item
  legend.innerHTML = labels.map((lbl, i) => {
    const pct = total > 0 ? ((values[i] / total) * 100).toFixed(1) : 0;
    return `<div class="legend-item">
      <div class="legend-dot" style="background:${colors[i]}"></div>
      <span class="legend-label">${escHtml(lbl)}</span>
      <span class="legend-pct">${pct}%</span>
    </div>`;
  }).join('');
}

/**
 * Format nominal ringkas: Rp 1,2 jt / Rp 2,5 M
 * [REV1] Agar teks tengah donut tidak overflow di kartu kecil
 */
function formatRingkas(n) {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)} M`;
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(1)} jt`;
  if (n >= 1_000)         return `Rp ${(n / 1_000).toFixed(0)} rb`;
  return formatRupiah(n);
}

function destroyCharts() {
  if (chartExpenseInstance) { chartExpenseInstance.destroy(); chartExpenseInstance = null; }
  if (chartIncomeInstance)  { chartIncomeInstance.destroy();  chartIncomeInstance  = null; }
}

/* ─────────────────────────────────────────────
   AI SUMMARY (MOCK)
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
  await new Promise(r => setTimeout(r, 900));

  const { totalIncome, totalExpense, net, perKatExpense } = rekapBulanan;
  const rasio = totalIncome > 0 ? ((totalExpense / totalIncome) * 100).toFixed(0) : 0;

  const topExpense = Object.entries(perKatExpense)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k, v]) => `${k} (${formatRupiah(v)})`)
    .join(' dan ');

  const emoji  = net >= 0 ? '✅' : '⚠️';
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

  contentEl.innerHTML = `<div class="ai-loading"><span></span><span></span><span></span></div>`;

  try {
    const teks = await generateAISummary(rekapBulanan);
    DB.setSummaryAI(key, teks);
    contentEl.textContent = teks;
  } catch (e) {
    contentEl.textContent = 'Gagal membuat ringkasan. Coba lagi nanti.';
  }
}
