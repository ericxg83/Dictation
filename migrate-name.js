// 一次性迁移：给 users 表加 name（真实姓名）列，并用 username 回填已有用户
const { Client } = require('pg');
const c = new Client({
  host: 'aws-0-ap-southeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.yrcvncsqbucnbxtbvoym',
  password: 'EfUIa1HsEVIV6YJ2',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});
c.connect().then(async () => {
  await c.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT');
  await c.query('UPDATE users SET name = username WHERE name IS NULL OR name = \'\'');
  const r = await c.query('SELECT id, username, name, role FROM users ORDER BY created_at');
  console.log('USERS:', r.rows.length);
  r.rows.forEach(u => console.log(`  [${u.role}] ${u.username} → name="${u.name}"`));
  await c.end();
}).catch(e => { console.error('ERR:', e.message); process.exit(1); });
