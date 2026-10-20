/**
 * api/jas-core.js
 * Core logic, guard role, and Google Drive/Sheets integration for Menu JAS (Admin & Superadmin).
 */

const crypto = require('crypto');

/**
 * Validasi role khusus menu JAS.
 * Hanya mengizinkan 'admin' dan 'super_admin' persis (string lowercase).
 * Role lain, case berbeda, null, undefined, kosong -> false.
 */
function isJasRole(role) {
  if (typeof role !== 'string') return false;
  return role === 'admin' || role === 'super_admin';
}

/**
 * Server guard untuk memeriksa autentikasi dan otorisasi menu JAS.
 * @param {string} token JWT dari client
 * @param {Function} verifyTokenFn fungsi verifikasi token dari api/rpc.js (opsional)
 * @returns {object} decoded user object { nip, role, ... }
 */
function verifyJasGuard(token, verifyTokenFn) {
  if (!token) {
    const err = new Error('Sesi tidak ditemukan. Silakan login kembali.');
    err.statusCode = 401;
    throw err;
  }

  let decoded;
  if (typeof verifyTokenFn === 'function') {
    decoded = verifyTokenFn(token);
  } else {
    // Fallback dekripsi/verifikasi JWT standar
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'simpeg-secret-change-me-in-env';
    try {
      decoded = jwt.verify(token, secret);
    } catch (e) {
      const err = new Error('Sesi tidak valid atau telah berakhir. Silakan login kembali.');
      err.statusCode = 401;
      throw err;
    }
  }

  if (!decoded || !isJasRole(decoded.role)) {
    const err = new Error('Akses ditolak: Menu dan layanan JAS hanya dapat diakses oleh Admin atau Superadmin.');
    err.statusCode = 403;
    throw err;
  }

  return decoded;
}

/**
 * Memastikan job hanya dapat diakses oleh pemiliknya (owner_id).
 */
function verifyJobOwnership(job, userNip) {
  if (!job) {
    const err = new Error('Pekerjaan (job) tidak ditemukan.');
    err.statusCode = 404;
    throw err;
  }
  if (String(job.owner_id || '').trim() !== String(userNip || '').trim()) {
    const err = new Error('Akses ditolak: Anda bukan pemilik pekerjaan ini.');
    err.statusCode = 403;
    throw err;
  }
  return true;
}

/**
 * Parse ID folder Google Drive dari link atau string ID murni.
 */
function parseGoogleDriveFolderId(input) {
  if (!input || typeof input !== 'string') return null;
  const s = input.trim();
  // Format /folders/ID
  const m1 = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  // Format id=ID
  const m2 = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  // ID langsung jika format ID Google Drive murni (minimal 25 karakter alfanumerik)
  if (/^[a-zA-Z0-9_-]{25,60}$/.test(s) && !s.includes(' ')) return s;
  return null;
}

/**
 * Parse ID Google Spreadsheet dari link atau string ID murni.
 */
function parseGoogleSpreadsheetId(input) {
  if (!input || typeof input !== 'string') return null;
  const s = input.trim();
  // Format /spreadsheets/d/ID
  const m1 = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  // Format id=ID
  const m2 = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  if (/^[a-zA-Z0-9_-]{25,60}$/.test(s) && !s.includes(' ')) return s;
  return null;
}

/**
 * Parse ID Berkas Google Drive dari link atau string ID murni.
 */
function parseGoogleDriveFileId(input) {
  if (!input || typeof input !== 'string') return null;
  const s = input.trim();
  // Format /file/d/ID
  const m1 = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  // Format id=ID
  const m2 = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  // Format uc?id=ID / open?id=ID
  const m3 = s.match(/\/(?:uc|open)\?.*id=([a-zA-Z0-9_-]+)/);
  if (m3) return m3[1];
  if (/^[a-zA-Z0-9_-]{15,60}$/.test(s)) return s;
  return null;
}

