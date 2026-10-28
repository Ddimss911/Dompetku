/* ═══════════════════════════════════════════════════════════
   akun/akun.js
   Render Halaman Akun, Modal Tambah/Edit Akun, dan logika
   hapus akun.
   Bergantung pada: shared/db.js, shared/ui.js
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────
   RENDER HALAMAN AKUN
   ───────────────────────────────────────────── */

function renderHalamanAkun() {
  const akunList  = DB.getAkun();
  const saldoMap  = hitungSaldoSemua();
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

function renderAkunItem(akun, saldoMap) {
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
   MODAL TAMBAH / EDIT AKUN
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

/* ─────────────────────────────────────────────
   HAPUS AKUN
   ───────────────────────────────────────────── */

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
