const fs = require('fs');

function checkFile(name) {
  const buf = fs.readFileSync(name);
  console.log(`${name}: length=${buf.length}`);
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    console.log(`  UTF-16 LE BOM`);
  } else if (buf[0] === 0xfe && buf[1] === 0xff) {
    console.log(`  UTF-16 BE BOM`);
  } else if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    console.log(`  UTF-8 BOM`);
  } else {
    console.log(`  UTF-8 or ASCII (no BOM)`);
  }
}

checkFile('Index v2.txt');
checkFile('Stylesheet v1.txt');
checkFile('Logo.txt');
checkFile('JavaScriptClient v2.txt');
