const { Client } = require('pg');
const fs = require('fs');
const c = new Client({ host: 'db.yrcvncsqbucnbxtbvoym.supabase.co', port: 5432, user: 'postgres', password: 'EfUIa1HsEVIV6YJ2', database: 'postgres', ssl: { rejectUnauthorized: false } });
const sql = fs.readFileSync('C:/Users/ADMINI~1/AppData/Local/Temp/opencode/schema.sql', 'utf8');
c.connect().then(async () => {
  await c.query(sql);
  const t = await c.query("select tablename from pg_tables where schemaname='public' order by tablename");
  console.log('TABLES OK:', t.rows.map(r => r.tablename).join(', '));
  await c.end();
}).catch(e => { console.error('ERR:', e.message); process.exit(1); });