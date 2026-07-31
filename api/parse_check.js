/**
 * api/parse_check.js — Binary search syntax checker for api/rpc.js
 * Uses vm.Script to compile JavaScript exactly like Node.js module loader.
 * DELETE this file after debugging is complete.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function tryParse(code) {
  try {
    new vm.Script(code);
    return null; // no error
  } catch (e) {
    return e.message;
  }
}

module.exports = async function handler(req, res) {
  try {
    const rpcPath = path.join(__dirname, 'rpc.js');
    const content = fs.readFileSync(rpcPath, 'utf8');
    const lines = content.split('\n');
    const totalLines = lines.length;
    const totalBytes = Buffer.byteLength(content, 'utf8');

    // First, check full file
    const fullError = tryParse(content);

    // Binary search: find the first line where syntax breaks
    let lo = 1, hi = totalLines, errorLine = totalLines;
    if (fullError) {
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        const partial = lines.slice(0, mid).join('\n');
        const err = tryParse(partial);
        if (err) {
          errorLine = mid;
          hi = mid;
        } else {
          lo = mid + 1;
        }
      }
    }

    // Grab surrounding context lines
    const contextStart = Math.max(0, errorLine - 5);
    const contextEnd = Math.min(totalLines, errorLine + 5);
    const context = lines.slice(contextStart, contextEnd).map((l, i) => {
      const ln = contextStart + i + 1;
      const marker = ln === errorLine ? '>>>' : '   ';
      return `${marker} ${ln}: ${l}`;
    });

    res.status(200).json({
      totalLines,
      totalBytes,
      fullFileError: fullError || 'NONE — file parses OK',
      binarySearchErrorLine: fullError ? errorLine : 'N/A',
      context: fullError ? context.join('\n') : 'N/A'
    });
  } catch (e) {
    res.status(200).json({ fatal: e.message, stack: e.stack });
  }
};
