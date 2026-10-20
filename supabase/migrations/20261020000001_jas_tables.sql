-- ==============================================================================
-- MIGRATION: 20261020000001_jas_tables.sql
-- Kategori: Fitur Menu JAS (Ubah Nama Berkas Gemini & Unduh Berkas Spreadsheet)
-- Karakteristik: Khusus Admin dan Superadmin, Akses Service Role Only via RLS
-- ==============================================================================

-- 1. Tabel Penyimpanan Token OAuth Google Pengguna (Khusus Admin/Superadmin)
CREATE TABLE IF NOT EXISTS jas_google_tokens (
  owner_id      TEXT PRIMARY KEY,
  email         TEXT,
  tokens        JSONB NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE jas_google_tokens ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='jas_google_tokens' AND policyname='deny_public_jas_google_tokens') THEN
    CREATE POLICY "deny_public_jas_google_tokens" ON jas_google_tokens FOR ALL TO public USING (false);
  END IF;
END $$;

-- 2. Tabel Job JAS
CREATE TABLE IF NOT EXISTS jas_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        TEXT NOT NULL,
  feature_type    TEXT NOT NULL CHECK (feature_type IN ('rename', 'download')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'stopped', 'done', 'failed')),
  config          JSONB DEFAULT '{}'::jsonb,
  lease_until     TIMESTAMPTZ,
  total_items     INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jas_jobs_owner ON jas_jobs(owner_id);
CREATE INDEX IF NOT EXISTS idx_jas_jobs_status ON jas_jobs(status);

ALTER TABLE jas_jobs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='jas_jobs' AND policyname='deny_public_jas_jobs') THEN
    CREATE POLICY "deny_public_jas_jobs" ON jas_jobs FOR ALL TO public USING (false);
  END IF;
END $$;

-- 3. Tabel Item Pekerjaan JAS
CREATE TABLE IF NOT EXISTS jas_job_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES jas_jobs(id) ON DELETE CASCADE,
  item_key        TEXT NOT NULL,
  drive_file_id   TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed', 'skipped', 'simulated')),
  old_name        TEXT,
  new_name        TEXT,
  file_url        TEXT,
  error_reason    TEXT,
  raw_gemini      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jas_job_items_job ON jas_job_items(job_id);
CREATE INDEX IF NOT EXISTS idx_jas_job_items_status ON jas_job_items(status);

-- Unique index parsial pada drive_file_id untuk status 'done' (mencegah rename ganda saat rerun)
CREATE UNIQUE INDEX IF NOT EXISTS uq_jas_job_items_done 
ON jas_job_items(drive_file_id) 
WHERE status = 'done';

ALTER TABLE jas_job_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='jas_job_items' AND policyname='deny_public_jas_job_items') THEN
    CREATE POLICY "deny_public_jas_job_items" ON jas_job_items FOR ALL TO public USING (false);
  END IF;
END $$;
