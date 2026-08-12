const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');
const { Client } = require('pg');

// 本地开发环境变量（生产环境用 Render 面板配置，此文件不提交 GitHub）
try { require('dotenv').config(); } catch (e) {}

const app = express();
const PORT = process.env.PORT || 3210;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ================= 数据库（Supabase PostgreSQL） =================
// 密码仅从环境变量读取，绝不硬编码进代码
const DB = {
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'postgres',
  ssl: { rejectUnauthorized: false }
};
if (!DB.host || !DB.user || !DB.password) {
  console.error('缺少数据库配置！请在 .env（本地）或 Render 环境变量里设置 PGHOST/PGUSER/PGPASSWORD');
  process.exit(1);
}

// 某些托管环境（如 Render 免费实例）IPv6 不可达，启动时把域名解析成 IPv4 地址再连接
const dns = require('dns');
let _dbHost = DB.host;
function getDbHost() { return _dbHost; }
async function resolveDbHost() {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(DB.host)) { _dbHost = DB.host; return; }
  try {
    const ips = await new Promise((res, rej) => dns.resolve4(DB.host, (e, a) => e ? rej(e) : res(a)));
    if (ips && ips.length) {
      _dbHost = ips[0];
      console.log('PG host 解析为 IPv4:', _dbHost);
    }
  } catch (e) {
    console.warn('PG IPv4 解析失败，使用原域名:', e.message);
  }
}
let _pg = null;
function pg() {
  if (!_pg) {
    _pg = new Client({ ...DB, host: getDbHost() });
    _pg.connect().catch(e => { console.error('PG 连接失败:', e.message); _pg = null; });
  }
  return _pg;
}
// 简单查询封装：连不上或失败时尝试重连一次
async function q(sql, params) {
  try {
    const r = await pg().query(sql, params);
    return r;
  } catch (e) {
    if (e.code === '57P01' || /Client has encountered a connection error/.test(e.message)) {
      try { await _pg.end(); } catch (e2) {}
      _pg = null;
      const r = await pg().query(sql, params);
      return r;
    }
    throw e;
  }
}

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 50 * 1024 * 1024 } });

app.use(express.json({ limit: '10mb' }));
app.use(express.static(PUBLIC_DIR));

// ================= 基础存储工具 =================
function genId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function keyOf(en) { return (en || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

// ---- 用户 ----
async function dbAllUsers() { return (await q('SELECT * FROM users')).rows; }
async function dbFindUser(by, val) { return (await q('SELECT * FROM users WHERE ' + by + ' = $1', [val])).rows[0] || null; }
async function dbInsertUser(u) {
  await q('INSERT INTO users (id, username, salt, password, role, class_id, pet, name, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [u.id, u.username, u.salt, u.password, u.role, u.classId || null, JSON.stringify(u.pet || null), u.name || null, u.createdAt]);
}
async function dbUpdateUser(u) {
  await q('UPDATE users SET username=$2, salt=$3, password=$4, role=$5, class_id=$6, pet=$7, name=$8 WHERE id=$1',
    [u.id, u.username, u.salt, u.password, u.role, u.class_id || u.classId || null, JSON.stringify(u.pet || null), u.name || null]);
}

// ---- 会话 ----
async function dbAllSessions() { return (await q('SELECT token, user_id AS "userId", expires_at AS "expiresAt" FROM sessions')).rows; }
async function dbInsertSession(token, userId, expiresAt) { await q('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1,$2,$3)', [token, userId, expiresAt]); }
async function dbDeleteSession(token) { await q('DELETE FROM sessions WHERE token = $1', [token]); }

// ---- 班级 ----
async function dbAllClasses() { return (await q('SELECT id, name, code, teacher_id AS "teacherId", created_at AS "createdAt" FROM classes')).rows; }
async function dbInsertClass(cls) { await q('INSERT INTO classes (id, name, code, teacher_id, created_at) VALUES ($1,$2,$3,$4,$5)', [cls.id, cls.name, cls.code, cls.teacherId || null, cls.createdAt]); }

// ---- 题库 ----
async function dbAllBanks() { return (await q('SELECT id, class_id AS "classId", title, entries, grade, updated_at AS "updatedAt" FROM banks')).rows; }
async function dbInsertBank(b) { await q('INSERT INTO banks (id, class_id, title, entries, grade, updated_at) VALUES ($1,$2,$3,$4,$5,$6)', [b.id, b.classId, b.title, JSON.stringify(b.entries || []), b.grade || null, b.updatedAt]); }
async function dbUpdateBank(b) { await q('UPDATE banks SET class_id=$2, title=$3, entries=$4, grade=$5, updated_at=$6 WHERE id=$1', [b.id, b.class_id || b.classId, b.title, JSON.stringify(b.entries || []), b.grade || null, b.updatedAt]); }
async function dbDeleteBank(id) { await q('DELETE FROM banks WHERE id = $1', [id]); }

// 启动时确保 banks 表有 grade 列（双保险：migrate-grade.js 之外，server 也兜底）
q("ALTER TABLE banks ADD COLUMN IF NOT EXISTS grade TEXT").catch(e => console.warn('banks.grade 兜底迁移失败：', e.message));
q("CREATE INDEX IF NOT EXISTS idx_banks_grade ON banks (class_id, grade)").catch(e => {});

// 年级分类：6/7/8/9 年级，null/空 表示未分类（兼容旧题库）
const GRADES = ['6', '7', '8', '9'];
function normalizeGrade(g) {
  if (g == null || g === '') return null;
  const s = String(g).trim();
  return GRADES.indexOf(s) !== -1 ? s : null;
}

// ---- 进度 ----
async function dbFindProgress(userId) { return (await q('SELECT user_id AS "userId", entries, stats, created_at AS "createdAt" FROM progress WHERE user_id = $1', [userId])).rows[0] || null; }
async function dbUpsertProgress(userId, entries, stats, createdAt) {
  await q('INSERT INTO progress (user_id, entries, stats, created_at) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id) DO UPDATE SET entries=EXCLUDED.entries, stats=EXCLUDED.stats',
    [userId, JSON.stringify(entries), JSON.stringify(stats), createdAt]);
}

// ================= 认证 =================
function hashPwd(pwd, salt) { return crypto.scryptSync(String(pwd), salt, 32).toString('hex'); }
async function createSession(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  await dbInsertSession(token, userId, Date.now() + 30 * 24 * 3600 * 1000);
  return token;
}
async function getSessionUser(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
  if (!token) return null;
  const s = (await q('SELECT * FROM sessions WHERE token = $1', [token])).rows[0];
  if (!s || s.expires_at < Date.now()) return null;
  return (await q('SELECT * FROM users WHERE id = $1', [s.user_id])).rows[0] || null;
}
function requireAuth(req, res, next) {
  getSessionUser(req).then(u => {
    if (!u) return res.status(401).json({ error: '未登录或登录已过期，请重新登录' });
    req.user = u;
    req.token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query.token;
    next();
  });
}
function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) return res.status(403).json({ error: '无权限操作' });
    next();
  };
}
function publicUser(u) { return { id: u.id, username: u.username, name: u.name || u.username, role: u.role, classId: u.class_id || u.classId || null, pet: u.pet || null }; }
async function getClassInfo(u) {
  if (!u.class_id) return null;
  return (await q('SELECT id, name, code, teacher_id AS "teacherId" FROM classes WHERE id = $1', [u.class_id])).rows[0] || null;
}
async function genClassCode() {
  const used = new Set((await dbAllClasses()).map(c => c.code));
  let code;
  do { code = String(Math.floor(100000 + Math.random() * 900000)); } while (used.has(code));
  return code;
}

