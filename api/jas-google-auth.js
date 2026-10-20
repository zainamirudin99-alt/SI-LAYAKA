/**
 * api/jas-google-auth.js — Vercel Serverless Function
 * Mengarahkan admin/superadmin ke consent screen Google OAuth
 */

const { isJasRole } = require('./jas-core');
const jwt = require('jsonwebtoken');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const token = req.query.token || (req.headers.authorization && req.headers.authorization.replace(/^Bearer\s+/, ''));
  if (!token) {
    return res.status(401).send('<h3>401 Unauthorized: Sesi tidak ditemukan. Silakan login ke SI-LAYAKA terlebih dahulu.</h3>');
  }

  const jwtSecret = process.env.JWT_SECRET || 'simpeg-secret-change-me-in-env';
  let decoded;
  try {
    decoded = jwt.verify(token, jwtSecret);
  } catch (err) {
    return res.status(401).send('<h3>401 Unauthorized: Sesi telah kedaluwarsa atau tidak valid. Silakan login kembali.</h3>');
  }

  if (!decoded || !isJasRole(decoded.role)) {
    return res.status(403).send('<h3>403 Forbidden: Layanan JAS hanya dapat diakses oleh Admin atau Superadmin.</h3>');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(500).send('<h3>500 Error: GOOGLE_CLIENT_ID belum dikonfigurasi pada environment variables Vercel.</h3>');
  }

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const redirectUri = `${proto}://${host}/api/jas-google-callback`;

  // Encode state dengan NIP admin dan timestamp untuk CSRF protection
  const statePayload = { nip: decoded.nip, ts: Date.now() };
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

  // Jika client meminta format JSON
  if (req.query.format === 'json') {
    return res.json({ success: true, url: authUrl });
  }

  // Redirect langsung
  return res.redirect(302, authUrl);
};
