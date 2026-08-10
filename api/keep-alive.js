/**
 * api/keep-alive.js — Supabase Auto Keep-Alive Cron Endpoint
 *
 * Diisi otomatis oleh Vercel Cron Job setiap hari pukul 02:00 UTC.
 * Menjalankan 1 query read sangat ringan ke Supabase untuk menjaga project
 * tetap aktif dan menghindari auto-pause (inactivity 7 hari) dari Supabase Free Tier.
 */

let createClient;
try {
  ({ createClient } = require('@supabase/supabase-js'));
} catch (e) {
  createClient = null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Content-Type', 'application/json');

  if (!createClient) {
    return res.status(500).json({
      success: false,
      message: '@supabase/supabase-js library not available.'
    });
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!url || !key) {
    return res.status(200).json({
      success: false,
      message: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured in environment variables.'
    });
  }

  try {
    const db = createClient(url, key);
    // Query ultra-ringan 1 baris
    const { data, error } = await db.from('users').select('id').limit(1);

    if (error) {
      // Jika tabel users beda nama, coba tabel usulan_kontrak
      const { data: d2, error: e2 } = await db.from('usulan_kontrak').select('id').limit(1);
      if (e2) {
        return res.status(500).json({
          success: false,
          error: error.message || e2.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Supabase keep-alive ping successful. Database project is active.',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
};