/**
 * Sanitasi nilai sebelum dimasukkan ke dalam nama file:
 * - Buang karakter terlarang: \ / : * ? " < > |
 * - Rapikan multiple spaces menjadi single space
 * - Buang titik (.) dan koma (,) di akhir nilai agar tidak menghasilkan "M.Ak..pdf"
 */
function sanitizeFileNameValue(str) {
  if (str === null || str === undefined) return '';
  let s = String(str);
  // Hapus karakter ilegal pada filesystem/Drive
  s = s.replace(/[\\/:*?"<>|]/g, ' ');
  // Ganti newline/tab dengan spasi
  s = s.replace(/[\r\n\t]+/g, ' ');
  // Rapikan spasi ganda
  s = s.replace(/\s+/g, ' ').trim();
  // Buang titik dan koma di akhir string
  s = s.replace(/[.,\s]+$/, '');
  return s.trim();
}

/**
 * Susun nama file akhir dari format template dan daftar nilai field.
 * Setiap placeholder `{NAMA_FIELD}` harus terdaftar di `allowedFieldNames`.
 * @param {string} templateFormat Contoh: "BA_{NIP}_{NAMA}"
 * @param {object} fieldValues Contoh: { NIP: "198501012010011005", NAMA: "Budi Santoso, M.Ak." }
 * @param {string[]} allowedFieldNames Daftar nama placeholder yang sah
 * @returns {string} Nama file lengkap berekstensi .pdf
 */
function renderTemplateName(templateFormat, fieldValues, allowedFieldNames) {
  if (!templateFormat || typeof templateFormat !== 'string') {
    throw new Error('Format nama berkas wajib diisi.');
  }

  const allowedSet = new Set((allowedFieldNames || []).map(f => String(f).trim().toUpperCase()));

  // Cari semua placeholder {VAR} dalam template
  const matches = templateFormat.match(/\{([a-zA-Z0-9_]+)\}/g) || [];
  if (matches.length === 0) {
    throw new Error('Format nama harus memuat minimal satu placeholder (contoh: {NAMA}).');
  }

  for (const m of matches) {
    const varName = m.slice(1, -1).trim().toUpperCase();
    if (!allowedSet.has(varName)) {
      throw new Error(`Placeholder ${m} tidak terdaftar di daftar field.`);
    }
  }

  let resultName = templateFormat;
  for (const m of matches) {
    const varName = m.slice(1, -1).trim().toUpperCase();
    const rawVal = fieldValues ? fieldValues[varName] : null;
    if (rawVal === null || rawVal === undefined || String(rawVal).trim() === '') {
      throw new Error(`Nilai untuk field ${varName} tidak ditemukan atau kosong.`);
    }
    const cleanVal = sanitizeFileNameValue(rawVal);
    if (!cleanVal) {
      throw new Error(`Nilai untuk field ${varName} tidak valid setelah disanitasi.`);
    }
    resultName = resultName.replace(m, cleanVal);
  }

  // Buang ekstensi ganda jika pengguna menulis .pdf di format
  resultName = resultName.replace(/\.pdf$/i, '').trim();
  // Sanitasi keseluruhan nama
  resultName = sanitizeFileNameValue(resultName);
  return `${resultName}.pdf`;
}

/**
 * Validasi nilai field bertipe NIP:
 * - Non-digit dibuang
 * - Panjang digit harus 9 s.d. 18 digit
 */
function validateNipValue(value) {
  if (value === null || value === undefined) return { valid: false, message: 'Nilai NIP null atau tidak ada.' };
  const digits = String(value).replace(/\D/g, '');
  if (digits.length >= 9 && digits.length <= 18) {
    return { valid: true, value: digits };
  }
  return { valid: false, message: `Panjang digit NIP tidak valid (${digits.length} digit, harus 9–18 digit).` };
}

/**
 * Validasi nilai field bertipe teks:
 * - Tidak kosong / bukan null
 * - Minimal 3 karakter setelah spasi dirapikan
 */
function validateTextValue(value) {
  if (value === null || value === undefined) return { valid: false, message: 'Nilai teks null atau tidak ada.' };
  const str = String(value).trim();
  if (str.length >= 3) {
    return { valid: true, value: str };
  }
  return { valid: false, message: `Nilai teks terlalu pendek (minimal 3 karakter).` };
}

/**
 * Susun prompt Gemini dari daftar field:
 * - Tiap field: nama placeholder, tipe, deskripsi lokasi, contoh (opsional)
 */
function buildGeminiPrompt(fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error('Daftar field tidak boleh kosong.');
  }

  const lines = [
    'Baca dokumen PDF ini. Ambil nilai berikut persis seperti tertulis di dokumen. Jangan menebak, jangan memperbaiki ejaan.'
  ];

  const keys = [];
  fields.forEach(f => {
    const name = String(f.name || '').trim().toUpperCase();
    if (!name) return;
    keys.push(name);
    const desc = String(f.desc || '').trim();
    const contoh = String(f.contoh || '').trim();
    if (contoh) {
      lines.push(`- ${name}: ${desc}. Contoh bentuk: ${contoh}`);
    } else {
      lines.push(`- ${name}: ${desc}`);
    }
  });

  lines.push('Jika suatu nilai tidak ditemukan, isi null.');
  lines.push(`Balas hanya JSON dengan kunci: ${keys.join(', ')}.`);

  return {
    prompt: lines.join('\n'),
    expectedKeys: keys
  };
}

/**
 * Deteksi kolom Nama dan kolom Link Berkas dari header baris dan data sampel spreadsheet.
 * @param {Array<string>} headers Baris header tabel
 * @param {Array<Array<any>>} sampleRows Baris data sampel
 */
function detectColumnsFromRows(headers, sampleRows) {
  if (!Array.isArray(headers)) return { nameColumnIndex: -1, linkColumnIndices: [] };

  let nameColumnIndex = -1;
  const linkColumnIndices = [];

  // 1. Deteksi kolom nama (nama atau nama lengkap, case-insensitive)
  headers.forEach((h, idx) => {
    const cleanH = String(h || '').trim().toLowerCase();
    if (/^nama(\s+lengkap)?$/i.test(cleanH) && nameColumnIndex === -1) {
      nameColumnIndex = idx;
    }
  });

  // 2. Deteksi kolom link (berdasarkan header bertema link/berkas atau sel mengandung URL)
  headers.forEach((h, colIdx) => {
    let hasUrl = false;
    const cleanH = String(h || '').trim().toLowerCase();
    if (/link|url|berkas|dokumen|file|drive/i.test(cleanH)) {
      hasUrl = true;
    }

    if (!hasUrl && Array.isArray(sampleRows)) {
      for (const row of sampleRows) {
        if (!row) continue;
        const cell = String(row[colIdx] || '');
        if (/https?:\/\/[^\s]+/i.test(cell) || cell.includes('=HYPERLINK')) {
          hasUrl = true;
          break;
        }
      }
    }

    if (hasUrl && colIdx !== nameColumnIndex) {
      linkColumnIndices.push(colIdx);
    }
  });

  return {
    nameColumnIndex,
    linkColumnIndices
  };
}

/**
 * Penamaan jika satu sel memiliki beberapa link berkas: _2, _3
 */
function formatDuplicateSuffix(index) {
  if (index <= 1) return '';
  return `_${index}`;
}

/**
 * Penamaan jika terdapat nama baris kembar / duplikat: "Nama (baris N)"
 */
function formatDuplicateRowName(baseName, rowNumber) {
  const clean = sanitizeFileNameValue(baseName);
  return `${clean} (baris ${rowNumber})`;
}

/**
 * Helper Google OAuth Token Management via native fetch
 */
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets';

function getGoogleOAuthUrl(redirectUri, state) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID belum dikonfigurasi di environment variables.');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_DRIVE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state: state
  });

  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

