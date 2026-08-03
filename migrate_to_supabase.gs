// ============================================================
// SCRIPT MIGRASI DATA: Google Spreadsheet → Supabase
// SIMPEG (Sistem Layanan Administrasi Kepegawaian)
// ============================================================
// CARA PAKAI:
// 1. Buka Google Spreadsheet SIMPEG Anda
//    (ID: 1fn9Nugfola-a6RPF3jyAM0L3SHQjThSC7cBX--dXtuA)
// 2. Klik menu Extensions → Apps Script
// 3. Hapus kode yang ada, paste seluruh kode ini
// 4. Isi SUPABASE_URL dan SUPABASE_SERVICE_KEY di bawah
// 5. Save (Ctrl+S), lalu reload Spreadsheet
// 6. Gunakan menu "🛠️ Migrasi Supabase" yang muncul di Spreadsheet
// ============================================================

// ⚙️ KONFIGURASI — Isi dengan nilai dari Supabase Dashboard Anda
const SUPABASE_URL         = "https://zzppasgblrdvazspynvj.supabase.co"; // Ganti
const SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6cHBhc2dibHJkdmF6c3B5bnZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDI3Mzk0NSwiZXhwIjoyMDk5ODQ5OTQ1fQ.AVF1Kr_uYcHMuQCUyAqc9B-UrGSW3outZj3qd1f9-Ig";               // Ganti

// Nama sheet di spreadsheet
const SHEET_DATA_UTAMA     = 'Data Utama';
const SHEET_USER_ROLES     = 'User Roles';
const SHEET_TEMPLATES      = 'Templates';
const SHEET_USULAN_KP      = 'Usulan KP';
const SHEET_USULAN_PENSIUN = 'Usulan Pensiun';
const SHEET_PIMPINAN       = 'Pimpinan';
const SHEET_JENIS_TUTAM    = 'Jenis tutam';

// ============================================================
// MENU KUSTOM
// ============================================================
function onOpen() {
  const ui = getUiSafe_();
  if (!ui) return;
  ui.createMenu("🛠️ Migrasi Supabase")
    .addItem("1. Cek Koneksi Supabase",           "cekKoneksi")
    .addSeparator()
    .addItem("2. Migrasi SEMUA data",             "migrasiSemuaData")
    .addSeparator()
    .addItem("3. Migrasi Data Utama saja",        "migrasiDataUtama")
    .addItem("4. Migrasi User Roles saja",        "migrasiUserRoles")
    .addItem("5. Migrasi Templates saja",         "migrasiTemplates")
    .addItem("6. Migrasi Usulan KP saja",         "migrasiUsulanKp")
    .addItem("7. Migrasi Usulan Pensiun saja",    "migrasiUsulanPensiun")
    .addItem("8. Migrasi Pimpinan saja",          "migrasiPimpinan")
    .addItem("9. Migrasi Jenis Tutam saja",       "migrasiJenisTutam")
    .addToUi();
}

// ============================================================
// CEK KONEKSI
// ============================================================
function cekKoneksi() {
  if (cekKonfigurasi_()) return;
  try {
    const r = UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/data_utama?limit=1", {
      headers: buildHeaders_(),
      muteHttpExceptions: true
    });
    const code = r.getResponseCode();
    if (code === 200) {
      alertSafe_("✅ Koneksi berhasil ke Supabase!\nURL: " + SUPABASE_URL);
    } else {
      let extraInfo = "";
      try {
        const listRes = UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/", {
          headers: buildHeaders_(),
          muteHttpExceptions: true
        });
        if (listRes.getResponseCode() === 200) {
          const spec = JSON.parse(listRes.getContentText());
          const paths = Object.keys(spec.paths || {})
            .map(p => p.replace(/^\/|\?.*$/g, ''))
            .filter(p => p !== "");
          extraInfo = "\n\nTabel terdeteksi di Supabase: " + JSON.stringify(paths);
        } else {
          extraInfo = "\n\n(Gagal mengambil list tabel, status: " + listRes.getResponseCode() + ")";
        }
      } catch (listErr) {
        extraInfo = "\n\n(Error saat mengambil list tabel: " + listErr.message + ")";
      }
      alertSafe_(
        "❌ Koneksi gagal. Status: " + code + "\n" + r.getContentText() + extraInfo
      );
    }
  } catch(e) {
    alertSafe_("❌ Error: " + e.message);
  }
}