// ================= 学习进度 =================
// 艾宾浩斯遗忘曲线：单位 = 天
const INTERVALS = [1, 2, 4, 7, 15, 30, 90, 180];
const DAY_MS = 86400000;

// 把 nextDue 对齐到目标日 00:00（按"天"计，避免小时粒度）
function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function nextDueAfterDays(days) {
  return startOfDay(Date.now() + days * DAY_MS);
}

function emptyProgress() {
  return {
    entries: [],
    stats: { points: 0, sessions: 0, history: {}, lastAt: null },
    createdAt: Date.now()
  };
}
async function loadProgress(uid) {
  const p = await dbFindProgress(uid);
  if (!p) return emptyProgress();
  const entries = (p.entries || []).map(e => {
    if (e && e.nextDue) e.nextDue = startOfDay(e.nextDue);
    return e;
  });
  return { entries, stats: p.stats || {}, createdAt: p.createdAt };
}
async function saveProgress(uid, p) {
  await dbUpsertProgress(uid, p.entries, p.stats, p.createdAt || Date.now());
}
async function initProgress(uid) {
  const p = await dbFindProgress(uid);
  if (!p) await dbUpsertProgress(uid, [], emptyProgress().stats, Date.now());
}

// 把题库条目同步进学生进度（新增未有的，保留已有的学习状态）
async function syncBankProgress(uid, bank) {
  const p = await loadProgress(uid);
  const byKey = new Map(p.entries.filter(e => e.bankId === bank.id).map(e => [e.key, e]));
  const now = Date.now();
  for (const be of bank.entries) {
    const key = keyOf(be.english) + '|' + (be.chinese || '').trim();
    if (byKey.has(key)) continue;
    p.entries.push({
      id: genId('p'), bankId: bank.id, key,
      english: be.english, chinese: be.chinese, pos: be.pos || '', type: be.type,
      level: 0, correctCount: 0, wrongCount: 0,
      lastResult: null, lastResultAt: null, nextDue: now
    });
  }
  await saveProgress(uid, p);
  return p;
}
function publicProgEntry(e) {
  return {
    id: e.id, bankId: e.bankId, english: e.english, chinese: e.chinese, pos: e.pos || '', type: e.type,
    level: e.level, correctCount: e.correctCount, wrongCount: e.wrongCount,
    lastResult: e.lastResult, nextDue: e.nextDue
  };
}

// ================= 文档解析 =================
const { pathToFileURL } = require('url');

async function extractWithPdfjs(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(
    __dirname, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs'
  )).href;
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    cMapUrl: pathToFileURL(path.join(__dirname, 'node_modules', 'pdfjs-dist', 'cmaps') + path.sep).href,
    cMapPacked: true,
    standardFontDataUrl: pathToFileURL(path.join(__dirname, 'node_modules', 'pdfjs-dist', 'standard_fonts') + path.sep).href
  }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const items = tc.items
      .map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5] }))
      .filter(it => it.str && it.str.trim() !== '');
    if (!items.length) continue;
    // 1) 按 y 坐标聚类成行（PDF 坐标系 y 向上为正，所以行内 y 接近）
    items.sort((a, b) => (b.y - a.y) || (a.x - b.x));
    const rows = [];
    let cur = [], curY = null;
    for (const it of items) {
      if (curY === null || Math.abs(it.y - curY) <= 6) { cur.push(it); curY = it.y; }
      else { rows.push(cur); cur = [it]; curY = it.y; }
    }
    if (cur.length) rows.push(cur);
    // 2) 每行按 x 排序，再按 x 间隙 > 40 切成"列"
    for (const row of rows) {
      row.sort((a, b) => a.x - b.x);
      const cells = [];
      let cell = [row[0]], prevX = row[0].x;
      for (let k = 1; k < row.length; k++) {
        if (row[k].x - prevX > 40) { cells.push(cell); cell = []; }
        cell.push(row[k]);
        prevX = row[k].x;
      }
      cells.push(cell);
      // 3) 每个单元格输出为一行
      cells.forEach(c => {
        const t = c.map(it => it.str).join('').replace(/\s+/g, ' ').trim();
        if (t) text += t + '\n';
      });
    }
    text += '\n';
  }
  return text;
}