async function exchangeGoogleAuthCode(code, redirectUri) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID atau GOOGLE_CLIENT_SECRET belum dikonfigurasi.');
  }

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    }).toString()
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Gagal menukar kode otorisasi Google: ${data.error_description || data.error || res.statusText}`);
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    expiry_date: Date.now() + (Number(data.expires_in || 3600) * 1000)
  };
}

async function refreshGoogleAccessToken(refreshToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token'
    }).toString()
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    // Sesuai ground truth: Jika token gagal diperbarui, tampilkan pesan persis: "Login Google ulang"
    const err = new Error('Login Google ulang: Sesi otorisasi Google Drive telah kedaluwarsa atau dicabut.');
    err.needReauth = true;
    throw err;
  }

  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
    expiry_date: Date.now() + (Number(data.expires_in || 3600) * 1000)
  };
}

async function getValidGoogleAccessToken(ownerNip, db) {
  if (!ownerNip) throw new Error('NIP pemilik sesi tidak valid.');
  const dbClient = db;
  const { data, error } = await dbClient.from('jas_google_tokens').select('*').eq('owner_id', ownerNip).maybeSingle();

  if (error || !data || !data.tokens) {
    const err = new Error('Login Google ulang: Akun Google Drive belum dihubungkan.');
    err.needReauth = true;
    throw err;
  }

  const tokens = data.tokens;
  const now = Date.now();

  // Jika token masih berlaku (buffer 60 detik)
  if (tokens.access_token && tokens.expiry_date && (tokens.expiry_date - now > 60000)) {
    return tokens.access_token;
  }

  // Jika sudah kedaluwarsa, lakukan refresh token
  if (!tokens.refresh_token) {
    const err = new Error('Login Google ulang: Refresh token Google tidak ditemukan.');
    err.needReauth = true;
    throw err;
  }

  const refreshed = await refreshGoogleAccessToken(tokens.refresh_token);
  const updatedTokens = Object.assign({}, tokens, {
    access_token: refreshed.access_token,
    expiry_date: refreshed.expiry_date
  });

  await dbClient.from('jas_google_tokens').update({
    tokens: updatedTokens,
    updated_at: new Date().toISOString()
  }).eq('owner_id', ownerNip);

  return refreshed.access_token;
}

/**
 * Pindai berkas PDF di dalam folder Google Drive dan subfolder-nya secara rekursif.
 */
async function listPdfFilesInFolderRecursive(folderId, accessToken) {
  const pdfFiles = [];
  const foldersToScan = [folderId];
  const scannedFolders = new Set();

  while (foldersToScan.length > 0) {
    const currentFolderId = foldersToScan.shift();
    if (scannedFolders.has(currentFolderId)) continue;
    scannedFolders.add(currentFolderId);

    let pageToken = null;
    do {
      const q = `'${currentFolderId}' in parents and trashed = false`;
      const params = new URLSearchParams({
        q,
        fields: 'nextPageToken, files(id, name, mimeType, size, webViewLink)',
        pageSize: '100',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true'
      });
      if (pageToken) params.set('pageToken', pageToken);

      const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(`Gagal memindai folder Google Drive: ${data.error ? data.error.message : res.statusText}`);
      }

      if (Array.isArray(data.files)) {
        for (const file of data.files) {
          if (file.mimeType === 'application/vnd.google-apps.folder') {
            foldersToScan.push(file.id);
          } else if (file.mimeType === 'application/pdf' || (file.name && file.name.toLowerCase().endsWith('.pdf'))) {
            pdfFiles.push({
              id: file.id,
              name: file.name,
              size: Number(file.size || 0),
              webViewLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`
            });
          }
        }
      }
      pageToken = data.nextPageToken || null;
    } while (pageToken);
  }

  return pdfFiles;
}

