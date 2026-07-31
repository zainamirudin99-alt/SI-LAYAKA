/**
 * api/parse_check.js — Find actual missing brace using vm.Script bisection on known boundaries
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
    const lines = content.split('\n');
    const N = lines.length;

    // Test known structural boundaries using vm.Script (100% accurate)
    // These are key lines where the file structure changes
    const checkpoints = [100, 200, 500, 1000, 1500, 1738, 2000, 3000, 4000, 5000, 6000, 6137, 6200, 6400, 6500, 6550, 6600, 6630, 6650, 6659];
    
    const results = {};
    for (const cp of checkpoints) {
      if (cp > N) continue;
      const partial = lines.slice(0, cp).join('\n');
      const err = tryParse(partial + '\n// EOF');
      // Check if adding } fixes it
      const errPlusBrace = tryParse(partial + '\n}\n// EOF');
      results['line_' + cp] = {
        parses: !err,
        needsClosingBrace: !err ? false : (errPlusBrace === null),
        error: err ? err.substring(0, 60) : null
      };
    }

    // Binary search between the two consecutive checkpoints where it breaks
    let breakStart = 0, breakEnd = N;
    const sortedCPs = checkpoints.filter(cp => cp <= N).sort((a, b) => a - b);
    for (let i = 0; i < sortedCPs.length - 1; i++) {
      const cpA = sortedCPs[i];
      const cpB = sortedCPs[i + 1];
      const errA = tryParse(lines.slice(0, cpA).join('\n') + '\n// EOF');
      const errB = tryParse(lines.slice(0, cpB).join('\n') + '\n// EOF');
      if (!errA && errB) {
        breakStart = cpA;
        breakEnd = cpB;
        break;
      }
    }

    // Fine-grained binary search between breakStart and breakEnd
    let lo = breakStart, hi = breakEnd;
    while (lo < hi - 1) {
      const mid = Math.floor((lo + hi) / 2);
      const partial = lines.slice(0, mid).join('\n') + '\n// EOF';
      if (!tryParse(partial)) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    // Show context around the breakpoint
    const contextLines = lines.slice(Math.max(0, lo - 3), Math.min(N, lo + 8));
    const context = contextLines.map((l, i) => {
      const ln = Math.max(1, lo - 2) + i;
      const marker = ln === lo + 1 ? '>>>' : '   ';
      return `${marker} ${ln}: ${l}`;
    }).join('\n');

    res.status(200).json({
      totalLines: N,
      structureCheckpoints: results,
      breaksBetweenLines: { from: breakStart, to: breakEnd },
      exactBreakAfterLine: lo,
      problemStartsAtLine: lo + 1,
      context
    });
  } catch (e) {
    res.status(200).json({ fatal: e.message, stack: e.stack });
  }
};
