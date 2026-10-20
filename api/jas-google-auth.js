/**
 * api/jas-google-auth.js — Vercel Serverless Function
 * Mengarahkan admin/superadmin ke consent screen Google OAuth
 */

const { isJasRole } = require('./jas-core');
let jwt;
try { jwt = require('jsonwebtoken'); } catch (_) { jwt = null; }

function decodeTokenSafe(token, secret) {
  if (jwt && typeof jwt.verify === 'function') {
    try {
      return jwt.verify(token, secret);
    } catch (_) {}
  }
  if (typeof token === 'string' && token.includes('.')) {
    const parts = token.split('.');
    if (parts.length === 3) {
      try {
        return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      } catch (_) {}
    } else if (parts[0] === 'simpeg') {
      return { nip: parts[1] || '', role: 'normal' };
    }
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const token = req.query.token || (req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/, ''));
  if (!token) {
    return res.status(401).send('<h3>401 Unauthorized: Sesi tidak ditemukan. Silakan login ke SI-LAYAKA terlebih dahulu.</h3>');
  }

  const jwtSecret = process.env.JWT_SECRET || 'simpeg-secret-change-me-in-env';
  const decoded = decodeTokenSafe(token, jwtSecret);
  if (!decoded) {
    return res.status(401).send('<h3>401 Unauthorized: Sesi telah kedaluwarsa atau tidak valid. Silakan login kembali.</h3>');
  }

  if (!isJasRole(decoded.role)) {
    return res.status(403).send('<h3>403 Forbidden: Layanan JAS hanya dapat diakses oleh Admin atau Superadmin.</h3>');
  }

  let createClient;
  try { ({ createClient } = require('@supabase/supabase-js')); } catch(e) { createClient = null; }

  let clientId = (req.query.clientId && String(req.query.clientId).trim()) || process.env.GOOGLE_CLIENT_ID;
  let clientSecret = (req.query.clientSecret && String(req.query.clientSecret).trim()) || process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    try {
      const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
      if (url && key && typeof createClient === 'function') {
        const db = createClient(url, key, { auth: { persistSession: false } });
        const { data: row } = await db.from('jas_google_tokens').select('*').eq('owner_id', decoded.nip).maybeSingle();
        if (row && row.tokens) {
          clientId = clientId || row.tokens.client_id;
          clientSecret = clientSecret || row.tokens.client_secret;
        }
      }
    } catch (_) {}
  }

  if (!clientId || !clientSecret) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Kredensial Belum Dikonfigurasi</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px 20px; text-align: center; }
          .card { max-width: 520px; margin: 0 auto; background: #1e293b; border-radius: 16px; padding: 32px 24px; border: 1px solid #334155; box-shadow: 0 10px 25px rgba(0,0,0,0.4); }
          h2 { color: #f59e0b; margin-top: 0; font-size: 20px; }
          p { color: #94a3b8; font-size: 13.5px; line-height: 1.6; }
          .btn { display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 10px 22px; border-radius: 8px; font-weight: 600; font-size: 13.5px; cursor: pointer; border: none; margin-top: 16px; }
          .btn:hover { background: #1d4ed8; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>⚠️ Kredensial Google Belum Diisi</h2>
          <p>
            Google Client ID dan Client Secret belum dimasukkan. Anda dapat memasukkannya langsung melalui tombol <strong>"⚙️ Atur Kredensial"</strong> pada kartu Google Drive di menu <strong>Job Automation Suite (JAS)</strong>.
          </p>
          <button class="btn" onclick="window.close()">Tutup Jendela Ini</button>
        </div>
      </body>
      </html>
    `);
  }

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const redirectUri = `${proto}://${host}/api/jas-google-callback`;

  // Encode state dengan NIP admin, custom credentials, dan timestamp untuk CSRF protection
  const statePayload = {
    nip: decoded.nip,
    clientId: clientId,
    clientSecret: clientSecret,
    ts: Date.now()
  };
  const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets',
    access_type: 'offline',
    prompt: 'consent',
    state: state
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  if (req.query.format === 'json') {
    return res.json({ success: true, url: authUrl });
  }

  return res.redirect(302, authUrl);
};