/**
 * Unduh buffer berkas dari Google Drive.
 */
async function downloadPdfFromDrive(fileId, accessToken) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gagal mengunduh berkas dari Google Drive (${res.status}): ${errText.slice(0, 200)}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return {
    buffer,
    sizeBytes: buffer.length
  };
}

/**
 * Ganti nama berkas di Google Drive via PATCH files.update.
 */
async function renameFileInDrive(fileId, newName, accessToken) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: newName })
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Gagal mengganti nama berkas di Google Drive: ${data.error ? data.error.message : res.statusText}`);
  }
  return data;
}

/**
 * Panggil Gemini API untuk mengekstrak field dari dokumen PDF (BYOK).
 * Menjalankan retry untuk 503 dan jeda 10s setelah pemanggilan.
 */
async function callGeminiExtractPdf(pdfBuffer, prompt, geminiKey, modelName) {
  if (!geminiKey || typeof geminiKey !== 'string' || !geminiKey.trim()) {
    throw new Error('Masukkan API key Gemini');
  }
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
    throw new Error('Buffer berkas PDF tidak valid.');
  }
  if (pdfBuffer.length > 20 * 1024 * 1024) {
    throw new Error('Ukuran berkas PDF melebihi batas 20MB untuk Gemini inline data.');
  }

  const model = process.env.GEMINI_MODEL || modelName || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: pdfBuffer.toString('base64')
            }
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0
    }
  };

  const maxRetries = 3;
  let attempt = 0;
  let res, data;

  while (attempt <= maxRetries) {
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'x-goog-api-key': geminiKey.trim(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.status === 400 || res.status === 403) {
        throw new Error('API key Gemini tidak valid');
      }

      if (res.status === 429) {
        throw new Error('Kuota Gemini API terlampaui (429). Silakan tunggu beberapa saat.');
      }

      if (res.status === 503) {
        attempt++;
        if (attempt <= maxRetries) {
          console.warn(`[jas-gemini] 503 Service Unavailable, mencoba ulang (${attempt}/${maxRetries}) dalam 15 detik...`);
          await new Promise(r => setTimeout(r, 15000));
          continue;
        } else {
          throw new Error('Layanan Gemini sedang sibuk (503 Service Unavailable setelah 3x percobaan).');
        }
      }

      data = await res.json();
      break;
    } catch (err) {
      if (err.message && (err.message.includes('API key Gemini tidak valid') || err.message.includes('429'))) {
        throw err;
      }
      if (attempt < maxRetries && (!res || res.status === 503)) {
        attempt++;
        await new Promise(r => setTimeout(r, 15000));
        continue;
      }
      throw err;
    }
  }

  // Jeda wajib 10 detik setelah setiap pemanggilan Gemini
  await new Promise(r => setTimeout(r, 10000));

  if (!res.ok || data.error) {
    throw new Error(`Gagal memanggil Gemini API: ${data.error ? data.error.message : res.statusText}`);
  }

  const candidateText = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] ? data.candidates[0].content.parts[0].text : null;
  if (!candidateText) {
    throw new Error('Gemini tidak memberikan respon teks kandidat.');
  }

  let parsedJson;
  try {
    parsedJson = JSON.parse(candidateText.trim());
  } catch (e) {
    const jsonMatch = candidateText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      parsedJson = JSON.parse(jsonMatch[1].trim());
    } else {
      throw new Error(`Respon Gemini bukan format JSON yang valid: ${candidateText.slice(0, 150)}`);
    }
  }

  return {
    rawGemini: candidateText,
    parsed: parsedJson
  };
}

/**
 * Tambahkan baris baru ke Google Spreadsheet dengan format NIP aman.
 */
async function appendRowToSpreadsheet(spreadsheetId, values, accessToken) {
  if (!spreadsheetId || !Array.isArray(values) || values.length === 0) return null;
  const formattedValues = values.map(v => {
    if (typeof v === 'string' && /^\d{9,18}$/.test(v.trim())) {
      return `'${v.trim()}`;
    }
    return v;
  });

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      values: [formattedValues]
    })
  });
  return await res.json();
}

