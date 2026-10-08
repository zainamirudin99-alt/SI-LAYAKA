# Design Doc: Fitur Tombol Alur & Panduan Penggunaan Dinamis Multi-Role SI-LAYAKA

## 1. Latar Belakang & Tujuan
Aplikasi SI-LAYAKA (Sistem Layanan Administrasi Kepegawaian) memiliki berbagai menu layanan seperti Kenaikan Pangkat, Kontrak, Pensiun, Usul PMK & PG, Buat SK dan Surat, serta Manajemen Template. Setiap menu dan sub-menu memiliki alur kerja yang spesifik dan seringkali berbeda tergantung pada peran (role) pengguna yang sedang aktif (`user`/Pegawai, Atasan Langsung, `admin`, atau `super_admin`).

Tujuan fitur ini:
1. Menambahkan tombol "Alur / Langkah-Langkah / Cara Penggunaan" di pojok kanan atas topbar aplikasi, persis di bawah tombol ganti tema (*Godzilla Dark / Light Mode*).
2. Ketika tombol diklik, modal/pop-up akan muncul menyajikan tata cara penggunaan langkah-demi-langkah dan diagram alur visual interaktif.
3. Konten panduan bersifat **kontekstual dan adaptif**: otomatis mendeteksi menu dan sub-menu yang sedang dibuka saat tombol diklik.
4. **Multi-Role & Future-Proof**: Struktur panduan disimpan dalam registry data terpusat (`GUIDE_REGISTRY`) sehingga jika di masa depan ada perubahan regulasi atau alur, pembaruan konten dan diagram sangat mudah dilakukan tanpa mengubah logika operasional aplikasi lainnya.
5. **Zero Regression**: Memastikan seluruh logika yang sudah ada (RPC, login, otorisasi, form, generate dokumen, tema, dll) tetap berfungsi normal 100%.

## 2. Cakupan Menu & Sub-Menu
1. **Menu Kenaikan Pangkat (`view-kenaikan-pangkat`)**:
   - `tab-checkEligible`: 0. Check Eligible (Alur Pegawai vs Admin)
   - `tab-optA`: Opsi A: AK Konversi Tahunan (Admin/Super Admin)
   - `tab-optB`: Opsi B: AK Konversi Kumulatif (Admin/Super Admin)
   - `tab-usulanMasuk`: 📨 Usulan Masuk (Admin/Super Admin)
   - `tab-siapSk`: 📝 Siap Buat SK (Admin/Super Admin)
2. **Menu Kontrak (`view-kontrak`)**:
   - `tabBtnKontrakUserStatus`: Usulan Kontrak Saya (Pegawai Non-ASN)
   - `tabBtnKontrakAtasan`: 👔 Review Usulan Bawahan (Atasan Langsung Unit)
   - `tabBtnKontrakAdminReview`: Review Usulan Unit (Admin DOSDM)
   - `tabBtnKontrakAdminBuat`: Buat Kontrak (Admin DOSDM - Single/Batch)
3. **Menu Pensiun (`view-pensiun`)**:
   - `tab-dpcp`: Buat DPCP (Alur Pengusul/Pegawai vs Admin DOSDM)
   - `tab-skPensiunNonAsn`: Buat SK Pensiun Pegawai Undip Non ASN (Admin DOSDM)
4. **Menu Usul PMK & PG (`view-pmk`)**:
   - Pengajuan Usulan PMK/PG (Pegawai) dan Verifikasi/Integrasi SIASN & E-Duk (Admin DOSDM)
5. **Menu Buat SK dan Surat (`view-buat-sk`)**:
   - `tabBuatSkUsulSk`: 📤 Usul SK (Pengusul Pegawai/Unit)
   - `tabBuatSkUsulanMasuk`: 📥 Usulan Masuk (Verifikator Admin DOSDM)
   - `tabBuatSkBuatSk`: ⚡ Buat SK dan Surat (Pembuat SK Tunggal & Batch Kolektif)
6. **Menu Template (`view-template`)**:
   - Tambah Template Baru (GDocs/DOCX), Scan Formula, dan Pengujian Preview Template (Admin/Super Admin)

## 3. Arsitektur Komponen

### A. Penempatan Tombol Topbar
* Lokasi di `Index v2.txt` pada kontainer `.topbar-actions`.
* Struktur HTML:
  ```html
  <div class="topbar-actions" style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
    <button type="button" class="topbar-theme-btn" id="appThemeToggleBtn" ...>...</button>
    <button type="button" class="topbar-guide-btn" id="appGuideBtn" title="Alur & Panduan Penggunaan Menu Ini">
      <span class="guide-btn-icon">📖</span>
      <span class="guide-btn-label">Alur & Panduan</span>
    </button>
  </div>
  ```
* Styling di `Stylesheet v1.txt`:
  - Mendukung Light Mode (clean pill style, border halus, hover efek).
  - Mendukung Godzilla Dark Mode (neon cyan border, glow halus, mecha aesthetic).

### B. Modal Interaktif Panduan (`#appGuideModal`)
* Struktur Modal:
  1. **Header**: Icon, Judul Menu, Badge Role Pengguna Aktif, Tombol Tutup (X & ESC support).
  2. **Sub-Menu Selector Bar**: Tab pills yang memungkinkan pengguna berpindah antar sub-menu di menu aktif saat ini.
  3. **Role Switcher Pills**: Jika sub-menu memiliki panduan multi-role (misal: Check Eligible, DPCP, Kontrak), pengguna/admin dapat beralih antara "👤 Pegawai / Pengusul", "🛡️ Admin DOSDM", atau "👔 Atasan Langsung".
  4. **Panel Konten**:
     - **Tab 1: Langkah-Langkah**: Rincian urutan proses bernomor, tips dokumen, peringatan regulasi.
     - **Tab 2: Diagram Alir Visual**: Pipeline diagram interaktif (HTML/CSS + SVG konektor) dengan status awal, tahapan proses, percabangan keputusan ({Eligible?}, {Verifikasi?}), dan status akhir.

### C. Registry Panduan Terpusat (`GUIDE_REGISTRY`)
* Diletakkan di `JavaScriptClient v2.txt` atau modul terkait.
* Struktur objek:
  - `[menuKey]`: metadata menu.
  - `subMenus`: kamus sub-menu.
  - `roleGuides`: kamus panduan per peran (`user`, `admin`, `atasan`).
  - `flowchart`: daftar node ({ id, title, desc, type, next }) yang dirender otomatis menjadi diagram alir visual responsif.

## 4. Rencana Pengujian & Validasi
1. Pengujian Tombol Topbar:
   - Terlihat rapi di desktop dan mobile di bawah tombol ganti tema.
   - Bekerja baik di Light Mode dan Godzilla Dark Mode.
2. Pengujian Kontekstual:
   - Berada di tab "Opsi A" -> klik tombol -> langsung membuka panduan "Opsi A".
   - Berada di menu "Kontrak" -> tab "Review Bawahan" -> membuka panduan Atasan Langsung.
3. Pengujian Multi-Role:
   - Login sebagai `user` -> panduan default menampilkan sudut pandang Pegawai.
   - Login sebagai `admin` -> panduan default menampilkan sudut pandang Admin.
   - Beralih role di dalam modal -> teks dan diagram berganti secara mulus.
4. Pengujian Regresi:
   - Build script `build.ps1` berhasil dijalankan tanpa error.
   - Logika aplikasi eksisting tidak mengalami perubahan atau interferensi.