// ============================================================
// MIGRASI SEMUA
// ============================================================
function migrasiSemuaData() {
  if (cekKonfigurasi_()) return;
  if (!confirmSafe_("Migrasi data (Data Utama, User Roles, Templates, Pimpinan, & Jenis Tutam) ke Supabase?\n(Data yang sudah ada akan di-upsert)", "Konfirmasi")) return;

  const r1 = migrasiDataUtama();
  const r2 = migrasiUserRoles();
  const r3 = migrasiTemplates();
  const r4 = migrasiUsulanKp();
  const r5 = migrasiUsulanPensiun();
  const r6 = migrasiPimpinan();
  const r7 = migrasiJenisTutam();

  alertSafe_(
    "Data Utama: "     + r1.berhasil + " OK, " + r1.gagal + " gagal\n" +
    "User Roles: "     + r2.berhasil + " OK, " + r2.gagal + " gagal\n" +
    "Templates: "      + r3.berhasil + " OK, " + r3.gagal + " gagal\n" +
    "Pimpinan: "       + r6.berhasil + " OK, " + r6.gagal + " gagal\n" +
    "Jenis Tutam: "    + r7.berhasil + " OK, " + r7.gagal + " gagal\n\n" +
    "Catatan: Sheet Usulan KP & Usulan Pensiun dilewati (hanya struktur kolom database).",
    "Selesai!"
  );
}

// ============================================================
// MIGRASI SHEET: Data Utama
// ============================================================
function migrasiDataUtama() {
  const ss    = getActiveSpreadsheet_();
  if (!ss) { Logger.log("Spreadsheet tidak ditemukan"); return {berhasil:0,gagal:0}; }
  const sheet = ss.getSheetByName(SHEET_DATA_UTAMA);
  if (!sheet) { Logger.log("Sheet Data Utama tidak ditemukan"); return {berhasil:0,gagal:0}; }

  const values  = sheet.getDataRange().getValues();
  if (values.length < 2) return {berhasil:0,gagal:0};

  const headers  = values[0].map(h => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,''));
  let berhasil = 0, gagal = 0;
  const BATCH = 50;
  let batch  = [];

  // Daftar kolom resmi di database tabel data_utama
  const COLUMNS_DATA_UTAMA = [
    'no', 'nip', 'karpeg', 'nidn', 'nuptk', 'nama_lengkap', 'nama', 'nama_pada_upacara', 
    'tmp_lhr', 'tgl_lhr', 'jns_kel', 'agama', 'status_menikah', 'tmt_pengangkatan', 
    'golongan', 'pangkat', 'tmt_gol', 'jabatan', 'jenis_jab', 'tmt_jab', 'kum', 
    'tmt_kum', 'pendidikan', 'jurusan', 'thn_lulus', 'kepakaran', 'status_bekerja', 
    'tmt_status_bekerja', 'akhir_tmt_status_bekerja', 'jenis_peg', 'status_kepegawaian', 
    'tmt_pensiun_bup', 'unit_es_ii', 'unit_es_iii', 'unit_es_iv', 'tmt_awal_bekerja_di_undip', 
    'jalur_masuk', 'keterangan'
  ];

  const nipIdx = headers.indexOf('nip');
  if (nipIdx === -1) {
    Logger.log("Kolom 'NIP' tidak ditemukan di sheet Data Utama!");
    return {berhasil: 0, gagal: values.length - 1};
  }

  function flushBatch() {
    if (!batch.length) return;
    try {
      const r = UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/data_utama?on_conflict=nip", {
        method:  "POST",
        headers: Object.assign({}, buildHeaders_(), { "Prefer": "resolution=merge-duplicates" }),
        payload: JSON.stringify(batch),
        muteHttpExceptions: true
      });
      const code = r.getResponseCode();
      if (code === 200 || code === 201) { berhasil += batch.length; }
      else { Logger.log("GAGAL data_utama batch: " + code + " " + r.getContentText()); gagal += batch.length; }
    } catch(e) { Logger.log("ERROR data_utama: " + e.message); gagal += batch.length; }
    batch = [];
    Utilities.sleep(200);
  }

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row.every(c => c === '' || c === null)) continue;
    const nip = String(row[nipIdx] || '').trim();
    if (!nip) continue;

    const obj = {};
    COLUMNS_DATA_UTAMA.forEach(col => obj[col] = null);
    headers.forEach((key, idx) => {
      if (key && COLUMNS_DATA_UTAMA.indexOf(key) !== -1) {
        const val = safeCellValue_(row[idx]);
        if (val !== null && val !== '') obj[key] = val;
      }
    });
    batch.push(obj);
    if (batch.length >= BATCH) flushBatch();
  }
  flushBatch();

  Logger.log("data_utama: " + berhasil + " OK, " + gagal + " gagal");
  return {berhasil, gagal};
}