/**
 * Periksa apakah NIP sudah ada di spreadsheet hasil untuk mencegah duplikasi.
 */
async function checkNipExistsInSpreadsheet(spreadsheetId, nipDigits, accessToken) {
  if (!spreadsheetId || !nipDigits) return false;
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A:Z`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.values || !Array.isArray(data.values)) return false;
    for (const row of data.values) {
      for (const cell of row) {
        const cleanCell = String(cell || '').replace(/\D/g, '');
        if (cleanCell && cleanCell === String(nipDigits)) {
          return true;
        }
      }
    }
  } catch (_) {}
  return false;
}

/* ================================================================
   FITUR 2: UNDUH BERKAS DARI SPREADSHEET (CORE LOGIC)
   ================================================================ */

const dns = require('dns');

/**
 * Validasi keamanan URL untuk mencegah SSRF (hanya http/https, tolak loopback/private IP).
 */
async function isSafeUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  let parsed;
  try {
    parsed = new URL(urlStr.trim());
  } catch (_) {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return false;
  if (/^10\./.test(host) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return false;
  try {
    const addresses = await dns.promises.lookup(host, { all: true });
    for (const addr of addresses) {
      const ip = addr.address;
      if (ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0') return false;
      if (/^10\./.test(ip) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip) || /^192\.168\./.test(ip) || /^169\.254\./.test(ip)) return false;
      if (/^fc00:|^fe80:/i.test(ip)) return false;
    }
  } catch (_) {
    return false;
  }
  return true;
}

/**
 * Ekstrak tautan URL dari cell spreadsheet (hyperlink, formula HYPERLINK, teks).
 */
function extractUrlsFromCell(cell) {
  if (!cell) return [];
  const urls = new Set();
  if (cell.hyperlink && typeof cell.hyperlink === 'string') {
    urls.add(cell.hyperlink.trim());
  }
  const formula = cell.userEnteredValue && cell.userEnteredValue.formulaValue;
  if (formula && typeof formula === 'string') {
    const m = formula.match(/=HYPERLINK\(\s*["']([^"']+)["']/i);
    if (m && m[1]) urls.add(m[1].trim());
  }
  const text = cell.formattedValue || (cell.userEnteredValue && cell.userEnteredValue.stringValue) || '';
  if (text && typeof text === 'string') {
    const matches = text.match(/https?:\/\/[^\s"',;<>]+/gi);
    if (matches) {
      matches.forEach(u => urls.add(u.trim()));
    }
  }
  return Array.from(urls);
}

/**
 * Ambil daftar nama tab/sheet dari Google Spreadsheet.
 */
async function fetchSpreadsheetInfo(spreadsheetId, accessToken) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title,gridProperties)`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Gagal membaca informasi spreadsheet: ${data.error ? data.error.message : res.statusText}`);
  }
  const sheets = (data.sheets || []).map(s => ({
    id: s.properties.sheetId,
    title: s.properties.title,
    rowCount: s.properties.gridProperties ? s.properties.gridProperties.rowCount : 1000
  }));
  return { spreadsheetId, sheets };
}

/**
 * Ambil baris data sel dengan format values dan formulas dari spreadsheet.
 */
async function fetchSpreadsheetRangeGrid(spreadsheetId, sheetName, startRow, endRow, accessToken) {
  const range = `'${sheetName}'!A${startRow}:ZZ${endRow}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?ranges=${encodeURIComponent(range)}&fields=sheets.data.rowData.values(formattedValue,userEnteredValue,hyperlink)`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Gagal membaca data sel spreadsheet: ${data.error ? data.error.message : res.statusText}`);
  }
  const rowData = (data.sheets && data.sheets[0] && data.sheets[0].data && data.sheets[0].data[0] && data.sheets[0].data[0].rowData) || [];
  return rowData;
}