// 文本质量评分：英文字母、中文字符加权，乱码符号扣分
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;
const CJK_PUNC_RE = /[\u3000-\u303f\uff00-\uffef\u2018\u2019\u201c\u201d]/;
function textQuality(text) {
  const s = String(text || '');
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  const cjk = (s.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
  const bad = (s.match(/[\uFFFD\uFFFE\uFFFF]/g) || []).length;
  const symbols = (s.match(/[^A-Za-z\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff00-\uffef\s0-9.,;:!?'"()\[\]\/\-]/g) || []).length;
  return { score: letters * 2 + cjk * 3 - bad * 10 - symbols, letters, cjk, bad, symbols };
}

async function extractPdfText(buffer) {
  const results = [];
  try { results.push({ name: 'pdfjs', text: await extractWithPdfjs(buffer) }); }
  catch (e) { console.error('pdfjs 提取失败:', e.message); }
  try {
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');
    const data = await pdfParse(buffer);
    results.push({ name: 'pdf-parse', text: data.text });
  } catch (e) { console.error('pdf-parse 提取失败:', e.message); }
  if (!results.length) throw new Error('无法从 PDF 中提取文字（可能是扫描版/图片型 PDF）');
  results.forEach(r => { r.q = textQuality(r.text); console.log('PDF 引擎 [' + r.name + '] 评分=' + r.q.score + ' 英文=' + r.q.letters + ' 中文=' + r.q.cjk + ' 乱码=' + r.q.bad); });
  results.sort((a, b) => b.q.score - a.q.score);
  return results[0].text;
}

function cleanEnglish(s) {
  s = String(s).replace(/[""«»]/g, '"').replace(/['']/g, "'").trim();
  // 去除开头的箭头、破折号、项目符号、特殊符号
  s = s.replace(/^[\s\-—•·*#→→■◆●○□▪▸►►►◆●►]+/, '');
  // 去除开头的序号
  s = s.replace(/^\(?\d{1,3}\)?[.\、,，:：)\]\s]+/, '');
  // 去除行内方括号标注如 [n]
  s = s.replace(/\[[A-Za-z]+\]/g, ' ');
  // 去除末尾多余的括号、箭头、特殊符号（先删括号，词性标注再用空格规则安全处理）
  s = s.replace(/[()（）)\]】》》>→■◆●○□▪▸►►]+$/g, '').trim();
  // 去除缩写注释如 (=application、(=application)
  s = s.replace(/\s*\(=\s*[A-Za-z]+\s*\)?\s*$/gi, '');
  // 去除末尾多余标点
  s = s.replace(/[.,，。;；:：!?！？]+\s*$/g, '').trim();
  s = s.replace(/\s{2,}/g, ' ').trim();
  // 去除有空格/句号分隔的词性标注（标准格式：complain v. / complain n. / study n./v.，词性前必须有空格或句号）
  // 注意：较长的词性（pron/prep/abbr/aux/modal）必须排在 n/v 之前，否则 they pron. 会被误删成 they pro
  const POS_B = '(?:pron|prep|abbr|aux|modal|conj|adj|adv|vt|vi|n|v|num|art|int)';
  s = s.replace(new RegExp('[\\s.]+' + POS_B + '\\.?(?:\\/' + POS_B + '\\.?)?\\s*$', 'gi'), '');
  // 去除末尾的行号/序号（如 "order number 10"、"immediately 13"，数字前必须有空格，避免误删 COVID-19 等）
  s = s.replace(/\s+\d+\.?\s*$/g, '');
  // 最终清理残留括号与标点
  s = s.replace(/[()（）)\]】》》>→.,，。;；:：!?！？]+$/g, '').trim();
  s = s.replace(/\s{2,}/g, ' ').trim();
  return s.trim();
}
function cleanChinese(s) {
  s = String(s).trim();
  s = s.replace(/^\(?\d{1,3}\)?[.\、,，:：)\]\s]+/, '');
  s = s.replace(/^[\s\-—•·*#]+/, '');
  // 去除开头残留的词性标注（如 "n. 麻烦"、"adj. 方便的"）
  s = s.replace(/^(n|v|vt|vi|adj|adv|prep|conj|pron|num|art|int|abbr|aux|modal)\.?\s*/i, '');
  // 去除派生词/变形注释：箭头 + 英文（如 "重复→repeated adj. 重复的" → "重复"）
  s = s.replace(/[\s→→]*→[\s]*[A-Za-z][\s\S]*$/g, '');
  // 去除开头的残留括号（如 "一对)..." 左侧丢失的左括号）
  s = s.replace(/^[()（）]+/, '');
  // 去除不配对的括号：扫描一遍，去掉没有对应左括号的右括号（如 "(屏幕)冻结" 的左括号被英文侧取走后留下的 ")"）
  let balance = 0;
  let out = '';
  for (const ch of s) {
    if (ch === '(' || ch === '（') { balance++; out += ch; }
    else if (ch === ')' || ch === '）') {
      if (balance > 0) { balance--; out += ch; }
      // 无配对左括号的右括号 → 丢弃
    } else out += ch;
  }
  s = out;
  // 去除末尾仍然不配对的括号
  while (/[)）]$/.test(s) && (s.match(/[)）]/g) || []).length > (s.match(/[/(（]/g) || []).length) {
    s = s.replace(/[)）]+$/, '');
  }
  // 去除末尾的行号/序号（如 "订单号10"、"好几次 11"、"技术支持团队12"）
  s = s.replace(/[\s]*\d+\.?\s*$/g, '');
  return s.trim();
}