// ============================================================
// MIGRASI SHEET: User Roles
// ============================================================
function migrasiUserRoles() {
  const ss    = getActiveSpreadsheet_();
  if (!ss) { Logger.log("Spreadsheet tidak ditemukan"); return {berhasil:0,gagal:0}; }
  const sheet = ss.getSheetByName(SHEET_USER_ROLES);
  if (!sheet) { Logger.log("Sheet User Roles tidak ditemukan"); return {berhasil:0,gagal:0}; }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return {berhasil:0,gagal:0};

  let berhasil = 0, gagal = 0;

  for (let i = 1; i < values.length; i++) {
    const nip = String(values[i][0] || '').trim();
    if (!nip) continue;

    const payload = {
      nip:            nip,
      nama:           String(values[i][1] || '').trim(),
      role:           String(values[i][2] || 'normal').trim(),
      diubah_oleh:    String(values[i][3] || '').trim(),
      tanggal_diubah: values[i][4] ? new Date(values[i][4]).toISOString() : new Date().toISOString()
    };

    try {
      const r = UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/user_roles", {
        method:  "POST",
        headers: Object.assign({}, buildHeaders_(), { "Prefer": "resolution=merge-duplicates" }),
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      const code = r.getResponseCode();
      if (code === 200 || code === 201) berhasil++;
      else { Logger.log("GAGAL role NIP " + nip + ": " + code); gagal++; }
    } catch(e) { Logger.log("ERROR role " + nip + ": " + e.message); gagal++; }
    Utilities.sleep(50);
  }

  Logger.log("user_roles: " + berhasil + " OK, " + gagal + " gagal");
  return {berhasil, gagal};
}

// ============================================================
// MIGRASI SHEET: Templates
// ============================================================
function migrasiTemplates() {
  const ss    = getActiveSpreadsheet_();
  if (!ss) { Logger.log("Spreadsheet tidak ditemukan"); return {berhasil:0,gagal:0}; }
  const sheet = ss.getSheetByName(SHEET_TEMPLATES);
  if (!sheet) { Logger.log("Sheet Templates tidak ditemukan (wajar jika belum ada template)"); return {berhasil:0,gagal:0}; }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return {berhasil:0,gagal:0};

  let berhasil = 0, gagal = 0;

  for (let i = 1; i < values.length; i++) {
    const id = String(values[i][0] || '').trim();
    if (!id) continue;

    const payload = {
      id:          id,
      judul:       String(values[i][1] || '').trim(),
      file_id:     String(values[i][2] || '').trim(),
      layanan:     String(values[i][3] || '').trim(),
      sub_menu:    String(values[i][4] || '').trim(),
      dibuat_pada: values[i][5] ? new Date(values[i][5]).toISOString() : new Date().toISOString()
    };

    try {
      const r = UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/templates?on_conflict=id", {
        method:  "POST",
        headers: Object.assign({}, buildHeaders_(), { "Prefer": "resolution=merge-duplicates" }),
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      const code = r.getResponseCode();
      if (code === 200 || code === 201) berhasil++;
      else { Logger.log("GAGAL template " + id + ": " + code + " " + r.getContentText()); gagal++; }
    } catch(e) { Logger.log("ERROR template " + id + ": " + e.message); gagal++; }
    Utilities.sleep(50);
  }

  Logger.log("templates: " + berhasil + " OK, " + gagal + " gagal");
  return {berhasil, gagal};
}