/**
 * Cari atau buat subfolder berdasarkan nama di folder target Google Drive (re-run safe).
 */
async function findOrCreateSubfolder(parentFolderId, folderName, accessToken) {
  const safeName = sanitizeFileNameValue(folderName) || 'Tanpa Nama';
  const escaped = safeName.replace(/'/g, "\\'");
  const q = `'${parentFolderId}' in parents and name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const res = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  if (res.ok && data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  const createUrl = 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true';
  const cRes = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: safeName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId]
    })
  });
  const cData = await cRes.json();
  if (!cRes.ok || cData.error) {
    throw new Error(`Gagal membuat subfolder "${safeName}": ${cData.error ? cData.error.message : cRes.statusText}`);
  }
  return cData.id;
}

/**
 * Cek keberadaan file di folder target (re-run safe).
 */
async function checkFileExistsInFolder(folderId, fileName, accessToken) {
  const escaped = fileName.replace(/'/g, "\\'");
  const q = `'${folderId}' in parents and name = '${escaped}' and trashed = false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const res = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();
  return (res.ok && data.files && data.files.length > 0);
}

/**
 * Unggah buffer berkas ke folder Google Drive via multipart upload.
 */
async function uploadBufferToDrive(folderId, fileName, mimeType, buffer, accessToken) {
  const boundary = '-------' + Date.now();
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = JSON.stringify({
    name: fileName,
    parents: [folderId]
  });

  const multipartBody = Buffer.concat([
    Buffer.from(delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + metadata + delimiter + `Content-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(closeDelimiter)
  ]);

  const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true';
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(multipartBody.length)
    },
    body: multipartBody
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Gagal mengunggah berkas ke Drive: ${data.error ? data.error.message : res.statusText}`);
  }
  return data;
}

/**
 * Salin berkas Google Drive atau unduh berkas non-Drive lalu simpan ke folder tujuan.
 */
async function copyDriveFileOrDownloadUrl(urlStr, targetFolderId, targetBaseName, accessToken) {
  const cleanBase = sanitizeFileNameValue(targetBaseName);
  const driveFileId = parseGoogleDriveFileId(urlStr);

  if (driveFileId) {
    const metaUrl = `https://www.googleapis.com/drive/v3/files/${driveFileId}?fields=id,name,mimeType,size&supportsAllDrives=true`;
    const mRes = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!mRes.ok) {
      throw new Error(`Berkas Google Drive tidak dapat diakses (HTTP ${mRes.status})`);
    }
    const meta = await mRes.json();

    if (meta.mimeType && meta.mimeType.startsWith('application/vnd.google-apps.')) {
      const finalName = `${cleanBase}.pdf`;
      const exists = await checkFileExistsInFolder(targetFolderId, finalName, accessToken);
      if (exists) return { skipped: true, fileName: finalName };

      const exportUrl = `https://www.googleapis.com/drive/v3/files/${driveFileId}/export?mimeType=application/pdf&supportsAllDrives=true`;
      const expRes = await fetch(exportUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!expRes.ok) {
        throw new Error(`Gagal mengekspor dokumen Google ke PDF (HTTP ${expRes.status})`);
      }
      const arrayBuf = await expRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      if (buffer.length > 10 * 1024 * 1024) {
        throw new Error('Hasil ekspor dokumen PDF melebihi batas 10MB');
      }

      await uploadBufferToDrive(targetFolderId, finalName, 'application/pdf', buffer, accessToken);
      return { copied: true, fileName: finalName };
    }

    let ext = '';
    if (meta.name && meta.name.includes('.')) {
      ext = '.' + meta.name.split('.').pop().trim();
    }
    const finalName = ext ? `${cleanBase}${ext}` : cleanBase;
    const exists = await checkFileExistsInFolder(targetFolderId, finalName, accessToken);
    if (exists) return { skipped: true, fileName: finalName };

    const copyUrl = `https://www.googleapis.com/drive/v3/files/${driveFileId}/copy?supportsAllDrives=true`;
    const cpRes = await fetch(copyUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: finalName,
        parents: [targetFolderId]
      })
    });
    const cpData = await cpRes.json();
    if (!cpRes.ok || cpData.error) {
      throw new Error(`Gagal menyalin berkas Drive: ${cpData.error ? cpData.error.message : cpRes.statusText}`);
    }
    return { copied: true, fileName: finalName, fileId: cpData.id };
  } else {
    const isSafe = await isSafeUrl(urlStr);
    if (!isSafe) {
      throw new Error('URL diblokir demi keamanan server (SSRF protection: privat/loopback IP dilarang)');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let dlRes;
    try {
      dlRes = await fetch(urlStr, { signal: controller.signal });
    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr.name === 'AbortError') throw new Error('Unduhan melebihi batas waktu (timeout 30 detik)');
      throw new Error(`Gagal mengunduh dari tautan: ${fetchErr.message}`);
    }
    clearTimeout(timeout);

    if (!dlRes.ok) {
      throw new Error(`Gagal mengunduh berkas dari sumber eksternal (HTTP ${dlRes.status})`);
    }

    const cLen = Number(dlRes.headers.get('content-length') || 0);
    if (cLen > 25 * 1024 * 1024) {
      throw new Error('Ukuran berkas melebihi batas 25MB');
    }

    let ext = '';
    const cd = dlRes.headers.get('content-disposition') || '';
    const cdMatch = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i);
    if (cdMatch && cdMatch[1] && cdMatch[1].includes('.')) {
      ext = '.' + cdMatch[1].split('.').pop().trim();
    } else {
      try {
        const p = new URL(urlStr).pathname;
        if (p.includes('.')) ext = '.' + p.split('.').pop().trim();
      } catch (_) {}
    }

    const finalName = ext ? `${cleanBase}${ext}` : cleanBase;
    const exists = await checkFileExistsInFolder(targetFolderId, finalName, accessToken);
    if (exists) return { skipped: true, fileName: finalName };

    const arrayBuf = await dlRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    if (buffer.length > 25 * 1024 * 1024) {
      throw new Error('Ukuran berkas melebihi batas 25MB');
    }

    const mime = dlRes.headers.get('content-type') || 'application/octet-stream';
    await uploadBufferToDrive(targetFolderId, finalName, mime, buffer, accessToken);
    return { copied: true, fileName: finalName };
  }
}

module.exports = {
  isJasRole,
  verifyJasGuard,
  verifyJobOwnership,
  parseGoogleDriveFolderId,
  parseGoogleSpreadsheetId,
  parseGoogleDriveFileId,
  sanitizeFileNameValue,
  renderTemplateName,
  validateNipValue,
  validateTextValue,
  buildGeminiPrompt,
  detectColumnsFromRows,
  formatDuplicateSuffix,
  formatDuplicateRowName,
  getGoogleOAuthUrl,
  exchangeGoogleAuthCode,
  refreshGoogleAccessToken,
  getValidGoogleAccessToken,
  listPdfFilesInFolderRecursive,
  downloadPdfFromDrive,
  renameFileInDrive,
  callGeminiExtractPdf,
  appendRowToSpreadsheet,
  checkNipExistsInSpreadsheet,
  isSafeUrl,
  extractUrlsFromCell,
  fetchSpreadsheetInfo,
  fetchSpreadsheetRangeGrid,
  findOrCreateSubfolder,
  checkFileExistsInFolder,
  copyDriveFileOrDownloadUrl,
  uploadBufferToDrive
};