// 在整段文本中，给粘连在单词后面的词性标签插入空格
// PDF 格式：complain n. 投诉 → 空格丢失后变成 complaintn.投诉
// 策略：找出每个 "字母串+句点" 的片段，若其整体是纯词性（pron./n. 等）则不动；
// 否则从词尾剥离最长的词性标签，剩余部分 >=3 个字母时拆成 "单词 词性"。
function normalizePosSpaces(text) {
  // 词性按长度从长到短排列，保证 pron. 优先于 n.
  const POS_LIST = ['pron', 'prep', 'abbr', 'aux', 'modal', 'conj', 'adj', 'adv', 'vt', 'vi', 'num', 'art', 'int', 'n', 'v'];
  return String(text).replace(/(?<![A-Za-z])[A-Za-z]{3,}\./gi, function(run) {
    const body = run.slice(0, -1).toLowerCase();
    // 整体就是纯词性标注（如 pron. / n. / adj.），保持原样
    if (POS_LIST.indexOf(body) !== -1) return run;
    for (const p of POS_LIST) {
      if (body.length > p.length && body.endsWith(p)) {
        const word = run.slice(0, -1 - p.length);
        if (/[A-Za-z]{3,}$/.test(word)) return word + ' ' + p + '.';
      }
    }
    return run;
  });
}
function splitEntry(line) {
  line = String(line).trim();
  // 过滤纯注释行：以 ( 或 (= 开头，或包含 → 的变形注释（froze—frozen、frozen）
  if (/^\([=]?/i.test(line) && !/[A-Za-z]+\s+[A-Za-z]+\s+/i.test(line)) return null;
  if (/^[=(].{0,2}[A-Za-z]/.test(line) && /\(.*\)/.test(line) && !/[\u4e00-\u9fff]/.test(line)) return null;
  const cjk = line.search(/[\u4e00-\u9fff]/);
  const eng = line.search(/[A-Za-z]/);
  if (cjk === -1 && eng === -1) return null;
  if (cjk === -1) return { en: cleanEnglish(line), zh: '', pos: extractPos(line) };
  if (eng === -1) return { en: '', zh: cleanChinese(line), pos: '' };
  if (eng < cjk) {
    const rawEn = line.slice(0, cjk);
    const rawZh = line.slice(cjk);
    // 英文部分以 ( 开头说明是注释行，过滤
    if (/^\([=]?/.test(rawEn)) return null;
    return { en: cleanEnglish(rawEn), zh: cleanChinese(rawZh), pos: extractPos(rawEn) };
  }
  return { en: cleanEnglish(line.slice(eng)), zh: cleanChinese(line.slice(0, eng)), pos: '' };
}
// 提取词性标注（如 complain v. → v；complaint n. → n；study n./v. → n./v.），未标注返回 ''
function extractPos(rawEn) {
  const m = String(rawEn).trim().match(/(?:^|\s)((?:n|v|vt|vi|adj|adv|prep|conj|pron|num|art|int|abbr|aux|modal)\.[\/\.]*(?:n|v|vt|vi|adj|adv|prep|conj|pron|num|art|int|abbr|aux|modal)\.?|(?:n|v|vt|vi|adj|adv|prep|conj|pron|num|art|int|abbr|aux|modal)\.?)$/i);
  return m ? m[1].toLowerCase() : '';
}
function detectType(en) {
  const n = String(en || '').trim().split(/\s+/).filter(Boolean).length;
  if (n >= 4) return 'sentence';
  if (n >= 2) return 'phrase';
  return 'word';
}
const SECTION_RE = /^(单词|词组|短语|句子|句型|重点|难点|复习|背诵|默写|词汇|知识|梳理|听力|口语|写作|Unit\s*\d|第[一二三四五六七八九十\d]+单元|一|二|三|四|五|六|七|八|九|十|Words|Vocabulary|Phrases|Sentences|Grammar|Key|Focus|Review|Recite)\b/i;
function usable(e) {
  if (!e) return false;
  const en = (e.english || '').trim();
  const zh = (e.chinese || '').trim();
  if (!en || !zh) return false;
  if (en.length < 2 || zh.length < 1) return false;
  if (!/[A-Za-z]/.test(en)) return false;
  if (SECTION_RE.test(zh)) return false;
  // 英文侧是纯章节标题（无中文）
  if (SECTION_RE.test(en) && !/[\u4e00-\u9fff]/.test(en)) return false;
  // 过滤纯词性标注行（n. 麻烦）
  if (/^(n|v|vt|vi|adj|adv|prep|conj|pron|num|art|int|abbr|aux|modal)(\.\s*)?$/i.test(en)) return false;
  if (/^[a-z]+\.$/.test(en)) return false;
  // 过滤注释/括号行（动词变形、缩写说明等）
  if (/^[=(]/.test(en)) return false;
  if (/[=]/.test(en) && !/\s/.test(en)) return false;
  if (/\(/.test(en) && !/\)/.test(en)) return false;
  // 过滤残余符号
  if (/[→——]/.test(en)) return false;
  if (/[（）()]/.test(en)) return false;
  return true;
}
function dedupe(candidates) {
  const seen = new Set();
  const out = [];
  for (const c of candidates) {
    const en = (c.english || '').trim();
    const zh = (c.chinese || '').trim();
    if (!usable({ english: en, chinese: zh })) continue;
    const k = keyOf(en);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ english: en, chinese: zh, pos: c.pos || '', type: detectType(en) });
  }
  return out;
}
function parseLines(text) {
  const candidates = [];
  let pendingEn = null;
  const lines = String(text).split(/\r?\n/).map(l => l.replace(/\u0000/g, ' ').trim()).filter(Boolean);
  for (const raw of lines) {
    let line = raw.replace(/^\(\d+\)\s*/, '').replace(/^\d+[\.\、,，:：)]?\s*/, '').trim();
    if (!/[A-Za-z\u4e00-\u9fff]/.test(line)) continue;
    // 在整行中给粘连的词性标签插入空格（complaintn投诉 → complaint n 投诉）
    line = normalizePosSpaces(line);
    const s = splitEntry(line);
    if (!s) continue;
    if (s.en && s.zh) {
      if (pendingEn) { candidates.push({ english: pendingEn, chinese: s.zh, pos: pendingPos }); pendingEn = null; pendingPos = ''; }
      candidates.push({ english: s.en, chinese: s.zh, pos: s.pos });
    } else if (s.en) {
      if (pendingEn) candidates.push({ english: pendingEn, chinese: '', pos: pendingPos });
      pendingEn = s.en; pendingPos = s.pos;
    } else if (s.zh) {
      if (pendingEn) { candidates.push({ english: pendingEn, chinese: s.zh, pos: pendingPos }); pendingEn = null; pendingPos = ''; }
    }
  }
  if (pendingEn) candidates.push({ english: pendingEn, chinese: '', pos: pendingPos });
  return candidates;
}
function stripTags(html) {
  return String(html).replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}
function parseDocxHtml(html) {
  const candidates = [];
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let m;
  while ((m = tableRe.exec(html))) {
    const rows = m[1].split(/<tr[^>]*>/i).slice(1);
    for (const row of rows) {
      const cells = row.split(/<t[dh][^>]*>/i).slice(1).map(stripTags);
      let en = null, zh = null, pos = null;
      for (const c of cells) {
        const t = c.replace(/\s+/g, ' ').trim();
        if (!t) continue;
        const s = splitEntry(t);
        if (s && s.en && s.zh) { en = en || s.en; zh = zh || s.zh; pos = pos || s.pos; continue; }
        if (!en && s && s.en && /[A-Za-z]/.test(t) && !/[\u4e00-\u9fff]/.test(t)) en = s.en;
        else if (!zh && s && s.zh && /[\u4e00-\u9fff]/.test(t) && !/[A-Za-z]/.test(t)) zh = s.zh;
      }
      if (en || zh) candidates.push({ english: en || '', chinese: zh || '', pos: pos || '' });
    }
  }
  const noTable = html.replace(/<table[\s\S]*?<\/table>/gi, '')
    .replace(/<\/(p|h[1-6]|li|div|tr|br)>/gi, '\n');
  const body = stripTags(noTable).replace(/\r?\n/g, '\n');
  candidates.push(...parseLines(body));
  return candidates;
}

// ================= 路由：健康检查 =================
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ================= 路由：认证 =================
app.post('/api/auth/register', async (req, res) => {
  const { username, password, role, className, classCode, name } = req.body || {};
  const uname = String(username || '').trim();
  if (!/^[\w\u4e00-\u9fa5]{2,20}$/.test(uname)) return res.status(400).json({ error: '用户名需 2-20 位中英文/数字/下划线' });
  if (String(password || '').length < 4) return res.status(400).json({ error: '密码至少 4 位' });
  if (role !== 'teacher' && role !== 'student') return res.status(400).json({ error: '请选择身份：老师或学生' });
  if (await dbFindUser('username', uname)) return res.status(400).json({ error: '用户名已被占用' });
  const uname2 = String(name || '').trim();
  if (role === 'student' && !/^[\u4e00-\u9fa5A-Za-z·\s]{1,20}$/.test(uname2)) return res.status(400).json({ error: '学生请填写真实姓名（20 字以内）' });
  const salt = crypto.randomBytes(8).toString('hex');
  const user = { id: genId('u'), username: uname, name: uname2 || uname, salt, password: hashPwd(password, salt), role, createdAt: Date.now(), pet: null };
  let classInfo = null;
  if (role === 'teacher') {
    const cname = String(className || '').trim() || (uname + '的班级');
    const cls = { id: genId('c'), name: cname, code: await genClassCode(), teacherId: user.id, createdAt: Date.now() };
    await dbInsertClass(cls);
    user.classId = cls.id;
    classInfo = { id: cls.id, name: cls.name, code: cls.code };
  } else {
    const cls = (await q('SELECT * FROM classes WHERE code = $1', [String(classCode || '').trim()])).rows[0];
    if (!cls) return res.status(400).json({ error: '班级码无效，请向老师确认' });
    user.classId = cls.id;
    classInfo = { id: cls.id, name: cls.name };
  }
  await dbInsertUser(user);
  await initProgress(user.id);
  const token = await createSession(user.id);
  res.json({ ok: true, token, user: publicUser(user), classInfo });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const uname = String(username || '').trim();
  const u = await dbFindUser('username', uname);
  if (!u || u.password !== hashPwd(password || '', u.salt)) return res.status(401).json({ error: '用户名或密码错误' });
  const token = await createSession(u.id);
  res.json({ ok: true, token, user: publicUser(u), classInfo: await getClassInfo(u) });
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  await dbDeleteSession(req.token);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, async (req, res) => {
  res.json({ user: publicUser(req.user), classInfo: await getClassInfo(req.user) });
});

// ================= 路由：宠物 =================
const DRAGON_IDS = ['trex', 'stego', 'tricera', 'ptero', 'brachio', 'spino', 'ankylo', 'euro', 'east', 'ice'];
app.post('/api/pet', requireAuth, requireRole('student'), async (req, res) => {
  const { dragonId, name } = req.body || {};
  const id = String(dragonId || '').trim();
  if (DRAGON_IDS.indexOf(id) === -1) return res.status(400).json({ error: '请选择一只龙龙' });
  const petName = String(name || '').trim().slice(0, 12);
  if (!petName) return res.status(400).json({ error: '给龙龙取个名字吧（12 字以内）' });
  const old = req.user.pet;
  let lostPoints = 0;
  if (old && old.dragonId) {
    // 更换伙伴：损失当前 20% 经验值（龙龙可能降级）
    const p = await loadProgress(req.user.id);
    const cur = p.stats.points || 0;
    lostPoints = Math.max(1, Math.round(cur * 0.2));
    p.stats.points = Math.max(0, cur - lostPoints);
    await saveProgress(req.user.id, p);
  }
  req.user.pet = {
    dragonId: id, name: petName,
    claimedAt: (old && old.claimedAt) || Date.now(),
    changedAt: Date.now(),
    changedCount: ((old && old.changedCount) || 0) + 1
  };
  await dbUpdateUser(req.user);
  const fresh = await loadProgress(req.user.id);
  res.json({ ok: true, pet: req.user.pet, lostPoints, points: fresh.stats.points || 0 });
});

// ================= 路由：文档解析 =================
app.post('/api/parse', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '没有收到文件' });
  const file = req.file;
  const ext = path.extname(file.originalname || '').toLowerCase();
  let candidates = [];
  try {
    if (ext === '.pdf') {
      const buf = fs.readFileSync(file.path);
      const text = await extractPdfText(buf);
      candidates = parseLines(text);
    } else if (ext === '.docx') {
      const result = await mammoth.convertToHtml({ path: file.path });
      candidates = parseDocxHtml(result.value);
    } else if (ext === '.doc') {
      const extractor = new WordExtractor();
      const doc = await extractor.extract(file.path);
      candidates = parseLines(doc.getBody());
    } else if (ext === '.txt') {
      candidates = parseLines(fs.readFileSync(file.path, 'utf8'));
    } else {
      try { fs.unlinkSync(file.path); } catch (e) {}
      return res.status(400).json({ error: '仅支持 PDF / Word(doc、docx) / 文本(txt) 文件' });
    }
  } catch (err) {
    console.error('parse error', err);
    try { fs.unlinkSync(file.path); } catch (e) {}
    return res.status(500).json({ error: '解析失败：' + err.message });
  }
  try { fs.unlinkSync(file.path); } catch (e) {}
  res.json({ entries: dedupe(candidates) });
});

