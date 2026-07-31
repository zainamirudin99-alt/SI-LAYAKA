/**
 * api/parse_check.js — Find the extra closing brace in api/rpc.js
 * DELETE this file after debugging is complete.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  try {
    const rpcPath = path.join(__dirname, 'rpc.js');
    const content = fs.readFileSync(rpcPath, 'utf8');
    const lines = content.split('\n');

    let depth = 0;
    let inStr = false, strCh = '', inBlock = false;
    let firstNegativeLine = null;
    let firstNegativeContext = [];
    const depthByLine = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const prevDepth = depth;
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
        if (c === '{') depth++;
        if (c === '}') depth--;
        // Track first time depth goes below 0
        if (depth < 0 && firstNegativeLine === null) {
          firstNegativeLine = i + 1;
          firstNegativeContext = lines.slice(Math.max(0, i-5), i+6).map((l, k) => {
            const ln = Math.max(1, i-4) + k;
            return (ln === i+1 ? '>>>' : '   ') + ' ' + ln + ': ' + l;
          });
        }
      }
      // Track depth at each line for analysis (only near problem area)
      if (depth < 0 || (firstNegativeLine && i < firstNegativeLine + 10)) {
        depthByLine.push({ line: i+1, depth, content: line.substring(0, 80) });
      }
    }

    res.status(200).json({
      totalLines: lines.length,
      finalDepth: depth,
      firstExtraClosingBraceAtLine: firstNegativeLine,
      context: firstNegativeContext.join('\n'),
      depthTrace: depthByLine.slice(0, 20)
    });
  } catch (e) {
    res.status(200).json({ fatal: e.message });
  }
};
