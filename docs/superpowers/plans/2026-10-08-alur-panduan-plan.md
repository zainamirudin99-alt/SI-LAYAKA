# Implementation Plan: Fitur Tombol Alur & Panduan Penggunaan Dinamis Multi-Role SI-LAYAKA

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan tombol "Alur & Panduan" di pojok kanan atas topbar di bawah tombol tema, yang memunculkan pop-up langkah-langkah penggunaan dan diagram alur visual interaktif adaptif multi-role untuk menu Kenaikan Pangkat (Check Eligible, Opsi A, Opsi B, Usulan Masuk, Siap Buat SK), Kontrak (semua sub-menu), Pensiun (DPCP & Buat SK Pensiun), Usul PMK & PG, Buat SK dan Surat, serta Template.

**Architecture:** Menggunakan arsitektur data terpusat `GUIDE_REGISTRY` di client script yang mendefinisikan tahapan dan node flowchart per menu, sub-menu, dan role. Mengintegrasikan tombol pada topbar, modal responsif dengan filter role dan sub-menu, serta visual flowchart renderer berbasis CSS/SVG. Mengompilasi template via `build.ps1` dan memvalidasi integritas aplikasi.

**Tech Stack:** Vanilla JavaScript (ES6+), HTML5, Vanilla CSS (Design Tokens, Light Mode & Godzilla Dark Mode), PowerShell (`build.ps1`), Node.js validation test suite.

**Spec:** [docs/superpowers/specs/2026-10-08-alur-panduan-design.md](file:///c:/Users/LENOVO/Documents/Zain%202.0/Project%20AI/SISTEM%20LAYAKA%20VERCEL/docs/superpowers/specs/2026-10-08-alur-panduan-design.md)

## Global Constraints
- **Zero Regression:** Logika aplikasi yang sudah ada (autentikasi, RPC, form dinamis, generator dokumen, switch tab) tidak boleh terganggu.
- **Dukungan Tema:** Komponen panduan harus tampil konsisten di Light Mode dan Godzilla Dark Mode.
- **Future-Proofing:** Seluruh teks dan alur disimpan terstruktur di `GUIDE_REGISTRY` agar perubahan di masa depan dapat diperbarui tanpa mengubah DOM modal.
- **Validasi Build:** File `public/index.html` harus berhasil di-build ulang melalui `build.ps1` tanpa error encoding.

---

### Task 1: Desain & Implementasi Styling CSS Panduan di `Stylesheet v1.txt`
**Files:**
- Modify: `Stylesheet v1.txt`
- Test: `scratch/test_css_guide.js`

- [ ] **Step 1: Tulis script uji validasi CSS**
Membuat script uji untuk mengecek keberadaan kelas CSS panduan (.topbar-guide-btn, #appGuideModal, .guide-flowchart, dll).
- [ ] **Step 2: Jalankan script uji untuk memverifikasi kegagalan awal**
- [ ] **Step 3: Tambahkan aturan CSS untuk tombol dan modal panduan di `Stylesheet v1.txt`**
Menambahkan gaya untuk `.topbar-guide-btn`, `.guide-modal-overlay`, `.guide-modal-card`, `.guide-role-pill`, `.guide-step-card`, dan `.guide-flow-node` lengkap dengan adaptasi `body.theme-dark`.
- [ ] **Step 4: Jalankan script uji untuk memastikan semua kelas CSS valid**
- [ ] **Step 5: Commit perubahan Task 1**

---

### Task 2: Penambahan Markup Tombol & Modal di `Index v2.txt`
**Files:**
- Modify: `Index v2.txt`
- Test: `scratch/test_html_guide.js`

- [ ] **Step 1: Tulis script uji validasi elemen HTML**
Mengecek keberadaan elemen `#appGuideBtn`, `#appGuideModal`, `#guideModalTitle`, `#guideSubMenuTabs`, `#guideRolePills`, `#guideStepsContainer`, dan `#guideFlowchartContainer`.
- [ ] **Step 2: Jalankan script uji untuk memverifikasi elemen belum ada**
- [ ] **Step 3: Sisipkan tombol panduan di `.topbar-actions` dan modal dialog di `Index v2.txt`**
- [ ] **Step 4: Jalankan script uji untuk memverifikasi elemen terpasang sempurna**
- [ ] **Step 5: Commit perubahan Task 2**

---

### Task 3: Implementasi `GUIDE_REGISTRY` dan Logika Modal di `JavaScriptClient v2.txt`
**Files:**
- Modify: `JavaScriptClient v2.txt`
- Test: `scratch/test_guide_registry.js`

- [ ] **Step 1: Tulis script uji kelengkapan `GUIDE_REGISTRY`**
Menguji bahwa registry mencakup:
1. `kenaikan-pangkat` (tab-checkEligible, tab-optA, tab-optB, tab-usulanMasuk, tab-siapSk)
2. `kontrak` (tabBtnKontrakUserStatus, tabBtnKontrakAtasan, tabBtnKontrakAdminReview, tabBtnKontrakAdminBuat)
3. `pensiun` (tab-dpcp, tab-skPensiunNonAsn)
4. `pmk` (pengajuan dan verifikasi)
5. `buat-sk` (tabBuatSkUsulSk, tabBuatSkUsulanMasuk, tabBuatSkBuatSk)
6. `template` (manajemen template)
Serta menguji fungsi `openAppGuideModal`, `closeAppGuideModal`, dan `renderGuideContent`.
- [ ] **Step 2: Jalankan script uji untuk memverifikasi kegagalan awal**
- [ ] **Step 3: Tambahkan `GUIDE_REGISTRY` dan fungsi interaktif di `JavaScriptClient v2.txt`**
- [ ] **Step 4: Jalankan script uji untuk memastikan registry dan fungsi lulus validasi 100%**
- [ ] **Step 5: Commit perubahan Task 3**

---

### Task 4: Kompilasi Proyek dengan `build.ps1` dan Validasi Integrasi Akhir
**Files:**
- Run: `build.ps1`
- Output: `public/index.html`
- Test: `scratch/test_build_integrity.js`

- [ ] **Step 1: Jalankan kompilasi `build.ps1`**
- [ ] **Step 2: Tulis dan jalankan script validasi integrasi akhir pada `public/index.html`**
Memastikan `public/index.html` memuat tombol, modal, CSS, dan skrip panduan tanpa merusak encoding UTF-8 dan logika RPC.
- [ ] **Step 3: Commit hasil build dan integrasi**
- [ ] **Step 4: Push perubahan ke remote repository jika semua validasi sukses**