// ================= 路由：老师 · 题库管理 =================
// 清洗入库条目（去重、过滤无效、补类型）
function cleanBankEntries(entries) {
  const cleaned = [];
  const seen = new Set();
  for (const e of entries || []) {
    const en = String(e.english || '').trim();
    const zh = String(e.chinese || '').trim();
    if (!en && !zh) continue;
    if (!usable({ english: en, chinese: zh })) continue;
    const k = keyOf(en);
    if (seen.has(k)) continue;
    seen.add(k);
    cleaned.push({ id: genId('e'), english: en, chinese: zh, pos: String(e.pos || '').trim(), type: e.type || detectType(en) });
  }
  return cleaned;
}

app.post('/api/bank', requireAuth, requireRole('teacher'), async (req, res) => {
  const { title, entries, grade } = req.body || {};
  if (!Array.isArray(entries) || !entries.length) return res.status(400).json({ error: '题库内容为空，请先上传或添加条目' });
  const cleaned = cleanBankEntries(entries);
  if (!cleaned.length) return res.status(400).json({ error: '题库内容无效' });
  const t = String(title || '').trim() || '未命名题库';
  const g = normalizeGrade(grade);
  const banks = await dbAllBanks();
  let bank = banks.find(b => b.classId === req.user.class_id && b.title === t);
  if (!bank) {
    bank = { id: genId('b'), classId: req.user.class_id, title: t, grade: g, entries: [], updatedAt: Date.now() };
    await dbInsertBank(bank);
  } else {
    bank.grade = g;
  }
  bank.entries = cleaned;
  bank.updatedAt = Date.now();
  await dbUpdateBank(bank);
  res.json({ ok: true, bank: { id: bank.id, title: bank.title, grade: bank.grade, count: bank.entries.length, updatedAt: bank.updatedAt } });
});

