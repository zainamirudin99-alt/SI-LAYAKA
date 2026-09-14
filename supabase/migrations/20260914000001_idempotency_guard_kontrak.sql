-- ==============================================================================
-- MIGRATION: 20260914000001_idempotency_guard_kontrak.sql
-- Kategori: Optimasi Konkurensi & Anti-Race Condition Menu Kontrak (300+ Pengguna)
-- Karakteristik: MURNI ADITIF (Index Parsial & Pengaman Idempotensi)
-- ==============================================================================

-- 1. Partial Unique Index untuk mencegah duplikasi usulan aktif pada NIP, Tahun, dan Layanan yang sama
--    Jika usulan berstatus 'Ditolak' atau 'closed_not_renewed', pegawai tetap dapat mengajukan usulan baru.
CREATE UNIQUE INDEX IF NOT EXISTS idx_usulan_kontrak_active_unique 
ON usulan_kontrak (nip, tahun, layanan) 
WHERE status NOT IN ('Ditolak', 'closed_not_renewed');

-- 2. Index pendukung untuk query status & atasan langsung pada konkurensi tinggi
CREATE INDEX IF NOT EXISTS idx_usulan_kontrak_nip_tahun_status 
ON usulan_kontrak (nip, tahun, status);

CREATE INDEX IF NOT EXISTS idx_usulan_kontrak_atasan_status 
ON usulan_kontrak (atasan_nip, status);
