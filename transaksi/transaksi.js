/* ═══════════════════════════════════════════════════════════
   transaksi/transaksi.js
   Render Halaman Transaksi Bulanan, tabel detail, export CSV,
   dan Modal Tambah/Edit/Hapus Transaksi.
   Bergantung pada: shared/db.js, shared/ui.js, beranda/beranda.js
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────
   STATE HALAMAN TRANSAKSI
   ───────────────────────────────────────────── */

let selectedBulanTransaksi = null;

/* ─────────────────────────────────────────────
   RENDER HALAMAN TRANSAKSI BULANAN
   ───────────────────────────────────────────── */

function renderHalamanTransaksi() {
  const tahun = new Date().getFullYear();
  document.getElementById('transaksi-tahun').textContent = tahun;

  const grid      = document.getElementById('month-grid');
  const transaksi = DB.getTransaksi();

  grid.innerHTML = BULAN_NAMA.map((nama, i) => {
    const mm  = String(i + 1).padStart(2, '0');
    const key = `${tahun}-${mm}`;
    const hasData = transaksi.some(t => prefixBulan(t.tanggal) === key);
    const isActive = selectedBulanTransaksi === key;
    return `<button class="month-btn ${hasData ? 'has-data' : ''} ${isActive ? 'active' : ''}"
      onclick="tampilTransaksiBulan('${key}')">${nama}</button>`;
  }).join('');

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
   MODAL TAMBAH / EDIT TRANSAKSI
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

    document.getElementById('trx-id').value        = trx.id;
    document.getElementById('trx-judul').value      = trx.judul;
    document.getElementById('trx-keterangan').value = trx.keterangan || '';
    document.getElementById('trx-nominal').value    = trx.nominal;
    document.getElementById('trx-tanggal').value    = trx.tanggal;
    setTipeTabs(trx.tipe);

    populateAkunSelects(trx.tipe);

    if (trx.tipe === 'transfer') {
      document.getElementById('trx-dari').value   = trx.akunDari;
      document.getElementById('trx-tujuan').value = trx.akunTujuan;
    } else if (trx.tipe === 'investasi') {
      document.getElementById('trx-akun').value             = trx.akunId;
      document.getElementById('trx-akun-investasi').value   = trx.akunInvestasiId || '';
    } else {
      document.getElementById('trx-akun').value    = trx.akunId;
      document.getElementById('trx-kategori').value = trx.kategori || '';
    }
  } else {
    // Mode Tambah
    title.textContent = 'Tambah Transaksi';
    document.getElementById('trx-id').value      = '';
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
  const groupKategori      = document.getElementById('group-kategori');
  const groupAkun          = document.getElementById('group-akun');
  const groupTransfer      = document.getElementById('group-transfer');
  const groupAkunInvestasi = document.getElementById('group-akun-investasi');

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
    document.getElementById('trx-dari').innerHTML   = mkSelect(optBiasa);
    document.getElementById('trx-tujuan').innerHTML = mkSelect(optBiasa + optInv);
  } else if (tipe === 'investasi') {
    document.getElementById('trx-akun').innerHTML          = mkSelect(optBiasa);
    document.getElementById('trx-akun-investasi').innerHTML =
      `<option value="">— Pilih (opsional) —</option>${optInv}`;
  } else {
    document.getElementById('trx-akun').innerHTML = mkSelect(optBiasa + optInv);
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
  const isEdit   = !!id;
  if (isEdit) {
    const oldTrx = DB.getTransaksi().find(t => t.id === id);
    if (oldTrx) reversiSaldo(saldoMap, oldTrx, -1);
  }

  if (tipe === 'expense' || tipe === 'investasi') {
    const saldo = saldoMap.get(akunId) ?? 0;
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
    trxObj.akunId          = akunId;
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
   HAPUS & EDIT TRANSAKSI
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
  renderAll();
}
