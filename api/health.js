/**
 * api/health.js — Diagnostic endpoint untuk debugging Vercel environment
 * Hapus file ini setelah masalah teratasi
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const checks = {};

  // 1. Check require modules
  try { require('@supabase/supabase-js'); checks.supabase_module = 'OK'; }
  catch(e) { checks.supabase_module = 'FAIL: ' + e.message; }

  try { require('jsonwebtoken'); checks.jwt_module = 'OK'; }
  catch(e) { checks.jwt_module = 'FAIL: ' + e.message; }

  try { require('pizzip'); checks.pizzip_module = 'OK'; }
  catch(e) { checks.pizzip_module = 'FAIL: ' + e.message; }

  try { require('docxtemplater'); checks.docxtemplater_module = 'OK'; }
  catch(e) { checks.docxtemplater_module = 'FAIL: ' + e.message; }

  try { require('xlsx'); checks.xlsx_module = 'OK'; }
  catch(e) { checks.xlsx_module = 'FAIL: ' + e.message; }

  // 2. Check environment variables (value masked)
  checks.SUPABASE_URL = process.env.SUPABASE_URL ? 'SET (' + (process.env.SUPABASE_URL.startsWith('https://') ? 'valid URL' : 'invalid URL') + ')' : 'NOT SET';
  checks.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET (length=' + process.env.SUPABASE_SERVICE_ROLE_KEY.length + ')' : 'NOT SET';
  checks.GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL ? 'SET' : 'NOT SET';
  checks.JWT_SECRET = process.env.JWT_SECRET ? 'SET' : 'NOT SET (will use default)';

  // 3. Node.js info
  checks.node_version = process.version;
  checks.platform = process.platform;

  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString(), checks });
};
