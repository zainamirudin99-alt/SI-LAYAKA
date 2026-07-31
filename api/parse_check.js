/**
 * api/parse_check.js — Fine-grained bisection between lines 200-500
 * DELETE this file after debugging is complete.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function tryParse(code) {
  try { new vm.Script(code); return null; }
  catch (e) { return e.message; }
}

function diagnoseFail(code) {
  const base = tryParse(code);
  if (!base) return 'OK';
  return {
    error: base.substring(0, 70),
    fixWith_brace:    tryParse(code + '\n}') === null ? 'YES' : 'no',
    fixWith_2braces:  tryParse(code + '\n}\n}') === null ? 'YES' : 'no',
    fixWith_comment:  tryParse(code + '\n*/') === null ? 'YES' : 'no',
    fixWith_backtick: tryParse(code + '\n`') === null ? 'YES' : 'no',
    fixWith_sq:       tryParse(code + "\n'") === null ? 'YES' : 'no',
    fixWith_dq:       tryParse(code + '\n"') === null ? 'YES' : 'no',
  };
}

module.exports = async function handler(req, res) {
  try {
    const rpcPath = path.join(__dirname, 'rpc.js');
    const content = fs.readFileSync(rpcPath, 'utf8');
    const lines = content.split('\n');

    // Detailed checkpoint scan between lines 200 and 500
    const checkpoints = [];
    for (let cp = 200; cp <= 500; cp += 10) checkpoints.push(cp);
    // Add specific single lines around the first diff area
    for (let cp = 200; cp <= 230; cp++) checkpoints.push(cp);
    checkpoints.sort((a, b) => a - b);

    const results = {};
    let lastGood = 200;
    let firstBad = null;

    for (const cp of [...new Set(checkpoints)]) {
      const partial = lines.slice(0, cp).join('\n');
      const ok = tryParse(partial) === null;
      if (ok) {
        lastGood = cp;
      } else if (!firstBad) {
        firstBad = cp;
      }
      if (cp <= 230 || (firstBad && cp <= firstBad + 20)) {
        results['line_' + cp] = ok ? 'OK' : diagnoseFail(partial);
      }
    }

    // Show context around firstBad
    let context = '';
    if (firstBad) {
      const ctxStart = Math.max(0, firstBad - 5);
      const ctxEnd = Math.min(lines.length, firstBad + 5);
      context = lines.slice(ctxStart, ctxEnd).map((l, i) => {
        const ln = ctxStart + 1 + i;
        return (ln === firstBad ? '>>>' : '   ') + ' ' + ln + ': ' + l;
      }).join('\n');
    }

    res.status(200).json({
      lastGoodLine: lastGood,
      firstBadLine: firstBad,
      context,
      lineDetails: results
    });
  } catch (e) {
    res.status(200).json({ fatal: e.message });
  }
};
