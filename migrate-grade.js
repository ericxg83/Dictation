// 一次性迁移：给 banks 表加 grade 列（六/七/八/九年级分类）
// 本地 .env 里有 PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE
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
  await c.query("ALTER TABLE banks ADD COLUMN IF NOT EXISTS grade TEXT");
  await c.query("CREATE INDEX IF NOT EXISTS idx_banks_grade ON banks (class_id, grade)");
  const r = await c.query("SELECT grade, count(*)::int AS n FROM banks GROUP BY grade ORDER BY grade NULLS LAST");
  console.log('banks 按年级统计：');
  r.rows.forEach(row => console.log(`  grade=${row.grade === null ? '未分类' : row.grade} → ${row.n} 个题库`));
  await c.end();
}).catch(e => { console.error('ERR:', e.message); process.exit(1); });
