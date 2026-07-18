/**
 * ================================================================
 * api/rpc.js — Vercel Serverless Function
 * SIMPEG: Sistem Layanan Administrasi Kepegawaian
 *
 * Endpoint tunggal: POST /api/rpc
 * Body: { method: "namaMethod", params: [...args] }
 * Semua method dari Google Apps Script (.gs) dikonversi di sini.
 * ================================================================
 */

const { createClient } = require('@supabase/supabase-js');
const jwt              = require('jsonwebtoken');
const { v4: uuidv4 }   = require('uuid');

// ----------------------------------------------------------------
// SUPABASE CLIENT
// ----------------------------------------------------------------
let supabase = null;
function getDb() {
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diset di Vercel env vars!');
  supabase = createClient(url, key);
  return supabase;
}

// ----------------------------------------------------------------
// KONFIGURASI (sama dengan config.gs)
// ----------------------------------------------------------------
const CONFIG = {
  NIP_IGNORED_PREFIX:    'H.7.',
  STATUS_NON_ASN_LABEL:  'Pegawai Undip Non ASN',
  PASSWORD_DIGIT_LENGTH: 8,
  SESSION_TTL_SECONDS:   6 * 60 * 60,
  SEED_SUPER_ADMIN_NIP:  '200103310225061024',
  SEED_ADMIN_UNIT_ES_II: 'Direktorat Sumber Daya Manusia',
  PROFIL_NORMAL_FIELDS:  ['nama_lengkap','tgl_lhr','golongan','status_kepegawaian','status_bekerja','jabatan','tmt_pensiun_bup'],
  PENSIUN_DASHBOARD_AMBANG_TAHUN: 1,
  GOLONGAN_URUTAN: ['I/a','I/b','I/c','I/d','II/a','II/b','II/c','II/d','III/a','III/b','III/c','III/d','IV/a','IV/b','IV/c','IV/d','IV/e'],
  GOLONGAN_PILIHAN: ['I/a','I/b','I/c','I/d','II/a','II/b','II/c','II/d','III/a','III/b','III/c','III/d','IV/a','IV/b','IV/c','IV/d','IV/e','Set. I/a','Set. I/b','Set. I/c','Set. I/d','Set. II/a','Set. II/b','Set. II/c','Set. II/d','Set. III/a','Set. III/b','Set. III/c','Set. III/d','Set. IV/a','Set. IV/b','Set. IV/c','Set. IV/d','Set. IV/e'],
  JABATAN_FUNGSIONAL_LIST: ['Asisten Ahli','Lektor','Lektor Kepala','Guru Besar'],
  PREDIKAT_SKP_LIST: ['Sangat Baik','Baik','Butuh Perbaikan','Kurang','Sangat Kurang'],
  BULAN_LIST: [{value:1,label:'Januari'},{value:2,label:'Februari'},{value:3,label:'Maret'},{value:4,label:'April'},{value:5,label:'Mei'},{value:6,label:'Juni'},{value:7,label:'Juli'},{value:8,label:'Agustus'},{value:9,label:'September'},{value:10,label:'Oktober'},{value:11,label:'November'},{value:12,label:'Desember'}],
  IJAZAH_BARU_2023_LIST: ['Ada','Tidak'],
  PRESENTASE_PREDIKAT: {'Sangat Baik':1.5,'Baik':1,'Butuh Perbaikan':0.75,'Kurang':0.5,'Sangat Kurang':0.25},
  KOEFISIEN_JABATAN:   {'Asisten Ahli':12.5,'Lektor':25,'Lektor Kepala':37.5,'Guru Besar':50},
  KEBUTUHAN_AK_GOLONGAN: {'III/a':50,'III/b':50,'III/c':100,'III/d':100,'IV/a':150,'IV/b':150,'IV/c':150,'IV/d':200,'IV/e':0},
  PENGURANGAN_GOLONGAN:  {'III/b':50,'III/c':50,'III/d':100,'IV/a':200,'IV/b':150,'IV/c':300,'IV/d':450,'IV/e':200},
  FAKTOR_NILAI_PENDIDIKAN: 0.25,
  JABATAN_GOLONGAN_TERTINGGI: {'Asisten Ahli':'III/b','Lektor':'III/d','Lektor Kepala':'IV/c','Guru Besar':'IV/e'},
  MASA_KERJA_MINIMAL: {dosen:2,tendik_jabatan_fungsional:2,tendik_non_jabatan_fungsional:4},
  JENIS_PENSIUN_LIST: ['BUP','Meninggal','Diberhentikan','Pengunduran Diri','Uzur'],
  USULAN_PENSIUN_DOKUMEN_TAMBAHAN: {'BUP':[],'Meninggal':['Surat Bukti Kematian'],'Uzur':['Bukti Tes Kesehatan'],'Pengunduran Diri':['Surat Pernyataan Pengunduran Diri','Surat Pengantar Pimpinan Unit']},
  KONTRAK_JENIS_PEG_ELIGIBLE: ['Tenaga Profesional','Kontrak Penuh Waktu','Kontrak Paruh Waktu','Tenaga Kontrak Penghargaan','KDRP'],
  KONTRAK_UPAH_TIER: {tier1:2903600,tier2:3026400},
  ROLE_LIST: ['normal','user','admin','super_admin'],
  LAYANAN_LIST: {'Kenaikan Pangkat':['AK Konversi Tahunan','AK Konversi Kumulatif'],'Pensiun':['DPCP','SUPER'],'Kontrak Tendik':['Kontrak Penuh Waktu','Kontrak Paruh Waktu','KDRP','Tenaga Profesional'],'Kontrak Dosen':['Kontrak Penuh Waktu','Kontrak Paruh Waktu','Tenaga Kontrak Penghargaan']},
  USULAN_KP_KATA_KUNCI_PNS: ['pns'],
  USULAN_KP_NOTIF_SIASN: 'Siap diusulkan ke-SIASN',
  USULAN_KP_NOTIF_SK:    'Sedang dibuatkan SK',
  TENDIK_JABATAN_FUNGSIONAL_LIST: ['Analis Data dan Informasi','Analis Sistem Informasi','Analis SDM Aparatur','Apoteker','Arsiparis','Asisten Apoteker','Bidan','Dokter','Elektromedis','Fisioterapis','Nutrisionis','Ortotis Prostetis','Perawat','Perawat Gigi','Perekam Medis','Pranata Laboratorium Kesehatan','Psikolog Klinis','Pustakawan','Radiografer','Sanitarian','Terapis Gigi dan Mulut','Terapis Okupasi','Terapis Wicara','Pranata Laboratorium Pendidikan','Pranata Komputer','Statistisi','Analis Kebijakan','Perencana','Pranata Hubungan Masyarakat','Pranata SDM Aparatur','Analis Pengelolaan Keuangan APBN','Pranata Keuangan APBN','Pengelola Pengadaan Barang/Jasa'],
  PENDIDIKAN_GOLONGAN_REGULER: {'SD':{min:'I/a',max:'I/d'},'SMP':{min:'I/c',max:'I/d'},'SMA/SMK':{min:'II/a',max:'III/d'},'D-I':{min:'II/b',max:'III/d'},'D-II':{min:'II/c',max:'III/d'},'D-III':{min:'II/c',max:'III/d'},'D-IV/S-1':{min:'III/a',max:'III/d'},'S-2':{min:'III/b',max:'III/d'},'S-3':{min:'III/c',max:'III/d'}}
};

