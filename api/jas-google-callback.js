/**
 * api/jas-google-callback.js — Vercel Serverless Function
 * Callback Google OAuth untuk menerima authorization code dan menyimpan token di Supabase.
 */

const { exchangeGoogleAuthCode } = require('./jas-core');
let createClient;
try { ({ createClient } = require('@supabase/supabase-js')); } catch(e) { createClient = null; }

function getDbClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !key || typeof createClient !== 'function') return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

module.exports = async function handler(req, res) {
  const { code, state, error: oauthErr } = req.query;

  if (oauthErr) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Otorisasi Dibatalkan</title><meta charset="utf-8"></head>
      <body style="font-family:sans-serif;text-align:center;padding:40px;">
        <h2 style="color:#ef4444;">❌ Otorisasi Google Dibatalkan</h2>
        <p>Alasan: ${String(oauthErr)}</p>
        <button onclick="window.close()" style="padding:10px 20px;cursor:pointer;">Tutup Jendela</button>
      </body>
      </html>
    `);
  }

  if (!code || !state) {
    return res.status(400).send('<h3>400 Bad Request: Parameter code atau state tidak ditemukan.</h3>');
  }

  let stateData;
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
  } catch (e) {
    return res.status(400).send('<h3>400 Bad Request: State parameter tidak valid.</h3>');
  }

  const ownerNip = stateData.nip;
  if (!ownerNip) {
    return res.status(400).send('<h3>400 Bad Request: NIP pemilik sesi tidak ditemukan dalam state.</h3>');
  }

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const redirectUri = `${proto}://${host}/api/jas-google-callback`;

  try {
    const tokens = await exchangeGoogleAuthCode(code, redirectUri);

    // Ambil info profil Google (email) untuk display
    let googleEmail = null;
    try {
      const uRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });
      if (uRes.ok) {
        const uData = await uRes.json();
        googleEmail = uData.email || null;
      }
    } catch (_) {}

    const db = getDbClient();
    if (!db) {
      throw new Error('Koneksi basis data Supabase tidak tersedia.');
    }

    // Upsert ke tabel jas_google_tokens
    const { error: dbErr } = await db.from('jas_google_tokens').upsert({
      owner_id: String(ownerNip),
      email: googleEmail,
      tokens: tokens,
      updated_at: new Date().toISOString()
    }, { onConflict: 'owner_id' });

    if (dbErr) {
      throw new Error(`Gagal menyimpan token ke database: ${dbErr.message}`);
    }

    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Drive Terhubung</title>
        <meta charset="utf-8">
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; text-align: center; }
          .card { background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 32px; max-width: 440px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); backdrop-filter: blur(12px); }
          .icon { font-size: 48px; margin-bottom: 12px; }
          h2 { margin: 0 0 8px 0; color: #34d399; }
          p { color: #94a3b8; font-size: 14px; margin: 0 0 24px 0; }
          button { background: #3b82f6; color: white; border: none; padding: 10px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✅</div>
          <h2>Google Drive Terhubung!</h2>
          <p>Akun Google <strong>${googleEmail || 'Anda'}</strong> berhasil dihubungkan untuk layanan JAS.</p>
          <button onclick="window.close()">Tutup Jendela Ini</button>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'JAS_GOOGLE_CONNECTED', email: ${JSON.stringify(googleEmail)} }, '*');
            setTimeout(function() { window.close(); }, 1500);
          }
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('[jas-google-callback] Error:', err.message);
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Gagal Menghubungkan Google</title><meta charset="utf-8"></head>
      <body style="font-family:sans-serif;text-align:center;padding:40px;">
        <h2 style="color:#ef4444;">❌ Gagal Menghubungkan Google Drive</h2>
        <p>${err.message}</p>
        <button onclick="window.close()" style="padding:10px 20px;cursor:pointer;">Tutup</button>
      </body>
      </html>
    `);
  }
};
