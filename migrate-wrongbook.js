// 一次性迁移：创建 wrong_book（学生错题本）表
// - 记录学生答错 / 偷看答案 的题
// - 同一题（同 progress_id）多次错误只保留一条，可累计错误次数
// - 标记 resolved 后不再出现在错题本列表（但不会删除，方便学生反悔）
try { require('dotenv').config(); } catch (e) {}
const { Client } = require('pg');
const c = new Client({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'postgres',
  ssl: { rejectUnauthorized: false }
});

c.connect().then(async () => {
  await c.query(`
    CREATE TABLE IF NOT EXISTS wrong_book (
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
    )
  `);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_wrong_book_user ON wrong_book (user_id, resolved, last_wrong_at DESC)`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_wrong_book_progress ON wrong_book (user_id, progress_id)`);

  const r = await c.query("SELECT count(*)::int AS n FROM wrong_book");
  console.log('wrong_book 已就绪，当前共 ' + r.rows[0].n + ' 条记录');
  await c.end();
}).catch(e => { console.error('ERR:', e.message); process.exit(1); });
