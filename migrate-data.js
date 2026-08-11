const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const c = new Client({ host: 'db.yrcvncsqbucnbxtbvoym.supabase.co', port: 5432, user: 'postgres', password: 'EfUIa1HsEVIV6YJ2', database: 'postgres', ssl: { rejectUnauthorized: false } });

function load(f) { try { return JSON.parse(fs.readFileSync(path.join('data', f), 'utf8')); } catch (e) { return null; } }

(async () => {
  await c.connect();
  const users = load('users.json');
  const classes = load('classes.json');
  const banks = load('banks.json');
  const sessions = load('sessions.json');
  const progDir = path.join('data', 'progress');

  if (users) {
    for (const u of users.users) {
      await c.query(
        'INSERT INTO users (id, username, salt, password, role, class_id, pet, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO UPDATE SET username=EXCLUDED.username, salt=EXCLUDED.salt, password=EXCLUDED.password, role=EXCLUDED.role, class_id=EXCLUDED.class_id, pet=EXCLUDED.pet',
        [u.id, u.username, u.salt, u.password, u.role, u.classId || null, JSON.stringify(u.pet || null), u.createdAt]
      );
    }
    console.log('users migrated:', users.users.length);
  }
  if (classes) {
    for (const cl of classes.classes) {
      await c.query(
        'INSERT INTO classes (id, name, code, teacher_id, created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, code=EXCLUDED.code, teacher_id=EXCLUDED.teacher_id',
        [cl.id, cl.name, cl.code, cl.teacherId || null, cl.createdAt]
      );
    }
    console.log('classes migrated:', classes.classes.length);
  }
  if (banks) {
    for (const b of banks.banks) {
      await c.query(
        'INSERT INTO banks (id, class_id, title, entries, updated_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, entries=EXCLUDED.entries, updated_at=EXCLUDED.updated_at',
        [b.id, b.classId, b.title, JSON.stringify(b.entries || []), b.updatedAt]
      );
    }
    console.log('banks migrated:', banks.banks.length);
  }
  if (sessions) {
    for (const [token, s] of Object.entries(sessions.sessions || {})) {
      await c.query('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1,$2,$3) ON CONFLICT (token) DO NOTHING', [token, s.userId, s.expiresAt]);
    }
    console.log('sessions migrated:', Object.keys(sessions.sessions || {}).length);
  }
  if (fs.existsSync(progDir)) {
    let n = 0;
    for (const f of fs.readdirSync(progDir)) {
      const uid = f.replace(/\.json$/, '');
      const p = load('progress/' + f);
      if (!p) continue;
      await c.query(
        'INSERT INTO progress (user_id, entries, stats, created_at) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id) DO UPDATE SET entries=EXCLUDED.entries, stats=EXCLUDED.stats',
        [uid, JSON.stringify(p.entries || []), JSON.stringify(p.stats || {}), p.createdAt]
      );
      n++;
    }
    console.log('progress migrated:', n);
  }
  const cnt = await c.query('SELECT (SELECT count(*) FROM users) u, (SELECT count(*) FROM classes) cl, (SELECT count(*) FROM banks) b, (SELECT count(*) FROM progress) p');
  console.log('DB counts:', JSON.stringify(cnt.rows[0]));
  await c.end();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });