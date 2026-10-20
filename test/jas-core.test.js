/**
 * test/jas-core.test.js
 * Unit tests murni untuk core functions Menu JAS
 * Menjalankan uji untuk:
 * 1. isJasRole / guard (admin, super_admin -> true; role lain, kosong, null, casing berbeda -> false)
 * 2. parse ID dari link folder / spreadsheet / berkas
 * 3. sanitasi nama berkas
 * 4. template nama (termasuk penolakan placeholder yang tidak ada di daftar field)
 * 5. penyusunan prompt Gemini dari daftar field
 * 6. validasi NIP dan teks
 * 7. deteksi kolom
 * 8. penamaan _2 dan (baris N)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  isJasRole,
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
  formatDuplicateRowName
} = require('../api/jas-core');

describe('1. Role Guard isJasRole()', () => {
  it('harus bernilai true untuk admin dan super_admin persis', () => {
    assert.strictEqual(isJasRole('admin'), true);
    assert.strictEqual(isJasRole('super_admin'), true);
  });

  it('harus bernilai false untuk role lain, kosong, null, undefined, dan casing berbeda', () => {
    assert.strictEqual(isJasRole('user'), false);
    assert.strictEqual(isJasRole('normal'), false);
    assert.strictEqual(isJasRole(''), false);
    assert.strictEqual(isJasRole(null), false);
    assert.strictEqual(isJasRole(undefined), false);
    assert.strictEqual(isJasRole('Admin'), false);
    assert.strictEqual(isJasRole('ADMIN'), false);
    assert.strictEqual(isJasRole('SUPER_ADMIN'), false);
    assert.strictEqual(isJasRole('Super_Admin'), false);
    assert.strictEqual(isJasRole(123), false);
    assert.strictEqual(isJasRole({}), false);
  });

  it('verifyJobOwnership harus memvalidasi kesesuaian owner_id', () => {
    const job = { id: 'job-1', owner_id: '19850101' };
    assert.strictEqual(verifyJobOwnership(job, '19850101'), true);
    assert.throws(() => verifyJobOwnership(job, '19850999'), /Akses ditolak/);
  });
});

describe('2. Parse ID dari Link Google Drive & Sheets', () => {
  it('parseGoogleDriveFolderId mengekstrak folder ID', () => {
    const url1 = 'https://drive.google.com/drive/folders/1zf8u-yXjhDcuzwyFiv7Xz7eYBNDZ85k3';
    const url2 = 'https://drive.google.com/drive/u/0/folders/1zf8u-yXjhDcuzwyFiv7Xz7eYBNDZ85k3?usp=sharing';
    const rawId = '1zf8u-yXjhDcuzwyFiv7Xz7eYBNDZ85k3';
    assert.strictEqual(parseGoogleDriveFolderId(url1), '1zf8u-yXjhDcuzwyFiv7Xz7eYBNDZ85k3');
    assert.strictEqual(parseGoogleDriveFolderId(url2), '1zf8u-yXjhDcuzwyFiv7Xz7eYBNDZ85k3');
    assert.strictEqual(parseGoogleDriveFolderId(rawId), '1zf8u-yXjhDcuzwyFiv7Xz7eYBNDZ85k3');
    assert.strictEqual(parseGoogleDriveFolderId('bukan-link-valid'), null);
  });

  it('parseGoogleSpreadsheetId mengekstrak spreadsheet ID', () => {
    const url1 = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0';
    const url2 = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing';
    assert.strictEqual(parseGoogleSpreadsheetId(url1), '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
    assert.strictEqual(parseGoogleSpreadsheetId(url2), '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
    assert.strictEqual(parseGoogleSpreadsheetId('invalid'), null);
  });

  it('parseGoogleDriveFileId mengekstrak file ID', () => {
    const url1 = 'https://drive.google.com/file/d/1A2B3C4D5E6F7G8H9I0J/view?usp=sharing';
    const url2 = 'https://drive.google.com/open?id=1A2B3C4D5E6F7G8H9I0J';
    assert.strictEqual(parseGoogleDriveFileId(url1), '1A2B3C4D5E6F7G8H9I0J');
    assert.strictEqual(parseGoogleDriveFileId(url2), '1A2B3C4D5E6F7G8H9I0J');
  });
});

describe('3. Sanitasi Nama Berkas', () => {
  it('membuang karakter terlarang filesystem dan merapikan spasi', () => {
    const dirty = ' Surat: Tugas / BA * 2026? <Draft> | Final "Test" ';
    const clean = sanitizeFileNameValue(dirty);
    assert.strictEqual(clean, 'Surat Tugas BA 2026 Draft Final Test');
  });

  it('membuang titik dan koma di akhir agar tidak menghasilkan ekstensi ganda atau M.Ak..pdf', () => {
    const dirty = 'Budi Santoso, M.Ak.,,,... ';
    const clean = sanitizeFileNameValue(dirty);
    assert.strictEqual(clean, 'Budi Santoso, M.Ak');
  });
});

describe('4. Template Nama Berkas', () => {
  it('berhasil merender nama jika semua placeholder ada di daftar field', () => {
    const format = 'BA_{NIP}_{NAMA}';
    const fields = ['NIP', 'NAMA'];
    const values = { NIP: '198501012010011005', NAMA: 'Budi Santoso, M.Ak.' };
    const res = renderTemplateName(format, values, fields);
    assert.strictEqual(res, 'BA_198501012010011005_Budi Santoso, M.Ak.pdf');
  });

  it('menolak template jika ada placeholder yang tidak terdaftar di daftar field', () => {
    const format = 'BA_{NIP}_{JABATAN}';
    const fields = ['NIP', 'NAMA']; // JABATAN tidak ada
    const values = { NIP: '198501012010011005', JABATAN: 'Dekan' };
    assert.throws(() => {
      renderTemplateName(format, values, fields);
    }, /Placeholder {JABATAN} tidak terdaftar di daftar field/);
  });

  it('menolak jika nilai field kosong atau null', () => {
    const format = 'BA_{NIP}_{NAMA}';
    const fields = ['NIP', 'NAMA'];
    const values = { NIP: '198501012010011005', NAMA: '' };
    assert.throws(() => {
      renderTemplateName(format, values, fields);
    }, /Nilai untuk field NAMA tidak ditemukan atau kosong/);
  });
});

describe('5. Penyusunan Prompt Gemini dari Daftar Field', () => {
  it('menyusun prompt dengan instruksi persis dan daftar field terstruktur', () => {
    const fields = [
      { name: 'NIP', desc: 'NIP pegawai yang disumpah', contoh: '198501012010011005' },
      { name: 'NAMA', desc: 'Nama lengkap beserta gelar', contoh: 'Budi Santoso, M.Ak.' }
    ];
    const { prompt, expectedKeys } = buildGeminiPrompt(fields);
    assert.ok(prompt.includes('Baca dokumen PDF ini. Ambil nilai berikut persis'));
    assert.ok(prompt.includes('- NIP: NIP pegawai yang disumpah. Contoh bentuk: 198501012010011005'));
    assert.ok(prompt.includes('- NAMA: Nama lengkap beserta gelar. Contoh bentuk: Budi Santoso, M.Ak.'));
    assert.ok(prompt.includes('Jika suatu nilai tidak ditemukan, isi null.'));
    assert.ok(prompt.includes('Balas hanya JSON dengan kunci: NIP, NAMA.'));
    assert.deepStrictEqual(expectedKeys, ['NIP', 'NAMA']);
  });
});

describe('6. Validasi NIP dan Teks', () => {
  it('validateNipValue memvalidasi NIP 9-18 digit', () => {
    assert.strictEqual(validateNipValue('19850101 201001 1 005').valid, true);
    assert.strictEqual(validateNipValue('19850101 201001 1 005').value, '198501012010011005');
    assert.strictEqual(validateNipValue('12345').valid, false); // < 9 digit
    assert.strictEqual(validateNipValue(null).valid, false);
  });

  it('validateTextValue memvalidasi teks non-empty >= 3 karakter', () => {
    assert.strictEqual(validateTextValue('Budi').valid, true);
    assert.strictEqual(validateTextValue('   AB   ').valid, false); // 2 karakter
    assert.strictEqual(validateTextValue('').valid, false);
    assert.strictEqual(validateTextValue(null).valid, false);
  });
});

describe('7. Deteksi Kolom Spreadsheet', () => {
  it('mendeteksi kolom nama dan kolom link URL', () => {
    const headers = ['No', 'Nama Lengkap', 'Unit Kerja', 'Link Berkas SK', 'Bukti Dukung'];
    const sampleRows = [
      ['1', 'Ahmad Dani', 'Fakultas Teknik', 'https://drive.google.com/file/d/123/view', 'https://example.com/doc.pdf'],
      ['2', 'Siti Aminah', 'Fakultas Kedokteran', 'https://drive.google.com/file/d/456/view', '']
    ];
    const res = detectColumnsFromRows(headers, sampleRows);
    assert.strictEqual(res.nameColumnIndex, 1);
    assert.deepStrictEqual(res.linkColumnIndices, [3, 4]);
  });
});

describe('8. Penamaan _2 dan (baris N)', () => {
  it('formatDuplicateSuffix memberi _2, _3', () => {
    assert.strictEqual(formatDuplicateSuffix(1), '');
    assert.strictEqual(formatDuplicateSuffix(2), '_2');
    assert.strictEqual(formatDuplicateSuffix(3), '_3');
  });

  it('formatDuplicateRowName menambahkan penanda baris', () => {
    assert.strictEqual(formatDuplicateRowName('Budi Santoso', 5), 'Budi Santoso (baris 5)');
    assert.strictEqual(formatDuplicateRowName('Siti Aminah, M.Kom.', 8), 'Siti Aminah, M.Kom (baris 8)');
  });
});

describe('9. Validasi Parameter Ekstraksi Gemini & Buffer PDF (Fitur 1)', () => {
  const { callGeminiExtractPdf } = require('../api/jas-core');

  it('menolak jika API key Gemini kosong atau tidak ada', async () => {
    const dummyBuffer = Buffer.from('%PDF-1.4 dummy');
    await assert.rejects(
      async () => callGeminiExtractPdf(dummyBuffer, 'prompt', ''),
      /Masukkan API key Gemini/
    );
    await assert.rejects(
      async () => callGeminiExtractPdf(dummyBuffer, 'prompt', null),
      /Masukkan API key Gemini/
    );
  });

  it('menolak jika buffer melebihi 20MB', async () => {
    // Mock buffer besar dengan byteLength > 20MB
    const bigFakeBuffer = { length: 21 * 1024 * 1024 };
    Object.setPrototypeOf(bigFakeBuffer, Buffer.prototype);
    await assert.rejects(
      async () => callGeminiExtractPdf(bigFakeBuffer, 'prompt', 'dummy-key'),
      /Ukuran berkas PDF melebihi batas 20MB/
    );
  });
});

describe('10. Perlindungan SSRF & Ekstraksi Link Cell (Fitur 2)', () => {
  const { isSafeUrl, extractUrlsFromCell } = require('../api/jas-core');

  it('isSafeUrl memblokir loopback, IP privat, dan protokol selain http/https', async () => {
    assert.strictEqual(await isSafeUrl('http://127.0.0.1/test'), false);
    assert.strictEqual(await isSafeUrl('http://localhost:3000/api'), false);
    assert.strictEqual(await isSafeUrl('http://192.168.1.10/doc.pdf'), false);
    assert.strictEqual(await isSafeUrl('http://10.0.0.5/secret'), false);
    assert.strictEqual(await isSafeUrl('ftp://example.com/file.zip'), false);
    assert.strictEqual(await isSafeUrl('javascript:alert(1)'), false);
    assert.strictEqual(await isSafeUrl(''), false);
    assert.strictEqual(await isSafeUrl(null), false);
  });

  it('extractUrlsFromCell mengekstrak URL dari hyperlink, formula, dan teks', () => {
    const c1 = { hyperlink: 'https://drive.google.com/file/d/123/view' };
    assert.deepStrictEqual(extractUrlsFromCell(c1), ['https://drive.google.com/file/d/123/view']);

    const c2 = { userEnteredValue: { formulaValue: '=HYPERLINK("https://undip.ac.id/sk.pdf", "Unduh SK")' } };
    assert.deepStrictEqual(extractUrlsFromCell(c2), ['https://undip.ac.id/sk.pdf']);

    const c3 = { formattedValue: 'Lihat lampiran di https://undip.ac.id/a.pdf dan https://undip.ac.id/b.pdf' };
    const urls = extractUrlsFromCell(c3);
    assert.strictEqual(urls.length, 2);
    assert.strictEqual(urls.includes('https://undip.ac.id/a.pdf'), true);
    assert.strictEqual(urls.includes('https://undip.ac.id/b.pdf'), true);
  });
});