const BULAN_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const JWT_SECRET = process.env.JWT_SECRET || 'simpeg-secret-change-me-in-env';

// ================================================================
// UTILITY FUNCTIONS (dari Utils.gs)
// ================================================================
function toDate(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === 'number') {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + value * 86400000);
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2])-1, Number(iso[3]));
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
      const day=Number(dmy[1]),month=Number(dmy[2]),year=Number(dmy[3]);
      if (month>=1&&month<=12&&day>=1&&day<=31) return new Date(year,month-1,day);
    }
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function formatTanggalIndonesia(value) {
  const d = toDate(value);
  if (!d) return (value===null||value===undefined)?'':String(value);
  return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

function diffYears(a, b) {
  const d1=toDate(a), d2=toDate(b);
  if (!d1||!d2) return 0;
  let years = d2.getFullYear()-d1.getFullYear();
  const passed = d2.getMonth()>d1.getMonth()||(d2.getMonth()===d1.getMonth()&&d2.getDate()>=d1.getDate());
  if (!passed) years--;
  return Math.max(0,years);
}

function diffDays(a, b) {
  const d1=toDate(a), d2=toDate(b);
  if (!d1||!d2) return 0;
  return Math.round((d2.getTime()-d1.getTime())/86400000);
}

// ================================================================
// AUTH HELPERS
// ================================================================
function extractPassword(nip, statusKepegawaian) {
  let n = String(nip||'').trim();
  const isNonAsn = String(statusKepegawaian||'').trim()===CONFIG.STATUS_NON_ASN_LABEL;
  if (isNonAsn && n.startsWith(CONFIG.NIP_IGNORED_PREFIX)) n=n.substring(CONFIG.NIP_IGNORED_PREFIX.length);
  return n.replace(/\D/g,'').substring(0,CONFIG.PASSWORD_DIGIT_LENGTH);
}

function normalizeNipForMatch(nip, statusKepegawaian) {
  let n = String(nip||'').trim();
  const isNonAsn = String(statusKepegawaian||'').trim()===CONFIG.STATUS_NON_ASN_LABEL;
  if (isNonAsn && n.startsWith(CONFIG.NIP_IGNORED_PREFIX)) n=n.substring(CONFIG.NIP_IGNORED_PREFIX.length);
  return n.trim();
}

function signToken(employee, role) {
  return jwt.sign(
    { nip: employee.nip, nama: employee.nama_lengkap||employee.nama||'', jabatan: employee.jabatan||'', status_kepegawaian: employee.status_kepegawaian||'', role },
    JWT_SECRET,
    { expiresIn: CONFIG.SESSION_TTL_SECONDS }
  );
}

function verifyToken(token) {
  if (!token) throw new Error('Sesi tidak ditemukan. Silakan login kembali.');
  try { return jwt.verify(token, JWT_SECRET); }
  catch(e) { throw new Error('Sesi telah berakhir. Silakan login kembali.'); }
}

function requireRole(token, allowedRoles) {
  const decoded = verifyToken(token);
  if (allowedRoles && !allowedRoles.includes(decoded.role)) {
    throw new Error('Anda tidak memiliki hak akses untuk aksi ini.');
  }
  return decoded;
}

// ================================================================
// DATABASE HELPERS
// ================================================================
async function findEmployeeByNip(inputNip) {
  const db = getDb();
  const inputTrim = String(inputNip||'').trim();

  // Direct lookup by NIP
  const { data, error } = await db.from('data_utama').select('*').eq('nip', inputTrim).maybeSingle();
  if (error) throw error;
  if (data) return data;

  // Try without H.7. prefix
  const nipStripped = inputTrim.startsWith(CONFIG.NIP_IGNORED_PREFIX)
    ? inputTrim.substring(CONFIG.NIP_IGNORED_PREFIX.length)
    : inputTrim;

  const { data: data2, error: err2 } = await db.from('data_utama').select('*')
    .or(`nip.eq.${inputTrim},nip.eq.${nipStripped}`)
    .maybeSingle();
  if (err2) throw err2;
  return data2 || null;
}

async function getUserRole(nip) {
  const db = getDb();
  const { data } = await db.from('user_roles').select('role').eq('nip', nip).maybeSingle();
  return data?.role || 'normal';
}

function tentukanNotifStatusAkhir(statusKepegawaian) {
  const s = String(statusKepegawaian||'').toLowerCase();
  const cocok = CONFIG.USULAN_KP_KATA_KUNCI_PNS.some(kw=>s.includes(kw.toLowerCase()));
  return cocok ? CONFIG.USULAN_KP_NOTIF_SIASN : CONFIG.USULAN_KP_NOTIF_SK;
}

// ================================================================
// SUPABASE STORAGE — upload base64 lampiran
// ================================================================
async function uploadLampiran(base64DataUrl, namaFile, subfolder) {
  if (!base64DataUrl) return '';
  const db = getDb();
  const parts  = base64DataUrl.split(',');
  const mime   = (parts[0].match(/:(.*?);/)||[,'application/octet-stream'])[1];
  const rawB64 = parts[1];
  const buf    = Buffer.from(rawB64, 'base64');
  const path   = `${subfolder||'misc'}/${Date.now()}-${(namaFile||'lampiran').replace(/[^a-zA-Z0-9._-]/g,'-')}`;

  const { error } = await db.storage.from('lampiran-usulan').upload(path, buf, { contentType: mime, upsert: false });
  if (error) throw error;

  const { data } = db.storage.from('lampiran-usulan').getPublicUrl(path);
  return data?.publicUrl || path;
}

// ================================================================
// ELIGIBILITY HELPERS (dari EligibilityService.gs)
// ================================================================
function normalisasiGolongan(g) { return String(g||'').replace(/^Set\.\s*/i,'').trim(); }

function hitungPengurangan(golonganIntegrasi, golonganSekarang) {
  const u = CONFIG.GOLONGAN_URUTAN;
  const i1 = u.indexOf(normalisasiGolongan(golonganIntegrasi));
  const i2 = u.indexOf(normalisasiGolongan(golonganSekarang));
  if (i1===-1||i2===-1||i2<=i1) return 0;
  let total=0;
  for (let i=i1+1;i<=i2;i++) total += CONFIG.PENGURANGAN_GOLONGAN[u[i]]||0;
  return total;
}

function hitungAkKonversiTahunan(predikat, jabatan, bulanMulai, bulanAkhir) {
  const pres = CONFIG.PRESENTASE_PREDIKAT[predikat];
  const koef = CONFIG.KOEFISIEN_JABATAN[jabatan];
  if (pres===undefined||koef===undefined) return 0;
  const bm=Number(bulanMulai),ba=Number(bulanAkhir);
  if (!bm||!ba||ba<bm) return 0;
  return pres * koef * ((ba-bm+1)/12);
}

function hitungNilaiPendidikanBaru(adaIjazah, golonganSekarang) {
  if (adaIjazah!=='Ada') return 0;
  return (CONFIG.KEBUTUHAN_AK_GOLONGAN[normalisasiGolongan(golonganSekarang)]||0)*CONFIG.FAKTOR_NILAI_PENDIDIKAN;
}

// ================================================================
// PROMOSI DASHBOARD HELPERS (dari PromosiDashboard.gs)
// ================================================================
function hitungTargetTmtPromosi(today) {
  const day=today.getDate(),month=today.getMonth()+1,year=today.getFullYear();
  let wsm=day>=16?month:month-1, wsy=year;
  if (wsm===0){wsm=12;wsy--;}
  let tm=wsm+2,ty=wsy;
  if (tm>12){tm-=12;ty++;}
  return {targetMonth:tm,targetYear:ty,targetDate:new Date(ty,tm-1,1)};
}

function klasifikasiPegawai(jabatan) {
  const j=String(jabatan||'').trim();
  if (CONFIG.JABATAN_FUNGSIONAL_LIST.includes(j)) return 'dosen';
  if (CONFIG.TENDIK_JABATAN_FUNGSIONAL_LIST.includes(j)) return 'tendik_jabatan_fungsional';
  return 'tendik_non_jabatan_fungsional';
}

function golonganIndex(g) { return CONFIG.GOLONGAN_URUTAN.indexOf(normalisasiGolongan(g)); }

function pendidikanTier(p) {
  const s=String(p||'').trim().toUpperCase();
  if (!s) return null;
  if (/^SD/.test(s)) return 'SD';
  if (/^SMP|^SLTP/.test(s)) return 'SMP';
  if (/^SMA|^SMK|^SLTA/.test(s)) return 'SMA/SMK';
  if (/^D[\s\-.]?1|^D[\s\-.]?I(?!\w)/.test(s)) return 'D-I';
  if (/^D[\s\-.]?2|^D[\s\-.]?II(?!\w)/.test(s)) return 'D-II';
  if (/^D[\s\-.]?3|^D[\s\-.]?III(?!\w)/.test(s)) return 'D-III';
  if (/^D[\s\-.]?4|^D[\s\-.]?IV(?!\w)|^S[\s\-.]?1(?!\d)|SARJANA/.test(s)) return 'D-IV/S-1';
  if (/^S[\s\-.]?2(?!\d)|MAGISTER|MASTER/.test(s)) return 'S-2';
  if (/^S[\s\-.]?3(?!\d)|DOKTOR/.test(s)) return 'S-3';
  return null;
}

function sudahMencapaiBatasGolongan(kategori, emp) {
  const gi = golonganIndex(emp.golongan);
  if (gi===-1) return {determinable:false,batasGolongan:null,sudahMencapaiBatas:false};
  if (kategori==='dosen') {
    const batas=CONFIG.JABATAN_GOLONGAN_TERTINGGI[String(emp.jabatan||'').trim()];
    if (!batas) return {determinable:false,batasGolongan:null,sudahMencapaiBatas:false};
    return {determinable:true,batasGolongan:batas,sudahMencapaiBatas:gi>=golonganIndex(batas)};
  }
  if (kategori==='tendik_non_jabatan_fungsional') {
    const tier=pendidikanTier(emp.pendidikan);
    if (!tier) return {determinable:false,batasGolongan:null,sudahMencapaiBatas:false};
    const batas=CONFIG.PENDIDIKAN_GOLONGAN_REGULER[tier].max;
    return {determinable:true,batasGolongan:batas,sudahMencapaiBatas:gi>=golonganIndex(batas)};
  }
  return {determinable:true,batasGolongan:null,sudahMencapaiBatas:false};
}

function klasifikasiStatusBekerja(sb) {
  const s=String(sb||'').trim().toLowerCase();
  if (/diberhentikan\s+sementara/.test(s)) return {dikenali:true,eligibleSamaSekali:false,track:'normal',notifPerhatian:false,labelStatus:'Diberhentikan Sementara'};
  if (/\bnon[\s-]?aktif\b|\btidak\s+aktif\b/.test(s)) return {dikenali:true,eligibleSamaSekali:false,track:'normal',notifPerhatian:false,labelStatus:'Non Aktif'};
  if (/tugas\s+belajar/.test(s)) {
    const bebas=!/tidak\s+bebas/.test(s)&&/\bbebas\b/.test(s);
    const tidakBebas=/tidak\s+bebas/.test(s);
    if (bebas) return {dikenali:true,eligibleSamaSekali:true,track:'reguler',notifPerhatian:true,labelStatus:'Tugas Belajar - Bebas Jabatan'};
    if (tidakBebas) return {dikenali:true,eligibleSamaSekali:true,track:'normal',notifPerhatian:true,labelStatus:'Tugas Belajar - Tidak Bebas Jabatan'};
    return {dikenali:false,eligibleSamaSekali:false,track:'normal',notifPerhatian:true,labelStatus:'Tugas Belajar (status tidak terbaca)'};
  }
  if (/ijin\s+belajar|izin\s+belajar/.test(s)) return {dikenali:true,eligibleSamaSekali:true,track:'normal',notifPerhatian:false,labelStatus:'Ijin Belajar'};
  if (/dipekerjakan/.test(s)) return {dikenali:true,eligibleSamaSekali:true,track:'normal',notifPerhatian:true,labelStatus:'Dipekerjakan'};
  return {dikenali:true,eligibleSamaSekali:true,track:'normal',notifPerhatian:false,labelStatus:String(sb||'Aktif Bekerja').trim()};
}

function cekEligiblePromosi(emp, targetDate) {
  const kategori=klasifikasiPegawai(emp.jabatan);
  const statusInfo=klasifikasiStatusBekerja(emp.status_bekerja);
  if (!statusInfo.eligibleSamaSekali) return {kategori,eligible:false,masaKerjaTahun:0,syaratTahun:0,batasGolongan:null,sudahMencapaiBatas:false,batasTidakDiketahui:false,statusInfo,jalurReguler:false};
  const isJf=(kategori==='dosen'||kategori==='tendik_jabatan_fungsional');
  const jalurReguler=kategori==='tendik_non_jabatan_fungsional'||(isJf&&statusInfo.track==='reguler');
  const syaratTahun=jalurReguler?CONFIG.MASA_KERJA_MINIMAL.tendik_non_jabatan_fungsional:CONFIG.MASA_KERJA_MINIMAL[kategori]||0;
  const masaKerjaTahun=diffYears(emp.tmt_gol,targetDate);
  const cukup=!!emp.tmt_gol&&masaKerjaTahun>=syaratTahun;
  const kat2=jalurReguler?'tendik_non_jabatan_fungsional':kategori;
  const batasInfo=sudahMencapaiBatasGolongan(kat2,emp);
  return {kategori,eligible:cukup&&batasInfo.determinable&&!batasInfo.sudahMencapaiBatas,masaKerjaTahun,syaratTahun,batasGolongan:batasInfo.batasGolongan,sudahMencapaiBatas:batasInfo.sudahMencapaiBatas,batasTidakDiketahui:!batasInfo.determinable,statusInfo,jalurReguler};
}

// ================================================================
// RPC METHODS — semua fungsi yang bisa dipanggil dari frontend
// ================================================================
const methods = {

  // ---- AUTH ----

  async login([nip, password]) {
    if (!nip||!password) return {success:false,message:'NIP dan password wajib diisi.'};
    const emp = await findEmployeeByNip(nip);
    if (!emp) return {success:false,message:'NIP tidak ditemukan.'};
    const valid = extractPassword(emp.nip, emp.status_kepegawaian);
    if (!valid||String(password).trim()!==valid) return {success:false,message:`Password salah. Gunakan ${CONFIG.PASSWORD_DIGIT_LENGTH} digit pertama dari NIP.`};
    const role = await getUserRole(emp.nip);
    const token = signToken(emp, role);
    return {success:true,message:'Login berhasil.',token,user:{nip:emp.nip,nama:emp.nama_lengkap||emp.nama,jabatan:emp.jabatan||'',status_kepegawaian:emp.status_kepegawaian||'',role}};
  },

  async register([nama, nipInput, unitKerja]) {
    const namaTrim=String(nama||'').trim(),nipTrim=String(nipInput||'').trim(),unitTrim=String(unitKerja||'').trim();
    if (!namaTrim||!nipTrim||!unitTrim) return {success:false,message:'Nama, NIP, dan Unit Kerja wajib diisi.'};
    if (nipTrim.replace(/\D/g,'').length<CONFIG.PASSWORD_DIGIT_LENGTH) return {success:false,message:`NIP harus berisi minimal ${CONFIG.PASSWORD_DIGIT_LENGTH} digit angka.`};
    const existing = await findEmployeeByNip(nipTrim);
    if (existing) return {success:false,message:'NIP sudah terdaftar. Silakan langsung Masuk (login).'};
    const db=getDb();
    const {error}=await db.from('data_utama').insert({nip:nipTrim,nama_lengkap:namaTrim,nama:namaTrim,unit_es_ii:unitTrim});
    if (error) throw error;
    const emp=await findEmployeeByNip(nipTrim);
    if (!emp) return {success:false,message:'Registrasi tersimpan, tetapi gagal memuat sesi.'};
    const role='normal';
    const token=signToken(emp,role);
    const pw=extractPassword(emp.nip,emp.status_kepegawaian);
    return {success:true,message:`Registrasi berhasil. Password Anda: ${pw} (${CONFIG.PASSWORD_DIGIT_LENGTH} digit pertama NIP).`,token,user:{nip:emp.nip,nama:emp.nama_lengkap||emp.nama,jabatan:'',status_kepegawaian:'',role}};
  },

  async logout([token]) {
    // Stateless JWT — tidak ada yang perlu dihapus di server
    return {success:true};
  },

  async validateSession([token]) {
    try {
      const decoded=verifyToken(token);
      return {valid:true,user:{nip:decoded.nip,nama:decoded.nama,jabatan:decoded.jabatan||'',status_kepegawaian:decoded.status_kepegawaian||'',role:decoded.role}};
    } catch(e) { return {valid:false,message:e.message}; }
  },

  // ---- DATA PEGAWAI ----

  async searchEmployees([token, query]) {
    verifyToken(token);
    const q=String(query||'').trim().toLowerCase();
    if (q.length<1) return [];
    const db=getDb();
    const {data,error}=await db.from('data_utama')
      .select('nip,nama_lengkap,nama')
      .or(`nama_lengkap.ilike.%${q}%,nama.ilike.%${q}%,nip.ilike.%${q}%`)
      .limit(20);
    if (error) throw error;
    return (data||[]).map(e=>({nip:e.nip,nama:e.nama_lengkap||e.nama}));
  },

  async getEmployeeFullData([token, nip]) {
    verifyToken(token);
    const db=getDb();
    const {data,error}=await db.from('data_utama').select('*').eq('nip',String(nip||'').trim()).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Data pegawai dengan NIP tersebut tidak ditemukan.');
    return data;
  },

  async getProfilSaya([token]) {
    const decoded=verifyToken(token);
    const db=getDb();
    const {data,error}=await db.from('data_utama').select('*').eq('nip',decoded.nip).maybeSingle();
    if (error) throw error;
    if (!data) return {success:false,message:'Data tidak ditemukan.'};
    const profil={};
    CONFIG.PROFIL_NORMAL_FIELDS.forEach(f=>{ profil[f]=formatTanggalIndonesia(data[f])||data[f]||''; });
    return {success:true,profil};
  },

  // ---- ROLES ----

  async getAllUserRolesForAdmin([token]) {
    requireRole(token,['super_admin']);
    const db=getDb();
    const {data:emps}=await db.from('data_utama').select('nip,nama_lengkap,nama,unit_es_ii').order('nama_lengkap');
    const {data:roles}=await db.from('user_roles').select('nip,role');
    const rolesMap={};
    (roles||[]).forEach(r=>{rolesMap[r.nip]=r.role;});
    const daftar=(emps||[]).filter(e=>e.nip).map(e=>({nip:e.nip,nama:e.nama_lengkap||e.nama||'',unitEsIi:e.unit_es_ii||'',role:rolesMap[e.nip]||'normal'}));
    return {success:true,daftar};
  },

  async ubahPeranAkun([token, targetNip, peranBaru]) {
    const caller=requireRole(token,['super_admin']);
    if (!['normal','user','admin'].includes(peranBaru)) return {success:false,message:'Peran tidak valid.'};
    const curRole=await getUserRole(targetNip);
    if (curRole==='super_admin') return {success:false,message:'Tidak bisa mengubah peran Super Admin.'};
    const db=getDb();
    const {error}=await db.from('user_roles').upsert({nip:targetNip,role:peranBaru,diubah_oleh:caller.nip,tanggal_diubah:new Date().toISOString()},{onConflict:'nip'});
    if (error) throw error;
    return {success:true,message:`Peran berhasil diubah menjadi "${peranBaru}".`};
  },

  // ---- TEMPLATES ----

  async getAllTemplates([token]) {
    verifyToken(token);
    const {data,error}=await getDb().from('templates').select('*').order('dibuat_pada',{ascending:false});
    if (error) throw error;
    return (data||[]).map(t=>({id:t.id,judul:t.judul,fileId:t.file_id,layanan:t.layanan,subMenu:t.sub_menu,dibuatPada:t.dibuat_pada}));
  },

  async addTemplate([token, templateData]) {
    requireRole(token,['admin','super_admin']);
    const {driveLink,judul,layanan,subMenu}=templateData||{};
    if (!judul||!layanan||!subMenu||!driveLink) return {success:false,message:'Judul, Layanan, Sub-menu, dan Link Drive wajib diisi.'};
    const fileId=extractDriveFileId(driveLink);
    if (!fileId) return {success:false,message:'Link Google Drive tidak valid.'};
    const {data,error}=await getDb().from('templates').insert({judul,file_id:fileId,layanan,sub_menu:subMenu}).select().single();
    if (error) throw error;
    return {success:true,message:`Template "${judul}" berhasil ditambahkan.`,id:data.id};
  },

  async deleteTemplate([token, templateId]) {
    requireRole(token,['admin','super_admin']);
    const {error}=await getDb().from('templates').delete().eq('id',templateId);
    if (error) throw error;
    return {success:true,message:'Template dihapus.'};
  },

  async getTemplatesForService([token, layanan, subMenu]) {
    verifyToken(token);
    const {data,error}=await getDb().from('templates').select('*').eq('layanan',layanan).eq('sub_menu',subMenu);
    if (error) throw error;
    return (data||[]).map(t=>({id:t.id,judul:t.judul,fileId:t.file_id,layanan:t.layanan,subMenu:t.sub_menu}));
  },

  // ---- CONFIG / OPTIONS ----

  async getConfigPublic([]) {
    return {
      golonganPilihan:  CONFIG.GOLONGAN_PILIHAN,
      jabatanFungsional:CONFIG.JABATAN_FUNGSIONAL_LIST,
      predikatSkp:      CONFIG.PREDIKAT_SKP_LIST,
      bulanList:        CONFIG.BULAN_LIST,
      ijazahBaru:       CONFIG.IJAZAH_BARU_2023_LIST,
      jenisPensiun:     CONFIG.JENIS_PENSIUN_LIST,
      layananList:      CONFIG.LAYANAN_LIST,
      kontrakJenisPeg:  CONFIG.KONTRAK_JENIS_PEG_ELIGIBLE,
      roleList:         CONFIG.ROLE_LIST,
      dokumenTambahan:  CONFIG.USULAN_PENSIUN_DOKUMEN_TAMBAHAN
    };
  },

  async getLayananOptions([]) {
    return CONFIG.LAYANAN_LIST;
  },

  // ---- FORM OPTIONS (sebelumnya hanya di Apps Script) ----

  async getEligibilityFormOptions([]) {
    return {
      golongan: CONFIG.GOLONGAN_PILIHAN,
      jabatan:  CONFIG.JABATAN_FUNGSIONAL_LIST,
      predikat: CONFIG.PREDIKAT_SKP_LIST,
      bulan:    CONFIG.BULAN_LIST,
      ijazahBaru: CONFIG.IJAZAH_BARU_2023_LIST
    };
  },

  async getDocGenFormOptions([]) {
    return {
      predikat:   ['Sangat Baik','Baik'],
      ijazahBaru: CONFIG.IJAZAH_BARU_2023_LIST
    };
  },

  async getKontrakFormOptions([]) {
    const tahunSekarang = new Date().getFullYear();
    const daftarTahun = [];
    for (let t = tahunSekarang - 1; t <= tahunSekarang + 3; t++) daftarTahun.push(t);
    return {
      jangkaWaktuBulan: [1,2,3,4,5,6,7,8,9,10,11,12],
      bulan:            CONFIG.BULAN_LIST,
      tahun:            daftarTahun,
      jenisPegEligible: CONFIG.KONTRAK_JENIS_PEG_ELIGIBLE,
      subMenuTendik:    CONFIG.LAYANAN_LIST['Kontrak Tendik'],
      subMenuDosen:     CONFIG.LAYANAN_LIST['Kontrak Dosen']
    };
  },

  async getPensiunFormOptions([]) {
    return {
      jenisPensiun: CONFIG.JENIS_PENSIUN_LIST
    };
  },

  async getStatusAksesKontrakSaya([token]) {
    const decoded = verifyToken(token);
    const db = getDb();
    const { data: emp, error } = await db.from('data_utama').select('jenis_peg').eq('nip', decoded.nip).maybeSingle();
    if (error) throw error;
    const jenisPegSaya = String((emp && emp.jenis_peg) || '').trim();
    const eligible = CONFIG.KONTRAK_JENIS_PEG_ELIGIBLE.some(j => j.toLowerCase() === jenisPegSaya.toLowerCase());
    if (!eligible) return { success: true, eligible: false, diizinkan: false, jenisPeg: jenisPegSaya };

    // Cek tabel akses_kontrak_mandiri di Supabase
    const kategoriCocok = CONFIG.KONTRAK_JENIS_PEG_ELIGIBLE.find(j => j.toLowerCase() === jenisPegSaya.toLowerCase());
    const { data: aksesRow } = await db.from('akses_kontrak_mandiri')
      .select('diizinkan').eq('kategori', kategoriCocok).order('tanggal_diubah', { ascending: false }).limit(1).maybeSingle();
    const diizinkan = eligible && aksesRow && aksesRow.diizinkan === true;
    return { success: true, eligible, diizinkan, jenisPeg: jenisPegSaya };
  },

  async getSemuaStatusAksesKontrakKategori([token]) {
    requireRole(token, ['admin','super_admin']);
    const db = getDb();
    const { data: rows } = await db.from('akses_kontrak_mandiri').select('kategori,diizinkan').order('tanggal_diubah', { ascending: false });
    // Ambil baris terakhir per kategori
    const peta = {};
    (rows || []).forEach(r => { if (!(r.kategori in peta)) peta[r.kategori] = r.diizinkan; });
    const daftar = CONFIG.KONTRAK_JENIS_PEG_ELIGIBLE.map(k => ({ kategori: k, diizinkan: !!peta[k] }));
    return { success: true, daftar };
  },

  async getLatestSavedGenerateData([token, nip]) {
    verifyToken(token);
    const db = getDb();
    // Coba dari tabel save_data (atau usulan_pensiun jika tersedia)
    const { data } = await db.from('usulan_pensiun').select('*').eq('nip', String(nip||'').trim())
      .order('tanggal_diajukan', { ascending: false }).limit(1).maybeSingle();
    if (!data) return null;
    return data;
  },

  // ---- CHECK ELIGIBLE ----

  async checkEligibility([token, payload]) {
    verifyToken(token);
    const {targetNip,jabatan,akIntegrasi,golonganIntegrasi,adaIjazahBaru2023,daftarPredikatSkp,golongan,tmt_gol,tmt_jab}=payload||{};
    if (!targetNip) return {success:false,message:'Pilih pegawai terlebih dahulu.'};
    if (!jabatan)   return {success:false,message:'Jabatan wajib dipilih.'};
    if (!golonganIntegrasi) return {success:false,message:'Golongan Saat Integrasi wajib dipilih.'};
    if (!adaIjazahBaru2023) return {success:false,message:'Ada Ijazah Baru Setelah 2023 wajib dipilih.'};
    const emp=await methods.getEmployeeFullData([token,targetNip]);
    const golonganSekarang=golongan||emp.golongan;
    const totalAkKonversi=(daftarPredikatSkp||[]).reduce((s,r)=>s+hitungAkKonversiTahunan(r.predikat,jabatan,r.bulanMulai,r.bulanAkhir),0);
    const nilaiPendidikan=hitungNilaiPendidikanBaru(adaIjazahBaru2023,golonganSekarang);
    const pengurangan=hitungPengurangan(golonganIntegrasi,golonganSekarang);
    const totalAkAkhir=(Number(akIntegrasi)||0)+totalAkKonversi+nilaiPendidikan-pengurangan;
    const kebutuhan=CONFIG.KEBUTUHAN_AK_GOLONGAN[normalisasiGolongan(golonganSekarang)];
    const eligible=kebutuhan!==undefined&&totalAkAkhir>kebutuhan;
    return {
      success:true,nip:emp.nip,nama:emp.nama_lengkap||emp.nama,golonganSekarang,jabatan,
      tmtGolonganBaru:tmt_gol||'',tmtJabatanBaru:tmt_jab||'',
      totalAkAkhir:Math.round(totalAkAkhir*100)/100,
      rincian:{akIntegrasi:Number(akIntegrasi)||0,totalAkKonversi,nilaiPendidikanBaru:nilaiPendidikan,pengurangan},
      eligibility:{status:eligible?'Eligible':'Belum Eligible',kebutuhan:kebutuhan??null,message:eligible?`Total AK (${totalAkAkhir.toFixed(2)}) melebihi kebutuhan (${kebutuhan}).`:`Total AK (${totalAkAkhir.toFixed(2)}) belum memenuhi kebutuhan (${kebutuhan}).`}
    };
  },

  // ---- PROMOSI DASHBOARD ----

  async getPromosiDashboardSummary([token]) {
    verifyToken(token);
    const db=getDb();
    const {data:emps, error}=await db.from('data_utama').select('nip,nama_lengkap,nama,jabatan,golongan,tmt_gol,status_bekerja,pendidikan,unit_es_ii');
    if (error) throw error;
    const target=hitungTargetTmtPromosi(new Date());
    const perUnit={};
    (emps||[]).forEach(emp=>{
      const sb=klasifikasiStatusBekerja(emp.status_bekerja);
      if (!sb.eligibleSamaSekali) return;
      const hasil=cekEligiblePromosi(emp,target.targetDate);
      if (!hasil.eligible) return;
      const unit=String(emp.unit_es_ii||'(Tanpa Unit)').trim()||'(Tanpa Unit)';
      if (!perUnit[unit]) perUnit[unit]={dosen:0,tendik:0};
      if (hasil.kategori==='dosen') perUnit[unit].dosen++;
      else perUnit[unit].tendik++;
    });
    const daftarUnit=Object.keys(perUnit).sort().map(u=>({unit:u,dosen:perUnit[u].dosen,tendik:perUnit[u].tendik,total:perUnit[u].dosen+perUnit[u].tendik}));
    return {success:true,targetTmt:`1 ${BULAN_ID[target.targetMonth-1]} ${target.targetYear}`,daftarUnit};
  },

  async getPromosiEligibleList([token, unit, kategoriFilter]) {
    verifyToken(token);
    const db=getDb();
    const {data:emps, error}=await db.from('data_utama').select('*').eq('unit_es_ii',unit);
    if (error) throw error;
    const target=hitungTargetTmtPromosi(new Date());
    const hasil=(emps||[])
      .map(emp=>Object.assign({emp},cekEligiblePromosi(emp,target.targetDate)))
      .filter(r=>r.eligible)
      .filter(r=>kategoriFilter==='dosen'?r.kategori==='dosen':r.kategori!=='dosen')
      .map(r=>({nip:r.emp.nip,nama:r.emp.nama_lengkap||r.emp.nama,jabatan:r.emp.jabatan,kategori:r.kategori,tmtGolongan:formatTanggalIndonesia(r.emp.tmt_gol),golonganSekarang:r.emp.golongan,batasGolongan:r.batasGolongan,masaKerjaTahun:r.masaKerjaTahun,syaratTahun:r.syaratTahun,jalurReguler:r.jalurReguler,notifPerhatian:r.statusInfo.notifPerhatian,labelStatus:r.statusInfo.labelStatus}))
      .sort((a,b)=>String(a.nama).localeCompare(String(b.nama)));
    return {success:true,targetTmt:`1 ${BULAN_ID[target.targetMonth-1]} ${target.targetYear}`,daftar:hasil};
  },

  // ---- PENSIUN DASHBOARD ----

  async getPensiunDashboardSummary([token]) {
    verifyToken(token);
    const db=getDb();
    const {data:emps, error}=await db.from('data_utama').select('nip,nama_lengkap,nama,jabatan,unit_es_ii,tmt_pensiun_bup');
    if (error) throw error;
    const ambangHari=CONFIG.PENSIUN_DASHBOARD_AMBANG_TAHUN*365;
    const perUnit={};
    (emps||[]).forEach(emp=>{
      if (!emp.tmt_pensiun_bup) return;
      const sisa=diffDays(new Date(),emp.tmt_pensiun_bup);
      if (sisa<0||sisa>ambangHari) return;
      const unit=String(emp.unit_es_ii||'(Tanpa Unit)').trim()||'(Tanpa Unit)';
      perUnit[unit]=(perUnit[unit]||0)+1;
    });
    const daftarUnit=Object.keys(perUnit).sort().map(u=>({unit:u,jumlah:perUnit[u]}));
    return {success:true,ambangTahun:CONFIG.PENSIUN_DASHBOARD_AMBANG_TAHUN,daftarUnit};
  },

  async getPensiunEligibleList([token, unit]) {
    verifyToken(token);
    const db=getDb();
    const {data:emps, error}=await db.from('data_utama').select('nip,nama_lengkap,nama,jabatan,tmt_pensiun_bup,unit_es_ii').eq('unit_es_ii',unit);
    if (error) throw error;
    const ambangHari=CONFIG.PENSIUN_DASHBOARD_AMBANG_TAHUN*365;
    const daftar=(emps||[])
      .filter(e=>{
        if (!e.tmt_pensiun_bup) return false;
        const sisa=diffDays(new Date(),e.tmt_pensiun_bup);
        return sisa>=0&&sisa<=ambangHari;
      })
      .map(e=>({nip:e.nip,nama:e.nama_lengkap||e.nama,jabatan:e.jabatan,tmtPensiunBup:formatTanggalIndonesia(e.tmt_pensiun_bup),sisaHari:diffDays(new Date(),e.tmt_pensiun_bup)}))
      .sort((a,b)=>a.sisaHari-b.sisaHari);
    return {success:true,daftar};
  },

  // ---- USULAN KP ----

  async ajukanUsulanKP([token, payload]) {
    const decoded=requireRole(token,['user','admin','super_admin']);
    const {daftarPegawai=[],suratPengantarBase64,namaFileSuratPengantar}=payload||{};
    if (!daftarPegawai.length) return {success:false,message:'Pilih minimal 1 pegawai.'};
    if (!suratPengantarBase64) return {success:false,message:'Surat pengantar wajib diunggah.'};
    const fileUrl=await uploadLampiran(suratPengantarBase64,namaFileSuratPengantar,'kp');
    const db=getDb();
    const batchId=uuidv4();
    const now=new Date().toISOString();
    const {data:emps}=await db.from('data_utama').select('nip,unit_es_ii').in('nip',daftarPegawai.map(p=>p.nip));
    const empMap={};
    (emps||[]).forEach(e=>{empMap[e.nip]=e;});
    const rows=daftarPegawai.map(p=>({batch_id:batchId,nip:p.nip,nama:p.nama,unit:(empMap[p.nip]&&empMap[p.nip].unit_es_ii)||'',diajukan_oleh_nip:decoded.nip,nama_pengaju:decoded.nama,tanggal_diajukan:now,file_url:fileUrl,status:'Diajukan'}));
    const {error}=await db.from('usulan_kp').insert(rows);
    if (error) throw error;
    return {success:true,message:`Usulan untuk ${rows.length} pegawai berhasil diajukan.`};
  },

  async getUsulanNotifikasiSummary([token]) {
    requireRole(token,['admin','super_admin']);
    const {data}=await getDb().from('usulan_kp').select('unit').eq('status','Diajukan');
    const perUnit={};
    (data||[]).forEach(u=>{const unit=String(u.unit||'(Tanpa Unit)').trim()||'(Tanpa Unit)';perUnit[unit]=(perUnit[unit]||0)+1;});
    const daftarUnit=Object.keys(perUnit).sort().map(unit=>({unit,jumlah:perUnit[unit]}));
    return {success:true,totalUsulanBaru:(data||[]).length,daftarUnit};
  },

  async getUsulanListByUnit([token, unit]) {
    requireRole(token,['admin','super_admin']);
    const {data}=await getDb().from('usulan_kp').select('*').eq('status','Diajukan').eq('unit',unit);
    const daftar=(data||[]).map(u=>({id:u.id,nip:u.nip,nama:u.nama,namaPengaju:u.nama_pengaju,tanggalDiajukan:formatTanggalIndonesia(u.tanggal_diajukan),fileUrl:u.file_url,opsiASelesai:!!u.opsi_a_selesai_pada,opsiBSelesai:!!u.opsi_b_selesai_pada})).sort((a,b)=>String(a.nama).localeCompare(String(b.nama)));
    return {success:true,daftar};
  },

  async getUsulanSayaForUser([token]) {
    const decoded=requireRole(token,['user','admin','super_admin']);
    const {data}=await getDb().from('usulan_kp').select('*').eq('diajukan_oleh_nip',decoded.nip).order('tanggal_diajukan',{ascending:false});
    const daftar=(data||[]).map(u=>({nip:u.nip,nama:u.nama,tanggalDiajukan:formatTanggalIndonesia(u.tanggal_diajukan),status:u.status,opsiASelesai:!!u.opsi_a_selesai_pada,opsiBSelesai:!!u.opsi_b_selesai_pada}));
    return {success:true,daftar};
  },

  async tandaiOpsiKpSelesai([token, nip, subLayanan]) {
    const decoded=requireRole(token,['admin','super_admin']);
    const db=getDb();
    const {data:rows}=await db.from('usulan_kp').select('*').eq('nip',nip).eq('status','Diajukan');
    if (!rows||!rows.length) return {success:true};
    const row=rows[0];
    const kol=subLayanan==='AK Konversi Tahunan'?{opsi_a_selesai_pada:new Date().toISOString()}:{opsi_b_selesai_pada:new Date().toISOString()};
    const opsiA=subLayanan==='AK Konversi Tahunan'?true:!!row.opsi_a_selesai_pada;
    const opsiB=subLayanan==='AK Konversi Kumulatif'?true:!!row.opsi_b_selesai_pada;
    const update={...kol};
    if (opsiA&&opsiB) {
      const {data:emp}=await db.from('data_utama').select('status_kepegawaian').eq('nip',nip).maybeSingle();
      update.status=tentukanNotifStatusAkhir(emp?.status_kepegawaian);
      update.diproses_oleh_nip=decoded.nip;
    }
    await db.from('usulan_kp').update(update).eq('id',row.id);
    return {success:true};
  },

  // ---- USULAN PENSIUN ----

  async ajukanUsulanPensiun([token, payload]) {
    const decoded=requireRole(token,['user','admin','super_admin']);
    const {nip,nama,jenisPensiun,suratPengantarBase64,namaFileSuratPengantar,fileTambahan1Base64,namaFileTambahan1,fileTambahan2Base64,namaFileTambahan2}=payload||{};
    if (!nip||!nama) return {success:false,message:'Pilih pegawai terlebih dahulu.'};
    if (!jenisPensiun) return {success:false,message:'Jenis Pensiun wajib dipilih.'};
    if (!suratPengantarBase64) return {success:false,message:'Surat pengantar wajib diunggah.'};
    const dokWajib=CONFIG.USULAN_PENSIUN_DOKUMEN_TAMBAHAN[jenisPensiun]||[];
    if (dokWajib.length>=1&&!fileTambahan1Base64) return {success:false,message:`Dokumen "${dokWajib[0]}" wajib diunggah.`};
    if (dokWajib.length>=2&&!fileTambahan2Base64) return {success:false,message:`Dokumen "${dokWajib[1]}" wajib diunggah.`};
    const db=getDb();
    const {data:emp}=await db.from('data_utama').select('unit_es_ii').eq('nip',nip).maybeSingle();
    const [fileUrl,file1Url,file2Url]=await Promise.all([
      uploadLampiran(suratPengantarBase64,namaFileSuratPengantar,'pensiun'),
      fileTambahan1Base64?uploadLampiran(fileTambahan1Base64,namaFileTambahan1,'pensiun'):Promise.resolve(''),
      fileTambahan2Base64?uploadLampiran(fileTambahan2Base64,namaFileTambahan2,'pensiun'):Promise.resolve('')
    ]);
    const {error}=await db.from('usulan_pensiun').insert({nip,nama,unit:emp?.unit_es_ii||'',jenis_pensiun:jenisPensiun,diajukan_oleh_nip:decoded.nip,nama_pengaju:decoded.nama,file_url:fileUrl,file_tambahan1_url:file1Url,file_tambahan1_label:dokWajib[0]||'',file_tambahan2_url:file2Url,file_tambahan2_label:dokWajib[1]||'',status:'Diajukan'});
    if (error) throw error;
    return {success:true,message:`Usulan pensiun untuk ${nama} berhasil diajukan.`};
  },

  async getUsulanPensiunNotifikasiSummary([token]) {
    requireRole(token,['admin','super_admin']);
    const {data}=await getDb().from('usulan_pensiun').select('unit').eq('status','Diajukan');
    const perUnit={};
    (data||[]).forEach(u=>{const unit=String(u.unit||'(Tanpa Unit)').trim()||'(Tanpa Unit)';perUnit[unit]=(perUnit[unit]||0)+1;});
    const daftarUnit=Object.keys(perUnit).sort().map(unit=>({unit,jumlah:perUnit[unit]}));
    return {success:true,totalUsulanBaru:(data||[]).length,daftarUnit};
  },

  async getUsulanPensiunListByUnit([token, unit]) {
    requireRole(token,['admin','super_admin']);
    const {data}=await getDb().from('usulan_pensiun').select('*').eq('status','Diajukan').eq('unit',unit);
    const daftar=(data||[]).map(u=>({nip:u.nip,nama:u.nama,jenisPensiun:u.jenis_pensiun,namaPengaju:u.nama_pengaju,tanggalDiajukan:formatTanggalIndonesia(u.tanggal_diajukan),fileUrl:u.file_url,fileTambahan1Url:u.file_tambahan1_url,fileTambahan1Label:u.file_tambahan1_label,fileTambahan2Url:u.file_tambahan2_url,fileTambahan2Label:u.file_tambahan2_label,dpcpSelesai:!!u.dpcp_selesai_pada,superSelesai:!!u.super_selesai_pada})).sort((a,b)=>String(a.nama).localeCompare(String(b.nama)));
    return {success:true,daftar};
  },

  async getUsulanPensiunSayaForUser([token]) {
    const decoded=requireRole(token,['user','admin','super_admin']);
    const {data}=await getDb().from('usulan_pensiun').select('*').eq('diajukan_oleh_nip',decoded.nip).order('tanggal_diajukan',{ascending:false});
    const daftar=(data||[]).map(u=>({nip:u.nip,nama:u.nama,jenisPensiun:u.jenis_pensiun,tanggalDiajukan:formatTanggalIndonesia(u.tanggal_diajukan),status:u.status}));
    return {success:true,daftar};
  },

  async tandaiDokumenPensiunSelesai([token, nip, jenisDokumen]) {
    const decoded=requireRole(token,['admin','super_admin']);
    const db=getDb();
    const {data:rows}=await db.from('usulan_pensiun').select('*').eq('nip',nip).eq('status','Diajukan');
    if (!rows||!rows.length) return {success:true};
    const row=rows[0];
    const kol=jenisDokumen==='dpcp'?{dpcp_selesai_pada:new Date().toISOString()}:{super_selesai_pada:new Date().toISOString()};
    const dpcpOk=jenisDokumen==='dpcp'?true:!!row.dpcp_selesai_pada;
    const superOk=jenisDokumen==='super'?true:!!row.super_selesai_pada;
    const update={...kol};
    if (dpcpOk&&superOk) {
      const {data:emp}=await db.from('data_utama').select('status_kepegawaian').eq('nip',nip).maybeSingle();
      update.status=tentukanNotifStatusAkhir(emp?.status_kepegawaian);
      update.diproses_oleh_nip=decoded.nip;
    }
    await db.from('usulan_pensiun').update(update).eq('id',row.id);
    return {success:true};
  },

  // ---- GLOSARIUM TAG ----

  async getGlosariumTag([token]) {
    verifyToken(token);
    const {data:cols}=await getDb().from('data_utama').select('*').limit(1);
    const firstRow = (cols && cols.length > 0) ? cols[0] : {};
    return {
      tagSpreadsheet:Object.keys(firstRow).filter(k=>!['id','created_at'].includes(k)).map(k=>({label:k,tag:`{{${k}}}`})),
      referensiFormula:[
        {label:'Matematika',contoh:'{{ a + b * c }}'},
        {label:'Terbilang',contoh:'{{ nominal | terbilang }}'},
        {label:'Rupiah',contoh:'{{ nominal | rupiah }}'},
        {label:'Huruf besar/kecil',contoh:'{{ jabatan | upper }}  {{ jabatan | lower }}'},
        {label:'Masa Kerja (Thn)',contoh:'{{ diff_years(tmt, today) }}'},
        {label:'Logika (ternary)',contoh:"{{ a > b ? 'X' : 'Y' }}"},
        {label:'Loop Baris Tabel',contoh:'{{#nama_loop}} ... {{/nama_loop}}'},
        {label:'Variabel turunan ("set")',contoh:'{{ set total = a + b }}{{ total }}'}
      ]
    };
  }
};

// ================================================================
// HELPER: Extract Drive File ID dari URL
// ================================================================
function extractDriveFileId(url) {
  if (!url) return null;
  const patterns=[/\/d\/([a-zA-Z0-9_-]{20,})/,/id=([a-zA-Z0-9_-]{20,})/,/folders\/([a-zA-Z0-9_-]{20,})/];
  for (const p of patterns) { const m=url.match(p); if (m) return m[1]; }
  if (/^[a-zA-Z0-9_-]{20,}$/.test(url.trim())) return url.trim();
  return null;
}

// ================================================================
// MAIN HANDLER — Vercel Serverless Entry Point
// ================================================================
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({error:'Method not allowed'}); return; }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({error:'Invalid JSON body'}); return;
  }

  const { method, params=[] } = body||{};
  if (!method) { res.status(400).json({error:'method wajib diisi'}); return; }

  const fn = methods[method];
  if (!fn) {
    const gasUrl = process.env.GOOGLE_SCRIPT_URL;
    if (gasUrl) {
      try {
        const response = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method, params })
        });
        const result = await response.json();
        res.status(200).json(result);
        return;
      } catch (proxyErr) {
        console.error(`[rpc proxy] ${method} ERROR:`, proxyErr.message);
        res.status(200).json({ success: false, message: `Gagal menghubungi Google Apps Script: ${proxyErr.message}` });
        return;
      }
    }
    res.status(404).json({error:`Method "${method}" tidak ditemukan`});
    return;
  }

  try {
    const result = await fn(params);
    res.status(200).json(result);
  } catch(err) {
    console.error(`[rpc] ${method} ERROR:`, err.message);
    res.status(200).json({success:false, message: err.message || 'Terjadi kesalahan server.'});
  }
};