// 老师：读取某个题库的完整条目（用于编辑）
app.get('/api/bank/:id/edit', requireAuth, requireRole('teacher'), async (req, res) => {
  const b = (await q('SELECT * FROM banks WHERE id = $1 AND class_id = $2', [req.params.id, req.user.class_id])).rows[0];
  if (!b) return res.status(404).json({ error: '题库不存在或无权编辑' });
  res.json({ bank: { id: b.id, title: b.title, grade: b.grade }, entries: b.entries || [] });
});

// 老师：重命名 / 更新题库内容 / 调整年级
app.put('/api/bank/:id', requireAuth, requireRole('teacher'), async (req, res) => {
  const b = (await q('SELECT * FROM banks WHERE id = $1 AND class_id = $2', [req.params.id, req.user.class_id])).rows[0];
  if (!b) return res.status(404).json({ error: '题库不存在或无权编辑' });
  const body = req.body || {};
  const t = String(body.title != null ? body.title : b.title).trim() || '未命名题库';
  let entries = b.entries;
  if (Array.isArray(body.entries)) {
    const cleaned = cleanBankEntries(body.entries);
    if (!cleaned.length) return res.status(400).json({ error: '题库内容无效' });
    entries = cleaned;
  }
  const g = body.grade !== undefined ? normalizeGrade(body.grade) : (b.grade || null);
  // 重命名后若与班级内其它题库重名则拒绝
  const dup = (await q('SELECT id FROM banks WHERE class_id = $1 AND title = $2 AND id <> $3', [req.user.class_id, t, b.id])).rows[0];
  if (dup) return res.status(400).json({ error: '班级内已有同名题库，请换一个标题' });
  b.title = t;
  b.entries = entries;
  b.grade = g;
  b.updatedAt = Date.now();
  await dbUpdateBank(b);
  res.json({ ok: true, bank: { id: b.id, title: b.title, grade: b.grade, count: b.entries.length, updatedAt: b.updatedAt } });
});

