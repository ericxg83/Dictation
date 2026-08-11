const fs = require('fs');
const { pathToFileURL } = require('url');
const path = require('path');

// 从 server.js 抽取解析函数到一个临时文件，再 require
const fs2 = require('fs');
const path2 = require('path');
// pathToFileURL 已经在顶部 require 过
const serverSrc = fs2.readFileSync(path2.join(__dirname, 'server.js'), 'utf8');
// 过滤 pdfjs 字体警告（"Warning: Ran out of space in font private use area"）
const _origWarn = console.warn;
console.warn = function (...args) {
  const msg = args.join(' ');
  if (/Ran out of space in font private use area/i.test(msg)) return;
  _origWarn.apply(console, args);
};
// keyOf 在前，extractWithPdfjs 在后，一起截到 parse 路由前
const startFns = serverSrc.indexOf('function keyOf');
const endFns = serverSrc.indexOf('// ================= 路由');
// 注入 path 变量供 extractWithPdfjs 使用（它在 server.js 顶部 require，这里没有）
const code = 'const path = require("path");\n' +
  serverSrc.slice(startFns, endFns) +
  '\nmodule.exports = { extractPdfText, parseLines, usable, dedupe, normalizePosSpaces, splitEntry, cleanEnglish, cleanChinese, detectType, extractPos, keyOf, SECTION_RE };\n';
const tmpFile = path2.join(__dirname, '_parser_tmp.js');
fs2.writeFileSync(tmpFile, code);
const { extractPdfText, parseLines, usable, dedupe } = require(tmpFile);
fs2.unlinkSync(tmpFile);

(async () => {
  const proj = 'D:/英语默写';
  const buf = fs.readFileSync('C:/Users/Administrator/Downloads/8A_U2_A.pdf');
  // 用 server.js 实际的 extractPdfText 函数
  const text = await extractPdfText(buf);
  console.log('---- 提取出的原始文本（前 4000 字符）----');
  console.log(text.slice(0, 4000));
  console.log('---- 总长度：' + text.length + ' 字符 ----');

  const candidates = parseLines(text);
  console.log('raw candidates:', candidates.length);
  const entries = dedupe(candidates);
  console.log('usable entries:', entries.length);
  entries.slice(0, 80).forEach(e => console.log('  ' + e.type + '\t' + e.english + '\t[' + (e.pos||'') + '] ' + e.chinese));
})();
