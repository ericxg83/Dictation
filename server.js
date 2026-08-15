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

// 兜底：任何未捕获的异步/同步异常只记日志，绝不让服务崩溃（数据库不可达、Express4 异步路由抛错时尤为关键）
process.on('unhandledRejection', (reason) => {
  console.error('未处理的 Promise 异常:', (reason && reason.stack) || reason);
});
process.on('uncaughtException', (err) => {
  console.error('未捕获的异常:', (err && err.stack) || err);
});

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
async function pg() {
  if (_pg) return _pg;
  const c = new Client({ ...DB, host: getDbHost(), connectionTimeoutMillis: 6000 });
  _pg = c;
  // 数据库不可达时仅记录日志，绝不让未捕获的 error 事件把整个服务拖垮
  c.on('error', e => { console.error('PG 连接错误:', e.message); });
  try {
    await c.connect();
    return c;
  } catch (e) {
    console.error('PG 连接失败:', e.message);
    _pg = null;
    throw e;
  }
}
// 简单查询封装：连不上或失败时尝试重连一次；连接类错误绝不抛出到外层导致进程崩溃
async function q(sql, params) {
  const isConnErr = e => !e ? false : !!(
    e.code === '57P01' || e.code === '57P02' || e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND' ||
    /client has encountered a connection error|connection terminated|timeout expired|connection refused|connect ECONNREFUSED/i.test(e.message || '')
  );
  try {
    const client = await pg();
    return await client.query(sql, params);
  } catch (e) {
    if (isConnErr(e)) {
      try { if (_pg) { await _pg.end(); } } catch (e2) {}
      _pg = null;
      try {
        const client2 = await pg();
        return await client2.query(sql, params);
      } catch (e2) {
        if (isConnErr(e2)) return { rows: [], rowCount: 0 };
        throw e2;
      }
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

// 启动时确保 wrong_book 表存在（migrate-wrongbook.js 之外，server 也兜底）
q(`CREATE TABLE IF NOT EXISTS wrong_book (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  progress_id TEXT NOT NULL,
  english TEXT NOT NULL,
  chinese TEXT,
  pos TEXT,
  type TEXT,
  bank_id TEXT,
  bank_title TEXT,
  reason TEXT NOT NULL DEFAULT 'wrong',
  wrong_count INTEGER NOT NULL DEFAULT 1,
  peek_count INTEGER NOT NULL DEFAULT 0,
  first_wrong_at BIGINT NOT NULL,
  last_wrong_at BIGINT NOT NULL,
  review_count INTEGER NOT NULL DEFAULT 0,
  last_review_at BIGINT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at BIGINT
)`).catch(e => console.warn('wrong_book 兜底建表失败：', e.message));
q(`CREATE INDEX IF NOT EXISTS idx_wrong_book_user ON wrong_book (user_id, resolved, last_wrong_at DESC)`).catch(e => {});
q(`CREATE INDEX IF NOT EXISTS idx_wrong_book_progress ON wrong_book (user_id, progress_id)`).catch(e => {});

// ---- 错题本 ----
function publicWrongEntry(w) {
  return {
    id: w.id,
    progressId: w.progress_id,
    english: w.english,
    chinese: w.chinese || '',
    pos: w.pos || '',
    type: w.type || 'word',
    bankId: w.bank_id || null,
    bankTitle: w.bank_title || '',
    reason: w.reason || 'wrong',
    wrongCount: w.wrong_count || 0,
    peekCount: w.peek_count || 0,
    firstWrongAt: w.first_wrong_at,
    lastWrongAt: w.last_wrong_at,
    reviewCount: w.review_count || 0,
    lastReviewAt: w.last_review_at || null,
    resolved: !!w.resolved,
    resolvedAt: w.resolved_at || null
  };
}
async function dbListWrongBook(uid) {
  return (await q(
    'SELECT * FROM wrong_book WHERE user_id = $1 ORDER BY resolved ASC, last_wrong_at DESC',
    [uid]
  )).rows;
}
async function dbFindWrongByProgress(uid, progressId) {
  return (await q(
    'SELECT * FROM wrong_book WHERE user_id = $1 AND progress_id = $2 LIMIT 1',
    [uid, progressId]
  )).rows[0] || null;
}
async function dbInsertWrong(w) {
  await q(
    `INSERT INTO wrong_book (id, user_id, progress_id, english, chinese, pos, type, bank_id, bank_title,
       reason, wrong_count, peek_count, first_wrong_at, last_wrong_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [w.id, w.userId, w.progressId, w.english, w.chinese || '', w.pos || '', w.type || 'word',
     w.bankId || null, w.bankTitle || '', w.reason || 'wrong',
     w.wrongCount || 1, w.peekCount || 0, w.firstWrongAt, w.lastWrongAt]
  );
}
async function dbUpdateWrong(w) {
  await q(
    `UPDATE wrong_book SET english=$2, chinese=$3, pos=$4, type=$5, bank_id=$6, bank_title=$7,
       reason=$8, wrong_count=$9, peek_count=$10, last_wrong_at=$11,
       review_count=$12, last_review_at=$13, resolved=$14, resolved_at=$15
     WHERE id=$1`,
    [w.id, w.english, w.chinese || '', w.pos || '', w.type || 'word',
     w.bankId || null, w.bankTitle || '', w.reason || 'wrong',
     w.wrongCount || 0, w.peekCount || 0, w.lastWrongAt || w.firstWrongAt,
     w.reviewCount || 0, w.lastReviewAt || null, !!w.resolved, w.resolvedAt || null]
  );
}
async function dbDeleteWrong(id, uid) {
  await q('DELETE FROM wrong_book WHERE id = $1 AND user_id = $2', [id, uid]);
}
// 把错题入库（已存在则累加计数；reason 标记为最新一次的原因）
async function recordWrong(uid, progressEntry, reason) {
  if (!progressEntry) return null;
  const now = Date.now();
  const existing = await dbFindWrongByProgress(uid, progressEntry.id);
  if (existing) {
    const w = publicWrongEntry(existing);
    if (existing.resolved) {
      // 已掌握的题再次出错：自动恢复未掌握状态
      w.resolved = false;
      w.resolvedAt = null;
    }
    w.lastWrongAt = now;
    if (reason === 'peek') w.peekCount = (w.peekCount || 0) + 1;
    else w.wrongCount = (w.wrongCount || 0) + 1;
    w.reason = reason || w.reason;
    // 同步条目快照（题库可能改名 / 改词性）
    w.english = progressEntry.english || w.english;
    w.chinese = progressEntry.chinese || w.chinese;
    w.pos = progressEntry.pos || w.pos;
    w.type = progressEntry.type || w.type;
    await dbUpdateWrong(w);
    return w;
  }
  const w = {
    id: genId('w'),
    userId: uid,
    progressId: progressEntry.id,
    english: progressEntry.english,
    chinese: progressEntry.chinese || '',
    pos: progressEntry.pos || '',
    type: progressEntry.type || 'word',
    bankId: progressEntry.bankId || null,
    bankTitle: '', // 稍后由调用方填充（题库标题在 progress 不存）
    reason: reason || 'wrong',
    wrongCount: reason === 'peek' ? 0 : 1,
    peekCount: reason === 'peek' ? 1 : 0,
    firstWrongAt: now,
    lastWrongAt: now
  };
  await dbInsertWrong(w);
  return w;
}

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
  try {
    const s = (await q('SELECT * FROM sessions WHERE token = $1', [token])).rows[0];
    if (!s || s.expires_at < Date.now()) return null;
    return (await q('SELECT * FROM users WHERE id = $1', [s.user_id])).rows[0] || null;
  } catch (e) {
    // 数据库暂不可用：按未登录处理，避免查询异常把进程打崩
    console.error('认证查询异常:', e.message);
    return null;
  }
}
function requireAuth(req, res, next) {
  getSessionUser(req).then(u => {
    if (!u) return res.status(401).json({ error: '未登录或登录已过期，请重新登录' });
    req.user = u;
    req.token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query.token;
    next();
  }, e => {
    console.error('认证失败:', e.message);
    res.status(500).json({ error: '服务器暂时不可用，请稍后再试' });
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

// ================= LLM 提取（DeepSeek / OpenAI 兼容协议） =================
// 老师上传 PDF/Word 时，规则解析经常出现：跨行中文截断、派生词丢漏、词性错位、词组/句子被错判成单词。
// 这里用 LLM 重新做一次结构化提取，按用户给定的 prompt 严格走规则，并在不可用时自动回退到原规则解析。
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_BASE_URL = (process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-chat';
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 90000;
const LLM_MAX_CHARS = Number(process.env.LLM_MAX_CHARS) || 30000;
function llmEnabled() { return !!LLM_API_KEY; }

// 文本过长时保留前 60% + 后 40%，避免把位于中段的单词表/短语表截断
function clipForLlm(text, maxChars) {
  const cap = Math.max(2000, Number(maxChars) || LLM_MAX_CHARS);
  if (!text || text.length <= cap) return { text: text || '', truncated: false };
  const head = Math.floor(cap * 0.6);
  const tail = cap - head;
  return {
    text: text.slice(0, head) + '\n\n[…中间内容过长已省略…]\n\n' + text.slice(-tail),
    truncated: true
  };
}

function buildLlmPrompt(rawText) {
  return `你是一个专业的英语教学资料提取与结构化专家。\n我已用工具把 PDF/Word 教材里的文字提取出来（见下方【教材内容】）。\n请严格按下面的规则，把"●单词梳理"与"●短语梳理"中所有词条抽取出来，按教材原文顺序整理成一个 JSON 数组。\n\n【教材内容】（已清洗；仍可能含换行、页眉页脚、空行）\n==========\n${rawText}\n==========\n\n【提取与拆分规则】\n1. 完整性（零遗漏）：\n   - 必须提取"●单词梳理"中的所有主词。\n   - 必须提取所有带"→"的派生词/拓展词，并拆为【独立条目】（如 digital → digit / digitalise / digitalization 各算一条）。\n   - 必须提取"●短语梳理"中的全部短语。\n\n2. 防错位与防截断：\n   - 严格对应每个英文词/短语自己的中文释义，绝不能上下行错位。\n   - 跨行中文释义必须完整拼接（如"最新的人工智能技术"、"令人同情的;感人的"），绝不能出现"令"、"最新的人工智能技"等残缺词。\n\n3. 词性（pos）：\n   - 单词/派生词必须真实标注：adj. / n. / v. / adv. / prep. / pron. / abbr. 等；多词性用 "/"（如 n./v.）。\n   - 派生词要标自己的词性，不能复用主词的词性。\n   - 词组（phrase）和句子（sentence）的 pos 留空字符串 ""，绝对不能统一填 "n."。\n\n4. 类型（type）：\n   - "word"：单个英文单词（含派生词），如 digital, digitalise。\n   - "phrase"：不含完整主谓的偏正/名词短语，如 user-friendly, classic black, the latest AI technology。\n   - "sentence"：含动词短语或完整句型，如 tap on the keyboard, keep an eye on your health, enjoy some private time。\n\n【输出】\n只输出一个 JSON 数组，不要任何额外说明、Markdown 代码块、注释。\n[\n  { "english": "...", "pos": "...", "chinese": "...", "type": "word|phrase|sentence" },\n  ...\n]\n按教材原文顺序逐条排列；若某行只有中文没有英文则跳过。`;
}

async function callLlm(rawText) {
  if (!llmEnabled()) throw new Error('LLM 未配置（缺少 LLM_API_KEY）');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);
  try {
    const res = await fetch(LLM_BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + LLM_API_KEY
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0.1,
        messages: [
          { role: 'system', content: '你是专业的英语教学资料提取与结构化专家。严格按用户要求输出 JSON 数组，不要任何额外说明。' },
          { role: 'user', content: buildLlmPrompt(rawText) }
        ]
      }),
      signal: ctrl.signal
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error('LLM HTTP ' + res.status + '：' + body.slice(0, 200));
    }
    const data = await res.json();
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) throw new Error('LLM 返回内容为空');
    return String(content);
  } finally {
    clearTimeout(timer);
  }
}

function parseLlmResponse(content) {
  let s = String(content || '').trim();
  // 去除可能被包住的 Markdown 代码块
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/g, '').trim();
  let arr = null;
  // 优先尝试整体解析
  try {
    const obj = JSON.parse(s);
    if (Array.isArray(obj)) arr = obj;
    else if (Array.isArray(obj.entries)) arr = obj.entries;
    else if (Array.isArray(obj.data)) arr = obj.data;
    else if (Array.isArray(obj.items)) arr = obj.items;
    else if (obj && typeof obj === 'object') {
      // 找对象里第一个数组字段
      for (const k of Object.keys(obj)) {
        if (Array.isArray(obj[k])) { arr = obj[k]; break; }
      }
    }
  } catch (e) {}
  // 兜底：从字符串里抠出第一个 [...] 数组
  if (!arr) {
    const m = s.match(/\[[\s\S]*\]/);
    if (m) {
      try { arr = JSON.parse(m[0]); } catch (e2) {}
    }
  }
  if (!Array.isArray(arr)) {
    throw new Error('LLM 输出无法解析为 JSON 数组：' + s.slice(0, 160));
  }
  const out = [];
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue;
    const en = String(it.english || '').trim();
    const zh = String(it.chinese || '').trim();
    if (!en || !zh) continue;
    let pos = String(it.pos || '').trim();
    if (pos === '-' || pos === '—') pos = '';
    let type = String(it.type || '').trim().toLowerCase();
    if (['word', 'phrase', 'sentence'].indexOf(type) === -1) type = detectType(en);
    out.push({ english: en, chinese: zh, pos, type });
  }
  return out;
}

async function extractByLlm(rawText) {
  const clipped = clipForLlm(rawText);
  const content = await callLlm(clipped.text);
  const entries = parseLlmResponse(content);
  return { entries, truncated: clipped.truncated };
}

// ================= 路由：连击鼓励语（基于 LLM） =================
// 练习中达成连击 / 连击中断 / 完美通关时，调用 LLM 生成游戏化的初中生风格鼓励语。
// LLM 未配置或失败时返回 null，让前端走本地词库兜底。
// DeepSeek 价格极低（每万次约几分钱），可放心使用；想完全免调用则前端自动降级到本地词库。
const COMBO_TIMEOUT_MS = Number(process.env.COMBO_TIMEOUT_MS) || 4000;

function buildComboPrompt(type, ctx) {
  const c = ctx || {};
  const combo = c.combo || 0;
  const correct = c.correct || 0;
  const wrong = c.wrong || 0;
  const total = c.total || 0;
  const maxCombo = c.maxCombo || 0;
  const acc = total ? Math.round(correct / total * 100) : 0;
  const typeDesc = {
    combo: `玩家刚打出 ${combo} 连击`,
    break: `玩家之前 ${combo} 连击，刚被打断`,
    perfect: `玩家整局 ${total} 题全对，零失误`,
    maxcombo: `结算回顾：最高连击 ${maxCombo}，共 ${total} 题，对 ${correct} 错 ${wrong}`
  }[type] || `连击 ${combo}`;
  const recentStr = (c.recent && c.recent.length)
    ? '\n最近已用过的描述（请避开相似句式）：' + c.recent.slice(-5).map(r => '「' + r + '」').join('、')
    : '';
  return `你是一个给初中生英语默写 App 写"游戏化鼓励语"的文案助手。${typeDesc}。${recentStr}
请根据情境生成一句新的鼓励语，要求：
1. 严格输出 JSON：{"title":"...","desc":"..."}，title 在 6 字以内，desc 在 20 字以内
2. 风格：活泼、可爱、游戏化、像成就系统弹窗文案；emoji 可用但不超过 1 个
3. 句式要新颖、避免与最近用过的重复
4. 只输出 JSON，不要任何额外说明、Markdown 代码块、注释
当前正确率 ${acc}%${maxCombo > combo ? '，本局最高连击 ' + maxCombo : ''}`;
}

function parseComboResponse(content) {
  let s = String(content || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/g, '').trim();
  let obj = null;
  try { obj = JSON.parse(s); } catch (e) {}
  if (!obj) {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) { try { obj = JSON.parse(m[0]); } catch (e2) {} }
  }
  if (!obj || typeof obj !== 'object') return null;
  const title = String(obj.title || '').trim().slice(0, 12);
  const desc = String(obj.desc || '').trim().slice(0, 40);
  if (!title || !desc) return null;
  return { title, desc };
}

async function callComboLlm(type, ctx) {
  if (!llmEnabled()) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), COMBO_TIMEOUT_MS);
  try {
    const res = await fetch(LLM_BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + LLM_API_KEY
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 1.0,
        messages: [
          { role: 'system', content: '你是给初中生写游戏化鼓励语的文案助手。风格活泼、可爱、像游戏成就提示。永远只输出要求的 JSON，不要多余说明。' },
          { role: 'user', content: buildComboPrompt(type, ctx) }
        ]
      }),
      signal: ctrl.signal
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) return null;
    return parseComboResponse(content);
  } catch (e) {
    console.warn('combo LLM failed:', e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

app.post('/api/combo-message', requireAuth, async (req, res) => {
  const { type, combo, correct, wrong, total, maxCombo, recent } = req.body || {};
  const valid = ['combo', 'break', 'perfect', 'maxcombo'];
  if (!valid.includes(type)) return res.json({ message: null, enabled: llmEnabled() });
  if (!llmEnabled()) return res.json({ message: null, enabled: false });
  const msg = await callComboLlm(type, { combo, correct, wrong, total, maxCombo, recent });
  res.json({ message: msg, enabled: true });
});

// ================= 路由：文档解析 =================
app.post('/api/parse', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '没有收到文件' });
  const file = req.file;
  const ext = path.extname(file.originalname || '').toLowerCase();
  let rawText = '';
  let docxHtml = ''; // 仅 docx 走规则回退时需要
  try {
    if (ext === '.pdf') {
      const buf = fs.readFileSync(file.path);
      rawText = await extractPdfText(buf);
    } else if (ext === '.docx') {
      const raw = await mammoth.extractRawText({ path: file.path });
      rawText = raw.value || '';
      const html = await mammoth.convertToHtml({ path: file.path });
      docxHtml = html.value || '';
    } else if (ext === '.doc') {
      const extractor = new WordExtractor();
      const doc = await extractor.extract(file.path);
      rawText = doc.getBody();
    } else if (ext === '.txt') {
      rawText = fs.readFileSync(file.path, 'utf8');
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

  // 优先走 LLM 提取；不可用 / 失败 / 0 条时回退到原规则解析
  let candidates = [];
  let mode = 'rule';
  let truncated = false;
  let llmError = '';
  if (llmEnabled() && rawText && rawText.trim()) {
    try {
      const r = await extractByLlm(rawText);
      if (r.entries && r.entries.length) {
        candidates = r.entries;
        mode = 'llm';
        truncated = !!r.truncated;
      } else {
        llmError = 'LLM 返回 0 条';
      }
    } catch (e) {
      llmError = e.message || String(e);
      console.error('LLM 提取失败，回退到规则提取：', llmError);
    }
  }
  if (!candidates.length) {
    if (ext === '.docx' && docxHtml) {
      candidates = parseDocxHtml(docxHtml);
    } else if (rawText) {
      candidates = parseLines(rawText);
    }
    mode = 'rule';
  }
  const result = dedupe(candidates);
  res.json({ entries: result, mode, truncated, llmEnabled: llmEnabled(), llmError: llmError || undefined });
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

// 学生：获取老师指定的默写题库（全班同一份，不按个人进度过滤；数量由老师指定）
app.get('/api/live/practice', requireAuth, async (req, res) => {
  const cls = await getClassInfo(req.user);
  const bd = cls && liveBoards[cls.id];
  const bankId = bd && !bd.session.ended && bd.bankId ? bd.bankId : null;
  if (!bankId) return res.json({ active: false, bank: null, count: 0, entries: [] });
  const bank = (await q('SELECT * FROM banks WHERE id = $1 AND class_id = $2', [bankId, cls.id])).rows[0];
  if (!bank) return res.json({ active: false, bank: null, count: 0, entries: [] });
  // 使用 session 中预生成的统一序列，保证所有学生题目和顺序一致
  const sequence = bd.sequence || [];
  const p = await syncBankProgress(req.user.id, bank);
  const byKey = new Map(p.entries.filter(e => e.bankId === bank.id).map(e => [e.key, e]));
  const entries = sequence.map(be => {
    const prog = byKey.get(keyOf(be.english) + '|' + (be.chinese || '').trim()) || {};
    return {
      id: prog.id || '', english: be.english, chinese: be.chinese, pos: be.pos || '', type: be.type,
      level: prog.level || 0, correctCount: prog.correctCount || 0,
      wrongCount: prog.wrongCount || 0, nextDue: prog.nextDue || Date.now()
    };
  });
  res.json({ active: true, bank: { id: bank.id, title: bank.title }, count: entries.length, entries });
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

function pointsByType(type) {
  // 单词 1 分，词组 2 分，句子 3 分
  if (type === 'phrase') return 2;
  if (type === 'sentence') return 3;
  return 1;
}

app.post('/api/result', requireAuth, async (req, res) => {
  const { id, correct, reason } = req.body || {};
  const p = await loadProgress(req.user.id);
  const e = p.entries.find(x => x.id === id);
  if (!e) return res.status(404).json({ error: '题目不存在' });
  const now = Date.now();
  if (correct) {
    e.level = (e.level || 0) + 1;
    e.correctCount = (e.correctCount || 0) + 1;
    const days = INTERVALS[Math.min(e.level - 1, INTERVALS.length - 1)];
    e.nextDue = nextDueAfterDays(days);
    const gain = pointsByType(e.type);
    p.stats.points = (p.stats.points || 0) + gain;
    e.lastGain = gain;
  } else {
    e.level = 0;
    e.wrongCount = (e.wrongCount || 0) + 1;
    e.nextDue = nextDueAfterDays(1); // 答错：明天再复习
    e.lastGain = 0;
  }
  e.lastResult = !!correct;
  e.lastResultAt = now;
  p.stats.lastAt = now;
  const today = new Date().toISOString().slice(0, 10);
  const h = p.stats.history[today] = p.stats.history[today] || { correct: 0, wrong: 0, points: 0 };
  if (correct) {
    h.correct++;
    h.points = (h.points || 0) + (e.lastGain || 0);
  } else {
    h.wrong++;
  }
  await saveProgress(req.user.id, p);
  // 答错或偷看答案：写入错题本
  let wrongEntry = null;
  if (!correct) {
    wrongEntry = await recordWrong(req.user.id, e, reason === 'peek' ? 'peek' : 'wrong');
    // 顺手把题库标题填上（progress 不存，只有 banks 表里有）
    if (wrongEntry && wrongEntry.bankId && !wrongEntry.bankTitle) {
      const bk = (await q('SELECT title FROM banks WHERE id = $1', [wrongEntry.bankId])).rows[0];
      if (bk) { wrongEntry.bankTitle = bk.title; await dbUpdateWrong(wrongEntry); }
    }
  }
  res.json({ ok: true, item: publicProgEntry(e), points: p.stats.points, today: h, gain: e.lastGain, wrongEntry: wrongEntry ? publicWrongEntry(wrongEntry) : null });
});

app.post('/api/sessionEnd', requireAuth, async (req, res) => {
  const p = await loadProgress(req.user.id);
  p.stats.sessions = (p.stats.sessions || 0) + 1;
  p.stats.lastAt = Date.now();
  await saveProgress(req.user.id, p);
  res.json({ ok: true });
});

// ================= 错题本 =================
// 列表 + 统计
app.get('/api/wrong-book', requireAuth, requireRole('student'), async (req, res) => {
  const rows = await dbListWrongBook(req.user.id);
  // 回填题库标题（早期入库或题库改名时）
  const bankIds = Array.from(new Set(rows.map(r => r.bank_id).filter(Boolean)));
  const bankMap = {};
  if (bankIds.length) {
    const bks = (await q('SELECT id, title FROM banks WHERE id = ANY($1::text[])', [bankIds])).rows;
    bks.forEach(b => { bankMap[b.id] = b.title; });
    // 异步把缺失的 title 写回库（不阻塞返回）
    for (const r of rows) {
      if (r.bank_id && !r.bank_title && bankMap[r.bank_id]) {
        r.bank_title = bankMap[r.bank_id];
        dbUpdateWrong(publicWrongEntry(r)).catch(() => {});
      }
    }
  }
  const list = rows.map(r => {
    const e = publicWrongEntry(r);
    if (!e.bankTitle && e.bankId && bankMap[e.bankId]) e.bankTitle = bankMap[e.bankId];
    return e;
  });
  const active = list.filter(x => !x.resolved);
  res.json({
    total: list.length,
    active: active.length,
    resolved: list.length - active.length,
    wrongCount: active.reduce((s, x) => s + (x.wrongCount || 0), 0),
    peekCount: active.reduce((s, x) => s + (x.peekCount || 0), 0),
    items: list
  });
});

// 单条删除
app.delete('/api/wrong-book/:id', requireAuth, requireRole('student'), async (req, res) => {
  await dbDeleteWrong(req.params.id, req.user.id);
  res.json({ ok: true });
});

// 批量删除
app.post('/api/wrong-book/batch-delete', requireAuth, requireRole('student'), async (req, res) => {
  const ids = Array.isArray((req.body || {}).ids) ? (req.body || {}).ids : [];
  if (!ids.length) return res.json({ ok: true, removed: 0 });
  let removed = 0;
  for (const id of ids) {
    try { await dbDeleteWrong(String(id), req.user.id); removed++; } catch (e) {}
  }
  res.json({ ok: true, removed });
});

// 标记为已掌握
app.post('/api/wrong-book/:id/resolve', requireAuth, requireRole('student'), async (req, res) => {
  const row = (await q('SELECT * FROM wrong_book WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id])).rows[0];
  if (!row) return res.status(404).json({ error: '错题不存在' });
  const w = publicWrongEntry(row);
  w.resolved = true;
  w.resolvedAt = Date.now();
  await dbUpdateWrong(w);
  res.json({ ok: true, item: w });
});

// 标记为未掌握（已掌握 → 重新加入）
app.post('/api/wrong-book/:id/unresolve', requireAuth, requireRole('student'), async (req, res) => {
  const row = (await q('SELECT * FROM wrong_book WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id])).rows[0];
  if (!row) return res.status(404).json({ error: '错题不存在' });
  const w = publicWrongEntry(row);
  w.resolved = false;
  w.resolvedAt = null;
  await dbUpdateWrong(w);
  res.json({ ok: true, item: w });
});

// 复习模式：拿未掌握的题去练（按题库 + 取前 N 条）
app.get('/api/wrong-book/practice', requireAuth, requireRole('student'), async (req, res) => {
  const rawLimit = parseInt(req.query.limit, 10);
  const limit = Math.min(100, Math.max(5, isNaN(rawLimit) ? 30 : rawLimit));
  const rows = (await q(
    'SELECT * FROM wrong_book WHERE user_id = $1 AND resolved = false ORDER BY last_wrong_at DESC LIMIT $2',
    [req.user.id, limit]
  )).rows;
  if (!rows.length) return res.json({ items: [], count: 0, bankIds: [] });
  // 找出这些错题对应在哪些题库（用 progress_id 反查 progress.entries）
  const progIds = rows.map(r => r.progress_id);
  const p = await loadProgress(req.user.id);
  const byId = new Map(p.entries.map(e => [e.id, e]));
  const bankIds = Array.from(new Set(rows.map(r => (byId.get(r.progress_id) || {}).bankId).filter(Boolean)));
  let bankMap = {};
  if (bankIds.length) {
    const bks = (await q('SELECT id, title FROM banks WHERE id = ANY($1::text[])', [bankIds])).rows;
    bks.forEach(b => { bankMap[b.id] = b.title; });
  }
  const items = rows.map(r => {
    const prog = byId.get(r.progress_id) || {};
    return {
      id: prog.id || '',
      wrongId: r.id,
      english: prog.english || r.english,
      chinese: prog.chinese || r.chinese,
      pos: prog.pos || r.pos || '',
      type: prog.type || r.type || 'word',
      bankId: (byId.get(r.progress_id) || {}).bankId || r.bank_id || null,
      bankTitle: bankMap[(byId.get(r.progress_id) || {}).bankId] || r.bank_title || '',
      reason: r.reason,
      wrongCount: r.wrong_count,
      peekCount: r.peek_count
    };
  }).filter(x => x.id);
  res.json({ items, count: items.length, bankIds: Object.keys(bankMap) });
});

// 错题复习时答对：累计 review_count，连续 3 次答对自动 mark resolved
app.post('/api/wrong-book/:id/review', requireAuth, requireRole('student'), async (req, res) => {
  const { correct, strike } = req.body || {};
  const row = (await q('SELECT * FROM wrong_book WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id])).rows[0];
  if (!row) return res.status(404).json({ error: '错题不存在' });
  const w = publicWrongEntry(row);
  w.reviewCount = (w.reviewCount || 0) + 1;
  w.lastReviewAt = Date.now();
  if (correct) {
    // 连续 3 次答对 → 自动标记为已掌握
    if (Number(strike) >= 3) {
      w.resolved = true;
      w.resolvedAt = Date.now();
    }
  } else {
    // 答错：把 lastWrongAt 更新到最近 + 累加错次数
    w.lastWrongAt = Date.now();
    w.wrongCount = (w.wrongCount || 0) + 1;
  }
  await dbUpdateWrong(w);
  res.json({ ok: true, item: w });
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
  const bankId = String((req.body || {}).bankId || '').trim();
  if (!bankId) return res.status(400).json({ error: '请选择默写题库' });
  const bank = (await q('SELECT id, title, entries, class_id FROM banks WHERE id = $1 AND class_id = $2', [bankId, cls.id])).rows[0];
  if (!bank) return res.status(400).json({ error: '题库不存在或不属于本班' });
  // 默写数量：默认取题库全部条目，最少 1 条
  const total = Array.isArray(bank.entries) ? bank.entries.length : 0;
  const rawCount = parseInt((req.body || {}).count, 10);
  const count = Math.min(total, Math.max(1, isNaN(rawCount) ? total : rawCount));
  if (total < 1) return res.status(400).json({ error: '题库为空，无法开启默写' });
  // 生成统一题目序列：Fisher-Yates 洗牌后截取 count 条，所有学生拿到相同题目和顺序
  const seq = bank.entries.slice();
  for (let i = seq.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [seq[i], seq[j]] = [seq[j], seq[i]];
  }
  const sequence = seq.slice(0, count);
  liveBoards[cls.id] = {
    id: genId('lv'),
    session: { startedAt: Date.now(), minutes, ended: false },
    bankId, bankTitle: bank.title, count,
    sequence,
    players: {}
  };
  const remaining = Math.min(60, Math.max(1, minutes)) * 60;
  res.json({ ok: true, remaining, bankId, bankTitle: bank.title, count });
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
  res.json({
    active: !bd.session.ended && remaining > 0,
    remaining,
    ended: bd.session.ended,
    bankId: bd.bankId || null,
    bankTitle: bd.bankTitle || '',
    count: bd.count || 0
  });
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
    bankId: bd.bankId || null,
    bankTitle: bd.bankTitle || '',
    count: bd.count || 0,
    sequenceWords: (bd.sequence || []).map(e => e.english || ''),
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
    uid: req.user.id,
    username: req.user.name || req.user.username,
    dragonId: String(b.dragonId || 'trex'),
    petName: String(b.petName || ''),
    stage: Number(b.stage) || 0,
    points: Number(b.points) || 0,
    word: String(b.word || ''),
    answer: String(b.answer || ''),
    typed: String(b.typed || ''),
    typedLen: Number(b.typedLen) || 0,
    total: Number(b.total) || 0,
    answered: Number(b.answered) || 0,
    correct: Number(b.correct) || 0,
    wrong: Number(b.wrong) || 0,
    score: Number(b.score) || 0,
    locked: !!b.locked,
    done: !!b.done,
    lastAt: Date.now()
  };
  res.json({ ok: true });
});

// ================= 路由：自由组队 PK =================
// 房间存储在内存，重启清空。每房最多 6 名玩家。
// 房间结构：
//   { id, code, hostId, bankId, bankTitle, count, minutes, mode,
//     status: 'waiting' | 'racing' | 'ended',
//     startedAt, endedAt, endReason, players: { [uid]: {...} }, sequence: [...] }
// 题目一次性预生成（与房间绑定，不与个人进度同步），保证所有玩家默写相同内容。
const pkRooms = {}; // code -> room
const PK_MAX_PLAYERS = 6;
const PK_MIN_COUNT = 5;
const PK_MAX_COUNT = 60;
const PK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去除 0/1/I/O 减少误读

function genPkCode() {
  let code;
  let attempts = 0;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += PK_CODE_ALPHABET[Math.floor(Math.random() * PK_CODE_ALPHABET.length)];
    }
    attempts++;
  } while (pkRooms[code] && attempts < 50);
  return code;
}

function pkRoomFor(user) {
  // 同一用户仅允许同时在一个房间内（避免多设备冲突）
  for (const code of Object.keys(pkRooms)) {
    const r = pkRooms[code];
    if (r.players[user.id]) return r;
  }
  return null;
}

function pkPublicRoom(r, viewerId) {
  if (!r) return null;
  const players = Object.values(r.players)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .map(p => ({
      uid: p.uid,
      name: p.name,
      dragonId: p.dragonId,
      petName: p.petName,
      stage: p.stage,
      points: p.points,
      isHost: !!p.isHost,
      ready: !!p.ready,
      finished: !!p.finished,
      score: p.score || 0,
      correct: p.correct || 0,
      wrong: p.wrong || 0,
      answered: p.answered || 0,
      lastAt: p.lastAt || 0
    }));
  let remaining = 0;
  if (r.status === 'racing') {
    const elapsed = Math.floor((Date.now() - r.startedAt) / 1000);
    remaining = Math.max(0, (r.minutes || 0) * 60 - elapsed);
  }
  return {
    code: r.code,
    status: r.status,
    mode: r.mode || 'group',
    bankId: r.bankId,
    bankTitle: r.bankTitle,
    count: r.count,
    minutes: r.minutes,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    endReason: r.endReason,
    hostId: r.hostId,
    players,
    remaining,
    maxPlayers: PK_MAX_PLAYERS,
    viewerUid: viewerId
  };
}

async function loadBankForUser(user, bankId) {
  const cls = await getClassInfo(user);
  if (!cls) return { error: '你还没有加入班级' };
  const bank = (await q('SELECT * FROM banks WHERE id = $1 AND class_id = $2', [bankId, cls.id])).rows[0];
  if (!bank) return { error: '题库不存在或不属于本班' };
  return { bank };
}

app.post('/api/pk/create', requireAuth, requireRole('student'), async (req, res) => {
  const body = req.body || {};
  const mode = body.mode === 'solo' ? 'solo' : 'group';
  const bankId = String(body.bankId || '').trim();
  if (!bankId) return res.status(400).json({ error: '请选择题库' });
  const rawCount = parseInt(body.count, 10);
  const count = Math.max(PK_MIN_COUNT, Math.min(PK_MAX_COUNT, isNaN(rawCount) ? 20 : rawCount));
  const rawMinutes = parseInt(body.minutes, 10);
  const minutes = Math.max(1, Math.min(20, isNaN(rawMinutes) ? 5 : rawMinutes));
  const { bank, error } = await loadBankForUser(req.user, bankId);
  if (error) return res.status(400).json({ error });
  if (!Array.isArray(bank.entries) || bank.entries.length === 0) {
    return res.status(400).json({ error: '题库为空，无法 PK' });
  }
  // 强制先退出已有房间
  const old = pkRoomFor(req.user);
  if (old) delete old.players[req.user.id];

  const code = genPkCode();
  const pet = (req.user.pet || {});
  const dId = (pet.dragonId || 'trex');
  const room = {
    code,
    id: genId('pk'),
    hostId: req.user.id,
    bankId: bank.id,
    bankTitle: bank.title,
    count: Math.min(count, bank.entries.length),
    minutes,
    mode,
    status: 'waiting',
    startedAt: 0,
    endedAt: 0,
    endReason: '',
    players: {}
  };
  room.players[req.user.id] = {
    uid: req.user.id,
    name: req.user.name || req.user.username,
    dragonId: dId,
    petName: pet.name || '',
    stage: 0,
    points: 0,
    isHost: true,
    ready: false,
    finished: false,
    score: 0, correct: 0, wrong: 0, answered: 0,
    lastAt: Date.now()
  };
  // solo 模式：直接开赛，跳过等待
  if (mode === 'solo') {
    room.status = 'racing';
    room.startedAt = Date.now();
    room.players[req.user.id].ready = true;
  }
  pkRooms[code] = room;
  res.json({ ok: true, room: pkPublicRoom(room, req.user.id) });
});

app.post('/api/pk/join', requireAuth, requireRole('student'), async (req, res) => {
  const code = String((req.body || {}).code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: '请输入房间号' });
  const room = pkRooms[code];
  if (!room) return res.status(404).json({ error: '房间不存在或已关闭' });
  if (room.status !== 'waiting') return res.status(400).json({ error: '该房间已开始或已结束' });
  if (Object.keys(room.players).length >= PK_MAX_PLAYERS) {
    return res.status(400).json({ error: '房间已满（最多 ' + PK_MAX_PLAYERS + ' 人）' });
  }
  // 强制先退出已有房间
  const old = pkRoomFor(req.user);
  if (old && old !== room) delete old.players[req.user.id];
  if (room.players[req.user.id]) {
    return res.json({ ok: true, room: pkPublicRoom(room, req.user.id) });
  }
  const pet = (req.user.pet || {});
  room.players[req.user.id] = {
    uid: req.user.id,
    name: req.user.name || req.user.username,
    dragonId: pet.dragonId || 'trex',
    petName: pet.name || '',
    stage: 0,
    points: 0,
    isHost: false,
    ready: false,
    finished: false,
    score: 0, correct: 0, wrong: 0, answered: 0,
    lastAt: Date.now()
  };
  res.json({ ok: true, room: pkPublicRoom(room, req.user.id) });
});

app.get('/api/pk/room/:code', requireAuth, requireRole('student'), async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const room = pkRooms[code];
  if (!room) return res.status(404).json({ error: '房间不存在' });
  // 计时结束：自动结束房间
  if (room.status === 'racing') {
    const elapsed = Math.floor((Date.now() - room.startedAt) / 1000);
    if (elapsed >= (room.minutes || 0) * 60) {
      room.status = 'ended';
      room.endedAt = Date.now();
      room.endReason = 'timeup';
    }
  }
  // 同时返回该用户的题库条目（首次进入比赛时拉取）
  let items = [];
  if (room.status === 'racing' && room.players[req.user.id]) {
    const { bank, error } = await loadBankForUser(req.user, room.bankId);
    if (!error && bank && Array.isArray(bank.entries)) {
      const need = room.count;
      const all = bank.entries.slice();
      // 用 code + bankId 当种子做一次稳定洗牌，保证每名玩家拿到的题目顺序一致
      let seed = 0;
      for (let i = 0; i < code.length; i++) seed = (seed * 31 + code.charCodeAt(i)) >>> 0;
      for (let i = all.length - 1; i > 0; i--) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        const j = seed % (i + 1);
        [all[i], all[j]] = [all[j], all[i]];
      }
      items = all.slice(0, need).map(e => ({
        english: e.english, chinese: e.chinese, pos: e.pos || '', type: e.type
      }));
    }
  }
  res.json({ ok: true, room: pkPublicRoom(room, req.user.id), items });
});

app.post('/api/pk/start', requireAuth, requireRole('student'), async (req, res) => {
  const code = String((req.body || {}).code || '').toUpperCase();
  const room = pkRooms[code];
  if (!room) return res.status(404).json({ error: '房间不存在' });
  if (room.hostId !== req.user.id) return res.status(403).json({ error: '只有房主可以开始比赛' });
  if (room.status !== 'waiting') return res.status(400).json({ error: '房间已开始或已结束' });
  if (Object.keys(room.players).length < 1) return res.status(400).json({ error: '房间内没有玩家' });
  room.status = 'racing';
  room.startedAt = Date.now();
  for (const uid of Object.keys(room.players)) {
    room.players[uid].ready = true;
    room.players[uid].startedAt = room.startedAt;
  }
  res.json({ ok: true, room: pkPublicRoom(room, req.user.id) });
});

app.post('/api/pk/report', requireAuth, requireRole('student'), async (req, res) => {
  const code = String((req.body || {}).code || '').toUpperCase();
  const room = pkRooms[code];
  if (!room) return res.status(404).json({ error: '房间不存在' });
  const p = room.players[req.user.id];
  if (!p) return res.status(403).json({ error: '你不在此房间' });
  const b = req.body || {};
  p.score = Number(b.score) || 0;
  p.correct = Number(b.correct) || 0;
  p.wrong = Number(b.wrong) || 0;
  p.answered = Number(b.answered) || 0;
  p.finished = !!b.finished;
  p.dragonId = String(b.dragonId || p.dragonId || 'trex');
  p.petName = String(b.petName || p.petName || '');
  p.stage = Number(b.stage) || 0;
  p.points = Number(b.points) || 0;
  p.lastAt = Date.now();
  if (p.finished && room.status === 'racing') {
    // 不立即结束房间，让其他人继续 / 计时结束统一结算
  }
  res.json({ ok: true });
});

app.post('/api/pk/leave', requireAuth, requireRole('student'), async (req, res) => {
  const code = String((req.body || {}).code || '').toUpperCase();
  const room = pkRooms[code];
  if (!room) return res.json({ ok: true });
  delete room.players[req.user.id];
  // 房主退出 / 房间空：销毁
  if (Object.keys(room.players).length === 0 || room.hostId === req.user.id) {
    if (room.status !== 'ended') {
      room.status = 'ended';
      room.endedAt = Date.now();
      room.endReason = 'host_left';
    }
    delete pkRooms[code];
  }
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
