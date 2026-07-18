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
  if (!confirmSafe_("Migrasi data (Data Utama & User Roles) ke Supabase?\n(Data yang sudah ada akan di-upsert)", "Konfirmasi")) return;

  const r1 = migrasiDataUtama();
  const r2 = migrasiUserRoles();
  const r3 = migrasiTemplates();
  const r4 = migrasiUsulanKp();
  const r5 = migrasiUsulanPensiun();

  alertSafe_(
    "Data Utama: "     + r1.berhasil + " OK, " + r1.gagal + " gagal\n" +
    "User Roles: "     + r2.berhasil + " OK, " + r2.gagal + " gagal\n\n" +
    "Catatan: Sheet selain Data Utama & User Roles dilewati (hanya struktur kolom database).",
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
    headers.forEach((key, idx) => {
      if (key && COLUMNS_DATA_UTAMA.indexOf(key) !== -1) {
        obj[key] = safeCellValue_(row[idx]);
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
  Logger.log("templates: dilewati (isinya tidak dimigrasi atas permintaan user)");
  return {berhasil: 0, gagal: 0};
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
  if (val instanceof Date) return val.toISOString();
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
