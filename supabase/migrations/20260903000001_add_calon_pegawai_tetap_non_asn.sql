-- ==============================================================================
-- MIGRATION: 20260903000001_add_calon_pegawai_tetap_non_asn.sql
-- Kategori: Calon Pegawai Tetap Undip NON ASN (Tendik & Dosen)
-- ==============================================================================

-- 1. Pastikan kolom nip di data_utama memiliki UNIQUE constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'data_utama'::regclass AND contype = 'u' AND conname LIKE '%nip%'
  ) THEN
    ALTER TABLE data_utama ADD CONSTRAINT uq_data_utama_nip UNIQUE (nip);
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Abaikan jika constraint sudah ada atau nip sudah primary key/unique
    NULL;
END $$;

-- 2. Pastikan tabel usulan_kontrak_baru siap menampung kategori baru
CREATE TABLE IF NOT EXISTS usulan_kontrak_baru (
  nip                     TEXT NOT NULL PRIMARY KEY,
  nama_lengkap            TEXT,
  tmp_lhr                 TEXT,
  tgl_lhr                 TEXT,
  pendidikan              TEXT,
  jurusan                 TEXT,
  unit_es_ii              TEXT,
  jabatan                 TEXT,
  alamat                  TEXT,
  nomor_telepon           TEXT,
  nomor_surat_perjanjian  TEXT,
  tmt_bulan               TEXT,
  tmt_tahun               TEXT,
  tst_bulan               TEXT,
  tst_tahun               TEXT,
  jangka_waktu            TEXT,
  besaran_upah            TEXT,
  layanan                 TEXT,
  sub_menu                TEXT,
  form_data               JSONB DEFAULT '{}',
  status                  TEXT DEFAULT 'Draft',
  diajukan_oleh_nip       TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Index pendukung untuk pencarian cepat berdasarkan layanan dan sub-menu
CREATE INDEX IF NOT EXISTS idx_usulan_kontrak_baru_nip ON usulan_kontrak_baru(nip);
CREATE INDEX IF NOT EXISTS idx_usulan_kontrak_baru_layanan_submenu ON usulan_kontrak_baru(layanan, sub_menu);

-- 3. Tabel khusus draft NIP NON ASN terverifikasi unik
CREATE TABLE IF NOT EXISTS draft_nip_non_asn (
  nip                     TEXT PRIMARY KEY,
  nama_lengkap            TEXT,
  tmp_lhr                 TEXT,
  tgl_lhr                 DATE,
  tmt                     DATE,
  gender                  TEXT,
  layanan                 TEXT NOT NULL DEFAULT 'Kontrak Tendik',
  sub_menu                TEXT NOT NULL DEFAULT 'Calon Pegawai Tetap Undip NON ASN',
  atasan_nip              TEXT,
  atasan_nama             TEXT,
  status                  TEXT DEFAULT 'Draft',
  form_data               JSONB DEFAULT '{}',
  diajukan_oleh_nip       TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_nip_h7_format CHECK (nip ~ '^H\.7\.[0-9]{18}$')
);

CREATE INDEX IF NOT EXISTS idx_draft_nip_non_asn_nip ON draft_nip_non_asn(nip);
CREATE INDEX IF NOT EXISTS idx_draft_nip_non_asn_status ON draft_nip_non_asn(status);

-- 4. Aktifkan RLS untuk keamanan data
ALTER TABLE usulan_kontrak_baru ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_nip_non_asn ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='draft_nip_non_asn' AND policyname='deny_public_draft_nip_non_asn') THEN
    CREATE POLICY "deny_public_draft_nip_non_asn" ON draft_nip_non_asn FOR ALL TO public USING (false);
  END IF;
END $$;
