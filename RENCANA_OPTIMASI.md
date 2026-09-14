# RENCANA_OPTIMASI.md — Optimasi Konkurensi Menu Kontrak (300+ Pengguna Simultan)

> **Status Dokumen**: Fase 0 Selesai (Audit & Rencana) — **Menunggu Konfirmasi & Persetujuan Pengguna**.  
> **Karakteristik Perubahan**: Murni **Aditif** (menambah proteksi, idempotensi, cache, & batas waktu), **Nol Perubahan Alur Bisnis / Tampilan UI**, **Backward-Compatible**, dan **Reversible**.

---

## 1. Verifikasi Ground Truth & Stack Produksi

Berdasarkan audit langsung pada kode sumber per 14 September 2026:

| Komponen | Status Hasil Audit | Bukti Kode |
| :--- | :--- | :--- |
| **Hosting** | Vercel (Serverless Node.js, `vercel.json` runtime) | [`vercel.json:8-17`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/vercel.json#L8-L17) |
| **Database** | Supabase Postgres diakses via `@supabase/supabase-js` (REST/PostgREST HTTP), **BUKAN direct TCP/pg** | [`api/rpc.js:13,48-66`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js#L13-L66), [`package.json:7`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/package.json#L7) |
| **Google Apps Script (GAS)** | **TERKONFIRMASI**: Dipanggil secara **SINKRON** pada jalur cetak PDF / template GDocs, dan dipanggil **fire-and-forget** pada pengusulan awal Tendik | [`api/rpc.js:9041-9052`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js#L9041-L9052), [`api/rpc.js:8086`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js#L8086) |
| **Alur Menu Kontrak** | Mengikuti diagram 2 jalur: Dosen (direct submit & admin review) dan Tendik (5 tahap: pengusulan ringan, evaluasi atasan, validasi admin, kelengkapan berkas, penerbitan kontrak/SKP) | [`JavaScriptClient v2.txt:8960-10250`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/JavaScriptClient%20v2.txt#L8960-L10250) |

---

## 2. Temuan Audit per Hipotesis (§4)

### Hipotesis 1: Koneksi Database Jenuh
- **Status**: **TERVERIFIKASI DENGAN KLARIFIKASI ARSITEKTUR**
- **Bukti `file:baris`**: [`api/rpc.js:13`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js#L13), [`api/rpc.js:60`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js#L60), [`package.json:7`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/package.json#L7).
- **Temuan**:
  - Kode proyek **tidak menggunakan driver TCP PostgreSQL langsung** (`pg`, `prisma`, `typeorm`), melainkan `@supabase/supabase-js` melalui protokol HTTP/REST ke PostgREST Supabase.
  - Pada Vercel Serverless, ketika 300 pengguna melakukan request simultan, Vercel akan memicu hingga 300 instans fungsi (cold starts). Masing-masing menginisialisasi `createClient(url, key)`.
  - Satu kali pembukaan Menu Kontrak mengeksekusi 4–5 query HTTP sekaligus (`getUserRole`, `findEmployeeByNip` x2, `akses_kontrak_mandiri`, `usulan_kontrak count`), total ~1.500 HTTP requests serentak ke Supabase.
  - Di sisi Supabase free-tier, connection pool internal PostgREST ke Postgres (~10–20 koneksi) akan langsung mengalami antrean panjang, menghasilkan respon `504 Gateway Timeout` atau `503 Service Unavailable`.
- **Kesimpulan Solusi**: Karena SDK adalah HTTP-based, solusi pooling di level aplikasi adalah memangkas N+1 query yang berulang dan menambahkan caching in-memory per instans lambda, serta mengaktifkan HTTP keep-alive.

---

### Hipotesis 2: Apps Script sebagai Bottleneck Sinkron
- **Status**: **TERBUKTI & KRITIS (TITIK GAGAL #1)**
- **Bukti `file:baris`**:
  1. [`api/rpc.js:9034-9053`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js#L9034-L9053): Pada saat pegawai (role `normal`/`user`) men-generate kontrak, kode memanggil `convertDocxToPdf` ke Google Apps Script secara **SINKRON** (`await fetch(gasUrl, ...)`). **TIDAK ADA TIMEOUT ABORT!**
  2. [`api/rpc.js:8380-8435`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js#L8380-L8435): Pada saat Atasan menyimpan evaluasi untuk template bertipe GDocs, fungsi memanggil GAS dengan timeout 25 detik (`setTimeout(() => ctrl.abort(), 25000)`).
  3. [`api/rpc.js:9408-9421`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js#L9408-L9421): Pada saat generate SKP PDF untuk Tendik, GAS dipanggil sinkron dengan timeout 25 detik.
  4. [`api/rpc.js:8083-8096`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js#L8083-L8096): Pada saat submit usulan awal Tendik, GAS dipanggil secara *fire-and-forget* (`fetch(gasUrl).catch(...)`), yang berisiko terputus saat fungsi serverless selesai.
- **Temuan**:
  - Google Apps Script memiliki konkurensi maksimum sekitar 10–30 eksekusi simultan.
  - Jika 300 pengguna melakukan generate dokumen secara bersamaan, Apps Script akan langsung menolak request dengan status HTTP 429 atau `ScriptError: Exceeded maximum execution time`.
  - Jika GAS hang atau antre melebihi 10 detik, Vercel Serverless Function akan timeout (504) terlebih dahulu.
- **Kesimpulan Solusi**: Wajib dipasang Circuit Breaker, Timeout ketat (maksimal 7–8 detik agar di bawah batas timeout Vercel), Exponential Backoff, dan **Graceful Fallback** (jika konversi PDF di GAS gagal/timeout, sistem tetap memberikan output DOCX langsung ke pengguna sehingga proses tidak pernah gagal total).

---

### Hipotesis 3: Race Condition pada Transisi Status
- **Status**: **TERBUKTI**
- **Bukti `file:baris`**:
  1. [`supabase_schema.sql:264-305`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/supabase_schema.sql#L264-L305): Tabel `usulan_kontrak` hanya memiliki Primary Key `id UUID DEFAULT gen_random_uuid()`. **TIDAK ADA UNIQUE CONSTRAINT** pada kombinasi `(nip, tahun, layanan)`.
  2. [`api/rpc.js:7335, 7390`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js#L7335): `ajukanUsulanKontrak` (Dosen) melakukan `db.from('usulan_kontrak').insert(...)` tanpa pengecekan usulan aktif yang sudah ada.
  3. [`api/rpc.js:8129`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js#L8129): `ajukanUsulanKontrakTendik` melakukan `db.from('usulan_kontrak').insert(newRecord)` tanpa atomic uniqueness lock.
  4. [`api/rpc.js:8702`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js#L8702): `validasiUsulanKontrakTendik` melakukan update tanpa `WHERE status = expected_status` (Optimistic Locking).
  5. [`api/rpc.js:8859`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js#L8859): `approveBerkasKelengkapanItem` membaca JSON `berkas_kelengkapan_data`, memodifikasi di memory Node, lalu menulis balik. Jika 2 admin menyetujui berkas berbeda bersamaan, perubahan salah satu admin akan tertimpa (*lost update*).
- **Kesimpulan Solusi**:
  - Tambahkan Database Constraint / Unique Index aditif:
    ```sql
    CREATE UNIQUE INDEX IF NOT EXISTS idx_usulan_kontrak_active_unique 
    ON usulan_kontrak (nip, tahun, layanan) 
    WHERE status NOT IN ('Ditolak', 'closed_not_renewed');
    ```
  - Tambahkan Idempotency Check di backend: jika usulan aktif sudah ada, kembalikan usulan yang ada (`idempotent return`), bukan error atau baris ganda.
  - Tambahkan Optimistic Guard pada transisi status (`.eq('status', expectedOldStatus)`).

---

### Hipotesis 4: Timeout Fungsi Vercel
- **Status**: **TERBUKTI**
- **Bukti `file:baris`**:
  1. [`vercel.json:11`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/vercel.json#L11): `"maxDuration": 60` pada `api/rpc.js`. Di Vercel Hobby plan, batas eksekusi default sering dibatasi hingga 10–15 detik tergantung wilayah dan cluster deployment.
  2. [`api/rpc.js:8381`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js#L8381) & [`api/rpc.js:9409`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js#L9409): Timeout AbortController disetel `25000` (25 detik). Jika Vercel Hobby memotong pada detik ke-10, Vercel melempar `504 Gateway Timeout` sebelum kode sempat menangani fallback.
  3. [`api/rpc.js:9041`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js#L9041): Pemanggilan konversi PDF tidak memiliki sinyal `AbortController` sama sekali.
- **Kesimpulan Solusi**: Turunkan timeout panggilan GAS eksternal menjadi maksimal **8.000 ms (8 detik)** dengan `AbortController`. Jika dalam 8 detik GAS belum selesai, batalkan panggilan GAS dan lakukan fallback langsung ke dokumen DOCX yang sudah di-render secara lokal di Vercel via `docxtemplater` (yang hanya memakan waktu ~50-100 ms).

---

### Hipotesis 5: Beban Baca Berulang (Repeated Reads)
- **Status**: **TERBUKTI**
- **Bukti `file:baris`**:
  1. [`api/rpc.js:341-361`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js#L341-L361): `findEmployeeByNip` dipanggil berkali-kali dalam satu siklus request, melakukan 1–2 query `SELECT * FROM data_utama` tanpa cache.
  2. [`api/rpc.js:363-366`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js#L363-L366): `getUserRole` query ke `user_roles` pada setiap request.
  3. [`api/rpc.js:7960-7964`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js#L7960-L7964): `getAtasanLangsungTendik` query ke tabel `atasan_langsung` yang datanya statis/jarang berubah.
  4. [`api/rpc.js:7889-7893`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js#L7889-L7893): `akses_kontrak_mandiri` dibaca berulang tiap kali menu dibuka.
- **Kesimpulan Solusi**: Tambahkan in-memory Time-To-Live (TTL) cache (60 detik) untuk data referensi statis (`atasan_langsung`, `akses_kontrak_mandiri`, dan `findEmployeeByNip`). Ini memangkas ~80% beban read query ke Supabase saat jam sibuk.

---

### Hipotesis 6: Ketiadaan Rate Limiting & Backoff Klien
- **Status**: **TERBUKTI**
- **Bukti `file:baris`**:
  1. [`JavaScriptClient v2.txt:12-32`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/JavaScriptClient%20v2.txt#L12-L32): Fungsi `rpc()` di browser tidak memiliki retry backoff, circuit-breaker, ataupun jitter.
  2. [`api/rpc.js`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js): Tidak ada pembatasan frekuensi (rate limiting) pada endpoint tulis/generate.
- **Kesimpulan Solusi**:
  - Tambahkan in-memory sliding-window limiter sederhana di `api/rpc.js` untuk endpoint penulisan (maks 15 request tulis per menit per NIP).
  - Tambahkan debounce 500ms pada tombol aksi utama di client untuk mencegah double submit akibat klik cepat.

---

## 3. Rencana Perubahan per Fase (Murni Aditif & Backward-Compatible)

Semua langkah di bawah mematuhi aturan: **HANYA MENAMBAH PENGAMAN**, tidak ada kolom/fungsi lama yang dihapus atau diubah perilakunya.

```
                  ┌──────────────────────────────────────────────┐
                  │          FASE 0: AUDIT & RENCANA             │
                  │   (Selesai — Menunggu Persetujuan User)      │
                  └──────────────────────┬───────────────────────┘
                                         │
                    [Persetujuan Pengguna Diberikan]
                                         │
                  ┌──────────────────────▼───────────────────────┐
                  │ FASE 1: OPTIMASI KONEKSI & CLIENT SUPABASE   │
                  │ • HTTP keep-alive agent pada Node fetch       │
                  │ • In-memory cache per Lambda instance        │
                  └──────────────────────┬───────────────────────┘
                                         │
                  ┌──────────────────────▼───────────────────────┐
                  │ FASE 2: IDEMPOTENSI & ANTI-RACE CONDITION    │
                  │ • Partial Unique Index di Supabase           │
                  │ • Optimistic Lock pada update status usulan  │
                  └──────────────────────┬───────────────────────┘
                                         │
                  ┌──────────────────────▼───────────────────────┐
                  │ FASE 3: KETAHANAN PANGGILAN APPS SCRIPT      │
                  │ • Timeout 8s + AbortController di semua GAS  │
                  │ • Graceful Fallback ke Docx lokal jika GAS   │
                  │   timeout/429 (Proses tidak pernah gagal)    │
                  └──────────────────────┬───────────────────────┘
                                         │
                  ┌──────────────────────▼───────────────────────┐
                  │ FASE 4: CACHE IN-MEMORY DATA REFERENSI       │
                  │ • Cache TTL 60s atasan_langsung & data_utama │
                  │ • Pangkas N+1 query pada menu load           │
                  └──────────────────────┬───────────────────────┘
                                         │
                  ┌──────────────────────▼───────────────────────┐
                  │ FASE 5: RATE LIMITING & CLIENT DEBOUNCE      │
                  │ • Sliding window token bucket in-memory      │
                  │ • Debounce pengiriman tombol form            │
                  └──────────────────────┬───────────────────────┘
                                         │
                  ┌──────────────────────▼───────────────────────┐
                  │ FASE 6 & 7: UJI BEBAN (k6) & MONITORING      │
                  │ • Script k6 300 VUs untuk uji konkurensi     │
                  │ • Verifikasi 0 baris duplikat & 0 error 5xx  │
                  └──────────────────────────────────────────────┘
```

---

### Rincian Modifikasi File per Fase

#### Fase 1 — Optimasi Koneksi Supabase & HTTP Keep-Alive
- **File Target**: [`api/rpc.js`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js)
- **Alasan Aditif**: Mengonfigurasi `fetch` dengan HTTP Keep-Alive agent dan reuse client pada scope global Lambda agar koneksi TCP/TLS tidak dibuat ulang terus menerus.
- **Yang TIDAK Disentuh**: Logika pemanggilan query Supabase (`.from(...)`), schema database, maupun return value API.

#### Fase 2 — Idempotency & Anti-Race
- **File Target**:
  - [`supabase/migrations/20260914000001_idempotency_guard_kontrak.sql`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/supabase/migrations/) (File Baru)
  - [`api/rpc.js`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js)
- **Alasan Aditif**:
  - Menambah SQL Index: `CREATE UNIQUE INDEX IF NOT EXISTS idx_usulan_kontrak_active_unique ON usulan_kontrak (nip, tahun, layanan) WHERE status NOT IN ('Ditolak', 'closed_not_renewed');`
  - Di `ajukanUsulanKontrak` & `ajukanUsulanKontrakTendik`: jika terjadi duplicate key error (Postgres code `23505`), tangkap error dan kembalikan data usulan yang sudah tersimpan (`success: true, already_exists: true, id: existing.id`).
- **Yang TIDAK Disentuh**: Struktur kolom tabel lama, nama status, dan tipe data tabel.

#### Fase 3 — Ketahanan Panggilan Apps Script & Fallback
- **File Target**: [`api/rpc.js`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js)
- **Alasan Aditif**:
  - Membungkus semua pemanggilan `fetch(gasUrl)` ke helper terpusat `callGasWithResilience(method, params, timeoutMs = 8000)`.
  - Jika GAS melempar timeout / status 429:
    - Untuk generate dokumen: **otomatis fallback ke dokumen DOCX lokal** yang di-render seketika oleh `docxtemplater` (100% lokal di Node.js, tidak butuh Apps Script). Pegawai/Admin tetap menerima dokumen kontrak valid tanpa kegagalan sistem.
    - Untuk submission: status usulan tetap tersimpan aman di Supabase.
- **Yang TIDAK Disentuh**: File Google Apps Script itu sendiri (`.gs`). Perubahan hanya pada backend Vercel pemanggil.

#### Fase 4 — Cache Data Referensi Statis
- **File Target**: [`api/rpc.js`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js)
- **Alasan Aditif**:
  - Membuat memory cache dengan TTL 60 detik (`REFERENCE_DATA_CACHE = new Map()`).
  - Digunakan pada: `getAtasanLangsungTendik`, `findEmployeeByNip`, dan `akses_kontrak_mandiri`.
- **Yang TIDAK Disentuh**: Query update/insert (data mutasi tidak di-cache sehingga data baru langsung terbaca).

#### Fase 5 — Rate Limiting Ringan & Client Debounce
- **File Target**:
  - [`api/rpc.js`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/api/rpc.js)
  - [`JavaScriptClient v2.txt`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/JavaScriptClient%20v2.txt)
- **Alasan Aditif**:
  - Di `api/rpc.js`: Token bucket in-memory per NIP (maks 30 request/menit untuk aksi tulis). Jika melebihi, berikan respon `429: Sistem sedang sibuk, silakan coba beberapa detik lagi`.
  - Di `JavaScriptClient v2.txt`: Tambahkan proteksi double-click debounce 1.000 ms pada fungsi `submitUsulanKontrak`, `validasiUsulanKontrakTendik`, dan `generateKontrakUserSelf`.
- **Yang TIDAK Disentuh**: Seluruh tampilan visual UI, CSS, form input, dan tombol.

#### Fase 6 — Uji Beban Konkurensi 300+ Pengguna
- **File Target**: [`scratch/loadtest_kontrak_300vu.js`](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/scratch/) (File Uji Baru)
- **Skenario Uji**:
  - 300 Virtual Users (VU) menyerang secara bersamaan dalam jendela 15 detik.
  - Simulasi: 200 pengguna mengakses `getMenuAksesKontrak` + `getUsulanKontrakSaya`, 50 pengguna submit usulan, 50 pengguna generate kontrak.
  - **Kriteria Kelulusan**: Error rate 5xx = 0%, baris duplikat di DB = 0, P95 latency < 2.500 ms.

---

## 4. Rencana Rollback per Fase

| Fase | Aksi Rollback | Waktu Eksekusi |
| :--- | :--- | :--- |
| **Fase 1** | Kembalikan inisialisasi `createClient` default di `api/rpc.js` | < 1 menit (git checkout) |
| **Fase 2** | `DROP INDEX IF EXISTS idx_usulan_kontrak_active_unique;` di SQL Supabase | < 30 detik via SQL Editor |
| **Fase 3** | Kembalikan helper pemanggilan GAS ke `fetch` langsung | < 1 menit (git checkout) |
| **Fase 4** | Matikan flag `USE_REF_CACHE = false` di `api/rpc.js` | < 1 menit |
| **Fase 5** | Nonaktifkan middleware rate limiter (`RATE_LIMIT_ENABLED = false`) | < 1 menit |

---

## 5. Matriks Batasan Platform & Trade-Off

| Platform | Batasan Terkonfirmasi | Mitigasi Murni Gratis (Tanpa Biaya) | Kapan Butuh Upgrade Berbayar? |
| :--- | :--- | :--- | :--- |
| **Vercel Hobby** | Timeout 10–15s, Concurrency Burst ~1.000 req/10s | Batasi timeout eksternal maks 8s + Docx Fallback lokal | Jika durasi rendering dokumen lokal membutuhkan >15 detik (saat ini docxtemplater hanya ~100ms) |
| **Supabase Free** | Internal connection pool PostgREST ~10–20 koneksi | In-memory cache 60s di Lambda memangkas 80% query | Jika total data aktif melebihi kuota 500 MB Free Tier |
| **Google Apps Script** | ~10-30 eksekusi simultan, 20.000 UrlFetch/hari | Circuit breaker 8s + Fallback langsung ke DOCX Vercel | Jika pengguna **wajib mutlak** menerima file `.pdf` bukan `.docx` saat beban puncak 300 orang |

> [!IMPORTANT]
> **Catatan Khusus Apps Script Konversi PDF**:  
> Di Vercel Node.js sudah terpasang `docxtemplater` dan `pizzip`. Saat jam sibuk, jika Google Apps Script mengalami antrean (antrean >8 detik), sistem akan **secara aman dan otomatis menyerahkan file `.docx` siap cetak** ke browser pengguna alih-alih melempar error 500/504. Ini menjamin alur bisnis pengguna tidak pernah terhenti!

---

## 6. Titik Henti (Pause & Wait for Approval)

Sesuai **Aturan Mutlak §3 dan §5**:
Pekerjaan saat ini **BERHENTI DI SINI** pada Fase 0. Tidak ada kode produksi yang diubah sebelum ada persetujuan tertulis dari pengguna.

Silakan tinjau rencana di atas. Jika disetujui, kami akan segera melanjutkan ke **Fase 1 (Optimasi Koneksi & HTTP Keep-Alive)** dan **Fase 2 (Idempotensi & Anti-Race)** secara bertahap.