// ============================================================
// MIGRASI SHEET: Usulan KP
// ============================================================
function migrasiUsulanKp() {
  Logger.log("usulan_kp: dilewati (isinya tidak dimigrasi atas permintaan user)");
  return {berhasil: 0, gagal: 0};
}

// ============================================================
// MIGRASI SHEET: Usulan Pensiun
// ============================================================
function migrasiUsulanPensiun() {
  Logger.log("usulan_pensiun: dilewati (isinya tidak dimigrasi atas permintaan user)");
  return {berhasil: 0, gagal: 0};
}

// ============================================================
// MIGRASI SHEET: Pimpinan
// ============================================================
function migrasiPimpinan() {
  const ss    = getActiveSpreadsheet_();
  if (!ss) { Logger.log("Spreadsheet tidak ditemukan"); return {berhasil:0,gagal:0}; }
  const sheet = ss.getSheetByName(SHEET_PIMPINAN);
  if (!sheet) { Logger.log("Sheet Pimpinan tidak ditemukan"); return {berhasil:0,gagal:0}; }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return {berhasil:0,gagal:0};

  let berhasil = 0, gagal = 0;
  const BATCH = 50;
  let batch  = [];

  function flushBatch() {
    if (!batch.length) return;
    try {
      const r = UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/pimpinan", {
        method:  "POST",
        headers: Object.assign({}, buildHeaders_(), { "Prefer": "resolution=merge-duplicates" }),
        payload: JSON.stringify(batch),
        muteHttpExceptions: true
      });
      const code = r.getResponseCode();
      if (code === 200 || code === 201) { berhasil += batch.length; }
      else { Logger.log("GAGAL pimpinan batch: " + code + " " + r.getContentText()); gagal += batch.length; }
    } catch(e) { Logger.log("ERROR pimpinan: " + e.message); gagal += batch.length; }
    batch = [];
    Utilities.sleep(200);
  }

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row.every(c => c === '' || c === null)) continue;
    const namaPimpinan = String(row[0] || '').trim();
    const unitEsIi     = String(row[1] || '').trim();
    if (!namaPimpinan && !unitEsIi) continue;

    const payload = {
      nama_pimpinan: namaPimpinan,
      unit_es_ii:    unitEsIi
    };
    batch.push(payload);
    if (batch.length >= BATCH) flushBatch();
  }
  flushBatch();

  Logger.log("pimpinan: " + berhasil + " OK, " + gagal + " gagal");
  return {berhasil, gagal};
}

