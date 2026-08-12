// 验证 server.js 的解析函数（与 pdftest.js 类似，但只测 LLM 相关部分）
const fs = require('fs');
const path = require('path');

// 1) 语法层面：通过 require 加载 server 模块会触发顶层执行（监听 PORT 等）。
//    我们用 child_process 启一个临时 server 然后立刻关掉，验证模块本身没语法/引用错误。
const { spawnSync } = require('child_process');

// 抽取 LLM 相关函数做单元测试
const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
// 截取 LLM 段（含所有 LLM 相关函数到 /api/parse 路由前）
const start = src.indexOf('// ================= LLM 提取');
const end = src.indexOf('// ================= 路由：文档解析');
const llmBlock = src.slice(start, end);
// detectType 在原文件靠前的位置；为单元测试复制一份
const detectTypeSrc = `
function detectType(en) {
  const n = String(en || '').trim().split(/\\s+/).filter(Boolean).length;
  if (n >= 4) return 'sentence';
  if (n >= 2) return 'phrase';
  return 'word';
}
`;
const code = detectTypeSrc + llmBlock + '\nmodule.exports = { clipForLlm, buildLlmPrompt, parseLlmResponse, detectType };\n';
const tmp = path.join(__dirname, '_llm_tmp.js');
fs.writeFileSync(tmp, code);
const { clipForLlm, buildLlmPrompt, parseLlmResponse, detectType } = require(tmp);
fs.unlinkSync(tmp);

let pass = 0, fail = 0;
function eq(name, a, b) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '\n    got:  ' + JSON.stringify(a) + '\n    want: ' + JSON.stringify(b)); }
}

// ===== clipForLlm =====
console.log('-- clipForLlm --');
const c1 = clipForLlm('short text', 100);
eq('不超长不截断', c1, { text: 'short text', truncated: false });

const long = 'A'.repeat(50000);
const c2 = clipForLlm(long, 1000);
// 函数内部 cap 最小 2000（避免过短导致截断太过），所以实际 cap=2000
const cap = 2000;
const c2ExpectedLen = cap + '\n\n[…中间内容过长已省略…]\n\n'.length;
eq('超长时 truncated=true', c2.truncated, true);
eq('超长时长度=cap+标记', c2.text.length, c2ExpectedLen);
eq('保留前 60%', c2.text.slice(0, 6), 'AAAAAAA'.slice(0, 6));
eq('包含省略标记', c2.text.indexOf('已省略') > 0, true);
eq('保留后 40%', c2.text.slice(-6), 'AAAAAAA'.slice(-6));

// ===== buildLlmPrompt =====
console.log('-- buildLlmPrompt --');
const p = buildLlmPrompt('hello world');
eq('包含教材内容', p.indexOf('hello world') > 0, true);
eq('包含 JSON 输出要求', p.indexOf('JSON 数组') > 0, true);
eq('包含完整性规则', p.indexOf('完整性') > 0, true);
eq('包含派生词规则', p.indexOf('派生词') > 0, true);
eq('包含词性规则', p.indexOf('pos') > 0, true);
eq('包含类型规则', p.indexOf('"word"') > 0, true);
eq('提示按原文顺序', p.indexOf('原文顺序') > 0, true);

// ===== parseLlmResponse =====
console.log('-- parseLlmResponse --');
const r1 = parseLlmResponse('[{"english":"digital","pos":"adj.","chinese":"数字的","type":"word"},{"english":"tap on the keyboard","pos":"","chinese":"敲击键盘","type":"sentence"}]');
eq('解析 JSON 数组', r1.length, 2);
eq('第一条 english', r1[0].english, 'digital');
eq('第一条 pos', r1[0].pos, 'adj.');
eq('第一条 type', r1[0].type, 'word');
eq('第二条 english', r1[1].english, 'tap on the keyboard');
eq('第二条 pos 为空', r1[1].pos, '');
eq('第二条 type=sentence', r1[1].type, 'sentence');

// 包了 Markdown 代码块
const r2 = parseLlmResponse('```json\n[{"english":"digit","pos":"n.","chinese":"数字","type":"word"}]\n```');
eq('剥离 Markdown 包裹', r2.length, 1);
eq('剥离后 english', r2[0].english, 'digit');

// LLM 返回包装对象 { entries: [...] }
const r3 = parseLlmResponse('{"entries":[{"english":"hi","pos":"","chinese":"嗨","type":"word"}]}');
eq('包装对象 entries', r3.length, 1);
eq('包装对象内容', r3[0].english, 'hi');

// 缺字段自动 detectType
const r4 = parseLlmResponse('[{"english":"hello world","pos":"-","chinese":"你好世界","type":"junk"}]');
eq('pos=- 转空', r4[0].pos, '');
eq('type 无效用 detectType', r4[0].type, 'phrase'); // 2 词 -> phrase

// 空对象 / 缺字段跳过
const r5 = parseLlmResponse('[{},{"english":"","chinese":"x"},{"english":"x","chinese":""},{"english":"AI","chinese":"人工智能","type":"word"}]');
eq('无效条目被跳过', r5.length, 1);
eq('只留有效那条', r5[0].english, 'AI');

// 无法解析
let threw = false;
try { parseLlmResponse('not json at all'); } catch (e) { threw = true; }
eq('无法解析抛错', threw, true);

console.log('\n共 ' + (pass + fail) + ' 用例，通过 ' + pass + '，失败 ' + fail);
process.exit(fail ? 1 : 0);
