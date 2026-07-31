/**
 * api/parse_check.js — Syntax checker for api/rpc.js
 * Uses vm.Script to compile JavaScript exactly like Node.js module loader.
 * DELETE this file after debugging is complete.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function tryParse(code) {
  try { new vm.Script(code); return null; }
  catch (e) { return e.message; }
}

module.exports = async function handler(req, res) {
  try {
    const rpcPath = path.join(__dirname, 'rpc.js');
    const content = fs.readFileSync(rpcPath, 'utf8');
    const totalLines = content.split('\n').length;
    const totalBytes = Buffer.byteLength(content, 'utf8');
    const fullError = tryParse(content);

    if (!fullError) {
      return res.status(200).json({ totalLines, totalBytes, status: 'FILE_PARSES_OK' });
    }

    // Detect what kind of unclosed construct exists by trying to add closing tokens
    const fixResults = {
      add_1_brace:           tryParse(content + '\n}') === null ? 'FIXES' : 'no',
      add_2_braces:          tryParse(content + '\n}\n}') === null ? 'FIXES' : 'no',
      add_3_braces:          tryParse(content + '\n}\n}\n}') === null ? 'FIXES' : 'no',
      add_block_comment_end: tryParse(content + '\n*/') === null ? 'FIXES' : 'no',
      add_backtick:          tryParse(content + '\n`') === null ? 'FIXES' : 'no',
      add_single_quote:      tryParse(content + "\n'") === null ? 'FIXES' : 'no',
      add_double_quote:      tryParse(content + '\n"') === null ? 'FIXES' : 'no',
      add_paren:             tryParse(content + '\n)') === null ? 'FIXES' : 'no',
      add_bracket:           tryParse(content + '\n]') === null ? 'FIXES' : 'no',
    };

    // Count brace depth line by line, tracking context properly
    const lines = content.split('\n');
    let depth = 0;
    let inStr = false, strCh = '', inBlock = false;
    const openBraceLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (let j = 0; j < line.length; j++) {
        const c = line[j];
        if (inBlock) {
          if (c === '*' && line[j+1] === '/') { inBlock = false; j++; }
          continue;
        }
        if (inStr) {
          if (c === '\\') { j++; continue; }
          if (c === strCh) inStr = false;
          continue;
        }
        if (c === '/' && line[j+1] === '/') break;
        if (c === '/' && line[j+1] === '*') { inBlock = true; j++; continue; }
        if (c === '"' || c === "'" || c === '`') { inStr = true; strCh = c; continue; }
        if (c === '{') { depth++; openBraceLines.push(i + 1); }
        if (c === '}') { depth--; if (openBraceLines.length > 0) openBraceLines.pop(); }
      }
    }

    res.status(200).json({
      totalLines,
      totalBytes,
      fullFileError: fullError,
      braceDepthAtEOF: depth,
      lastUnclosedBracesAtLines: openBraceLines.slice(-10),
      fixAttempts: fixResults
    });
  } catch (e) {
    res.status(200).json({ fatal: e.message });
  }
};