// ============================================================
// MIGRASI SHEET: Jenis tutam
// ============================================================
function migrasiJenisTutam() {
  const ss    = getActiveSpreadsheet_();
  if (!ss) { Logger.log("Spreadsheet tidak ditemukan"); return {berhasil:0,gagal:0}; }
  const sheet = ss.getSheetByName(SHEET_JENIS_TUTAM) || ss.getSheetByName('Jenis Tutam');
  if (!sheet) { Logger.log("Sheet Jenis tutam tidak ditemukan"); return {berhasil:0,gagal:0}; }

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return {berhasil:0,gagal:0};

  const rawHeaders = values[0];
  const headers = rawHeaders.map(h => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,''));
  
  let berhasil = 0, gagal = 0;
  const BATCH = 50;
  let batch  = [];
  const seenKeys = new Set();

  // Peta alias nama kolom header sheet ke kolom database Supabase
  function mapHeaderToColumn(hKey) {
    if (!hKey) return null;
    if (['no', 'nomor', 'id'].indexOf(hKey) !== -1) return 'no';
    if (['jenis_tutam', 'jenis_tugas_tambahan', 'tugas_tambahan', 'nama_jenis_tutam', 'nama_tutam', 'nama_tugas_tambahan', 'jabatan', 'nama', 'jenis', 'sub_unit'].indexOf(hKey) !== -1) return 'jenis_tutam';
    if (['departemen', 'dept', 'bagian'].indexOf(hKey) !== -1) return 'departemen';
    if (['unit_es_ii', 'unit', 'unit_kerja', 'fakultas'].indexOf(hKey) !== -1) return 'unit_es_ii';
    if (['keterangan', 'ket', 'deskripsi'].indexOf(hKey) !== -1) return 'keterangan';
    return null;
  }

  function flushBatch() {
    if (!batch.length) return;
    try {
      const r = UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/jenis_tutam?on_conflict=jenis_tutam", {
        method:  "POST",
        headers: Object.assign({}, buildHeaders_(), { "Prefer": "resolution=merge-duplicates" }),
        payload: JSON.stringify(batch),
        muteHttpExceptions: true
      });
      const code = r.getResponseCode();
      if (code === 200 || code === 201) { berhasil += batch.length; }
      else { Logger.log("GAGAL jenis_tutam batch: " + code + " " + r.getContentText()); gagal += batch.length; }
    } catch(e) { Logger.log("ERROR jenis_tutam: " + e.message); gagal += batch.length; }
    batch = [];
    Utilities.sleep(200);
  }

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row.every(c => c === '' || c === null)) continue;

    // Pastikan seluruh object batch memiliki struktur KUNCI YANG SAMA KANONIKAL (menghindari error PGRST102)
    const obj = {
      no: null,
      jenis_tutam: null,
      departemen: null,
      unit_es_ii: null,
      keterangan: null
    };

    headers.forEach((hKey, idx) => {
      const targetCol = mapHeaderToColumn(hKey);
      if (targetCol) {
        const cellVal = safeCellValue_(row[idx]);
        if (cellVal !== null && cellVal !== '') {
          obj[targetCol] = cellVal;
        }
      }
    });

    // Fallback: Jika 'jenis_tutam' tidak terisi dari alias header, gunakan sel ber-isi pertama yang bukan 'no'
    if (!obj.jenis_tutam) {
      for (let idx = 0; idx < row.length; idx++) {
        const hKey = headers[idx];
        const targetCol = mapHeaderToColumn(hKey);
        if (targetCol !== 'no') {
          const val = safeCellValue_(row[idx]);
          if (val) {
            obj.jenis_tutam = val;
            break;
          }
        }
      }
    }

    // Wajib ada nilai 'jenis_tutam' agar tidak melanggar not-null constraint di database
    if (!obj.jenis_tutam) continue;

    // Deduplikasi key 'jenis_tutam' agar tidak gagal karena duplicate key dalam 1 batch
    const keyLower = String(obj.jenis_tutam).trim().toLowerCase();
    if (seenKeys.has(keyLower)) continue;
    seenKeys.add(keyLower);

    batch.push(obj);
    if (batch.length >= BATCH) flushBatch();
  }
  flushBatch();

  Logger.log("jenis_tutam: " + berhasil + " OK, " + gagal + " gagal");
  return {berhasil, gagal};
}

// ============================================================
// HELPERS
// ============================================================
function buildHeaders_() {
  return {
    "Content-Type":  "application/json",
    "apikey":        SUPABASE_SERVICE_KEY,
    "Authorization": "Bearer " + SUPABASE_SERVICE_KEY
  };
}

function cekKonfigurasi_() {
  if (SUPABASE_URL.includes("YOUR_PROJECT_ID") || SUPABASE_SERVICE_KEY.includes("YOUR_SERVICE_ROLE_KEY")) {
    alertSafe_("Harap isi SUPABASE_URL dan SUPABASE_SERVICE_KEY di bagian atas skrip.");
    return true;
  }
  return false;
}

function safeCellValue_(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

function getUiSafe_() {
  try {
    return SpreadsheetApp.getUi();
  } catch (e) {
    return null;
  }
}

function alertSafe_(message, title) {
  const ui = getUiSafe_();
  if (ui) {
    if (title) {
      ui.alert(title, message, ui.ButtonSet.OK);
    } else {
      ui.alert(message);
    }
  } else {
    Logger.log((title ? title + ": " : "") + message);
  }
}

function confirmSafe_(message, title) {
  const ui = getUiSafe_();
  if (ui) {
    const response = ui.alert(title || "Konfirmasi", message, ui.ButtonSet.YES_NO);
    return response === ui.Button.YES;
  } else {
    Logger.log("Konfirmasi otomatis YES (UI tidak tersedia): " + message);
    return true;
  }
}

function getActiveSpreadsheet_() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    try {
      ss = SpreadsheetApp.openById("1fn9Nugfola-a6RPF3jyAM0L3SHQjThSC7cBX--dXtuA");
    } catch(e) {
      Logger.log("Gagal membuka spreadsheet dengan ID: " + e.message);
    }
  }
  return ss;
}
