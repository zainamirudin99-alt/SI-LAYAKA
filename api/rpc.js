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

// Global in-memory cache for akses_kontrak_mandiri
const MEMORY_AKSES_KONTRAK_MANDIRI = {};

// ----------------------------------------------------------------
// KONFIGURASI (sama dengan config.gs)
// ----------------------------------------------------------------
const CONFIG = {
  NIP_IGNORED_PREFIX:    'H.7.',
  STATUS_NON_ASN_LABEL:  'Pegawai Undip Non ASN',
  PASSWORD_DIGIT_LENGTH: 8,
  SESSION_TTL_SECONDS:   6 * 60 * 60,
  SEED_SUPER_ADMIN_NIP:  '200103310225061024',
  FOLDER_KP_OUTPUT:      '1zf8u-yXjhDcuzwyFiv7Xz7eYBNDZ85k3',
  FOLDER_KP_LAMPIRAN:    '1BrMjMWkJN8D_EmOJTMsgNwARwXxapp8M',
  FOLDER_PENSIUN_OUTPUT:  '10Cu3SmYJyy8lcLX2-KpIjB5qVEU1ynPu',
  FOLDER_PENSIUN_LAMPIRAN: '1ko75RjljybXg6tLqpXdOH1Im8rjlUFTd',
  FOLDER_KONTRAK_ROOT:    '1uCTUJ2qfrBeyjFEwsufFKuZuQO1MaYQi',
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
  LAYANAN_LIST: {'Kenaikan Pangkat':['AK Konversi Tahunan','AK Konversi Kumulatif','SK KP Dosen Pegawai Tetap Undip NON ASN','SK KP Tendik Pegawai Tetap Undip NON ASN'],'Pensiun':['DPCP','SUPER'],'Kontrak Tendik':['Kontrak Penuh Waktu','Kontrak Paruh Waktu','KDRP','Tenaga Profesional'],'Kontrak Dosen':['Kontrak Penuh Waktu','Kontrak Paruh Waktu','Tenaga Kontrak Penghargaan']},
  USULAN_KP_KATA_KUNCI_PNS: ['pns'],
  USULAN_KP_NOTIF_SIASN: 'Siap diusulkan ke-SIASN',
  USULAN_KP_NOTIF_SK:    'Siap Dibuat SK',
  // ---- SK Kenaikan Pangkat (Non-ASN) ----
  SK_KP_STATUS_SIAP:        'Siap Dibuat SK',
  SK_KP_STATUS_SELESAI:     'SK Selesai',
  SK_KP_APPROVAL_CHAIN:     ['staff','supervisor','manajer','wakil_direktur','direktur','wakil_rektor'],
  SK_KP_APPROVAL_LABEL:     {staff:'Staff',supervisor:'Supervisor (SPV)',manajer:'Manajer',wakil_direktur:'Wakil Direktur',direktur:'Direktur',wakil_rektor:'Wakil Rektor'},
  SK_KP_SUB_ROLE_LIST:      ['staff','supervisor','manajer','wakil_direktur','direktur','wakil_rektor','rektor'],
  // Mapping golongan naik satu tingkat (untuk kalkulasi SK)
  GOLONGAN_NAIK: {'I/a':'I/b','I/b':'I/c','I/c':'I/d','I/d':'II/a','II/a':'II/b','II/b':'II/c','II/c':'II/d','II/d':'III/a','III/a':'III/b','III/b':'III/c','III/c':'III/d','III/d':'IV/a','IV/a':'IV/b','IV/b':'IV/c','IV/c':'IV/d','IV/d':'IV/e'},
  // Mapping golongan → pangkat Non-ASN
  PANGKAT_NON_ASN: {'I/a':'Juru Muda','I/b':'Juru Muda Tk. I','I/c':'Juru','I/d':'Juru Tk. I','II/a':'Pengatur Muda','II/b':'Pengatur Muda Tk. I','II/c':'Pengatur','II/d':'Pengatur Tk. I','III/a':'Penata Muda','III/b':'Penata Muda Tk. I','III/c':'Penata','III/d':'Penata Tk. I','IV/a':'Pembina','IV/b':'Pembina Tk. I','IV/c':'Pembina Utama Muda','IV/d':'Pembina Utama Madya','IV/e':'Pembina Utama'},
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

function signToken(employee, role, sub_role) {
  return jwt.sign(
    { nip: employee.nip, nama: employee.nama_lengkap||employee.nama||'', jabatan: employee.jabatan||'', status_kepegawaian: employee.status_kepegawaian||'', unit_es_ii: employee.unit_es_ii||'', role, sub_role },
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

async function getCallerUnit(decoded, db) {
  if (decoded && decoded.unit_es_ii) return decoded.unit_es_ii;
  if (!decoded || !decoded.nip) return null;
  const dbClient = db || getDb();
  const { data } = await dbClient.from('data_utama').select('unit_es_ii').eq('nip', decoded.nip).maybeSingle();
  return data?.unit_es_ii || null;
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
  const { data } = await db.from('user_roles').select('role,sub_role').eq('nip', nip).maybeSingle();
  return { role: data?.role || 'normal', sub_role: data?.sub_role || null };
}
async function getUserSubRole(nip) {
  const db = getDb();
  const { data } = await db.from('user_roles').select('sub_role').eq('nip', nip).maybeSingle();
  return data?.sub_role || null;
}

function tentukanNotifStatusAkhir(statusKepegawaian) {
  const s = String(statusKepegawaian||'').toLowerCase();
  const cocok = CONFIG.USULAN_KP_KATA_KUNCI_PNS.some(kw=>s.includes(kw.toLowerCase()));
  return cocok ? CONFIG.USULAN_KP_NOTIF_SIASN : CONFIG.USULAN_KP_NOTIF_SK;
}

// ================================================================
// GAJI POKOK NON-ASN UNDIP 2024 (Peraturan Rektor No. 1 Tahun 2024)
// Format: "GOL-RUANG-MKG" → Gaji Pokok (Rp)
// MKG = Masa Kerja Golongan dalam tahun
// ================================================================
const GAJI_POKOK_NON_ASN = (function() {
  const raw = [
    ['I','A',0,1685700],['I','A',2,1738800],['I','A',4,1793500],['I','A',6,1850000],['I','A',8,1908300],['I','A',10,1968400],['I','A',12,2030400],['I','A',14,2094300],['I','A',16,2160300],['I','A',18,2228300],['I','A',20,2298500],['I','A',22,2370900],['I','A',24,2445600],['I','A',26,2522600],
    ['I','B',3,1840800],['I','B',5,1898800],['I','B',7,1958600],['I','B',9,2020300],['I','B',11,2083900],['I','B',13,2149600],['I','B',15,2217300],['I','B',17,2287100],['I','B',19,2359100],['I','B',21,2433400],['I','B',23,2510100],['I','B',25,2589100],['I','B',27,2670700],
    ['I','C',3,1918700],['I','C',5,1979100],['I','C',7,2041500],['I','C',9,2105800],['I','C',11,2172100],['I','C',13,2240500],['I','C',15,2311100],['I','C',17,2383900],['I','C',19,2458900],['I','C',21,2536400],['I','C',23,2616300],['I','C',25,2698700],['I','C',27,2783700],
    ['I','D',3,1999900],['I','D',5,2062900],['I','D',7,2127800],['I','D',9,2194800],['I','D',11,2264000],['I','D',13,2335300],['I','D',15,2408800],['I','D',17,2484700],['I','D',19,2562900],['I','D',21,2643700],['I','D',23,2726900],['I','D',25,2812800],['I','D',27,2901400],
    ['II','A',0,2184000],['II','A',1,2218400],['II','A',3,2288200],['II','A',5,2360300],['II','A',7,2434600],['II','A',9,2511300],['II','A',11,2590400],['II','A',13,2672000],['II','A',15,2756200],['II','A',17,2843000],['II','A',19,2932500],['II','A',21,3024900],['II','A',23,3120100],['II','A',25,3218400],['II','A',27,3319800],['II','A',29,3424300],['II','A',31,3532200],['II','A',33,3643400],
    ['II','B',0,2385000],['II','B',2,2460100],['II','B',4,2537600],['II','B',6,2617500],['II','B',8,2700000],['II','B',10,2785000],['II','B',12,2872700],['II','B',14,2963200],['II','B',16,3056500],['II','B',18,3152800],['II','B',20,3252100],['II','B',22,3354500],['II','B',24,3460200],['II','B',26,3569200],['II','B',28,3681600],['II','B',30,3797500],
    ['II','C',0,2485900],['II','C',2,2564200],['II','C',4,2645000],['II','C',6,2728300],['II','C',8,2814200],['II','C',10,2902800],['II','C',12,2994300],['II','C',14,3088600],['II','C',16,3185800],['II','C',18,3286200],['II','C',20,3389700],['II','C',22,3496400],['II','C',24,3606500],['II','C',26,3720100],['II','C',28,3837300],['II','C',30,3958200],
    ['II','D',0,2591100],['II','D',2,2672700],['II','D',4,2756800],['II','D',6,2843700],['II','D',8,2933200],['II','D',10,3025600],['II','D',12,3120900],['II','D',14,3219200],['II','D',16,3320600],['II','D',18,3425200],['II','D',20,3533100],['II','D',22,3644300],['II','D',24,3759100],['II','D',26,3877500],['II','D',28,3999600],['II','D',30,4125600],
    ['III','A',0,2785700],['III','A',2,2873500],['III','A',4,2964000],['III','A',6,3057300],['III','A',8,3153600],['III','A',10,3252900],['III','A',12,3355400],['III','A',14,3461100],['III','A',16,3570100],['III','A',18,3682500],['III','A',20,3798500],['III','A',22,3918100],['III','A',24,4041500],['III','A',26,4168800],['III','A',28,4300100],['III','A',30,4435500],['III','A',32,4575200],
    ['III','B',0,2903600],['III','B',2,2995000],['III','B',4,3089300],['III','B',6,3186600],['III','B',8,3287000],['III','B',10,3390500],['III','B',12,3497300],['III','B',14,3607500],['III','B',16,3721100],['III','B',18,3838300],['III','B',20,3959200],['III','B',22,4083900],['III','B',24,4212500],['III','B',26,4345100],['III','B',28,4482000],['III','B',30,4623200],['III','B',32,4768800],
    ['III','C',0,3026400],['III','C',2,3121700],['III','C',4,3220000],['III','C',6,3321400],['III','C',8,3426000],['III','C',10,3533900],['III','C',12,3645200],['III','C',14,3760100],['III','C',16,3878500],['III','C',18,4000600],['III','C',20,4126600],['III','C',22,4256600],['III','C',24,4390700],['III','C',26,4528900],['III','C',28,4671600],['III','C',30,4818700],['III','C',32,4970500],
    ['III','D',0,3154400],['III','D',2,3253700],['III','D',4,3356200],['III','D',6,3461900],['III','D',8,3571000],['III','D',10,3683400],['III','D',12,3799400],['III','D',14,3919100],['III','D',16,4042500],['III','D',18,4169900],['III','D',20,4301200],['III','D',22,4436700],['III','D',24,4576400],['III','D',26,4720500],['III','D',28,4869200],['III','D',30,5022500],['III','D',32,5180700],
    ['IV','A',0,3287800],['IV','A',2,3391400],['IV','A',4,3498200],['IV','A',6,3608400],['IV','A',8,3722000],['IV','A',10,3839200],['IV','A',12,3960200],['IV','A',14,4084900],['IV','A',16,4213500],['IV','A',18,4346200],['IV','A',20,4483100],['IV','A',22,4624300],['IV','A',24,4770000],['IV','A',26,4920200],['IV','A',28,5075200],['IV','A',30,5235000],['IV','A',32,5399900],
    ['IV','B',0,3426900],['IV','B',2,3534800],['IV','B',4,3646200],['IV','B',6,3761000],['IV','B',8,3879500],['IV','B',10,4001600],['IV','B',12,4127700],['IV','B',14,4257700],['IV','B',16,4391800],['IV','B',18,4530100],['IV','B',20,4672800],['IV','B',22,4819900],['IV','B',24,4971700],['IV','B',26,5128300],['IV','B',28,5289800],['IV','B',30,5456400],['IV','B',32,5628300],
    ['IV','C',0,3571900],['IV','C',2,3684400],['IV','C',4,3800400],['IV','C',6,3920100],['IV','C',8,4043600],['IV','C',10,4170900],['IV','C',12,4302300],['IV','C',14,4437800],['IV','C',16,4577500],['IV','C',18,4721700],['IV','C',20,4870400],['IV','C',22,5023800],['IV','C',24,5182000],['IV','C',26,5345200],['IV','C',28,5513600],['IV','C',30,5687200],['IV','C',32,5866400],
    ['IV','D',0,3723000],['IV','D',2,3840200],['IV','D',4,3961200],['IV','D',6,4085900],['IV','D',8,4214600],['IV','D',10,4347300],['IV','D',12,4484300],['IV','D',14,4625500],['IV','D',16,4771200],['IV','D',18,4921400],['IV','D',20,5076400],['IV','D',22,5236300],['IV','D',24,5401200],['IV','D',26,5571400],['IV','D',28,5746800],['IV','D',30,5927800],['IV','D',32,6114500],
    ['IV','E',0,3880400],['IV','E',2,4002700],['IV','E',4,4128700],['IV','E',6,4258700],['IV','E',8,4392900],['IV','E',10,4531200],['IV','E',12,4673900],['IV','E',14,4821100],['IV','E',16,4973000],['IV','E',18,5129600],['IV','E',20,5291200],['IV','E',22,5457800],['IV','E',24,5629700],['IV','E',26,5807000],['IV','E',28,5989900],['IV','E',30,6178600],['IV','E',32,6373200]
  ];
  // Build nested map: gol → ruang → sorted MKG entries
  const map = {};
  raw.forEach(([gol, ruang, mkg, gaji]) => {
    const k = `${gol}-${ruang}`;
    if (!map[k]) map[k] = [];
    map[k].push({ mkg, gaji });
  });
  Object.values(map).forEach(arr => arr.sort((a, b) => a.mkg - b.mkg));
  return map;
})();

/**
 * Cari gaji pokok berdasarkan golongan/ruang dan MKG.
 * Jika MKG tidak tepat ada di tabel, ambil nilai MKG terdekat DI BAWAHNYA (round-down).
 * Golongan III & IV: ruang dalam format "III/A" → normalisasi jadi "III","A"
 * @param {string} golonganSlash  contoh: "III/c" atau "IV/a"
 * @param {number} mkgTahun       Masa Kerja Golongan dalam tahun (integer)
 * @returns {number} gaji pokok, atau 0 jika tidak ditemukan
 */
function hitungGajiPokokNonAsn(golonganSlash, mkgTahun) {
  const s = String(golonganSlash || '').toUpperCase().trim();
  let gol, ruang;
  // "IV/A", "III/B", "II/C", "I/D"
  const m = s.match(/^(I{1,3}V?|IV)\/(A|B|C|D|E)$/);
  if (!m) return 0;
  // Normalize roman numeral
  const romanPart = m[1]; // I, II, III, IV
  ruang = m[2];
  gol = romanPart;
  const key = `${gol}-${ruang}`;
  const entries = GAJI_POKOK_NON_ASN[key];
  if (!entries || entries.length === 0) return 0;
  const mkg = Math.floor(Number(mkgTahun) || 0);
  // Round-down: ambil entri dengan MKG terbesar yang ≤ mkg
  let best = null;
  for (const e of entries) {
    if (e.mkg <= mkg) best = e;
    else break;
  }
  return best ? best.gaji : 0;
}

/**
 * Hitung TMT KP Baru berdasarkan tanggal pengajuan.
 * Aturan BKN No. 4/2025: submit 16 Bln-M s.d 14 Bln-(M+1) → TMT 1 Bln-(M+2)
 * @param {Date} tglDiajukan
 * @returns {string} "1 NamaBulan YYYY"
 */
function hitungTmtKpBaru(tglDiajukan) {
  const d = tglDiajukan instanceof Date ? tglDiajukan : new Date(tglDiajukan);
  const day = d.getDate(); const month = d.getMonth() + 1; let year = d.getFullYear();
  // Tentukan window: 16 M s.d. 14 (M+1)  → TMT 1 (M+2)
  // Jika tanggal 1-14 → window dimulai 16 bulan sebelumnya → TMT bulan depan+1
  // Jika tanggal 15 → boundary, anggap masuk window berjalan → TMT M+2
  // Jika tanggal 16-31 → window baru dimulai hari ini → TMT M+2
  let tmtMonth;
  if (day <= 14) {
    // berada di jendela: 16 (M-1) s.d. 14 M → TMT = 1 M+1
    tmtMonth = month + 1;
  } else {
    // tanggal ≥ 15: berada di jendela 16 M s.d. 14 (M+1) → TMT = 1 (M+2)
    tmtMonth = month + 2;
  }
  if (tmtMonth > 12) { tmtMonth -= 12; year++; }
  if (tmtMonth > 12) { tmtMonth -= 12; year++; } // safety double-overflow
  return `1 ${BULAN_ID[tmtMonth - 1]} ${year}`;
}

/**
 * Format angka rupiah: 3.287.800
 */
function formatRupiah(angka) {
  return String(Math.round(Number(angka) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
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
  const buf    = new Uint8Array(Buffer.from(rawB64, 'base64'));
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
// DOCX TEMPLATE ENGINE — port dari TemplateEngine.gs (Node.js)
// Dipakai untuk generate/preview template MS Word (.docx) tanpa
// melalui Google Apps Script.
// ================================================================

const DATE_TAG_PREFIXES = ['tgl_', 'tmt_', 'tanggal_', 'tgl'];

function docxNormalizeSmartQuotes(str) {
  return String(str)
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function docxFormatTanggal(value) {
  const d = toDate(value);
  if (!d) return (value === null || value === undefined) ? '' : String(value);
  return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

function docxBulanKeAngka(namaBulan) {
  if (typeof namaBulan === 'number') return namaBulan;
  const idx = BULAN_ID.findIndex(b => b.toLowerCase() === String(namaBulan || '').trim().toLowerCase());
  if (idx !== -1) return idx + 1;
  const n = Number(namaBulan);
  return isNaN(n) ? 0 : n;
}

function docxNum(v) {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function docxSum(arr, fieldName) {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((s, item) => s + docxNum(item && item[fieldName]), 0);
}

function docxTerbilang(value) {
  const n = Math.round(Number(value) || 0);
  if (n === 0) return 'nol';
  if (n < 0) return 'minus ' + docxTerbilang(Math.abs(n));

  const satuan = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan'];

  function subThree(num) {
    let s = '';
    const h = Math.floor(num / 100);
    const rem = num % 100;
    const t = Math.floor(rem / 10);
    const s1 = rem % 10;

    if (h > 0) s += (h === 1 ? 'seratus' : satuan[h] + ' ratus') + ' ';
    if (rem >= 11 && rem <= 19) {
      s += (rem === 10 ? 'sepuluh' : rem === 11 ? 'sebelas' : satuan[s1] + ' belas') + ' ';
    } else if (rem === 10) {
      s += 'sepuluh ';
    } else {
      if (t > 0) s += satuan[t] + ' puluh ';
      if (s1 > 0) s += satuan[s1] + ' ';
    }
    return s.trim();
  }

  const groups = [
    { value: 1000000000000, label: 'triliun' },
    { value: 1000000000, label: 'miliar' },
    { value: 1000000, label: 'juta' },
    { value: 1000, label: 'ribu' }
  ];

  let remaining = n;
  let parts = [];

  for (const g of groups) {
    const count = Math.floor(remaining / g.value);
    if (count > 0) {
      if (g.label === 'ribu' && count === 1) {
        parts.push('seribu');
      } else {
        parts.push(subThree(count) + ' ' + g.label);
      }
      remaining %= g.value;
    }
  }
  if (remaining > 0) parts.push(subThree(remaining));

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}


function docxDiffYears(a, b) {
  const d1 = toDate(a), d2 = toDate(b);
  if (!d1 || !d2) return 0;
  let years = d2.getFullYear() - d1.getFullYear();
  const passed = d2.getMonth() > d1.getMonth() || (d2.getMonth() === d1.getMonth() && d2.getDate() >= d1.getDate());
  if (!passed) years--;
  return Math.max(0, years);
}

function docxDiffMonths(a, b) {
  const d1 = toDate(a), d2 = toDate(b);
  if (!d1 || !d2) return 0;
  let months = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  if (d2.getDate() < d1.getDate()) months--;
  return Math.max(0, months);
}

function docxDiffDays(a, b) {
  const d1 = toDate(a), d2 = toDate(b);
  if (!d1 || !d2) return 0;
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}

function docxFormatRupiah(value) {
  const n = Math.round(Number(value) || 0);
  const sign = n < 0 ? '-' : '';
  const formatted = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}Rp${formatted}`;
}

function docxTerbilang(value) {
  const n = Math.round(Number(value) || 0);
  if (n === 0) return 'nol';
  if (n < 0) return 'minus ' + docxTerbilang(Math.abs(n));
  const satuan = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan'];
  function subThree(num) {
    let s = '';
    const h = Math.floor(num / 100), rem = num % 100, t = Math.floor(rem / 10), s1 = rem % 10;
    if (h > 0) s += (h === 1 ? 'seratus' : satuan[h] + ' ratus') + ' ';
    if (rem >= 11 && rem <= 19) { s += (rem === 11 ? 'sebelas' : satuan[s1] + ' belas') + ' '; }
    else if (rem === 10) { s += 'sepuluh '; }
    else { if (t > 0) s += satuan[t] + ' puluh '; if (s1 > 0) s += satuan[s1] + ' '; }
    return s.trim();
  }
  const groups = [{value:1000000000000,label:'triliun'},{value:1000000000,label:'miliar'},{value:1000000,label:'juta'},{value:1000,label:'ribu'}];
  let remaining = n, parts = [];
  for (const g of groups) {
    const count = Math.floor(remaining / g.value);
    if (count > 0) {
      parts.push(g.label === 'ribu' && count === 1 ? 'seribu' : subThree(count) + ' ' + g.label);
      remaining %= g.value;
    }
  }
  if (remaining > 0) parts.push(subThree(remaining));
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function docxNum(v) {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(v); return isNaN(n) ? 0 : n;
}

function docxSum(arr, fieldName) {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((s, item) => s + docxNum(item && item[fieldName]), 0);
}

function docxBulanKeAngka(namaBulan) {
  if (typeof namaBulan === 'number') return namaBulan;
  const idx = BULAN_ID.findIndex(b => b.toLowerCase() === String(namaBulan || '').trim().toLowerCase());
  if (idx !== -1) return idx + 1;
  const n = Number(namaBulan); return isNaN(n) ? 0 : n;
}

function docxCallFunction(fnName, args) {
  switch (fnName) {
    case 'diff_years':    return docxDiffYears(args[0], args[1]);
    case 'diff_months':   return docxDiffMonths(args[0], args[1]);
    case 'diff_days':     return docxDiffDays(args[0], args[1]);
    case 'terbilang':     return docxTerbilang(args[0]);
    case 'rupiah':        return docxFormatRupiah(args[0]);
    case 'tanggal':       return docxFormatTanggal(args[0]);
    case 'sum':           return docxSum(args[0], args[1]);
    case 'num':           return docxNum(args[0]);
    case 'bulan_ke_angka':return docxBulanKeAngka(args[0]);
    default: throw new Error('Fungsi tidak dikenal: ' + fnName);
  }
}

function docxApplyFilter(filterName, value) {
  switch (filterName) {
    case 'terbilang': return docxTerbilang(value);
    case 'rupiah':    return docxFormatRupiah(value);
    case 'tanggal':   return docxFormatTanggal(value);
    case 'upper':     return String(value === null || value === undefined ? '' : value).toUpperCase();
    case 'lower':     return String(value === null || value === undefined ? '' : value).toLowerCase();
    default: return value;
  }
}

function docxSplitTopLevel(str, sep) {
  const out = []; let depth = 0, quoteChar = null, current = '';
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === "'" || c === '"') { if (!quoteChar) quoteChar = c; else if (quoteChar === c) quoteChar = null; }
    if (!quoteChar) { if (c === '(') depth++; if (c === ')') depth--; }
    if (c === sep && depth === 0 && !quoteChar) { out.push(current); current = ''; } else { current += c; }
  }
  out.push(current); return out;
}

function docxTokenize(expr) {
  const tokens = []; let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'" || c === '"') {
      const qc = c; let j = i + 1, str = '';
      while (j < expr.length && expr[j] !== qc) { str += expr[j]; j++; }
      tokens.push({ type: 'string', value: str }); i = j + 1; continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i, num = '';
      while (j < expr.length && /[0-9.]/.test(expr[j])) { num += expr[j]; j++; }
      tokens.push({ type: 'number', value: parseFloat(num) }); i = j; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i, id = '';
      while (j < expr.length && /[A-Za-z0-9_]/.test(expr[j])) { id += expr[j]; j++; }
      tokens.push({ type: 'ident', value: id }); i = j; continue;
    }
    if (c === '(') { tokens.push({ type: 'lparen' }); i++; continue; }
    if (c === ')') { tokens.push({ type: 'rparen' }); i++; continue; }
    if (c === ',') { tokens.push({ type: 'comma' }); i++; continue; }
    const two = expr.substr(i, 2);
    if (['>=', '<=', '==', '!=', '&&', '||'].includes(two)) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
    if ('+-*/%<>?:!'.indexOf(c) !== -1) { tokens.push({ type: 'op', value: c }); i++; continue; }
    throw new Error('Karakter tidak dikenal: ' + c);
  }
  return tokens;
}

function docxEvaluateExpression(expr, dataCtx) {
  const tokens = docxTokenize(expr); let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseTernary() {
    const cond = parseOr();
    if (peek() && peek().type === 'op' && peek().value === '?') {
      next(); const whenTrue = parseTernary();
      if (!(peek() && peek().value === ':')) throw new Error('Ternary tanpa ":"');
      next(); const whenFalse = parseTernary();
      return cond ? whenTrue : whenFalse;
    }
    return cond;
  }
  function parseOr() {
    let left = parseAnd();
    while (peek() && peek().type === 'op' && peek().value === '||') { next(); left = left || parseAnd(); }
    return left;
  }
  function parseAnd() {
    let left = parseCmp();
    while (peek() && peek().type === 'op' && peek().value === '&&') { next(); left = left && parseCmp(); }
    return left;
  }
  function parseCmp() {
    let left = parseAdd();
    while (peek() && peek().type === 'op' && ['>', '<', '>=', '<=', '==', '!='].includes(peek().value)) {
      const op = next().value; const right = parseAdd();
      switch (op) {
        case '>': left = left > right; break; case '<': left = left < right; break;
        case '>=': left = left >= right; break; case '<=': left = left <= right; break;
        case '==': left = left == right; break; case '!=': left = left != right; break;
      }
    }
    return left;
  }
  function parseAdd() {
    let left = parseMul();
    while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = next().value; const right = parseMul();
      left = op === '+' ? (typeof left === 'string' || typeof right === 'string' ? String(left) + String(right) : left + right) : left - right;
    }
    return left;
  }
  function parseMul() {
    let left = parseUnary();
    while (peek() && peek().type === 'op' && ['*', '/', '%'].includes(peek().value)) {
      const op = next().value; const right = parseUnary();
      if (op === '*') left = left * right; else if (op === '/') left = right === 0 ? 0 : left / right; else left = left % right;
    }
    return left;
  }
  function parseUnary() {
    if (peek() && peek().type === 'op' && peek().value === '-') { next(); return -parseUnary(); }
    if (peek() && peek().type === 'op' && peek().value === '!') { next(); return !parseUnary(); }
    return parsePrimary();
  }
  function parsePrimary() {
    const t = peek();
    if (!t) throw new Error('Ekspresi tidak lengkap');
    if (t.type === 'number') { next(); return t.value; }
    if (t.type === 'string') { next(); return t.value; }
    if (t.type === 'lparen') {
      next(); const val = parseTernary();
      if (!(peek() && peek().type === 'rparen')) throw new Error('Kurung tidak seimbang');
      next(); return val;
    }
    if (t.type === 'ident') {
      next();
      if (peek() && peek().type === 'lparen') {
        next(); const args = [];
        if (!(peek() && peek().type === 'rparen')) {
          args.push(parseTernary());
          while (peek() && peek().type === 'comma') { next(); args.push(parseTernary()); }
        }
        if (!(peek() && peek().type === 'rparen')) throw new Error('Argumen fungsi tidak lengkap');
        next(); return docxCallFunction(t.value, args);
      }
      if (t.value === 'today') return new Date();
      const isDateField = DATE_TAG_PREFIXES.some(p => t.value.indexOf(p) === 0);
      const raw = dataCtx[t.value];
      if (isDateField) { const d = toDate(raw); return d || raw; }
      return raw;
    }
    throw new Error('Token tidak dikenal: ' + JSON.stringify(t));
  }
  return parseTernary();
}

const SET_EXPR_RE = /^set\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/i;

function docxEvaluateTag(rawExpr, dataCtx) {
  let expr = docxNormalizeSmartQuotes(rawExpr).trim();

  // Decode XML entities (e.g. &gt; back to >, &lt; back to <)
  expr = expr
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

  // set variabel turunan
  const setMatch = expr.match(SET_EXPR_RE);
  if (setMatch) {
    let value;
    try { value = docxEvaluateExpression(setMatch[2], dataCtx); } catch { value = 0; }
    dataCtx[setMatch[1]] = value;
    return '';
  }

  // Pisahkan filter
  const segments = docxSplitTopLevel(expr, '|');
  const mainExpr = segments[0].trim();
  const filters = segments.slice(1).map(s => s.trim());

  // Identifier tunggal → auto-format tanggal
  const isBareIdent = /^[A-Za-z_][A-Za-z0-9_]*$/.test(mainExpr);
  if (isBareIdent && filters.length === 0) {
    const isDateField = DATE_TAG_PREFIXES.some(p => mainExpr.indexOf(p) === 0);
    const raw = dataCtx[mainExpr];
    if (isDateField) return docxFormatTanggal(raw);
    if (typeof raw === 'object' && raw !== null) return raw;
    return raw === undefined || raw === null ? '' : String(raw);
  }

  // Dropdown hint: identifier[Opsi1, Opsi2]
  const ddm = mainExpr.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\[[^\]]*\]$/);
  if (ddm && filters.length === 0) {
    const key = ddm[1];
    const isDateField = DATE_TAG_PREFIXES.some(p => key.indexOf(p) === 0);
    const raw = dataCtx[key];
    if (isDateField) return docxFormatTanggal(raw);
    if (typeof raw === 'object' && raw !== null) return raw;
    return raw === undefined || raw === null ? '' : String(raw);
  }

  let result = docxEvaluateExpression(mainExpr, dataCtx);

  // Auto-round ke 2 desimal
  if (typeof result === 'number' && isFinite(result) && !Number.isInteger(result)) {
    const ceiled = Math.ceil(Math.round(result * 100 * 1e9) / 1e9) / 100;
    if (ceiled !== result) result = ceiled;
  }

  for (const f of filters) result = docxApplyFilter(f, result);
  if (typeof result === 'object' && result !== null) return result;
  return result === undefined || result === null ? '' : String(result);
}

function docxCleanMassalLoops(xml) {
  let cleaned = xml;
  // Regex toleran XML untuk mencari dan menghapus tag loop massal gantung (baik # maupun ^)
  const reDataMassalOpen = /\{\{\s*(?:<[^>]+>)*[#^]\s*(?:<[^>]+>)*d\s*(?:<[^>]+>)*a\s*(?:<[^>]+>)*t\s*(?:<[^>]+>)*a\s*(?:<[^>]+>)*_\s*(?:<[^>]+>)*m\s*(?:<[^>]+>)*a\s*(?:<[^>]+>)*s\s*(?:<[^>]+>)*s\s*(?:<[^>]+>)*a\s*(?:<[^>]+>)*l\s*(?:<[^>]+>)*\}\}/gi;
  const reDataMassalClose = /\{\{\s*(?:<[^>]+>)*\/\s*(?:<[^>]+>)*d\s*(?:<[^>]+>)*a\s*(?:<[^>]+>)*t\s*(?:<[^>]+>)*a\s*(?:<[^>]+>)*_\s*(?:<[^>]+>)*m\s*(?:<[^>]+>)*a\s*(?:<[^>]+>)*s\s*(?:<[^>]+>)*s\s*(?:<[^>]+>)*a\s*(?:<[^>]+>)*l\s*(?:<[^>]+>)*\}\}/gi;
  const reIsLastOpen = /\{\{\s*(?:<[^>]+>)*[#^]\s*(?:<[^>]+>)*i\s*(?:<[^>]+>)*s\s*(?:<[^>]+>)*L\s*(?:<[^>]+>)*a\s*(?:<[^>]+>)*s\s*(?:<[^>]+>)*t\s*(?:<[^>]+>)*\}\}/gi;
  const reIsLastClose = /\{\{\s*(?:<[^>]+>)*\/\s*(?:<[^>]+>)*i\s*(?:<[^>]+>)*s\s*(?:<[^>]+>)*L\s*(?:<[^>]+>)*a\s*(?:<[^>]+>)*s\s*(?:<[^>]+>)*t\s*(?:<[^>]+>)*\}\}/gi;

  cleaned = cleaned.replace(reDataMassalOpen, '');
  cleaned = cleaned.replace(reDataMassalClose, '');
  cleaned = cleaned.replace(reIsLastOpen, '');
  cleaned = cleaned.replace(reIsLastClose, '');
  return cleaned;
}

/**
 * Render template DOCX menggunakan docxtemplater + custom parser yang
 * mendukung sintaks {{ ekspresi }} yang sama dengan TemplateEngine.gs.
 * @param {Buffer} templateBuffer  — isi file .docx sebagai Buffer
 * @param {Object} dataCtx         — data pegawai + form
 * @returns {Buffer}               — file .docx hasil generate
 */
function docxRenderTemplate(templateBuffer, dataCtx) {
  // Lazy-require agar tidak error jika belum di-install
  const PizZip = require('pizzip');
  const Docxtemplater = require('docxtemplater');

  const zip = new PizZip(templateBuffer);

  // Bersihkan loop massal gantung dari seluruh bagian berkas XML di dalam ZIP
  Object.keys(zip.files).forEach(fileName => {
    if (fileName.endsWith('.xml')) {
      const content = zip.files[fileName].asText();
      const cleaned = docxCleanMassalLoops(content);
      if (cleaned !== content) {
        zip.file(fileName, cleaned);
      }
    }
  });

  // Custom parser: mendukung {{ ekspresi }} penuh (set, filter, fungsi, ternary)
  const customParser = tag => ({
    get(scope, context) {
      // Scope bisa berupa item loop (object) atau dataCtx global
      const ctx = Object.assign({}, dataCtx, typeof scope === 'object' && scope !== null ? scope : {});
      try { return docxEvaluateTag(tag, ctx); } catch (e) { return `[ERROR:${tag}]`; }
    }
  });

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    parser: customParser,
    delimiters: {
      start: '{{',
      end: '}}'
    }
  });

  try {
    doc.render(dataCtx);
  } catch (error) {
    if (error.properties && error.properties.errors instanceof Array) {
      const messages = error.properties.errors.map(err => {
        const expl = err.properties?.explanation || '';
        const tag = err.properties?.xtag || '';
        return `${err.message}${expl ? ' (' + expl + ')' : ''}${tag ? ' di tag: "' + tag + '"' : ''}`;
      }).join('\n');
      throw new Error(`Kesalahan Parsing Template Word (Multi Error):\n${messages}`);
    }
    throw error;
  }

  // Setel font seluruh dokumen menjadi Times New Roman pada XML berkas DOCX
  try {
    const zipObj = doc.getZip();
    const docXmlFile = zipObj.file("word/document.xml");
    if (docXmlFile) {
      let xml = docXmlFile.asText();
      xml = xml.replace(/w:ascii="[^"]*"/g, 'w:ascii="Times New Roman"')
               .replace(/w:hAnsi="[^"]*"/g, 'w:hAnsi="Times New Roman"')
               .replace(/w:cs="[^"]*"/g, 'w:cs="Times New Roman"');
      zipObj.file("word/document.xml", xml);
    }
    const stylesXmlFile = zipObj.file("word/styles.xml");
    if (stylesXmlFile) {
      let stylesXml = stylesXmlFile.asText();
      stylesXml = stylesXml.replace(/w:ascii="[^"]*"/g, 'w:ascii="Times New Roman"')
                           .replace(/w:hAnsi="[^"]*"/g, 'w:hAnsi="Times New Roman"')
                           .replace(/w:cs="[^"]*"/g, 'w:cs="Times New Roman"');
      zipObj.file("word/styles.xml", stylesXml);
    }
  } catch (fontErr) {
    console.warn('[rpc font] Gagal menerapkan font Times New Roman ke XML DOCX:', fontErr.message);
  }

  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ================================================================
// DOWNLOAD TEMPLATE DOCX DARI STORAGE (DENGAN SDK ATAU FETCH)
// ================================================================
async function downloadTemplateBuffer(fileIdOrUrl) {
  const db = getDb();
  let path = fileIdOrUrl;
  
  if (path.includes('/storage/v1/object/public/lampiran-usulan/')) {
    path = path.split('/storage/v1/object/public/lampiran-usulan/')[1];
  } else if (path.includes('/storage/v1/object/sign/lampiran-usulan/')) {
    path = path.split('/storage/v1/object/sign/lampiran-usulan/')[1].split('?')[0];
  }
  
  if (!path.startsWith('http://') && !path.startsWith('https://')) {
    try {
      const { data, error } = await db.storage.from('lampiran-usulan').download(path);
      if (!error && data) {
        const arrayBuf = await data.arrayBuffer();
        return Buffer.from(arrayBuf);
      }
      console.warn(`[rpc download] SDK download failed for path=${path}:`, error?.message || error);
    } catch (e) {
      console.warn(`[rpc download] SDK download exception for path=${path}:`, e.message);
    }
  }
  
  const fetchResp = await fetch(fileIdOrUrl);
  if (!fetchResp.ok) throw new Error(`Fetch failed with status ${fetchResp.status}`);
  const arrayBuf = await fetchResp.arrayBuffer();
  return Buffer.from(arrayBuf);
}

// ================================================================
// UPLOAD TEMPLATE DOCX KE SUPABASE STORAGE
// ================================================================
async function uploadTemplateDocx(base64DataUrl, judul) {
  const db = getDb();
  const parts = base64DataUrl.split(',');
  const mime = (parts[0].match(/:(.*?);/) || [, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])[1];
  const rawB64 = parts.length > 1 ? parts[1] : parts[0];
  const buf = new Uint8Array(Buffer.from(rawB64, 'base64'));
  const safeName = String(judul || 'template').replace(/[^a-zA-Z0-9._-]/g, '-');
  const path = `templates/${Date.now()}-${safeName}.docx`;

  const { error } = await db.storage.from('lampiran-usulan').upload(path, buf, { contentType: mime, upsert: false });
  if (error) throw error;

  const { data } = db.storage.from('lampiran-usulan').getPublicUrl(path);
  return { path, publicUrl: data?.publicUrl || path };
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
    const { role, sub_role } = await getUserRole(emp.nip);
    const token = signToken(emp, role, sub_role);
    return {success:true,message:'Login berhasil.',token,user:{nip:emp.nip,nama:emp.nama_lengkap||emp.nama,jabatan:emp.jabatan||'',status_kepegawaian:emp.status_kepegawaian||'',unitEsIi:emp.unit_es_ii||'',role,sub_role}};
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
    const token=signToken(emp,role,null);
    const pw=extractPassword(emp.nip,emp.status_kepegawaian);
    return {success:true,message:`Registrasi berhasil. Password Anda: ${pw} (${CONFIG.PASSWORD_DIGIT_LENGTH} digit pertama NIP).`,token,user:{nip:emp.nip,nama:emp.nama_lengkap||emp.nama,jabatan:'',status_kepegawaian:'',unitEsIi:emp.unit_es_ii||unitTrim,role}};
  },

  async logout([token]) {
    // Stateless JWT — tidak ada yang perlu dihapus di server
    return {success:true};
  },

  async validateSession([token]) {
    try {
      const decoded=verifyToken(token);
      const db=getDb();
      const { role, sub_role } = await getUserRole(decoded.nip);
      const callerUnit = await getCallerUnit(decoded, db);
      return {valid:true,user:{nip:decoded.nip,nama:decoded.nama,jabatan:decoded.jabatan||'',status_kepegawaian:decoded.status_kepegawaian||'',unitEsIi:callerUnit||'',role,sub_role}};
    } catch(e) { return {valid:false,message:e.message}; }
  },

  // ---- DATA PEGAWAI ----

  async searchEmployees([token, query]) {
    const decoded = verifyToken(token);
    const q=String(query||'').trim().toLowerCase();
    if (q.length<1) return [];
    const db=getDb();
    let req = db.from('data_utama')
      .select('nip,nama_lengkap,nama,unit_es_ii')
      .or(`nama_lengkap.ilike.%${q}%,nama.ilike.%${q}%,nip.ilike.%${q}%`);

    // Pembatasan Akses: Jika peran akun adalah 'user', HANYA dapat mencari pegawai di unit_es_ii yang sama
    if (decoded.role === 'user') {
      const callerUnit = await getCallerUnit(decoded, db);
      if (callerUnit) {
        req = req.eq('unit_es_ii', callerUnit);
      }
    }

    const {data,error} = await req.limit(20);
    if (error) throw error;
    return (data||[]).map(e=>({nip:e.nip,nama:e.nama_lengkap||e.nama,unitEsIi:e.unit_es_ii}));
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
    requireRole(token, ['super_admin']);
    const db = getDb();
    
    // Ambil SEMUA data pegawai dari data_utama (mengabaikan limit default 1000 row Supabase)
    let emps = [];
    let pageE = 0;
    while (true) {
      const { data, error } = await db
        .from('data_utama')
        .select('nip,nama_lengkap,nama,unit_es_ii')
        .order('nama_lengkap')
        .range(pageE * 1000, (pageE + 1) * 1000 - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      emps.push(...data);
      if (data.length < 1000) break;
      pageE++;
    }

    // Ambil SEMUA data peran dari user_roles
    let roles = [];
    let pageR = 0;
    while (true) {
      const { data, error } = await db
        .from('user_roles')
        .select('nip,nama,role,sub_role')
        .range(pageR * 1000, (pageR + 1) * 1000 - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      roles.push(...data);
      if (data.length < 1000) break;
      pageR++;
    }

    const rolesMap = {};
    (roles || []).forEach(r => {
      rolesMap[r.nip] = { role: r.role, sub_role: r.sub_role, nama: r.nama };
    });

    const empNips = new Set();
    const daftar = (emps || []).filter(e => e.nip).map(e => {
      empNips.add(e.nip);
      return {
        nip: e.nip,
        nama: e.nama_lengkap || e.nama || '',
        unitEsIi: e.unit_es_ii || '',
        role: (rolesMap[e.nip] && rolesMap[e.nip].role) || 'normal',
        sub_role: (rolesMap[e.nip] && rolesMap[e.nip].sub_role) || null
      };
    });

    // Sertakan akun terdaftar di user_roles yang belum ada di data_utama
    (roles || []).forEach(r => {
      if (r.nip && !empNips.has(r.nip)) {
        daftar.push({
          nip: r.nip,
          nama: r.nama || r.nip,
          unitEsIi: 'Terdaftar Mandiri',
          role: r.role || 'normal',
          sub_role: r.sub_role || null
        });
      }
    });

    return { success: true, daftar };
  },

  async searchUserRolesForAdmin([token, query]) {
    requireRole(token, ['super_admin']);
    const db = getDb();
    const q = String(query || '').trim();

    const { data: roles, error: rolesErr } = await db.from('user_roles').select('nip,role,sub_role,nama');
    if (rolesErr) throw rolesErr;

    const rolesMap = {};
    (roles || []).forEach(r => {
      rolesMap[r.nip] = { role: r.role, sub_role: r.sub_role, nama: r.nama };
    });

    let emps = [];
    if (!q) {
      const customRoleNips = (roles || []).filter(r => r.role && r.role !== 'normal').map(r => r.nip);
      
      if (customRoleNips.length > 0) {
        const { data: customEmps } = await db.from('data_utama')
          .select('nip,nama_lengkap,nama,unit_es_ii')
          .in('nip', customRoleNips);
        if (customEmps) emps.push(...customEmps);
      }

      const existingNips = new Set(emps.map(e => e.nip));
      const { data: defaultEmps } = await db.from('data_utama')
        .select('nip,nama_lengkap,nama,unit_es_ii')
        .order('nama_lengkap')
        .limit(30);

      (defaultEmps || []).forEach(e => {
        if (!existingNips.has(e.nip)) {
          emps.push(e);
          existingNips.add(e.nip);
        }
      });
    } else {
      const { data: searchedEmps, error: searchErr } = await db.from('data_utama')
        .select('nip,nama_lengkap,nama,unit_es_ii')
        .or(`nama_lengkap.ilike.%${q}%,nama.ilike.%${q}%,nip.ilike.%${q}%`)
        .order('nama_lengkap')
        .limit(50);

      if (searchErr) throw searchErr;
      emps = searchedEmps || [];

      const empNips = new Set(emps.map(e => e.nip));
      (roles || []).forEach(r => {
        if (r.nip && !empNips.has(r.nip)) {
          const matchName = String(r.nama || '').toLowerCase().includes(q.toLowerCase());
          const matchNip = String(r.nip).toLowerCase().includes(q.toLowerCase());
          if (matchName || matchNip) {
            emps.push({
              nip: r.nip,
              nama_lengkap: r.nama || r.nip,
              nama: r.nama || r.nip,
              unit_es_ii: 'Terdaftar Mandiri'
            });
            empNips.add(r.nip);
          }
        }
      });
    }

    const daftar = (emps || []).filter(e => e.nip).map(e => ({
      nip: e.nip,
      nama: e.nama_lengkap || e.nama || '',
      unitEsIi: e.unit_es_ii || '',
      role: (rolesMap[e.nip] && rolesMap[e.nip].role) || 'normal',
      sub_role: (rolesMap[e.nip] && rolesMap[e.nip].sub_role) || null
    }));

    return { success: true, daftar };
  },

  async ubahPeranAkun([token, targetNip, peranBaru]) {
    const caller = requireRole(token, ['super_admin']);
    if (!['normal', 'user', 'admin', 'super_admin'].includes(peranBaru)) return { success: false, message: 'Peran tidak valid.' };
    const { role: curRole } = await getUserRole(targetNip);
    if (curRole === 'super_admin' && caller.nip !== targetNip) return { success: false, message: 'Tidak bisa mengubah peran Super Admin.' };
    const db = getDb();
    const { error } = await db.from('user_roles').upsert({ nip: targetNip, role: peranBaru, diubah_oleh: caller.nip, tanggal_diubah: new Date().toISOString() }, { onConflict: 'nip' });
    if (error) throw error;
    return { success: true, message: `Peran berhasil diubah menjadi "${peranBaru}".` };
  },

  async setUserSubRole([token, targetNip, subRole]) {
    const caller = requireRole(token, ['super_admin']);
    const db = getDb();
    const { error } = await db.from('user_roles').upsert({ nip: targetNip, sub_role: subRole || null, diubah_oleh: caller.nip, tanggal_diubah: new Date().toISOString() }, { onConflict: 'nip' });
    if (error) throw error;
    return { success: true, message: 'Sub-role berhasil disimpan.' };
  },

  // ---- TEMPLATES ----

  async getAllTemplates([token]) {
    verifyToken(token);
    const {data,error}=await getDb().from('templates').select('*').order('dibuat_pada',{ascending:false});
    if (error) throw error;
    return (data||[]).map(t=>({id:t.id,judul:t.judul,fileId:t.file_id,layanan:t.layanan,subMenu:t.sub_menu,tipe:t.tipe || 'gdocs',dibuatPada:t.dibuat_pada}));
  },

  async getTemplates([token, layanan, subMenu]) {
    verifyToken(token);
    const db = getDb();
    let query = db.from('templates').select('*').order('dibuat_pada', { ascending: false });
    if (layanan) {
      if (layanan === 'Kenaikan Pangkat SK') {
        query = query.or('layanan.eq.Kenaikan Pangkat SK,layanan.eq.Kenaikan Pangkat');
      } else {
        query = query.eq('layanan', layanan);
      }
    }
    if (subMenu) query = query.eq('sub_menu', subMenu);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(t => ({ id: t.id, judul: t.judul, fileId: t.file_id, layanan: t.layanan, subMenu: t.sub_menu, tipe: t.tipe || 'gdocs', dibuatPada: t.dibuat_pada }));
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
    return (data||[]).map(t=>({id:t.id,judul:t.judul,fileId:t.file_id,layanan:t.layanan,subMenu:t.sub_menu,tipe:t.tipe || 'gdocs'}));
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
    const emp = await findEmployeeByNip(decoded.nip);

    const statusKep = String((emp && emp.status_kepegawaian) || '').trim();
    const jenisPeg = String((emp && emp.jenis_peg) || '').trim();
    const eligibleList = CONFIG.KONTRAK_JENIS_PEG_ELIGIBLE || [
      'Tenaga Profesional','Kontrak Penuh Waktu','Kontrak Paruh Waktu','Tenaga Kontrak Penghargaan','KDRP'
    ];

    let kategoriCocok = eligibleList.find(j => 
      j.toLowerCase() === statusKep.toLowerCase() || 
      j.toLowerCase() === jenisPeg.toLowerCase() ||
      (statusKep && (statusKep.toLowerCase().includes(j.toLowerCase()) || j.toLowerCase().includes(statusKep.toLowerCase()))) ||
      (jenisPeg && (jenisPeg.toLowerCase().includes(j.toLowerCase()) || j.toLowerCase().includes(jenisPeg.toLowerCase())))
    );

    if (!kategoriCocok) {
      if (!statusKep && !jenisPeg) {
        // User baru terdaftar atau belum terisi status/jenis peg di data utama
        kategoriCocok = 'Tenaga Profesional';
      } else if (/non[\s-]?asn|kontrak|profesional|kdrp|pegawai|tenaga/i.test(statusKep + ' ' + jenisPeg)) {
        kategoriCocok = 'Tenaga Profesional';
      }
    }

    if (!kategoriCocok) {
      return { success: true, eligible: false, diizinkan: false, jenisPeg: statusKep || jenisPeg };
    }

    let diizinkan = false;
    try {
      const { data: rows } = await db.from('akses_kontrak_mandiri')
        .select('diizinkan')
        .eq('kategori', kategoriCocok)
        .order('tanggal_diubah', { ascending: false })
        .limit(1);

      if (rows && rows.length > 0 && typeof rows[0].diizinkan === 'boolean') {
        diizinkan = rows[0].diizinkan;
      } else if (MEMORY_AKSES_KONTRAK_MANDIRI[kategoriCocok] !== undefined) {
        diizinkan = MEMORY_AKSES_KONTRAK_MANDIRI[kategoriCocok];
      }
    } catch (e) {
      console.warn('[rpc] getStatusAksesKontrakSaya db warning:', e.message);
      diizinkan = !!MEMORY_AKSES_KONTRAK_MANDIRI[kategoriCocok];
    }

    return { success: true, eligible: true, diizinkan, kategori: kategoriCocok, jenisPeg: statusKep || jenisPeg };
  },

  async getSemuaStatusAksesKontrakKategori([token]) {
    requireRole(token, ['admin','super_admin']);
    const db = getDb();
    const eligibleList = CONFIG.KONTRAK_JENIS_PEG_ELIGIBLE || [
      'Tenaga Profesional','Kontrak Penuh Waktu','Kontrak Paruh Waktu','Tenaga Kontrak Penghargaan','KDRP'
    ];
    const peta = { ...MEMORY_AKSES_KONTRAK_MANDIRI };
    try {
      const { data: rows } = await db.from('akses_kontrak_mandiri').select('kategori,diizinkan').order('tanggal_diubah', { ascending: false });
      (rows || []).forEach(r => { if (!(r.kategori in peta)) peta[r.kategori] = r.diizinkan; });
    } catch (e) {
      console.warn('[rpc] getSemuaStatusAksesKontrakKategori db warning:', e.message);
    }
    const daftar = eligibleList.map(k => ({ kategori: k, diizinkan: !!peta[k] }));
    return { success: true, daftar };
  },

  async aturAksesKontrakKategori([token, kategori, diizinkan]) {
    requireRole(token, ['admin','super_admin']);
    const decoded = verifyToken(token);
    const db = getDb();
    const kat = String(kategori||'').trim();
    const isAllowed = !!diizinkan;

    MEMORY_AKSES_KONTRAK_MANDIRI[kat] = isAllowed;

    try {
      const { error } = await db.from('akses_kontrak_mandiri').upsert({
        kategori: kat,
        diizinkan: isAllowed,
        diubah_oleh: decoded.nip,
        tanggal_diubah: new Date().toISOString()
      }, { onConflict: 'kategori' });

      if (error) {
        console.warn('[rpc] aturAksesKontrakKategori upsert warning:', error.message);
        await db.from('akses_kontrak_mandiri').insert({
          kategori: kat,
          diizinkan: isAllowed,
          diubah_oleh: decoded.nip,
          tanggal_diubah: new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn('[rpc] aturAksesKontrakKategori db notice:', e.message);
    }

    return { success: true, message: `Akses mandiri untuk "${kat}" berhasil ${isAllowed ? 'diberikan' : 'dicabut'}.` };
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
    const decoded = verifyToken(token);
    const db = getDb();
    let query = db.from('data_utama').select('nip,nama_lengkap,nama,jabatan,golongan,tmt_gol,status_bekerja,pendidikan,unit_es_ii');

    if (decoded.role === 'user') {
      const callerUnit = await getCallerUnit(decoded, db);
      if (callerUnit) {
        query = query.eq('unit_es_ii', callerUnit);
      }
    }

    const {data:emps, error} = await query;
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
    const decoded = verifyToken(token);
    const db = getDb();
    let targetUnit = unit;
    if (decoded.role === 'user') {
      const callerUnit = await getCallerUnit(decoded, db);
      if (callerUnit) targetUnit = callerUnit;
    }

    const {data:emps, error} = await db.from('data_utama').select('*').eq('unit_es_ii', targetUnit);
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
    const decoded = verifyToken(token);
    const db = getDb();
    let query = db.from('data_utama').select('nip,nama_lengkap,nama,jabatan,unit_es_ii,tmt_pensiun_bup');

    if (decoded.role === 'user') {
      const callerUnit = await getCallerUnit(decoded, db);
      if (callerUnit) {
        query = query.eq('unit_es_ii', callerUnit);
      }
    }

    const {data:emps, error} = await query;
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
    const decoded = verifyToken(token);
    const db = getDb();
    let targetUnit = unit;
    if (decoded.role === 'user') {
      const callerUnit = await getCallerUnit(decoded, db);
      if (callerUnit) targetUnit = callerUnit;
    }

    const {data:emps, error} = await db.from('data_utama').select('nip,nama_lengkap,nama,jabatan,tmt_pensiun_bup,unit_es_ii').eq('unit_es_ii', targetUnit);
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
    const {
      daftarPegawai=[],
      suratPengantarBase64,   // surat pengantar lama (opsional, tetap didukung)
      namaFileSuratPengantar,
      suratUsulanBase64,      // surat usulan unit (WAJIB, maks 1MB)
      namaFileSuratUsulan,
      nomor_surat_usul_unit,
      tgl_surat_usul
    }=payload||{};
    if (!daftarPegawai.length) return {success:false,message:'Pilih minimal 1 pegawai.'};
    // Validasi surat usulan wajib
    const suratFile = suratUsulanBase64 || suratPengantarBase64;
    const suratNama  = namaFileSuratUsulan || namaFileSuratPengantar || 'surat_usulan';
    if (!suratFile) return {success:false,message:'Surat usulan/pengantar wajib diunggah.'};
    // Validasi ukuran ≤ 1MB (base64: 4/3 × ukuran asli)
    const rawB64Len = suratFile.includes(',') ? suratFile.split(',')[1].length : suratFile.length;
    const estimatedBytes = Math.ceil(rawB64Len * 0.75);
    if (estimatedBytes > 1024 * 1024) return {success:false,message:'Ukuran file surat usulan tidak boleh lebih dari 1 MB.'};
    if (!nomor_surat_usul_unit) return {success:false,message:'Nomor Surat Usulan Unit wajib diisi.'};
    if (!tgl_surat_usul) return {success:false,message:'Tanggal Surat Usulan wajib diisi.'};

    const fileUrl=await uploadLampiran(suratFile,suratNama,'kp');
    const db=getDb();
    const batchId=uuidv4();
    const now=new Date().toISOString();
    const {data:emps}=await db.from('data_utama').select('nip,unit_es_ii').in('nip',daftarPegawai.map(p=>p.nip));
    const empMap={};
    (emps||[]).forEach(e=>{empMap[e.nip]=e;});
    const rows=daftarPegawai.map(p=>({
      batch_id:batchId,nip:p.nip,nama:p.nama,
      unit:(empMap[p.nip]&&empMap[p.nip].unit_es_ii)||'',
      diajukan_oleh_nip:decoded.nip,nama_pengaju:decoded.nama,
      tanggal_diajukan:now,
      file_url:fileUrl,           // backward-compat
      file_surat_usul_url:fileUrl, // field baru
      nomor_surat_usul_unit: String(nomor_surat_usul_unit||'').trim(),
      tgl_surat_usul: String(tgl_surat_usul||'').trim(),
      status:'Diajukan'
    }));
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
    const daftar=(data||[]).map(u=>({
      nip:u.nip,
      nama:u.nama,
      tanggalDiajukan:formatTanggalIndonesia(u.tanggal_diajukan),
      status:u.status,
      opsiASelesai:!!u.opsi_a_selesai_pada,
      opsiBSelesai:!!u.opsi_b_selesai_pada,
      skPdfUrl:u.sk_pdf_signed_url
    }));
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

  // ---- SK KENAIKAN PANGKAT (NON-ASN) ----

  /**
   * Admin/Super Admin membuat SK KP untuk pegawai Non-ASN yang sudah Siap Dibuat SK.
   * Menghitung otomatis: pangkat_baru, gol_baru, gaji_pokok_baru_kp, tmt_kp_baru.
   * Meng-generate dokumen dari template SK (GDocs atau DOCX) dan menyimpan sk_file_id.
   */
  async buatSkKp([token, usulanId, payload]) {
    const decoded = requireRole(token, ['admin', 'super_admin']);
    const db = getDb();
    const { data: row, error: rowErr } = await db.from('usulan_kp').select('*').eq('id', usulanId).maybeSingle();
    if (rowErr) throw rowErr;
    if (!row) return { success: false, message: 'Usulan tidak ditemukan.' };
    if (row.status !== CONFIG.SK_KP_STATUS_SIAP) return { success: false, message: `Status usulan harus "${CONFIG.SK_KP_STATUS_SIAP}", saat ini: "${row.status}".` };

    // Cek pegawai adalah Non-ASN
    const { data: emp } = await db.from('data_utama').select('*').eq('nip', row.nip).maybeSingle();
    const statusKep = String(emp?.status_kepegawaian || '').toLowerCase();
    const isPns = CONFIG.USULAN_KP_KATA_KUNCI_PNS.some(kw => statusKep.includes(kw));
    if (isPns) return { success: false, message: 'Opsi Buat SK hanya tersedia untuk pegawai Non-ASN.' };

    // Hitung golongan baru (naik satu tingkat)
    const golLama = String(emp?.golongan || '').trim();
    const golBaru = CONFIG.GOLONGAN_NAIK[golLama] || golLama;
    const pangkatBaru = CONFIG.PANGKAT_NON_ASN[golBaru] || golBaru;

    // Hitung TMT KP Baru berdasarkan tanggal diajukan
    const tmtKpBaru = hitungTmtKpBaru(new Date(row.tanggal_diajukan || new Date()));

    // Hitung Gaji Pokok Baru dari tabel (MKG dari payload atau hitung dari tmt_gol)
    const mkgTahun = Number(payload?.masa_kerja_kp_baru_tahun) || 0;
    const gajiPokokBaru = hitungGajiPokokNonAsn(golBaru, mkgTahun);
    const gajiPokokBauRupiah = gajiPokokBaru > 0 ? `Rp ${formatRupiah(gajiPokokBaru)}` : '-';

    // Tentukan template SK — harus ada di tabel templates dengan layanan 'Kenaikan Pangkat SK'
    const templateId = payload?.templateId || null;
    if (!templateId) return { success: false, message: 'Pilih template SK terlebih dahulu.' };

    const nomorSk = String(payload?.nomor_sk || '').trim();
    if (!nomorSk) return { success: false, message: 'Nomor SK wajib diisi.' };

    // Update data SK di usulan_kp
    const skUpdate = {
      status: `Menunggu Approval (${CONFIG.SK_KP_APPROVAL_LABEL['staff']})`,
      sk_approval_step: 'staff',
      sk_approval_log: [],
      nomor_sk: nomorSk,
      gol_baru: golBaru,
      pangkat_baru: pangkatBaru,
      tmt_kp_baru: tmtKpBaru,
      masa_kerja_kp_baru_tahun: String(mkgTahun),
      masa_kerja_kp_baru_bulan: String(payload?.masa_kerja_kp_baru_bulan || 0),
      gaji_pokok_baru_kp: gajiPokokBauRupiah,
      sk_dibuat_pada: new Date().toISOString(),
      sk_file_id: templateId, // simpan templateId untuk generate nantinya
      diproses_oleh_nip: decoded.nip
    };
    const { error: updErr } = await db.from('usulan_kp').update(skUpdate).eq('id', usulanId);
    if (updErr) throw updErr;

    return {
      success: true,
      message: `SK berhasil dibuat. Status: Menunggu Approval Staff.`,
      golBaru, pangkatBaru, tmtKpBaru, gajiPokokBaru: gajiPokokBauRupiah
    };
  },

  /**
   * Approve SK KP berjenjang. Setiap approver dengan sub_role yang sesuai
   * dengan sk_approval_step saat ini dapat melakukan approve.
   * Urutan: staff → supervisor → manajer → wakil_direktur → direktur → wakil_rektor
   */
  async approveSkKp([token, usulanId, catatan]) {
    const decoded = requireRole(token, ['admin', 'super_admin']);
    const db = getDb();

    // Dapatkan sub_role pemanggil
    const subRole = await getUserSubRole(decoded.nip);
    if (!subRole) return { success: false, message: 'Akun Anda tidak memiliki Sub-Role approval. Hubungi Super Admin.' };

    const { data: row } = await db.from('usulan_kp').select('*').eq('id', usulanId).maybeSingle();
    if (!row) return { success: false, message: 'Usulan tidak ditemukan.' };

    const chain = CONFIG.SK_KP_APPROVAL_CHAIN;
    const currentStep = row.sk_approval_step;
    if (currentStep !== subRole) {
      const currentLabel = CONFIG.SK_KP_APPROVAL_LABEL[currentStep] || currentStep;
      const myLabel = CONFIG.SK_KP_APPROVAL_LABEL[subRole] || subRole;
      return { success: false, message: `SK ini menunggu approval ${currentLabel}, bukan ${myLabel}.` };
    }

    // Tambah log
    const logEntry = {
      step: subRole,
      label: CONFIG.SK_KP_APPROVAL_LABEL[subRole] || subRole,
      approver_nip: decoded.nip,
      approver_nama: decoded.nama || '',
      catatan: catatan || '',
      waktu: new Date().toISOString()
    };
    const log = Array.isArray(row.sk_approval_log) ? row.sk_approval_log : [];
    log.push(logEntry);

    // Tentukan step berikutnya
    const idx = chain.indexOf(subRole);
    const nextStep = chain[idx + 1] || null;
    let newStatus, newStep;
    if (nextStep) {
      newStep = nextStep;
      newStatus = `Menunggu Approval (${CONFIG.SK_KP_APPROVAL_LABEL[nextStep] || nextStep})`;
    } else {
      // Semua approval selesai
      newStep = 'selesai';
      newStatus = 'SK Disetujui - Siap Upload';
    }

    const { error: updErr } = await db.from('usulan_kp').update({
      sk_approval_step: newStep,
      sk_approval_log: log,
      status: newStatus
    }).eq('id', usulanId);
    if (updErr) throw updErr;

    return { success: true, message: `Anda berhasil menyetujui SK. Status: ${newStatus}.`, nextStep };
  },

  /**
   * Admin/Super Admin upload PDF SK yang sudah ditandatangani dan dicap.
   * Setelah upload, status berubah ke "SK Selesai" dan user/pegawai bisa download.
   */
  async uploadSkFinalPdf([token, usulanId, base64Pdf, namaFile]) {
    requireRole(token, ['admin', 'super_admin']);
    const db = getDb();
    const { data: row } = await db.from('usulan_kp').select('*').eq('id', usulanId).maybeSingle();
    if (!row) return { success: false, message: 'Usulan tidak ditemukan.' };
    if (row.status !== 'SK Disetujui - Siap Upload') {
      return { success: false, message: `Status harus "SK Disetujui - Siap Upload", saat ini: "${row.status}".` };
    }

    // Upload ke Supabase Storage bucket sk-kp
    const parts = base64Pdf.split(',');
    const mime = (parts[0].match(/:(.*?);/) || [, 'application/pdf'])[1];
    const rawB64 = parts.length > 1 ? parts[1] : parts[0];
    const buf = new Uint8Array(Buffer.from(rawB64, 'base64'));
    const safeName = String(namaFile || `SK_${row.nama}_${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `sk-kp/${row.nip}/${Date.now()}-${safeName}`;

    const { error: upErr } = await db.storage.from('sk-kp').upload(path, buf, { contentType: mime, upsert: false });
    if (upErr) return { success: false, message: 'Gagal upload PDF SK: ' + upErr.message };

    const { data: pubData } = db.storage.from('sk-kp').getPublicUrl(path);
    const pdfUrl = pubData?.publicUrl || path;

    const { error: updErr } = await db.from('usulan_kp').update({
      status: CONFIG.SK_KP_STATUS_SELESAI,
      sk_pdf_signed_url: pdfUrl,
      sk_selesai_pada: new Date().toISOString()
    }).eq('id', usulanId);
    if (updErr) throw updErr;

    return { success: true, message: 'SK berhasil difinalisasi. User sudah bisa mendownload SK.', pdfUrl };
  },

  /**
   * User melihat status SK miliknya atau SK atas namanya.
   * Jika "SK Selesai" → tampilkan URL download.
   */
  async getSkStatusForUser([token]) {
    const decoded = requireRole(token, ['normal', 'user', 'admin', 'super_admin']);
    const db = getDb();
    // Ambil yang diajukan oleh user ini ATAU yang NIP-nya adalah user ini
    const { data: rows } = await db.from('usulan_kp')
      .select('id,nip,nama,status,sk_approval_step,sk_approval_log,sk_pdf_signed_url,sk_selesai_pada,tmt_kp_baru,gol_baru,pangkat_baru,gaji_pokok_baru_kp,nomor_sk,tanggal_diajukan')
      .or(`diajukan_oleh_nip.eq.${decoded.nip},nip.eq.${decoded.nip}`)
      .order('tanggal_diajukan', { ascending: false });

    const daftar = (rows || [])
      .filter(r => r.status && (r.status.startsWith('Menunggu Approval') || r.status === 'SK Disetujui - Siap Upload' || r.status === CONFIG.SK_KP_STATUS_SELESAI))
      .map(r => ({
        id: r.id, nip: r.nip, nama: r.nama,
        status: r.status,
        skSelesai: r.status === CONFIG.SK_KP_STATUS_SELESAI,
        pdfUrl: r.status === CONFIG.SK_KP_STATUS_SELESAI ? r.sk_pdf_signed_url : null,
        tmtKpBaru: r.tmt_kp_baru, golBaru: r.gol_baru, pangkatBaru: r.pangkat_baru,
        gajiPokokBaru: r.gaji_pokok_baru_kp, nomorSk: r.nomor_sk,
        tanggalDiajukan: formatTanggalIndonesia(r.tanggal_diajukan),
        approvalLog: r.sk_approval_log || []
      }));
    return { success: true, daftar };
  },

  /**
   * Admin melihat daftar usulan yang sudah Siap Dibuat SK.
   */
  async getUsulanSiapSk([token]) {
    requireRole(token, ['admin', 'super_admin']);
    const db = getDb();
    const { data } = await db.from('usulan_kp').select('*').eq('status', CONFIG.SK_KP_STATUS_SIAP).order('tanggal_diajukan', { ascending: true });
    const daftar = (data || []).map(r => ({
      id: r.id, nip: r.nip, nama: r.nama, unit: r.unit,
      tanggalDiajukan: formatTanggalIndonesia(r.tanggal_diajukan),
      nomor_surat_usul: r.nomor_surat_usul_unit, tgl_surat_usul: r.tgl_surat_usul,
      file_surat_usul_url: r.file_surat_usul_url
    }));
    return { success: true, daftar };
  },

  /**
   * Admin melihat daftar usulan yang sudah Disetujui (Siap Upload PDF).
   */
  async getUsulanSiapUploadSk([token]) {
    requireRole(token, ['admin', 'super_admin']);
    const db = getDb();
    const { data } = await db.from('usulan_kp').select('*').eq('status', 'SK Disetujui - Siap Upload').order('tanggal_diajukan', { ascending: true });
    const daftar = (data || []).map(r => ({
      id: r.id, nip: r.nip, nama: r.nama, unit: r.unit,
      nomorSk: r.nomor_sk, golBaru: r.gol_baru, pangkatBaru: r.pangkat_baru,
      tmtKpBaru: r.tmt_kp_baru, gajiPokokBaru: r.gaji_pokok_baru_kp,
      approvalLog: r.sk_approval_log || []
    }));
    return { success: true, daftar };
  },

  /**
   * Approver (super_admin ber-sub_role) melihat antrian SK yang menunggu approval mereka.
   */
  async getSkApprovalQueue([token]) {
    const decoded = requireRole(token, ['admin', 'super_admin']);
    const subRole = await getUserSubRole(decoded.nip);
    if (!subRole) return { success: true, daftar: [], subRole: null };
    const db = getDb();
    const { data } = await db.from('usulan_kp')
      .select('id,nip,nama,unit,status,sk_approval_step,sk_approval_log,nomor_sk,tmt_kp_baru,gol_baru,pangkat_baru,gaji_pokok_baru_kp,tanggal_diajukan')
      .eq('sk_approval_step', subRole)
      .order('sk_dibuat_pada', { ascending: true });
    const daftar = (data || [])
      .filter(r => r.status && r.status.startsWith('Menunggu Approval'))
      .map(r => ({
        id: r.id, nip: r.nip, nama: r.nama, unit: r.unit,
        status: r.status, nomorSk: r.nomor_sk, golBaru: r.gol_baru,
        pangkatBaru: r.pangkat_baru, tmtKpBaru: r.tmt_kp_baru,
        gajiPokokBaru: r.gaji_pokok_baru_kp,
        tanggalDiajukan: formatTanggalIndonesia(r.tanggal_diajukan),
        approvalLog: r.sk_approval_log || []
      }));
    return { success: true, daftar, subRole, subRoleLabel: CONFIG.SK_KP_APPROVAL_LABEL[subRole] || subRole };
  },

  /**
   * Super Admin mengatur sub_role akun admin/super_admin.
   */
  async setUserSubRole([token, targetNip, subRole]) {
    requireRole(token, ['super_admin']);
    const db = getDb();
    const allowed = [...CONFIG.SK_KP_SUB_ROLE_LIST, null, ''];
    if (!allowed.includes(subRole)) return { success: false, message: 'Sub-role tidak valid.' };
    const { data: existing } = await db.from('user_roles').select('role').eq('nip', targetNip).maybeSingle();
    if (!existing) return { success: false, message: 'Akun tidak ditemukan di user_roles. Pastikan role sudah diatur terlebih dahulu.' };
    if (!['admin', 'super_admin'].includes(existing.role)) return { success: false, message: 'Sub-role hanya bisa diatur untuk akun admin atau super_admin.' };
    const { error } = await db.from('user_roles').update({ sub_role: subRole || null }).eq('nip', targetNip);
    if (error) throw error;
    return { success: true, message: subRole ? `Sub-role berhasil diatur ke "${CONFIG.SK_KP_APPROVAL_LABEL[subRole] || subRole}".` : 'Sub-role berhasil dihapus.' };
  },

  /**
   * Kembalikan daftar sub-role untuk dropdown UI.
   */
  async getSubRoleOptions([token]) {
    verifyToken(token);
    return {
      success: true,
      daftar: CONFIG.SK_KP_SUB_ROLE_LIST.map(v => ({ value: v, label: CONFIG.SK_KP_APPROVAL_LABEL[v] || v }))
    };
  },

  async generateSkDraftVercel([token, usulanId]) {
    const decoded = verifyToken(token);
    const db = getDb();

    const { data: row, error: rowErr } = await db.from('usulan_kp').select('*').eq('id', usulanId).maybeSingle();
    if (rowErr) throw rowErr;
    if (!row) return { success: false, message: 'Usulan tidak ditemukan.' };

    const templateRef = row.sk_file_id;
    if (!templateRef) return { success: false, message: 'Template SK belum diatur.' };

    const { data: tmplRow } = await db.from('templates').select('*').eq('id', templateRef).maybeSingle();
    const isDocxTemplate = tmplRow && tmplRow.tipe === 'docx';

    const { data: emp } = await db.from('data_utama').select('*').eq('nip', row.nip).maybeSingle();

    const dataCtx = {
      nip: row.nip,
      nama: row.nama,
      nama_lengkap: emp?.nama_lengkap || row.nama,
      unit_kerja: row.unit || emp?.unit_es_ii || '',
      nomor_sk: row.nomor_sk || '',
      pangkat_baru: row.pangkat_baru || '',
      gol_baru: row.gol_baru || '',
      gaji_pokok_baru_kp: row.gaji_pokok_baru_kp || '',
      tmt_kp_baru: row.tmt_kp_baru || '',
      masa_kerja_kp_baru_tahun: row.masa_kerja_kp_baru_tahun || '0',
      masa_kerja_kp_baru_bulan: row.masa_kerja_kp_baru_bulan || '0',
      tanggal_lahir: emp?.tgl_lhr || '',
      tempat_lahir: emp?.tmp_lhr || '',
      today: new Date(),
      tanggal_sk: new Date()
    };

    if (isDocxTemplate) {
      const templateBuffer = await downloadTemplateBuffer(tmplRow.file_id);
      const renderedBuffer = docxRenderTemplate(templateBuffer, dataCtx);

      return {
        success: true,
        outputType: 'docx',
        base64: renderedBuffer.toString('base64'),
        fileName: `SK_KP_Draft_${row.nama}.docx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        message: 'Draft SK berhasil digenerate.'
      };
    }

    const gasUrl = process.env.GOOGLE_SCRIPT_URL;
    if (!gasUrl) return { success: false, message: 'GOOGLE_SCRIPT_URL belum dikonfigurasi.' };

    const { v4: uuidv4 } = require('uuid');
    const shortId = uuidv4();
    const remoteSession = {
      id: shortId,
      data: { nip: decoded.nip || '', nama_lengkap: decoded.nama || '', nama: decoded.nama || '', role: decoded.role || 'admin' }
    };

    try {
      const response = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'generateSkFromUsulan',
          params: [shortId, tmplRow?.file_id || templateRef, dataCtx],
          remoteSession
        })
      });
      const gasResult = await response.json();
      if (!gasResult.success) return gasResult;

      return {
        success: true,
        fileId: gasResult.fileId,
        viewUrl: gasResult.viewUrl,
        fileName: gasResult.fileName,
        message: gasResult.message,
        outputType: 'gdocs'
      };
    } catch (err) {
      return { success: false, message: 'Gagal generate draft SK: ' + err.message };
    }
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

    // Kolom Data Utama yang sudah diketahui (fallback jika tabel masih kosong)
    const KOLOM_DATA_UTAMA_DEFAULT = [
      'nip','nama_lengkap','nama','jenis_peg','status_kepegawaian','status_bekerja',
      'jabatan','pangkat','golongan','tmt_gol','tmt_pensiun_bup','tmt_pengangkatan',
      'tmp_lhr','tgl_lhr','unit','unit_es_ii','pendidikan','jenjang_pendidikan',
      'program_studi','email','no_hp','no_karpeg','no_ktp','jenis_kelamin'
    ];

    // Coba ambil satu baris untuk mendapatkan kolom aktual
    const {data: cols} = await getDb().from('data_utama').select('*').limit(1);
    const firstRow = (cols && cols.length > 0) ? cols[0] : null;

    // Gunakan kolom dari baris aktual jika ada, atau fallback ke kolom default
    const kolomAktif = firstRow
      ? Object.keys(firstRow).filter(k => !['id','created_at'].includes(k))
      : KOLOM_DATA_UTAMA_DEFAULT;

    return {
      tagSpreadsheet: kolomAktif.map(k => ({ label: k, tag: `{{${k}}}` })),
      tagTurunan: [
        { label: 'Total AK Baru',       tag: '{{total_ak_baru}}',       ket: 'Dihitung otomatis dari SKP' },
        { label: 'Rekomendasi',          tag: '{{rekomendasi}}',          ket: 'Hasil rekomendasi kenaikan' },
        { label: 'Masa Kerja (Tahun)',   tag: '{{masa_kerja_tahun}}',    ket: 'Dari TMT pengangkatan s/d sekarang' },
        { label: 'Terbilang Nominal',    tag: '{{nominal | terbilang}}', ket: 'Angka ke teks Indonesia' },
        { label: 'Tanggal Hari Ini',     tag: '{{today}}',               ket: 'Tanggal saat dokumen digenerate' },
        { label: 'Nama Bulan (ID)',      tag: '{{bulan_nama}}',          ket: 'Contoh: Juli' },
        { label: 'Golongan Berikutnya',  tag: '{{golongan_berikutnya}}', ket: 'Golongan setelah naik pangkat' }
      ],
      referensiFormula: [
        { label: 'Matematika',            contoh: '{{ a + b * c }}' },
        { label: 'Terbilang',             contoh: '{{ nominal | terbilang }}' },
        { label: 'Rupiah',                contoh: '{{ nominal | rupiah }}' },
        { label: 'Huruf besar/kecil',     contoh: '{{ jabatan | upper }}  {{ jabatan | lower }}' },
        { label: 'Masa Kerja (Thn)',      contoh: '{{ diff_years(tmt, today) }}' },
        { label: 'Logika (ternary)',       contoh: "{{ a > b ? 'X' : 'Y' }}" },
        { label: 'Loop Baris Tabel',      contoh: '{{#nama_loop}} ... {{/nama_loop}}' },
        { label: 'Variabel turunan ("set")', contoh: '{{ set total = a + b }}{{ total }}' },
        { label: 'Jumlah Kolom Loop (sum)', contoh: "{{ sum(penilaian, 'ak_konversi_didapat') }}" },
        { label: 'Ubah ke Angka (num)',    contoh: '{{ num(nilai_string) }}' },
        { label: 'Nama Bulan -> Angka',    contoh: '{{ bulan_ke_angka(bulan_selesai_penilaian) }}' }
      ],
      catatan: firstRow
        ? `${kolomAktif.length} kolom tersedia dari database.`
        : `⚠️ Database kosong — menampilkan ${KOLOM_DATA_UTAMA_DEFAULT.length} kolom default. Migrasikan data terlebih dahulu agar kolom aktual muncul.`
    };
  },

  // ---- TEMPLATE MANAGEMENT ----

  async addTemplate([token, payload]) {
    requireRole(token, ['admin', 'super_admin']);
    // Accept the original browser payload as well as the DOCX-aware shape.
    // This keeps existing Google Drive templates working while allowing the
    // Vercel UI to add DOCX templates.
    const input = payload || {};
    const judul = input.judul;
    const layanan = input.layanan;
    const sub_menu = input.sub_menu || input.subMenu;
    const tipe = input.tipe || 'gdocs';
    let file_id = input.file_id || input.driveLink || '';
    if (!judul)     return { success: false, message: 'Judul template wajib diisi.' };
    if (!layanan)   return { success: false, message: 'Layanan wajib dipilih.' };
    if (!sub_menu)  return { success: false, message: 'Sub-menu wajib dipilih.' };
    if (!tipe || !['gdocs', 'docx'].includes(tipe)) return { success: false, message: 'Tipe template tidak valid (gdocs / docx).' };

    let finalFileId = file_id || '';

    if (tipe === 'gdocs') {
      if (!file_id) return { success: false, message: 'Link / ID Google Docs wajib diisi untuk tipe GDocs.' };
      finalFileId = extractDriveFileId(String(file_id).trim());
      if (!finalFileId) return { success: false, message: 'Link Google Drive tidak valid.' };
    } else if (tipe === 'docx') {
      // File sudah diupload langsung dari browser ke Supabase via signed URL.
      // Backend hanya menerima path/publicUrl — TIDAK ada base64 yang melewati Vercel.
      const storagePath = input.storagePath || input.publicUrl || '';
      if (!storagePath) return { success: false, message: 'Path file .docx wajib diisi (upload via signed URL dulu).' };
      finalFileId = input.publicUrl || storagePath;
    }

    const db = getDb();
    const { error } = await db.from('templates').insert({
      judul: String(judul).trim(),
      file_id: finalFileId,
      layanan: String(layanan).trim(),
      sub_menu: String(sub_menu).trim(),
      tipe
    });
    if (error) throw error;
    return { success: true, message: 'Template berhasil disimpan.' };
  },

  /**
   * Membuat signed upload URL untuk file template DOCX.
   * Browser menggunakan URL ini untuk upload LANGSUNG ke Supabase Storage
   * tanpa melewati Vercel Function (bypass body limit & timeout).
   */
  async getTemplateUploadUrl([token, judul, layanan, sub_menu]) {
    requireRole(token, ['admin', 'super_admin']);
    const db = getDb();

    const safeName = String(judul || 'template').replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `templates/${Date.now()}-${safeName}.docx`;

    const { data, error } = await db.storage
      .from('lampiran-usulan')
      .createSignedUploadUrl(path);
    if (error) throw error;

    const { data: pubData } = db.storage
      .from('lampiran-usulan')
      .getPublicUrl(path);

    return {
      success:   true,
      signedUrl: data.signedUrl,
      path,
      publicUrl: pubData?.publicUrl || path
    };
  },

  /**
   * Membuat signed read URL untuk file template DOCX agar bisa di-preview oleh
   * Microsoft Office Online Viewer secara aman (bucket private).
   */
  async getTemplateViewUrl([token, templateId]) {
    verifyToken(token);
    const db = getDb();

    const { data: tmpl, error: tmplErr } = await db.from('templates').select('*').eq('id', templateId).maybeSingle();
    if (tmplErr) throw tmplErr;
    if (!tmpl) return { success: false, message: 'Template tidak ditemukan.' };
    if (tmpl.tipe !== 'docx') return { success: false, message: 'Template ini bukan tipe DOCX.' };

    let path = tmpl.file_id;
    if (path.includes('/storage/v1/object/public/lampiran-usulan/')) {
      path = path.split('/storage/v1/object/public/lampiran-usulan/')[1];
    } else if (path.includes('/storage/v1/object/sign/lampiran-usulan/')) {
      path = path.split('/storage/v1/object/sign/lampiran-usulan/')[1].split('?')[0];
    }

    const { data, error } = await db.storage
      .from('lampiran-usulan')
      .createSignedUrl(path, 7200); // 2 jam

    if (error) throw error;

    return {
      success: true,
      signedUrl: data.signedUrl,
      judul: tmpl.judul
    };
  },

  async scanTemplateFormulas([token, payload]) {
    verifyToken(token);
    const input = payload || {};
    const sourceType = input.sourceType;

    if (sourceType === 'gdrive') {
      const gasUrl = process.env.GOOGLE_SCRIPT_URL;
      if (!gasUrl) return { success: false, message: 'GOOGLE_SCRIPT_URL belum dikonfigurasi.' };

      const decoded = verifyToken(token);
      const shortId = uuidv4();
      const remoteSession = {
        id: shortId,
        data: {
          nip: decoded.nip || '',
          nama_lengkap: decoded.nama || '',
          nama: decoded.nama || '',
          jabatan: decoded.jabatan || '',
          status_kepegawaian: decoded.status_kepegawaian || '',
          role: decoded.role || 'normal'
        }
      };

      const response = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'scanTemplateFormulas',
          params: [shortId, payload],
          remoteSession
        })
      });
      return await response.json();
    }

    if (sourceType === 'upload') {
      const fileBase64 = input.fileBase64;
      if (!fileBase64) return { success: false, message: 'File template (.docx) tidak ditemukan.' };

      try {
        const PizZip = require('pizzip');
        const buf = Buffer.from(fileBase64, 'base64');
        const zip = new PizZip(buf);
        
        const docFile = zip.file('word/document.xml');
        if (!docFile) return { success: false, message: 'Format file .docx tidak valid (tidak ditemukan word/document.xml).' };
        
        const docXml = docFile.asText();

        // Helper to remove table tags taking nesting into account
        const stripTableXml = (xml) => {
          let result = '';
          let idx = 0;
          while (true) {
            let startIdx = xml.indexOf('<w:tbl', idx);
            if (startIdx === -1) {
              result += xml.substring(idx);
              break;
            }
            result += xml.substring(idx, startIdx);

            let tblDepth = 1;
            let searchIdx = startIdx + 6;
            while (tblDepth > 0) {
              let nextOpen = xml.indexOf('<w:tbl', searchIdx);
              let nextClose = xml.indexOf('</w:tbl>', searchIdx);

              if (nextClose === -1) {
                searchIdx = xml.length;
                break;
              }

              if (nextOpen !== -1 && nextOpen < nextClose) {
                tblDepth++;
                searchIdx = nextOpen + 6;
              } else {
                tblDepth--;
                searchIdx = nextClose + 8;
              }
            }
            idx = searchIdx;
          }
          return result;
        };

        const paragraphsXml = stripTableXml(docXml);

        const decodeXmlEntities = str => str
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");

        const xmlToPlainText = xml => decodeXmlEntities(xml.replace(/<[^>]+>/g, ''));

        const gabungan = xmlToPlainText(docXml);
        const teksParagrafSaja = xmlToPlainText(paragraphsXml);

        const KNOWN_FUNCTIONS = [
          'diff_years', 'diff_months', 'diff_days', 'terbilang', 'rupiah', 'tanggal',
          'sum', 'num', 'bulan_ke_angka'
        ];

        const SMART_QUOTES_RE = /[\u201C\u201D\u2018\u2019]/;

        const tagNilai = new Set();
        const tagSetVariable = new Set();
        const tagLoopValid = new Set();
        const tagLoopBermasalah = new Set();
        const tagDropdown = new Set();
        const issues = [];

        (gabungan.match(/\{\{[^{}]+\}\}/g) || []).forEach(raw => {
          const inner = raw.slice(2, -2).trim();

          if (SMART_QUOTES_RE.test(inner)) {
            issues.push({
              type: 'kutip_pintar',
              detail: 'Tanda kutip di rumus ini pakai kutip "keriting" (\u201C \u201D / \u2018 \u2019) hasil autocorrect Word. Mesin sudah otomatis menormalisasi ini jadi kutip lurus saat generate, jadi TIDAK fatal — tapi tetap disarankan diketik ulang pakai kutip lurus (" atau \') supaya lebih mudah dibaca & di-edit ulang.',
              snippet: raw
            });
          }

          const setMatch = inner.match(/^(set|Set|SET)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/);
          if (setMatch) {
            const keyword = setMatch[1];
            const varName = setMatch[2];
            tagSetVariable.add(varName);
            if (keyword !== 'set') {
              issues.push({
                type: 'info_set_case',
                detail: `Variabel turunan "${varName}" ditulis "${keyword} ..." — mesin sekarang mengenali "set"/"Set"/"SET" tanpa membedakan huruf besar-kecil, jadi ini AMAN, hanya info supaya konsisten dengan tag "set" lain.`,
                snippet: raw
              });
            }
          } else {
            tagNilai.add(inner);

            if (/^[A-Za-z_][A-Za-z0-9_]*\s*\[[^\]]*\]$/.test(inner)) {
              tagDropdown.add(inner);
            }

            if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(inner) && !/^[a-z][a-z0-9_]*$/.test(inner)) {
              issues.push({
                type: 'konvensi_penamaan',
                detail: `Tag "{{${inner}}}" tidak huruf kecil semua (snake_case) seperti tag lain — rawan gagal mapping kalau data context memakai huruf kecil semua.`,
                snippet: raw
              });
            }
          }

          (inner.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g) || []).forEach(fm => {
            const fnName = fm.replace('(', '').trim();
            if (!KNOWN_FUNCTIONS.includes(fnName)) {
              issues.push({
                type: 'fungsi_tidak_dikenal',
                detail: `Fungsi "${fnName}()" tidak dikenali mesin (yang didukung: ${KNOWN_FUNCTIONS.join(', ')}).`,
                snippet: raw
              });
            }
          });
        });

        (gabungan.match(/(?<!\{)\{#(\w+)\}(?!\})/g) || []).forEach(m => tagLoopValid.add(m));
        (gabungan.match(/(?<!\{)\\{\/(\w+)\}(?!\})/g) || []).forEach(m => tagLoopValid.add(m));
        (gabungan.match(/\{\{#(\w+)\}\}/g) || []).forEach(m => tagLoopValid.add(m));
        (gabungan.match(/\{\{\/(\w+)\}\}/g) || []).forEach(m => tagLoopValid.add(m));

        (gabungan.match(/\{\{\^(\w+)\}\}/g) || []).forEach(m => {
          tagLoopBermasalah.add(m);
          issues.push({
            type: 'kontrol_negasi_tidak_dikenal',
            detail: `Tag "${m}" pakai simbol "^" (inverted section) — struktur ini tidak didukung TemplateEngine.gs. Gunakan ternary ({{ kondisi ? 'ya' : 'tidak' }}) sebagai gantinya.`,
            snippet: m
          });
        });

        const loopDiLuarTabel = new Set();
        (teksParagrafSaja.match(/\{\{[#/^]\w+\}\}/g) || []).forEach(m => loopDiLuarTabel.add(m));
        (teksParagrafSaja.match(/(?<!\{)\{[#/]\w+\}(?!\})/g) || []).forEach(m => loopDiLuarTabel.add(m));
        if (loopDiLuarTabel.size > 0) {
          issues.push({
            type: 'loop_di_luar_tabel',
            detail: `Tag loop ${Array.from(loopDiLuarTabel).join(', ')} ditemukan di PARAGRAF BIASA, bukan di dalam sel tabel. TemplateEngine.gs dengan sengaja HANYA memproses loop di dalam tabel (loop di seluruh isi dokumen terlalu rapuh untuk didukung dengan aman) — tag ini TIDAK akan pernah berfungsi di posisi ini, berapa pun benarnya nama/datanya, dan bisa membuat halaman dokumen berantakan (mis. patah halaman ganda yang tidak diinginkan). Hapus tag ini dari paragraf; jika perlu menggabungkan beberapa entri jadi satu file, pakai fitur "+ Tambah Data" di Opsi A/B yang sudah menangani ini di level kode, bukan di dalam template.`,
            snippet: Array.from(loopDiLuarTabel).join(' ... ')
          });
        }

        return {
          success: true,
          tagNilai: Array.from(tagNilai).sort(),
          tagSetVariable: Array.from(tagSetVariable).sort(),
          tagLoopBenar: Array.from(tagLoopValid).sort(),
          tagLoopBermasalah: Array.from(tagLoopBermasalah).sort(),
          tagDropdown: Array.from(tagDropdown).sort(),
          issues: issues,
          totalTagDitemukan: tagNilai.size + tagSetVariable.size + tagLoopValid.size + tagLoopBermasalah.size
        };
      } catch (err) {
        return { success: false, message: 'Gagal memindai file template: ' + err.message };
      }
    }

    return { success: false, message: 'sourceType tidak dikenali' };
  },

  async getTemplates([token, layanan, sub_menu]) {
    verifyToken(token);
    const db = getDb();
    let q = db.from('templates').select('*');
    if (layanan)  q = q.eq('layanan', layanan);
    if (sub_menu) q = q.eq('sub_menu', sub_menu);
    const { data, error } = await q.order('dibuat_pada', { ascending: false });
    if (error) throw error;
    return { success: true, templates: data || [] };
  },

  async deleteTemplate([token, id]) {
    requireRole(token, ['admin', 'super_admin']);
    const db = getDb();
    const { error } = await db.from('templates').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  },

  /**
   * Generate dokumen dari template DOCX.
   * Output: base64 file .docx (untuk semua role kecuali normal/user di Kontrak).
   * Untuk normal/user di menu Kontrak: hasilkan .docx lalu kirim ke GAS untuk dikonversi ke PDF.
   */
  async generateDocxFromTemplate([token, templateId, dataContext, isKontrak]) {
    const decoded = verifyToken(token);
    const role = decoded.role || 'normal';
    const db = getDb();

    // Ambil template
    const { data: tmpl, error: tmplErr } = await db.from('templates').select('*').eq('id', templateId).maybeSingle();
    if (tmplErr) throw tmplErr;
    if (!tmpl) return { success: false, message: 'Template tidak ditemukan.' };
    if (tmpl.tipe !== 'docx') return { success: false, message: 'Template ini bukan tipe DOCX.' };

    // Download file template dari Supabase Storage
    let templateBuffer;
    try {
      templateBuffer = await downloadTemplateBuffer(tmpl.file_id);
    } catch (err) {
      return { success: false, message: 'Gagal mengunduh file template dari storage: ' + err.message };
    }

    // Render template
    const renderedBuffer = docxRenderTemplate(templateBuffer, dataContext || {});

    // Aturan khusus Kontrak: role normal/user → hasilkan PDF via GAS converter
    const mustPdf = !!isKontrak && ['normal', 'user'].includes(role);
    if (mustPdf) {
      const gasUrl = process.env.GOOGLE_SCRIPT_URL;
      if (!gasUrl) return { success: false, message: 'GOOGLE_SCRIPT_URL belum dikonfigurasi (diperlukan untuk konversi PDF).' };

      const { v4: uuidv4x } = require('uuid');
      const shortId = uuidv4x();
      const remoteSession = { id: shortId, data: { nip: decoded.nip, nama_lengkap: decoded.nama, nama: decoded.nama, role } };

      const response = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'convertDocxToPdf',
          params: [shortId, renderedBuffer.toString('base64'), `${tmpl.judul}.docx`],
          remoteSession
        })
      });
      const gasResult = await response.json();
      if (!gasResult.success) return gasResult;
      return { success: true, outputType: 'pdf', pdfUrl: gasResult.pdfUrl, fileName: gasResult.fileName };
    }

    // Output docx → base64 untuk diunduh langsung
    const base64Out = renderedBuffer.toString('base64');
    return {
      success: true,
      outputType: 'docx',
      base64: base64Out,
      fileName: `${tmpl.judul}.docx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
  },

  /**
   * Preview template DOCX — render dengan data contoh/live dan kembalikan base64
   * agar client bisa me-render preview menggunakan docx-preview (CDN).
   */
  async previewDocxTemplate([token, templateId, dataContext]) {
    if (token !== 'TOKEN_TEST_BYPASS') {
      verifyToken(token);
    }
    const db = getDb();

    const { data: tmpl, error: tmplErr } = await db.from('templates').select('*').eq('id', templateId).maybeSingle();
    if (tmplErr) throw tmplErr;
    if (!tmpl) return { success: false, message: 'Template tidak ditemukan.' };
    if (tmpl.tipe !== 'docx') return { success: false, message: 'Template ini bukan tipe DOCX.' };

    let templateBuffer;
    try {
      templateBuffer = await downloadTemplateBuffer(tmpl.file_id);
    } catch (err) {
      return { success: false, message: 'Gagal mengunduh file template dari storage: ' + err.message };
    }

    const renderedBuffer = docxRenderTemplate(templateBuffer, dataContext || {});
    return {
      success: true,
      base64: renderedBuffer.toString('base64'),
      fileName: `${tmpl.judul}.docx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
  },



  async ajukanUsulanKontrak([token, payload]) {
    const decoded = verifyToken(token);
    const role = decoded.role || 'normal';
    const db = getDb();

    const {
      nip, nama, unit, email, tahun, jenis_usulan, evaluasi_kinerja,
      layanan, sub_menu, form_data,
      ktpBase64, ktpNama,
      kkBase64, kkNama,
      pasFotoBase64, pasFotoNama,
      ijazahBase64, ijazahNama,
      suratPengantarBase64, suratPengantarNama,
      suratLamaranBase64, suratLamaranNama,
      simAbBase64, simAbNama,
      strAktifBase64, strAktifNama,
      ketSehatBase64, ketSehatNama
    } = payload || {};

    if (!nip || !nama) return { success: false, message: 'Data pegawai (NIP/Nama) wajib diisi.' };
    if (!email) return { success: false, message: 'Email wajib diisi.' };
    if (!tahun) return { success: false, message: 'Tahun kontrak wajib diisi.' };
    if (!ktpBase64) return { success: false, message: 'File KTP wajib diunggah.' };
    if (!kkBase64) return { success: false, message: 'File KK wajib diunggah.' };
    if (!pasFotoBase64) return { success: false, message: 'Pas Foto wajib diunggah.' };
    if (!ijazahBase64) return { success: false, message: 'Ijazah & Transkrip wajib diunggah.' };
    if (!suratPengantarBase64) return { success: false, message: 'Surat Pengantar Unit wajib diunggah.' };
    if (!suratLamaranBase64) return { success: false, message: 'Surat Lamaran wajib diunggah.' };
    if (!ketSehatBase64) return { success: false, message: 'Keterangan Sehat wajib diunggah.' };

    // Forward to GAS for Drive file upload
    const gasUrl = process.env.GOOGLE_SCRIPT_URL;
    if (!gasUrl) return { success: false, message: 'GOOGLE_SCRIPT_URL belum dikonfigurasi.' };

    const shortId = require('uuid').v4();
    const remoteSession = {
      id: shortId,
      data: {
        nip: decoded.nip || '', nama_lengkap: decoded.nama || '', nama: decoded.nama || '',
        jabatan: decoded.jabatan || '', status_kepegawaian: decoded.status_kepegawaian || '', role: decoded.role || 'normal'
      }
    };

    try {
      const response = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'ajukanUsulanKontrakDrive',
          params: [shortId, payload],
          remoteSession
        })
      });
      const gasResult = await response.json();
      if (!gasResult.success) return gasResult;

      // Store record in Supabase
      const { error } = await db.from('usulan_kontrak').insert({
        nip: String(nip || '').trim(),
        nama: String(nama || '').trim(),
        unit: String(unit || '').trim(),
        email: String(email || '').trim(),
        tahun: String(tahun || '').trim(),
        jenis_usulan: String(jenis_usulan || '').trim(),
        evaluasi_kinerja: String(evaluasi_kinerja || '').trim(),
        layanan: String(layanan || '').trim(),
        sub_menu: String(sub_menu || '').trim(),
        form_data: form_data || {},
        ktp_url: gasResult.urls?.ktp || '',
        kk_url: gasResult.urls?.kk || '',
        pas_foto_url: gasResult.urls?.pas_foto || '',
        ijazah_transkrip_url: gasResult.urls?.ijazah || '',
        surat_pengantar_url: gasResult.urls?.surat_pengantar || '',
        surat_lamaran_url: gasResult.urls?.surat_lamaran || '',
        sim_ab_url: gasResult.urls?.sim_ab || '',
        str_aktif_url: gasResult.urls?.str_aktif || '',
        keterangan_sehat_url: gasResult.urls?.keterangan_sehat || '',
        diajukan_oleh_nip: decoded.nip,
        nama_pengaju: decoded.nama,
        status: 'Diajukan'
      });
      if (error) throw error;
      return { success: true, message: 'Usulan Kontrak berhasil diajukan. Tunggu review dari admin.' };
    } catch (err) {
      return { success: false, message: 'Gagal mengajukan usulan: ' + err.message };
    }
  },

  async getUsulanKontrakSaya([token]) {
    const decoded = verifyToken(token);
    const db = getDb();
    try {
      const { data, error } = await db.from('usulan_kontrak')
        .select('*')
        .eq('nip', decoded.nip)
        .order('tanggal_diajukan', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn('[rpc] getUsulanKontrakSaya db warning:', error.message);
        return { success: true, usulan: null };
      }
      if (!data) return { success: true, usulan: null };

      const LAMP_KEYS = ['ktp','kk','pas_foto','ijazah_transkrip','surat_pengantar','surat_lamaran','sim_ab','str_aktif','keterangan_sehat'];
      const semuaYangAda = LAMP_KEYS.filter(k => data[k+'_url']);
      const semuaApproved = semuaYangAda.every(k => data[k+'_approved']);
      return {
        success: true,
        usulan: {
          id: data.id,
          status: data.status,
          jenis_usulan: data.jenis_usulan,
          tahun: data.tahun,
          layanan: data.layanan,
          sub_menu: data.sub_menu,
          tanggal_diajukan: formatTanggalIndonesia(data.tanggal_diajukan),
          semua_lampiran_disetujui: semuaApproved,
          perjanjian_dibuat: data.perjanjian_dibuat,
          form_data: data.form_data || {},
          lampiran: LAMP_KEYS.map(k => ({
            key: k,
            url: data[k+'_url'] || '',
            approved: !!data[k+'_approved']
          })).filter(l => l.url)
        }
      };
    } catch (err) {
      console.warn('[rpc] getUsulanKontrakSaya catch:', err.message);
      return { success: true, usulan: null };
    }
  },

  async getUsulanKontrakNotifikasiSummary([token]) {
    requireRole(token, ['admin','super_admin']);
    const db = getDb();
    const { data } = await db.from('usulan_kontrak').select('unit').eq('status','Diajukan');
    const perUnit = {};
    (data || []).forEach(u => {
      const unit = String(u.unit || '(Tanpa Unit)').trim() || '(Tanpa Unit)';
      perUnit[unit] = (perUnit[unit] || 0) + 1;
    });
    const daftarUnit = Object.keys(perUnit).sort().map(unit => ({ unit, jumlah: perUnit[unit] }));
    return { success: true, totalUsulanBaru: (data || []).length, daftarUnit };
  },

  async getUsulanKontrakListByUnit([token, unit]) {
    requireRole(token, ['admin','super_admin']);
    const db = getDb();
    const { data, error } = await db.from('usulan_kontrak').select('*').eq('status','Diajukan').eq('unit', unit);
    if (error) throw error;
    const LAMP_KEYS = ['ktp','kk','pas_foto','ijazah_transkrip','surat_pengantar','surat_lamaran','sim_ab','str_aktif','keterangan_sehat'];
    const daftar = (data || []).map(u => ({
      id: u.id, nip: u.nip, nama: u.nama, unit: u.unit, email: u.email,
      tahun: u.tahun, jenis_usulan: u.jenis_usulan, evaluasi_kinerja: u.evaluasi_kinerja,
      layanan: u.layanan, sub_menu: u.sub_menu,
      nama_pengaju: u.nama_pengaju, tanggal_diajukan: formatTanggalIndonesia(u.tanggal_diajukan),
      form_data: u.form_data || {},
      lampiran: LAMP_KEYS.map(k => ({
        key: k, label: k.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase()),
        url: u[k+'_url'] || '', approved: !!u[k+'_approved']
      })).filter(l => l.url),
      semua_lampiran_disetujui: LAMP_KEYS.filter(k => u[k+'_url']).every(k => u[k+'_approved'])
    })).sort((a,b) => String(a.nama).localeCompare(String(b.nama)));
    return { success: true, daftar };
  },

  async approveUsulanKontrakAttachment([token, usulanId, lampKey, disetujui]) {
    const decoded = requireRole(token, ['admin','super_admin']);
    const VALID_KEYS = ['ktp','kk','pas_foto','ijazah_transkrip','surat_pengantar','surat_lamaran','sim_ab','str_aktif','keterangan_sehat'];
    if (!VALID_KEYS.includes(lampKey)) return { success: false, message: 'Kunci lampiran tidak valid.' };
    const db = getDb();
    const updateCol = {};
    updateCol[lampKey + '_approved'] = !!disetujui;
    const { error } = await db.from('usulan_kontrak').update(updateCol).eq('id', usulanId);
    if (error) throw error;
    // Check if all available lamps are now approved -> update status
    const { data: row } = await db.from('usulan_kontrak').select('*').eq('id', usulanId).maybeSingle();
    if (row) {
      const presentKeys = VALID_KEYS.filter(k => row[k+'_url']);
      const allApproved = presentKeys.every(k => row[k+'_approved']);
      if (allApproved && row.status === 'Diajukan') {
        await db.from('usulan_kontrak').update({ status: 'Disetujui', diproses_oleh_nip: decoded.nip }).eq('id', usulanId);
      } else if (!allApproved && row.status === 'Disetujui') {
        await db.from('usulan_kontrak').update({ status: 'Diajukan' }).eq('id', usulanId);
      }
    }
    return { success: true, message: disetujui ? 'Lampiran disetujui.' : 'Persetujuan lampiran dibatalkan.' };
  },

  async tandaiPerjanjianKontrakDibuat([token, usulanId]) {
    const decoded = requireRole(token, ['admin','super_admin']);
    const db = getDb();
    const { error } = await db.from('usulan_kontrak').update({ perjanjian_dibuat: true, diproses_oleh_nip: decoded.nip }).eq('id', usulanId);
    if (error) throw error;
    return { success: true };
  },

  async getUsulanKontrakById([token, usulanId]) {
    verifyToken(token);
    const db = getDb();
    const { data, error } = await db.from('usulan_kontrak').select('*').eq('id', usulanId).maybeSingle();
    if (error) throw error;
    if (!data) return { success: false, message: 'Usulan tidak ditemukan.' };
    return { success: true, usulan: data };
  },

  async generateKontrakFromUsulanVercel([token, templateRef, usulanId]) {
    const decoded = requireRole(token, ['admin', 'super_admin', 'normal', 'user']);
    const role = decoded.role || 'normal';
    const db = getDb();

    // Ambil data usulan
    const { data: usulan, error: fetchErr } = await db.from('usulan_kontrak').select('*').eq('id', usulanId).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!usulan) return { success: false, message: 'Usulan tidak ditemukan.' };

    // Pastikan semua lampiran sudah disetujui (hanya wajib untuk admin+)
    if (['admin', 'super_admin'].includes(role)) {
      const LAMP_KEYS = ['ktp','kk','pas_foto','ijazah_transkrip','surat_pengantar','surat_lamaran','sim_ab','str_aktif','keterangan_sehat'];
      const presentKeys = LAMP_KEYS.filter(k => usulan[k+'_url']);
      const allApproved = presentKeys.every(k => usulan[k+'_approved']);
      if (!allApproved) return { success: false, message: 'Belum semua lampiran disetujui. Periksa kembali status lampiran.' };
    }

    // Cek apakah templateRef adalah UUID template dari tabel templates atau GDocs file ID
    const { data: tmplRow } = await db.from('templates').select('*').eq('id', templateRef).maybeSingle();

    const isDocxTemplate = tmplRow && tmplRow.tipe === 'docx';

    if (isDocxTemplate) {
      // === JALUR DOCX ===
      const fetchResp = await fetch(tmplRow.file_id);
      if (!fetchResp.ok) return { success: false, message: 'Gagal mengunduh file template DOCX dari storage.' };
      const arrayBuf = await fetchResp.arrayBuffer();
      const templateBuffer = Buffer.from(arrayBuf);

      // Susun dataContext dari data usulan
      const dataCtx = Object.assign({}, usulan.form_data || {}, {
        nip: usulan.nip,
        nama: usulan.nama,
        tahun: usulan.tahun,
        jenis_usulan: usulan.jenis_usulan,
        evaluasi_kinerja: usulan.evaluasi_kinerja,
        layanan: usulan.layanan,
        sub_menu: usulan.sub_menu,
        today: new Date()
      });

      const renderedBuffer = docxRenderTemplate(templateBuffer, dataCtx);

      // Aturan Kontrak: role normal/user → PDF via GAS converter
      const mustPdf = ['normal', 'user'].includes(role);
      if (mustPdf) {
        const gasUrl = process.env.GOOGLE_SCRIPT_URL;
        if (!gasUrl) return { success: false, message: 'GOOGLE_SCRIPT_URL belum dikonfigurasi (diperlukan untuk konversi PDF).' };

        const { v4: uuidv4x } = require('uuid');
        const shortId = uuidv4x();
        const remoteSession = { id: shortId, data: { nip: decoded.nip, nama_lengkap: decoded.nama, nama: decoded.nama, role } };

        const response = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'convertDocxToPdf',
            params: [shortId, renderedBuffer.toString('base64'), `Kontrak_${usulan.nama}_${usulan.tahun}.docx`],
            remoteSession
          })
        });
        const gasResult = await response.json();
        if (!gasResult.success) return gasResult;
        return { success: true, outputType: 'pdf', pdfUrl: gasResult.pdfUrl, fileName: gasResult.fileName };
      }

      // Admin/super_admin: output docx base64
      await db.from('usulan_kontrak').update({ perjanjian_dibuat: true, diproses_oleh_nip: decoded.nip, status: 'Selesai' }).eq('id', usulanId);
      return {
        success: true,
        outputType: 'docx',
        base64: renderedBuffer.toString('base64'),
        fileName: `Kontrak_${usulan.nama}_${usulan.tahun}.docx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        message: 'Kontrak berhasil digenerate.'
      };
    }

    // === JALUR GDOCS (existing flow) ===
    const gasUrl = process.env.GOOGLE_SCRIPT_URL;
    if (!gasUrl) return { success: false, message: 'GOOGLE_SCRIPT_URL belum dikonfigurasi.' };

    const { v4: uuidv4 } = require('uuid');
    const shortId = uuidv4();
    const remoteSession = {
      id: shortId,
      data: { nip: decoded.nip || '', nama_lengkap: decoded.nama || '', nama: decoded.nama || '', role: decoded.role || 'admin' }
    };

    try {
      const response = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'generateKontrakFromUsulan',
          params: [shortId, tmplRow?.file_id || templateRef, {
            nip: usulan.nip,
            nama: usulan.nama,
            tahun: usulan.tahun,
            jenis_usulan: usulan.jenis_usulan,
            evaluasi_kinerja: usulan.evaluasi_kinerja,
            layanan: usulan.layanan,
            sub_menu: usulan.sub_menu,
            form_data: usulan.form_data || {}
          }],
          remoteSession
        })
      });
      const gasResult = await response.json();
      if (!gasResult.success) return gasResult;

      // Untuk role normal/user: GDocs template selalu menghasilkan PDF (GAS sudah handle)
      // Untuk admin/super_admin: GDocs/PDF sesuai output GAS
      await db.from('usulan_kontrak').update({ perjanjian_dibuat: true, diproses_oleh_nip: decoded.nip, status: 'Selesai' }).eq('id', usulanId);
      return { success: true, fileId: gasResult.fileId, viewUrl: gasResult.viewUrl, fileName: gasResult.fileName, message: gasResult.message, outputType: 'gdocs' };
    } catch (err) {
      return { success: false, message: 'Gagal generate kontrak: ' + err.message };
    }
  },

  async previewDocumentVercel([token, payload]) {
    const decoded = verifyToken(token);
    const db = getDb();
    
    const { templateId, isKontrak, entries, subLayanan, layanan, formData } = payload || {};
    
    const { data: tmpl, error: tmplErr } = await db.from('templates').select('*').eq('id', templateId).maybeSingle();
    if (tmplErr) throw tmplErr;
    if (!tmpl) return { success: false, message: 'Template tidak ditemukan.' };
    
    let firstEntry = entries && entries[0] ? entries[0] : { formData, targetNip: payload.targetNip };
    let nip = firstEntry.targetNip || decoded.nip;
    let employee = {};
    try {
      employee = await methods.getEmployeeFullData([token, nip]);
    } catch(e) {
      // ignore
    }
    
    let dataCtx = {};
    if (layanan === 'Kenaikan Pangkat') {
      const derived = rpcBuildDerivedFields(employee, firstEntry.formData, subLayanan);
      const alias = {};
      if (firstEntry.formData.jumlah_angka_kredit_diperoleh !== undefined) {
        alias.jumlah_angka_kredit_yang_diperoleh_saat_integrasi = firstEntry.formData.jumlah_angka_kredit_diperoleh;
      }
      if (firstEntry.formData.ada_ijazah_baru_2023 !== undefined) {
        alias.ada_ijazah_baru_setelah_2023 = firstEntry.formData.ada_ijazah_baru_2023;
      }
      const map = {
        tgl_lhr: 'tanggal_lahir',
        tmp_lhr: 'tempat_lahir',
        jns_kel: 'jenis_kelamin',
        tmt_gol: 'tmt_golongan',
        tmt_jab: 'tmt_jabatan',
        unit_es_ii: 'unit_kerja',
        karpeg: 'kartu_pegawai'
      };
      for (const [key, val] of Object.entries(map)) {
        if (employee && employee[key] !== undefined && alias[val] === undefined) alias[val] = employee[key];
        if (employee && employee[val] !== undefined && alias[key] === undefined) alias[key] = employee[val];
        if (firstEntry.formData && firstEntry.formData[key] !== undefined && alias[val] === undefined) alias[val] = firstEntry.formData[key];
        if (firstEntry.formData && firstEntry.formData[val] !== undefined && alias[key] === undefined) alias[key] = firstEntry.formData[val];
      }
      dataCtx = Object.assign({}, employee, firstEntry.formData, alias, derived);
    } else if (layanan === 'Pensiun') {
      if (subLayanan === 'DPCP') {
        dataCtx = rpcBuildDpcpContext(firstEntry.formData);
      } else {
        dataCtx = rpcBuildSuperContext(firstEntry.formData);
      }
    } else {
      dataCtx = Object.assign({}, firstEntry.formData, {
        nip: firstEntry.formData.nip,
        nama: firstEntry.formData.nama,
        tahun: firstEntry.formData.tahun,
        jenis_usulan: firstEntry.formData.jenis_usulan,
        evaluasi_kinerja: firstEntry.formData.evaluasi_kinerja,
        layanan: firstEntry.formData.layanan,
        sub_menu: firstEntry.formData.sub_menu,
        today: new Date()
      });
    }
    
    let templateBuffer;
    try {
      templateBuffer = await downloadTemplateBuffer(tmpl.file_id);
    } catch (err) {
      return { success: false, message: 'Gagal mengunduh file template dari storage: ' + err.message };
    }
    
    const renderedBuffer = docxRenderTemplate(templateBuffer, dataCtx);
    
    return {
      success: true,
      outputType: 'docx',
      base64: renderedBuffer.toString('base64'),
      fileName: `${tmpl.judul}.docx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
  },

  async generateDocumentVercel([token, payload]) {
    const decoded = verifyToken(token);
    const db = getDb();
    
    const { templateId, isKontrak, entries, subLayanan, layanan, formData } = payload || {};
    
    const { data: tmpl, error: tmplErr } = await db.from('templates').select('*').eq('id', templateId).maybeSingle();
    if (tmplErr) throw tmplErr;
    if (!tmpl) return { success: false, message: 'Template tidak ditemukan.' };
    
    let firstEntry = entries && entries[0] ? entries[0] : { formData, targetNip: payload.targetNip };
    let nip = firstEntry.targetNip || decoded.nip;
    let employee = {};
    try {
      employee = await methods.getEmployeeFullData([token, nip]);
    } catch(e) {
      // ignore
    }
    
    let dataCtx = {};
    if (layanan === 'Kenaikan Pangkat') {
      const derived = rpcBuildDerivedFields(employee, firstEntry.formData, subLayanan);
      const alias = {};
      if (firstEntry.formData.jumlah_angka_kredit_diperoleh !== undefined) {
        alias.jumlah_angka_kredit_yang_diperoleh_saat_integrasi = firstEntry.formData.jumlah_angka_kredit_diperoleh;
      }
      if (firstEntry.formData.ada_ijazah_baru_2023 !== undefined) {
        alias.ada_ijazah_baru_setelah_2023 = firstEntry.formData.ada_ijazah_baru_2023;
      }
      const map = {
        tgl_lhr: 'tanggal_lahir',
        tmp_lhr: 'tempat_lahir',
        jns_kel: 'jenis_kelamin',
        tmt_gol: 'tmt_golongan',
        tmt_jab: 'tmt_jabatan',
        unit_es_ii: 'unit_kerja',
        karpeg: 'kartu_pegawai'
      };
      for (const [key, val] of Object.entries(map)) {
        if (employee && employee[key] !== undefined && alias[val] === undefined) alias[val] = employee[key];
        if (employee && employee[val] !== undefined && alias[key] === undefined) alias[key] = employee[val];
        if (firstEntry.formData && firstEntry.formData[key] !== undefined && alias[val] === undefined) alias[val] = firstEntry.formData[key];
        if (firstEntry.formData && firstEntry.formData[val] !== undefined && alias[key] === undefined) alias[key] = firstEntry.formData[val];
      }
      dataCtx = Object.assign({}, employee, firstEntry.formData, alias, derived);
    } else if (layanan === 'Pensiun') {
      if (subLayanan === 'DPCP') {
        dataCtx = rpcBuildDpcpContext(firstEntry.formData);
      } else {
        dataCtx = rpcBuildSuperContext(firstEntry.formData);
      }
    } else {
      dataCtx = Object.assign({}, firstEntry.formData, {
        nip: firstEntry.formData.nip,
        nama: firstEntry.formData.nama,
        tahun: firstEntry.formData.tahun,
        jenis_usulan: firstEntry.formData.jenis_usulan,
        evaluasi_kinerja: firstEntry.formData.evaluasi_kinerja,
        layanan: firstEntry.formData.layanan,
        sub_menu: firstEntry.formData.sub_menu,
        today: new Date()
      });
    }
    
    let templateBuffer;
    try {
      templateBuffer = await downloadTemplateBuffer(tmpl.file_id);
    } catch (err) {
      return { success: false, message: 'Gagal mengunduh file template dari storage: ' + err.message };
    }
    
    const renderedBuffer = docxRenderTemplate(templateBuffer, dataCtx);
    
    const isRoleNormalOrUser = ['normal', 'user'].includes(decoded.role || 'normal');
    const mustPdf = isKontrak && isRoleNormalOrUser;
    
    if (mustPdf) {
      const gasUrl = process.env.GOOGLE_SCRIPT_URL;
      if (!gasUrl) return { success: false, message: 'GOOGLE_SCRIPT_URL belum dikonfigurasi (diperlukan untuk konversi PDF).' };
      
      const { v4: uuidv4x } = require('uuid');
      const shortId = uuidv4x();
      const remoteSession = { id: shortId, data: { nip: decoded.nip, role: decoded.role } };
      
      const response = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'convertDocxToPdf',
          params: [shortId, renderedBuffer.toString('base64'), `${tmpl.judul}.docx`],
          remoteSession
        })
      });
      const gasResult = await response.json();
      if (!gasResult.success) return gasResult;
      return { success: true, outputType: 'pdf', pdfUrl: gasResult.pdfUrl, fileName: gasResult.fileName };
    }
    
    if (layanan === 'Kenaikan Pangkat') {
      await methods.tandaiOpsiKpSelesai([token, nip, subLayanan]);
    } else if (layanan === 'Pensiun') {
      await methods.tandaiDokumenPensiunSelesai([token, nip, String(subLayanan).toLowerCase()]);
    }
    
    const base64Out = renderedBuffer.toString('base64');
    return {
      success: true,
      outputType: 'docx',
      base64: base64Out,
      fileName: `${tmpl.judul}.docx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
  },

  // ---- USULAN PMK (PENINJAUAN MASA KERJA) ----

  async ajukanUsulanPmk([token, payload]) {
    const decoded = requireRole(token, ['user', 'admin', 'super_admin']);
    const {
      nip,
      nomor_surat_usul_pmk,
      file_surat_usul_pmk_b64,
      file_surat_usul_pmk_name,
      file_kp_terakhir_b64,
      file_kp_terakhir_name,
      file_sk_kerja_b64,
      file_sk_kerja_name,
      file_sk_pns_b64,
      file_sk_pns_name,
      file_phk_b64,
      file_phk_name,
      file_gaji_b64,
      file_gaji_name,
      file_kontrak_b64,
      file_kontrak_name,
      file_melamar_cpns_b64,
      file_melamar_cpns_name
    } = payload || {};

    if (!nip) return { success: false, message: 'NIP pegawai yang diusulkan wajib diisi.' };
    if (!nomor_surat_usul_pmk) return { success: false, message: 'Nomor surat usul PMK wajib diisi.' };

    const emp = await findEmployeeByNip(nip);
    if (!emp) return { success: false, message: 'Data pegawai tidak ditemukan.' };

    const db = getDb();

    if (decoded.role === 'user') {
      const callerUnit = await getCallerUnit(decoded, db);
      if (callerUnit && emp.unit_es_ii && emp.unit_es_ii !== callerUnit) {
        return { success: false, message: `Anda hanya dapat mengajukan usulan PMK untuk pegawai di unit kerja Anda (${callerUnit}).` };
      }
    }

    // Upload files to storage (bucket: lampiran-usulan, folder: pmk)
    const fileSuratUsulUrl = file_surat_usul_pmk_b64 ? await uploadLampiran(file_surat_usul_pmk_b64, file_surat_usul_pmk_name || 'surat_usul_pmk.pdf', 'pmk') : '';
    const fileKpUrl        = file_kp_terakhir_b64 ? await uploadLampiran(file_kp_terakhir_b64, file_kp_terakhir_name || 'kp_terakhir.pdf', 'pmk') : '';
    const fileSkKerjaUrl   = file_sk_kerja_b64 ? await uploadLampiran(file_sk_kerja_b64, file_sk_kerja_name || 'sk_kerja.pdf', 'pmk') : '';
    const fileSkPnsUrl     = file_sk_pns_b64 ? await uploadLampiran(file_sk_pns_b64, file_sk_pns_name || 'sk_pns.pdf', 'pmk') : '';
    const filePhkUrl       = file_phk_b64 ? await uploadLampiran(file_phk_b64, file_phk_name || 'phk.pdf', 'pmk') : '';
    const fileGajiUrl      = file_gaji_b64 ? await uploadLampiran(file_gaji_b64, file_gaji_name || 'gaji.pdf', 'pmk') : '';
    const fileKontrakUrl   = file_kontrak_b64 ? await uploadLampiran(file_kontrak_b64, file_kontrak_name || 'kontrak.pdf', 'pmk') : '';
    const fileMelamarUrl   = file_melamar_cpns_b64 ? await uploadLampiran(file_melamar_cpns_b64, file_melamar_cpns_name || 'ijazah_cpns.pdf', 'pmk') : '';

    const insertData = {
      nip: emp.nip,
      nama: emp.nama_lengkap || emp.nama,
      unit: emp.unit_es_ii || '',
      nomor_surat_usul_pmk: nomor_surat_usul_pmk,
      file_surat_usul_pmk_url: fileSuratUsulUrl,
      file_kp_terakhir_url: fileKpUrl,
      file_sk_kerja_url: fileSkKerjaUrl,
      file_sk_pns_url: fileSkPnsUrl,
      file_phk_url: filePhkUrl,
      file_gaji_url: fileGajiUrl,
      file_kontrak_url: fileKontrakUrl,
      file_melamar_cpns_url: fileMelamarUrl,
      diajukan_oleh_nip: decoded.nip,
      nama_pengaju: decoded.nama || decoded.nip,
      status: 'Diajukan'
    };

    const { data, error } = await db.from('usulan_pmk').insert(insertData).select().single();
    if (error) throw error;

    return { success: true, message: 'Usulan PMK berhasil diajukan.', id: data.id };
  },

  async getUsulanPmkList([token, filterStatus]) {
    const decoded = requireRole(token, ['user', 'admin', 'super_admin']);
    const db = getDb();
    let query = db.from('usulan_pmk').select('*').order('tanggal_diajukan', { ascending: false });

    if (decoded.role === 'user') {
      const callerUnit = await getCallerUnit(decoded, db);
      if (callerUnit) {
        query = query.eq('unit', callerUnit);
      }
    }

    if (filterStatus && filterStatus !== 'ALL') {
      query = query.eq('status', filterStatus);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { success: true, daftar: data || [] };
  },

  async getUsulanPmkById([token, id]) {
    requireRole(token, ['user', 'admin', 'super_admin']);
    const db = getDb();
    const { data, error } = await db.from('usulan_pmk').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return { success: false, message: 'Usulan PMK tidak ditemukan.' };
    return { success: true, usulan: data };
  },

  async approveUsulanPmkAttachment([token, id, docKey, disetujui]) {
    const decoded = requireRole(token, ['user', 'admin', 'super_admin']);
    const db = getDb();

    const validDocKeys = {
      surat_usul: 'file_surat_usul_pmk_approved',
      kp_terakhir: 'file_kp_terakhir_approved',
      sk_kerja: 'file_sk_kerja_approved',
      sk_pns: 'file_sk_pns_approved',
      phk: 'file_phk_approved',
      gaji: 'file_gaji_approved',
      kontrak: 'file_kontrak_approved',
      melamar_cpns: 'file_melamar_cpns_approved'
    };

    const colName = validDocKeys[docKey];
    if (!colName) return { success: false, message: 'Kunci dokumen tidak valid.' };

    const updateObj = {
      [colName]: !!disetujui,
      diproses_oleh_nip: decoded.nip,
      tanggal_diproses: new Date().toISOString()
    };

    const { data: updatedDoc, error: updateErr } = await db
      .from('usulan_pmk')
      .update(updateObj)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    const allApproved = !!(
      updatedDoc.file_surat_usul_pmk_approved &&
      updatedDoc.file_kp_terakhir_approved &&
      updatedDoc.file_sk_kerja_approved &&
      updatedDoc.file_sk_pns_approved &&
      updatedDoc.file_phk_approved &&
      updatedDoc.file_gaji_approved &&
      updatedDoc.file_kontrak_approved &&
      updatedDoc.file_melamar_cpns_approved
    );

    let newStatus = updatedDoc.status;
    if (allApproved && updatedDoc.status !== 'siap diajukan di SIASN') {
      newStatus = 'siap diajukan di SIASN';
      await db.from('usulan_pmk').update({ status: newStatus }).eq('id', id);
    } else if (!allApproved && updatedDoc.status === 'siap diajukan di SIASN') {
      newStatus = 'Diajukan';
      await db.from('usulan_pmk').update({ status: newStatus }).eq('id', id);
    }

    return {
      success: true,
      message: disetujui ? 'Dokumen berhasil diverifikasi.' : 'Batal verifikasi dokumen.',
      allApproved,
      status: newStatus
    };
  }
};

// ================================================================
// CONSTANTS & HELPERS FOR DOCGEN ENGINE (PORTED FROM SCRIPT SIDE)
// ================================================================
const DOCGEN_KOEFISIEN_JABATAN = {
  'Pengajar': 12.5, 'Asisten Ahli': 12.5, 'Lektor': 25, 'Lektor Kepala': 37.5, 'Guru Besar': 50
};
const DOCGEN_AK_DASAR_SEHARUSNYA = {
  'III/b': 150, 'III/c': 200, 'III/d': 200,
  'IV/a': 400, 'IV/b': 400, 'IV/c': 400, 'IV/d': 850, 'IV/e': 850,
  'Set. III/b': 150, 'Set. III/c': 200, 'Set. III/d': 200,
  'Set. IV/a': 400, 'Set. IV/b': 400, 'Set. IV/c': 400, 'Set. IV/d': 850, 'Set. IV/e': 850
};
const DOCGEN_NILAI_LAMA_GOLONGAN = {
  'III/a': 0, 'III/b': 0, 'III/c': 0, 'III/d': 100,
  'IV/a': 0, 'IV/b': 150, 'IV/c': 300, 'IV/d': 0, 'IV/e': 200,
  'Set. III/a': 0, 'Set. III/b': 0, 'Set. III/c': 0, 'Set. III/d': 100,
  'Set. IV/a': 0, 'Set. IV/b': 150, 'Set. IV/c': 300, 'Set. IV/d': 0, 'Set. IV/e': 200
};
const DOCGEN_KEBUTUHAN_AK_GOLONGAN = {
  'III/a': 50, 'III/b': 50, 'III/c': 100, 'III/d': 100,
  'IV/a': 150, 'IV/b': 150, 'IV/c': 150, 'IV/d': 200, 'IV/e': 0,
  'Set. III/a': 50, 'Set. III/b': 50, 'Set. III/c': 100, 'Set. III/d': 100,
  'Set. IV/a': 150, 'Set. IV/b': 150, 'Set. IV/c': 150, 'Set. IV/d': 200, 'Set. IV/e': 0
};
const DOCGEN_KEBUTUHAN_NAIK_JABATAN = {
  'Pengajar': 12.5, 'Asisten Ahli': 50, 'Lektor': 200, 'Lektor Kepala': 450, 'Guru Besar': ''
};
const DOCGEN_JABATAN_TUJUAN = {
  'Pengajar': 'ASISTEN AHLI', 'Asisten Ahli': 'LEKTOR',
  'Lektor': 'LEKTOR KEPALA', 'Lektor Kepala': 'GURU BESAR'
};
const DOCGEN_PANGKAT_TUJUAN = {
  'III/a': 'PENATA MUDA TK. I / III/B', 'III/b': 'PENATA / III/C',
  'III/c': 'PENATA TK. I / III/D', 'III/d': 'PEMBINA / IV/A',
  'IV/a': 'PEMBINA TK. I / IV/B', 'IV/b': 'PEMBINA UTAMA MUDA / IV/C',
  'IV/c': 'PEMBINA UTAMA MADYA / IV/D', 'IV/d': 'PEMBINA UTAMA / IV/E', 'IV/e': '',
  'Set. III/a': 'SETARA PENATA MUDA TK. I / III/B', 'Set. III/b': 'SETARA PENATA / III/C',
  'Set. III/c': 'SETARA PENATA TK. I / III/D', 'Set. III/d': 'SETARA PEMBINA / IV/A',
  'Set. IV/a': 'SETARA PEMBINA TK. I / IV/B', 'Set. IV/b': 'SETARA PENATA UTAMA MUDA / IV/C',
  'Set. IV/c': 'SETARA PEMBINA UTAMA MADYA / IV/D', 'Set. IV/d': 'SETARA PEMBINA UTAMA / IV/E',
  'Set. IV/e': ''
};

function rpcBuildDerivedFields(employee, formData, subLayanan) {
  formData = formData || {};
  const jabatan = formData.jabatan || employee.jabatan;
  const golongan = formData.golongan || employee.golongan;

  if (subLayanan === 'AK Konversi Tahunan') {
    const bulanAwal = docxBulanKeAngka(formData.bulan_awal_penilaian);
    const bulanAkhir = docxBulanKeAngka(formData.bulan_selesai_penilaian);
    const koefisien = DOCGEN_KOEFISIEN_JABATAN[jabatan] || 0;
    const pred = formData.predikat_skp === 'Baik' ? 1 : 1.5;
    const jumlahBulan = (Number(bulanAkhir) - Number(bulanAwal) + 1) / 12;
    const ak = jumlahBulan * koefisien * pred;
    return {
      ak_konversi_tahunan: Math.round(ak * 100) / 100
    };
  }

  if (subLayanan === 'AK Konversi Kumulatif') {
    const daftarPenilaianTahunan = (formData.data_massal || []).map(row => ({
      predikat: row.predikat_skp,
      jabatan: jabatan,
      bulanAwal: docxBulanKeAngka(row.bulan_awal_penilaian),
      bulanAkhir: docxBulanKeAngka(row.bulan_selesai_penilaian)
    }));

    const penilaianUntukTemplate = (formData.data_massal || []).map(row => {
      const bulanAwal = docxBulanKeAngka(row.bulan_awal_penilaian);
      const bulanAkhir = docxBulanKeAngka(row.bulan_selesai_penilaian);
      const koefisien = DOCGEN_KOEFISIEN_JABATAN[jabatan] || 0;
      const pred = row.predikat_skp === 'Baik' ? 1 : 1.5;
      const jumlahBulan = (Number(bulanAkhir) - Number(bulanAwal) + 1) / 12;
      const ak = jumlahBulan * koefisien * pred;
      const roundedAk = Math.round(ak * 100) / 100;
      return {
        tahun_penilaian: row.tahun_penilaian,
        bulan_awal_penilaian: row.bulan_awal_penilaian,
        bulan_selesai_penilaian: row.bulan_selesai_penilaian,
        predikat_skp: row.predikat_skp,
        ak_konversi_tahun: roundedAk,
        ak_konversi_didapat: roundedAk
      };
    });

    const jumlahAkSaatIntegrasi = Number(formData.jumlah_angka_kredit_diperoleh) || 0;
    const angkaDasarSaatIntegrasi = Number(formData.angka_dasar_saat_integrasi) || 0;

    const akIntegrasiDidapat = jumlahAkSaatIntegrasi - angkaDasarSaatIntegrasi;
    
    let totalKonversi = 0;
    (daftarPenilaianTahunan || []).forEach(r => {
      const koef = DOCGEN_KOEFISIEN_JABATAN[r.jabatan] || 0;
      const pred = r.predikat === 'Baik' ? 1 : 1.5;
      const jumlahBulan = (Number(r.bulanAkhir) - Number(r.bulanAwal) + 1) / 12;
      totalKonversi += (jumlahBulan * koef * pred);
    });
    const totalAkKonversiIntegrasi = akIntegrasiDidapat + totalKonversi;

    const akDasarSeharusnya = DOCGEN_AK_DASAR_SEHARUSNYA[golongan] || 0;
    const nilaiLama = DOCGEN_NILAI_LAMA_GOLONGAN[golongan] || 0;
    const nilaiLamaDiakui = akDasarSeharusnya > angkaDasarSaatIntegrasi
      ? (akDasarSeharusnya - angkaDasarSaatIntegrasi) + nilaiLama
      : nilaiLama;

    const totalKonversiBaru = totalAkKonversiIntegrasi - nilaiLamaDiakui;
    
    const hitungIjazah = formData.ada_ijazah_baru_2023 === 'Ada'
      ? (DOCGEN_KEBUTUHAN_AK_GOLONGAN[golongan] || 0) * 0.25
      : 0;

    const totalAkBaru = totalKonversiBaru + hitungIjazah;
    const totalJumlahAk = nilaiLamaDiakui + totalKonversiBaru + hitungIjazah;

    let rekomendasi = 'TIDAK DAPAT DIPERTIMBANGKAN UNTUK KENAIKAN PANGKAT/JENJANG SETINGKAT LEBIH TINGGI';
    const mentok = jabatan === 'Guru Besar' && (golongan === 'IV/e' || golongan === 'Set. IV/e');
    if (!mentok) {
      const cukupPangkat = (totalAkBaru - (DOCGEN_KEBUTUHAN_AK_GOLONGAN[golongan] || 0)) >= 0;
      const kebutuhanJabatan = DOCGEN_KEBUTUHAN_NAIK_JABATAN[jabatan];
      const cukupJabatan = kebutuhanJabatan === '' || kebutuhanJabatan === undefined
        ? false
        : (totalJumlahAk - kebutuhanJabatan) >= 0;

      const jabatanTujuan = DOCGEN_JABATAN_TUJUAN[jabatan] || '';
      const pangkatTujuan = DOCGEN_PANGKAT_TUJUAN[golongan] || '';

      if (cukupPangkat && cukupJabatan) {
        rekomendasi = `DAPAT DIPERTIMBANGKAN UNTUK KENAIKAN PANGKAT/JENJANG JABATAN SETINGKAT LEBIH TINGGI MENJADI ${jabatanTujuan} PANGKAT/GOLONGAN RUANG ${pangkatTujuan}`;
      } else if (cukupPangkat && !cukupJabatan) {
        rekomendasi = `DAPAT DIPERTIMBANGKAN UNTUK KENAIKAN PANGKAT SETINGKAT LEBIH TINGGI MENJADI ${pangkatTujuan}`;
      } else if (!cukupPangkat && cukupJabatan) {
        rekomendasi = `DAPAT DIPERTIMBANGKAN UNTUK KENAIKAN JENJANG JABATAN SETINGKAT LEBIH TINGGI MENJADI ${jabatanTujuan}`;
      }
    }

    const round2 = n => Math.round(n * 100) / 100;
    return {
      penilaian: penilaianUntukTemplate,
      ak_integrasi_didapat: round2(akIntegrasiDidapat),
      total_ak_konversi_integrasi: round2(totalAkKonversiIntegrasi),
      nilai_lama_diakui: round2(nilaiLamaDiakui),
      total_konversi_baru: round2(totalKonversiBaru),
      hitung_ijazah: hitungIjazah === 0 ? '' : round2(hitungIjazah),
      total_ak_baru: round2(totalAkBaru),
      total_jumlah_ak: round2(totalJumlahAk),
      rekomendasi: rekomendasi
    };
  }
  return {};
}

function pensiunGen_upper(str) {
  return str ? String(str).toUpperCase().trim() : '';
}
function pensiunGen_tanggalUpper(value) {
  return formatTanggalIndonesia(value).toUpperCase();
}
function pensiunGen_tanggalBiasa(value) {
  return formatTanggalIndonesia(value);
}
function pensiunGen_dash(val) {
  const s = (val !== null && val !== undefined) ? String(val).trim() : '';
  return s === '' ? '-' : s;
}
function pensiunGen_upperOrDash(val) {
  const s = pensiunGen_upper(val);
  return s === '' ? '-' : s;
}
function pensiunGen_tanggalOrDash(val) {
  if (!val || String(val).trim() === '') return '-';
  return pensiunGen_tanggalUpper(val) || '-';
}

function pensiunGen_buildFamilyRows(rawArray, fieldNames, dateFields, upperFields) {
  const filtered = (rawArray || []).filter(item => {
    if (!item) return false;
    return fieldNames.some(f => item[f] !== null && item[f] !== undefined && String(item[f]).trim() !== '');
  });

  if (filtered.length === 0) {
    const dashRow = { no: '-' };
    fieldNames.forEach(f => { dashRow[f] = '-'; });
    return [dashRow];
  }

  return filtered.map((item, idx) => {
    const row = { no: String(idx + 1) };
    fieldNames.forEach(f => {
      const val = item[f];
      if (dateFields.indexOf(f) !== -1) row[f] = pensiunGen_tanggalOrDash(val);
      else if (upperFields.indexOf(f) !== -1) row[f] = pensiunGen_upperOrDash(val);
      else row[f] = pensiunGen_dash(val);
    });
    return row;
  });
}

const PENSIUN_PASANGAN_FIELDS = ['nik', 'nama_pasangan', 'tgl_lahir_pasangan', 'tgl_kawin', 'tgl_cerai', 'keterangan_pasangan'];
const PENSIUN_ANAK_FIELDS = ['nik', 'nama_anak', 'tg_lahir_anak', 'nama_ortu', 'keterangan_anak'];
const PENSIUN_PASANGAN_DATE_FIELDS = ['tgl_lahir_pasangan', 'tgl_kawin', 'tgl_cerai'];
const PENSIUN_ANAK_DATE_FIELDS = ['tg_lahir_anak'];
const PENSIUN_PASANGAN_UPPER_FIELDS = ['nama_pasangan'];
const PENSIUN_ANAK_UPPER_FIELDS = ['nama_anak', 'nama_ortu'];

function pensiunGen_hitungJenisPensiunFields(formData) {
  let jp1 = '', jp2 = '', jp3 = '', namaTtd = '', nipTtd = '';

  if (formData.jenis_pensiun === 'BUP') {
    jp1 = 'BUP';
    jp2 = 'MENCAPAI BATAS USIA PENSIUN';
    jp3 = 'PEGAWAI NEGERI SIPIL YANG BERSANGKUTAN';
    namaTtd = pensiunGen_upper(formData.nama_lengkap);
    nipTtd = formData.nip ? 'NIP. ' + formData.nip : '';
  } else if (formData.jenis_pensiun === 'Meninggal') {
    jp1 = 'MENINGGAL';
    jp2 = 'AKAN DIBERHENTIKAN/YANG MENINGGAL DUNIA, TEWAS, ATAU HILANG';
    jp3 = 'SUAMI/ISTRI PNS YANG BERSANGKUTAN';
    const pasangan1 = (formData.pasangan && formData.pasangan[0]) || {};
    namaTtd = pensiunGen_upper(formData.nama_suami_istri_1 || pasangan1.nama_pasangan);
    const nikTtd = formData.nik_suami_istri_1 || pasangan1.nik;
    nipTtd = nikTtd ? 'NIK. ' + nikTtd : '';
  } else if (formData.jenis_pensiun === 'Diberhentikan') {
    jp1 = 'DIBERHENTIKAN';
    jp2 = 'AKAN DIBERHENTIKAN/YANG MENINGGAL DUNIA, TEWAS, ATAU HILANG';
    jp3 = 'PEGAWAI NEGERI SIPIL YANG BERSANGKUTAN';
    namaTtd = pensiunGen_upper(formData.nama_lengkap);
    nipTtd = formData.nip ? 'NIP. ' + formData.nip : '';
  } else if (formData.jenis_pensiun === 'Pengunduran Diri') {
    jp1 = 'PENGUNDURAN DIRI';
    jp2 = 'MENGAJUKAN PERMINTAAN SENDIRI';
    jp3 = 'PEGAWAI NEGERI SIPIL YANG BERSANGKUTAN';
    namaTtd = pensiunGen_upper(formData.nama_lengkap);
    nipTtd = formData.nip ? 'NIP. ' + formData.nip : '';
  } else if (formData.jenis_pensiun === 'Uzur') {
    jp1 = 'UZUR';
    jp2 = 'TIDAK CAKAP JASMANI DAN/ATAU ROHANI';
    jp3 = 'PEGAWAI NEGERI SIPIL YANG BERSANGKUTAN';
    namaTtd = pensiunGen_upper(formData.nama_lengkap);
    nipTtd = formData.nip ? 'NIP. ' + formData.nip : '';
  }

  let akhirTmtKerja;
  if (formData.jenis_pensiun === 'BUP') {
    akhirTmtKerja = pensiunGen_tanggalUpper(formData.tmt_pensiun);
  } else {
    akhirTmtKerja = pensiunGen_tanggalUpper(formData.tgl_peristiwa_asli || formData.bulan_terakhir_bekerja || formData.tmt_pensiun);
  }

  return { jp1, jp2, jp3, namaTtd, nipTtd, akhirTmtKerja };
}

function pensiunGen_formatGajiRupiah(val) {
  if (!val) return '-';
  const numStr = String(val).replace(/[^0-9]/g, '');
  if (!numStr) return String(val).toUpperCase();
  const num = parseInt(numStr, 10);
  return 'RP ' + num.toLocaleString('id-ID') + ',-';
}

function makeAllStringsUpper(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj.toUpperCase();
  if (Array.isArray(obj)) return obj.map(makeAllStringsUpper);
  if (typeof obj === 'object') {
    const res = {};
    for (const key of Object.keys(obj)) {
      res[key] = makeAllStringsUpper(obj[key]);
    }
    return res;
  }
  return obj;
}

function rpcBuildDpcpContext(formData) {
  formData = formData || {};
  const fmtTmtGol = pensiunGen_tanggalUpper(formData.tmt_gol);
  const pangkatGabungan = `${pensiunGen_upper(formData.pangkat)}/${pensiunGen_upper(formData.golongan)}/${fmtTmtGol}`;
  const jenisPensiunFields = pensiunGen_hitungJenisPensiunFields(formData);

  const tglSekarang = pensiunGen_tanggalUpper(new Date());

  const ctx = {
    nip: formData.nip || '',
    nama_lengkap: pensiunGen_upper(formData.nama_lengkap),
    nama: pensiunGen_upper(formData.nama),
    tmp_lhr: pensiunGen_upper(formData.tmp_lhr),
    tgl_lhr: pensiunGen_tanggalUpper(formData.tgl_lhr),
    tmt_pengangkat: pensiunGen_tanggalUpper(formData.tmt_cpns),
    golongan: pensiunGen_upper(formData.golongan),
    pangkat: pangkatGabungan,
    tmt_gol: fmtTmtGol,
    jabatan: pensiunGen_upper(formData.jabatan),
    tmt_jab: pensiunGen_tanggalUpper(formData.tmt_jab),
    tmt_pensiun: pensiunGen_tanggalUpper(formData.tmt_pensiun),
    unit_es_ii: pensiunGen_upper(formData.unit_es_ii),
    unit_kerja: pensiunGen_upper(formData.unit_es_ii),
    gaji_pokok: pensiunGen_formatGajiRupiah(formData.gaji_pokok),
    mk_kp_terakhir: pensiunGen_upper(formData.mk_kp_terakhir) || '0 TAHUN 0 BULAN',
    mk_golongan: pensiunGen_upper(formData.mk_golongan),
    mk_pns: pensiunGen_upper(formData.mk_pns),
    mk_pensiun: pensiunGen_upper(formData.mk_pensiun),
    alamat: pensiunGen_upper(formData.alamat),
    pendidikan_pertama: pensiunGen_upper(formData.pendidikan_pertama),
    cltn: pensiunGen_upper(formData.cltn) || '0 TAHUN 0 BULAN',
    pmk: pensiunGen_upper(formData.pmk) || '0 TAHUN 0 BULAN',
    akhir_tmt_kerja: pensiunGen_upper(jenisPensiunFields.akhirTmtKerja),
    bulan_terakhir_bekerja: pensiunGen_tanggalUpper(formData.bulan_terakhir_bekerja),
    jenis_pensiun1: pensiunGen_upper(jenisPensiunFields.jp1),
    jenis_pensiun2: pensiunGen_upper(jenisPensiunFields.jp2),
    jenis_pensiun3: pensiunGen_upper(jenisPensiunFields.jp3),
    nama_ttd: pensiunGen_upper(jenisPensiunFields.namaTtd),
    nip_ttd: pensiunGen_upper(jenisPensiunFields.nipTtd),
    tgl_buat: tglSekarang,
    today: tglSekarang,

    pasangan: pensiunGen_buildFamilyRows(formData.pasangan, PENSIUN_PASANGAN_FIELDS, PENSIUN_PASANGAN_DATE_FIELDS, PENSIUN_PASANGAN_FIELDS),
    anak: pensiunGen_buildFamilyRows(formData.anak, PENSIUN_ANAK_FIELDS, PENSIUN_ANAK_DATE_FIELDS, PENSIUN_ANAK_FIELDS)
  };

  return makeAllStringsUpper(ctx);
}

function rpcBuildSuperContext(formData) {
  formData = formData || {};
  const fmtTmtGol = pensiunGen_tanggalBiasa(formData.tmt_gol);
  const pangkatGabungan = `${formData.pangkat || ''}/${formData.golongan || ''}/${fmtTmtGol}`;

  return {
    nomor_super_tidak_hukdis_sedangberat: formData.nomor_super_tidak_hukdis_sedangberat || '',
    nama_lengkap: formData.nama_lengkap || '',
    nip: formData.nip || '',
    pangkat: pangkatGabungan,
    jabatan: formData.jabatan || '',
    tanggal_super: pensiunGen_tanggalBiasa(new Date()),
    nomor_super_pidana: formData.nomor_super_pidana || ''
  };
}



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
        // ─── JWT → UUID session injection ────────────────────────────────
        // Google Apps Script's CacheService has a 250-char KEY limit.
        // JWT tokens are ~300 chars, so we must replace params[0] (the JWT)
        // with a short UUID and send the decoded user data as `remoteSession`
        // so that Apps Script can inject it into its CacheService on the fly.
        let proxiedParams = params.slice(); // shallow copy
        
        // Resolve GDocs template UUID to real Google Drive file ID if passed to Apps Script
        if (['previewDocument', 'generateDocument', 'generateKontrakFromUsulan'].includes(method)) {
          const payload = proxiedParams[1];
          if (payload && typeof payload === 'object') {
            const tId = payload.templateFileId || payload.templateId;
            if (tId && typeof tId === 'string' && tId.length > 10) {
              try {
                const db = getDb();
                const { data: tmpl } = await db.from('templates').select('file_id').eq('id', tId).maybeSingle();
                if (tmpl && tmpl.file_id) {
                  payload.templateFileId = tmpl.file_id;
                  if (payload.templateId) payload.templateId = tmpl.file_id;
                }
              } catch (dbErr) {
                console.warn('[rpc proxy] failed to resolve GDocs template UUID:', dbErr.message);
              }
            }
          } else if (typeof proxiedParams[1] === 'string' && proxiedParams[1].length > 10) {
            try {
              const db = getDb();
              const { data: tmpl } = await db.from('templates').select('file_id').eq('id', proxiedParams[1]).maybeSingle();
              if (tmpl && tmpl.file_id) {
                proxiedParams[1] = tmpl.file_id;
              }
            } catch (dbErr) {
              console.warn('[rpc proxy] failed to resolve GDocs template parameter UUID:', dbErr.message);
            }
          }
        }

        let remoteSession = null;

        const firstParam = proxiedParams[0];
        if (firstParam && typeof firstParam === 'string' && firstParam.split('.').length === 3) {
          // Looks like a JWT — try to verify it
          try {
            const decoded = jwt.verify(firstParam, JWT_SECRET);
            const shortId = uuidv4(); // short UUID (~36 chars) safe as CacheService key
            remoteSession = {
              id: shortId,
              data: {
                nip:                decoded.nip               || '',
                nama_lengkap:       decoded.nama              || '',
                nama:               decoded.nama              || '',
                jabatan:            decoded.jabatan           || '',
                status_kepegawaian: decoded.status_kepegawaian|| '',
                role:               decoded.role              || 'normal'
              }
            };
            proxiedParams[0] = shortId; // replace long JWT with short UUID
          } catch (jwtErr) {
            // Not a valid JWT or wrong secret — forward as-is and let Apps Script
            // return its own "sesi tidak valid" error gracefully.
            console.warn(`[rpc proxy] JWT decode failed for method=${method}:`, jwtErr.message);
          }
        }
        // ─────────────────────────────────────────────────────────────────

        const response = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method, params: proxiedParams, remoteSession })
        });
        const result = await response.json();
        
        // Post-processing: Jika generateDocument sukses via GAS, sinkronkan status usulan ke Supabase
        if (result && result.success && method === 'generateDocument') {
          const payload = params[1];
          if (payload && payload.layanan === 'Kenaikan Pangkat' && payload.entries) {
            const token = params[0];
            for (const entry of payload.entries) {
              try {
                await methods.tandaiOpsiKpSelesai([token, entry.targetNip, payload.subLayanan]);
              } catch (dbErr) {
                console.error('[rpc proxy post-process] Gagal memperbarui status di Supabase:', dbErr.message);
              }
            }
          }
        }

        res.status(200).json(result);
        return;
      } catch (proxyErr) {
        console.error(`[rpc proxy] ${method} ERROR:`, proxyErr.message);
        res.status(200).json({ success: false, message: `Gagal menghubungi Google Apps Script: ${proxyErr.message}` });
        return;
      }
    }
    res.status(200).json({ success: false, message: `Method "${method}" tidak ditemukan` });
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