app.get('/api/bank', requireAuth, requireRole('teacher'), async (req, res) => {
  const banks = (await dbAllBanks())
    .filter(b => b.classId === req.user.class_id)
    .map(b => ({ id: b.id, title: b.title, grade: b.grade || null, count: b.entries.length, updatedAt: b.updatedAt }));
  res.json({ banks });
});

app.delete('/api/bank/:id', requireAuth, requireRole('teacher'), async (req, res) => {
  const b = (await q('SELECT * FROM banks WHERE id = $1 AND class_id = $2', [req.params.id, req.user.class_id])).rows[0];
  if (!b) return res.status(404).json({ error: '题库不存在' });
  await dbDeleteBank(b.id);
  res.json({ ok: true });
});

// ================= 路由：老师 · 班级学生 =================
app.get('/api/class/students', requireAuth, requireRole('teacher'), async (req, res) => {
  const users = await dbAllUsers();
  const students = users.filter(u => u.role === 'student' && u.class_id === req.user.class_id);
  const list = [];
  for (const u of students) {
    const p = await loadProgress(u.id);
    list.push({
      id: u.id, username: u.username, name: u.name || u.username, joinedAt: u.created_at, pet: u.pet || null,
      total: p.entries.length,
      mastered: p.entries.filter(e => (e.level || 0) >= 4).length,
      due: p.entries.filter(e => (e.nextDue || 0) <= Date.now()).length,
      points: p.stats.points || 0,
      lastActive: p.stats.lastAt
    });
  }
  list.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
  res.json({ students: list });
});

// 老师：修正学生姓名（也可改用户名）
app.put('/api/class/student/:id', requireAuth, requireRole('teacher'), async (req, res) => {
  const u = (await q('SELECT * FROM users WHERE id = $1 AND role = $2 AND class_id = $3', [req.params.id, 'student', req.user.class_id])).rows[0];
  if (!u) return res.status(404).json({ error: '学生不存在或不属于你的班级' });
  const body = req.body || {};
  const name = String(body.name != null ? body.name : (u.name || u.username)).trim();
  if (!/^[\u4e00-\u9fa5A-Za-z·\s]{1,20}$/.test(name)) return res.status(400).json({ error: '姓名需 20 字以内的中英文' });
  u.name = name;
  await dbUpdateUser(u);
  res.json({ ok: true, user: { id: u.id, username: u.username, name } });
});

// ================= 路由：学生 · 题库 =================
app.get('/api/banks', requireAuth, async (req, res) => {
  const cls = await getClassInfo(req.user);
  if (!cls) return res.json({ classInfo: null, banks: [] });
  const banks = (await dbAllBanks())
    .filter(b => b.classId === cls.id)
    .map(b => ({ id: b.id, title: b.title, grade: b.grade || null, count: b.entries.length, updatedAt: b.updatedAt }));
  res.json({ classInfo: { id: cls.id, name: cls.name }, banks });
});

app.get('/api/bank/:id', requireAuth, async (req, res) => {
  const cls = await getClassInfo(req.user);
  const bank = (await q('SELECT * FROM banks WHERE id = $1', [req.params.id])).rows[0];
  if (!bank || !cls || bank.class_id !== cls.id) return res.status(404).json({ error: '题库不存在或无权访问' });
  const p = await syncBankProgress(req.user.id, bank);
  const byKey = new Map(p.entries.filter(e => e.bankId === bank.id).map(e => [e.key, e]));
  const entries = bank.entries.map(be => {
    const prog = byKey.get(keyOf(be.english) + '|' + (be.chinese || '').trim()) || {};
    return {
      id: prog.id || '', english: be.english, chinese: be.chinese, pos: be.pos || '', type: be.type,
      level: prog.level || 0, correctCount: prog.correctCount || 0,
      wrongCount: prog.wrongCount || 0, nextDue: prog.nextDue || Date.now()
    };
  });
  res.json({ bank: { id: bank.id, title: bank.title }, entries });
});

// ================= 路由：学生 · 练习 =================
app.get('/api/today', requireAuth, async (req, res) => {
  const p = await loadProgress(req.user.id);
  const now = Date.now();
  const items = p.entries.filter(e => (e.nextDue || 0) <= now)
    .sort((a, b) => (a.nextDue || 0) - (b.nextDue || 0))
    .map(publicProgEntry);
  res.json({ items, total: p.entries.length, dueCount: items.length, points: p.stats.points || 0 });
});

app.post('/api/result', requireAuth, async (req, res) => {
  const { id, correct } = req.body || {};
  const p = await loadProgress(req.user.id);
  const e = p.entries.find(x => x.id === id);
  if (!e) return res.status(404).json({ error: '题目不存在' });
  const now = Date.now();
  if (correct) {
    e.level = (e.level || 0) + 1;
    e.correctCount = (e.correctCount || 0) + 1;
    const days = INTERVALS[Math.min(e.level - 1, INTERVALS.length - 1)];
    e.nextDue = nextDueAfterDays(days);
    p.stats.points = (p.stats.points || 0) + 1;
  } else {
    e.level = 0;
    e.wrongCount = (e.wrongCount || 0) + 1;
    e.nextDue = nextDueAfterDays(1); // 答错：明天再复习
  }
  e.lastResult = !!correct;
  e.lastResultAt = now;
  p.stats.lastAt = now;
  const today = new Date().toISOString().slice(0, 10);
  const h = p.stats.history[today] = p.stats.history[today] || { correct: 0, wrong: 0 };
  if (correct) h.correct++; else h.wrong++;
  await saveProgress(req.user.id, p);
  res.json({ ok: true, item: publicProgEntry(e), points: p.stats.points, today: h });
});

app.post('/api/sessionEnd', requireAuth, async (req, res) => {
  const p = await loadProgress(req.user.id);
  p.stats.sessions = (p.stats.sessions || 0) + 1;
  p.stats.lastAt = Date.now();
  await saveProgress(req.user.id, p);
  res.json({ ok: true });
});

app.get('/api/stats', requireAuth, async (req, res) => {
  const p = await loadProgress(req.user.id);
  const now = Date.now();
  const due = p.entries.filter(e => (e.nextDue || 0) <= now).length;
  const mastered = p.entries.filter(e => (e.level || 0) >= 4).length;
  const schedule = [];
  for (let i = 0; i < 7; i++) {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() + i);
    const dayEnd = dayStart.getTime() + DAY_MS;
    const start = i === 0 ? now : dayStart.getTime();
    const count = p.entries.filter(e => (e.nextDue || 0) > start && (e.nextDue || 0) < dayEnd).length;
    schedule.push({ date: dayStart.toISOString().slice(0, 10), count });
  }
  const history = Object.keys(p.stats.history || {}).sort().slice(-14)
    .map(d => ({ date: d, ...p.stats.history[d] }));
  res.json({
    total: p.entries.length,
    due, mastered,
    points: p.stats.points || 0,
    sessions: p.stats.sessions || 0,
    schedule, history
  });
});

app.use((err, req, res, next) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: '文件超过 50MB 大小限制' });
  console.error('请求错误', err);
  res.status(err.status || 500).json({ error: err.message || '服务器错误' });
});

// ================= 路由：大屏实时看板 =================
// 内存存储（班级码 → 看板），重启即清空，无需落盘
const liveBoards = {};
async function liveBoardOf(user) {
  const cls = await getClassInfo(user);
  return cls ? liveBoards[cls.id] : null;
}
app.post('/api/live/start', requireAuth, requireRole('teacher'), async (req, res) => {
  const cls = await getClassInfo(req.user);
  if (!cls) return res.status(400).json({ error: '请先创建班级' });
  const minutes = Math.min(60, Math.max(1, parseInt((req.body || {}).minutes, 10) || 10));
  liveBoards[cls.id] = {
    id: genId('lv'),
    session: { startedAt: Date.now(), minutes, ended: false },
    players: {}
  };
  const remaining = Math.min(60, Math.max(1, minutes)) * 60;
  res.json({ ok: true, remaining });
});
app.post('/api/live/stop', requireAuth, requireRole('teacher'), async (req, res) => {
  const cls = await getClassInfo(req.user);
  if (cls && liveBoards[cls.id]) liveBoards[cls.id].session.ended = true;
  res.json({ ok: true });
});
// 学生/老师通用：获取当前倒计时（学生端大屏横幅）
app.get('/api/live', requireAuth, async (req, res) => {
  const cls = await getClassInfo(req.user);
  const bd = cls && liveBoards[cls.id];
  if (!bd) return res.json({ active: false, remaining: 0, ended: false });
  const elapsed = Math.floor((Date.now() - bd.session.startedAt) / 1000);
  const remaining = Math.max(0, bd.session.minutes * 60 - elapsed);
  // 已超时但还没手动结束 → 视为已结束（避免学生端一直显示"时间到"）
  const timedOut = !bd.session.ended && remaining <= 0;
  if (timedOut) bd.session.ended = true;
  res.json({ active: !bd.session.ended && remaining > 0, remaining, ended: bd.session.ended });
});
// 老师大屏：全班实时状态
app.get('/api/live/board', requireAuth, requireRole('teacher'), async (req, res) => {
  const cls = await getClassInfo(req.user);
  const bd = cls && liveBoards[cls.id];
  if (!bd) return res.json({ session: null, players: [] });
  const now = Date.now();
  const elapsed = Math.floor((now - bd.session.startedAt) / 1000);
  const players = Object.values(bd.players)
    .filter(p => bd.session.ended || now - p.lastAt < 60000) // 结束保留，进行中清理 60s 掉线
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  res.json({
    session: {
      ended: bd.session.ended,
      remaining: Math.max(0, bd.session.minutes * 60 - elapsed),
      startedAt: bd.session.startedAt,
      minutes: bd.session.minutes
    },
    players
  });
});
// 学生：上报当前默写进度
app.post('/api/live/report', requireAuth, requireRole('student'), async (req, res) => {
  const cls = await getClassInfo(req.user);
  const bd = cls && liveBoards[cls.id];
  if (!bd || bd.session.ended) return res.json({ ok: true });
  const b = req.body || {};
  bd.players[req.user.id] = {
    username: req.user.name || req.user.username,
    dragonId: String(b.dragonId || 'trex'),
    petName: String(b.petName || ''),
    stage: Number(b.stage) || 0,
    points: Number(b.points) || 0,
    word: String(b.word || ''),
    answer: String(b.answer || ''),
    typedLen: Number(b.typedLen) || 0,
    answered: Number(b.answered) || 0,
    correct: Number(b.correct) || 0,
    wrong: Number(b.wrong) || 0,
    score: Number(b.score) || 0,
    done: !!b.done,
    lastAt: Date.now()
  };
  res.json({ ok: true });
});

const server = app.listen(PORT, () => {
  console.log('英语默写助手已启动: http://localhost:' + PORT);
  console.log('按 Ctrl+C 停止服务');
});
resolveDbHost();
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('端口 ' + PORT + ' 已被占用，可能服务已在运行。若无法访问，请先关闭占用该端口的进程后重试。');
  } else {
    console.error('启动失败：' + err.message);
  }
  process.exit(1);
});
