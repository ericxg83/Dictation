const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const TOKEN_KEY = 'dict_token';
let currentUser = null;
let classInfo = null;
let session = null;
let checking = false;
let draft = []; // 老师草稿
let totalPoints = 0; // 累计积分（决定宠物等级）

// ================= 龙龙宠物体系：10 种龙，从蛋孵化到成年 =================
const DRAGON_KINDS = [
  { id: 'trex',    name: '霸王龙',   main: '#EF8A3C', dark: '#B85C14', belly: '#FFE9C7', wing: false, trait: 'spikes' },
  { id: 'stego',   name: '剑龙',     main: '#5FB85F', dark: '#2E7D32', belly: '#D8F0D8', wing: false, trait: 'plates' },
  { id: 'tricera', name: '三角龙',   main: '#4E9EE0', dark: '#1B5E9E', belly: '#D6E9FA', wing: false, trait: 'frill' },
  { id: 'ptero',   name: '翼龙',     main: '#A989E0', dark: '#6D4FA8', belly: '#E7DDF7', wing: true,  trait: 'crest' },
  { id: 'brachio', name: '雷龙',     main: '#5FC9B0', dark: '#1F8A70', belly: '#D6F2EA', wing: false, trait: 'long' },
  { id: 'spino',   name: '棘龙',     main: '#E8766B', dark: '#A63B30', belly: '#FADCD8', wing: false, trait: 'sail' },
  { id: 'ankylo',  name: '甲龙',     main: '#A98A5A', dark: '#6E5733', belly: '#EDE2CF', wing: false, trait: 'club' },
  { id: 'euro',    name: '欧洲龙',   main: '#D95F7A', dark: '#9C2F4A', belly: '#F7DCE4', wing: true,  trait: 'spiky' },
  { id: 'east',    name: '东方龙',   main: '#E8B54A', dark: '#A97C12', belly: '#FBEECB', wing: false, trait: 'east' },
  { id: 'ice',     name: '冰龙',     main: '#7FB8E8', dark: '#3A6FA0', belly: '#DBEBF8', wing: true,  trait: 'crystal' }
];

// 积分 → 进化阶段：蛋(0) → 幼龙(10) → 少年龙(30) → 成年龙(60)
const DRAGON_STAGES = [
  { min: 0,  name: '龙蛋',   tip: '默写攒积分让它孵化吧' },
  { min: 10, name: '幼龙',   tip: '破壳啦！继续攒积分成长' },
  { min: 30, name: '少年龙', tip: '长出翅膀/鳞甲，更威风了' },
  { min: 60, name: '成年龙', tip: '完全体！成为你的专属坐骑' }
];
const DRAGON_MAX_STAGE = DRAGON_STAGES.length - 1;

function dragonInfo(points) {
  let idx = 0;
  for (let i = 0; i < DRAGON_STAGES.length; i++) {
    if (points >= DRAGON_STAGES[i].min) idx = i;
  }
  const cur = DRAGON_STAGES[idx];
  const next = DRAGON_STAGES[idx + 1] || null;
  let pct = 100, label = cur.tip;
  if (next) {
    const span = next.min - cur.min;
    const have = points - cur.min;
    pct = Math.min(100, Math.round(have / span * 100));
    label = '当前积分 ' + points + ' · 再攒 ' + (next.min - points) + ' 分 → ' + next.name;
  } else {
    label = '当前积分 ' + points + ' · ' + cur.tip;
  }
  return { idx, cur, next, pct, label };
}

function myDragon() {
  const pet = currentUser && currentUser.pet;
  if (!pet) return null;
  return DRAGON_KINDS.find(d => d.id === pet.dragonId) || DRAGON_KINDS[0];
}

// ===== 龙龙 SVG 画布 =====
const EGGS = ['🥚', '🐣'];
function eggArt(d) {
  const color = d ? d.main : '#E8B54A';
  const spot = d ? d.dark : '#A97C12';
  return '<svg viewBox="0 0 120 140" class="dragon-svg">' +
    '<ellipse cx="60" cy="72" rx="38" ry="50" fill="' + color + '" stroke="' + spot + '" stroke-width="3"/>' +
    '<ellipse cx="60" cy="82" rx="22" ry="28" fill="' + (d ? d.belly : '#FBEECB') + '"/>' +
    '<circle cx="44" cy="52" r="5" fill="rgba(255,255,255,.45)"/>' +
    '<circle cx="72" cy="42" r="4" fill="rgba(255,255,255,.4)"/>' +
    '<circle cx="50" cy="78" r="3" fill="rgba(255,255,255,.35)"/>' +
    '<path d="M42 60 q5 -4 10 0" stroke="' + spot + '" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    '<path d="M68 60 q5 -4 10 0" stroke="' + spot + '" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    '<path d="M52 74 q8 6 16 0" stroke="' + spot + '" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    '<ellipse cx="46" cy="66" rx="4" ry="2.5" fill="rgba(255,150,150,.55)"/>' +
    '<ellipse cx="74" cy="66" rx="4" ry="2.5" fill="rgba(255,150,150,.55)"/>' +
    '</svg>';
}

function dragonArt(d, stage) {
  if (stage <= 0) return eggArt(d);
  const s = stage === 1 ? 0.55 : stage === 2 ? 0.78 : 1;
  const main = d.main, dark = d.dark, belly = d.belly;
  const hasWing = d.wing && stage >= 2;
  // 简化身体 + 头部 + 眼睛 + 装饰，随阶段放大
  let wing = '';
  if (hasWing) {
    wing = '<path d="M70 58 Q40 22 22 44 Q30 52 26 64 L58 68 Z" fill="' + dark + '" opacity=".9"/>' +
           '<path d="M74 56 Q92 30 104 46 Q98 54 100 62 L76 64 Z" fill="' + dark + '" opacity=".7"/>';
  }
  return '<svg viewBox="0 0 150 140" class="dragon-svg">' +
    '<g transform="translate(75 72) scale(' + s + ') translate(-75 -72)">' +
    // 尾巴
    '<path d="M52 96 C36 112 20 110 14 96 C10 88 16 82 22 88 C26 84 30 86 32 90 Z" fill="' + main + '" stroke="' + dark + '" stroke-width="2.5"/>' +
    // 身体
    '<ellipse cx="74" cy="86" rx="40" ry="34" fill="' + main + '" stroke="' + dark + '" stroke-width="3"/>' +
    '<ellipse cx="74" cy="94" rx="26" ry="20" fill="' + belly + '"/>' +
    // 腿
    '<ellipse cx="58" cy="116" rx="11" ry="7" fill="' + main + '" stroke="' + dark + '" stroke-width="2.5"/>' +
    '<ellipse cx="90" cy="116" rx="11" ry="7" fill="' + main + '" stroke="' + dark + '" stroke-width="2.5"/>' +
    wing +
    // 头部
    '<circle cx="112" cy="56" r="26" fill="' + main + '" stroke="' + dark + '" stroke-width="3"/>' +
    '<ellipse cx="130" cy="62" rx="15" ry="12" fill="' + main + '" stroke="' + dark + '" stroke-width="3"/>' +
    '<ellipse cx="136" cy="61" rx="4" ry="3" fill="' + dark + '"/>' +
    // 眼睛
    '<circle cx="104" cy="50" r="9" fill="#fff" stroke="' + dark + '" stroke-width="2.5"/>' +
    '<circle cx="107" cy="50" r="4.5" fill="' + dark + '"/>' +
    '<circle cx="109" cy="48" r="1.6" fill="#fff"/>' +
    // 腮红
    '<ellipse cx="92" cy="62" rx="5" ry="3.5" fill="rgba(255,150,150,.6)"/>' +
    // 嘴
    '<path d="M126 70 q6 4 12 1" stroke="' + dark + '" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
    // 头角
    '<path d="M104 34 L98 16 L112 28 Z" fill="' + dark + '"/>' +
    '<path d="M120 34 L126 16 L130 30 Z" fill="' + dark + '"/>' +
    traitArt(d, stage) +
    '</g></svg>';
}

function traitArt(d, stage) {
  const main = d.main, dark = d.dark, belly = d.belly;
  const on = stage >= 2;
  switch (d.trait) {
    case 'spikes': // 霸王龙：背棘
      return on ? '<path d="M52 60 L44 44 L60 54 Z M70 52 L70 34 L82 50 Z" fill="' + dark + '"/>' : '';
    case 'plates': // 剑龙：背板
      return on
        ? '<path d="M42 62 L34 46 L52 56 Z M58 52 L56 34 L70 50 Z M74 52 L78 36 L86 54 Z" fill="' + dark + '" opacity=".85"/>'
        : '';
    case 'frill': // 三角龙：颈盾 + 鼻角
      return on
        ? '<path d="M88 44 L84 22 L104 30 L116 20 L122 40 L108 34 Z" fill="' + belly + '" stroke="' + dark + '" stroke-width="2.5"/>' +
          '<path d="M108 34 L120 14 L116 38 Z" fill="' + belly + '" stroke="' + dark + '" stroke-width="2"/>'
        : '';
    case 'crest': // 翼龙：头冠
      return on
        ? '<path d="M118 34 Q130 6 146 10 Q136 26 138 40 L122 36 Z" fill="' + main + '" stroke="' + dark + '" stroke-width="2.5"/>'
        : '';
    case 'long': // 雷龙：长颈
      return '<ellipse cx="96" cy="40" rx="16" ry="24" fill="' + main + '" stroke="' + dark + '" stroke-width="2.5" transform="rotate(-18 96 40)"/>';
    case 'sail': // 棘龙：背帆
      return on
        ? '<path d="M50 58 C46 30 62 24 74 26 C88 28 96 34 100 46 C82 42 66 46 58 62 Z" fill="' + d.belly + '" stroke="' + dark + '" stroke-width="2.5"/>'
        : '';
    case 'club': // 甲龙：尾锤
      return on
        ? '<circle cx="16" cy="96" r="12" fill="' + main + '" stroke="' + dark + '" stroke-width="3"/>'
        : '';
    case 'spiky': // 欧洲龙：背刺
      return on
        ? '<path d="M60 58 L54 42 L68 52 Z M78 52 L80 36 L90 52 Z" fill="' + dark + '"/>'
        : '';
    case 'east': // 东方龙：长须
      return '<path d="M136 58 q14 2 14 14" stroke="' + dark + '" stroke-width="3" fill="none" stroke-linecap="round"/>' +
             '<circle cx="150" cy="72" r="3" fill="' + dark + '"/>';
    case 'crystal': // 冰龙：冰晶
      return on
        ? '<path d="M96 70 L88 56 L104 66 Z M108 74 L116 60 L112 76 Z" fill="#DFF3FF" stroke="' + dark + '" stroke-width="2"/>'
        : '';
    default: return '';
  }
}

function currentStageIndex(points) {
  let idx = 0;
  for (let i = 0; i < DRAGON_STAGES.length; i++) {
    if (points >= DRAGON_STAGES[i].min) idx = i;
  }
  return idx;
}

function renderPetPanel() {
  const d = myDragon();
  const pi = dragonInfo(totalPoints);
  $('#petEmoji').innerHTML = d ? dragonArt(d, pi.idx) : eggArt(null);
  $('#petName').textContent = d ? (currentUser.pet.name || d.name) : '尚未领养';
  $('#petDesc').textContent = d
    ? d.name + ' · ' + pi.cur.name + (currentUser.pet.name ? '（' + currentUser.pet.name + '）' : '')
    : '在「学习统计」里领养一只龙龙吧';
  $('#petBar').style.width = pi.pct + '%';
  $('#petProgress').textContent = pi.label;
}

function renderCornerPet() {
  const wrap = $('#cornerPet');
  const d = myDragon();
  if (!d || currentUser.role !== 'student') { wrap.hidden = true; return; }
  const idx = currentStageIndex(totalPoints);
  wrap.hidden = false;
  $('#cornerPetEmoji').innerHTML = dragonArt(d, idx);
  $('#cornerPetName').textContent = currentUser.pet.name || d.name;
}

// ===== 领取/更换龙龙 =====
let _pickedDragon = DRAGON_KINDS[0].id;
function renderPetPick() {
  const grid = $('#petPick');
  grid.innerHTML = '';
  DRAGON_KINDS.forEach(d => {
    const div = document.createElement('div');
    div.className = 'pet-opt' + (d.id === _pickedDragon ? ' sel' : '');
    div.innerHTML =
      '<div class="pet-opt-art">' + dragonArt(d, DRAGON_MAX_STAGE) + '</div>' +
      '<div class="pet-opt-name">' + esc(d.name) + '</div>' +
      '<div class="pet-opt-tip">蛋 → 幼龙 → 少年 → 成年</div>';
    div.onclick = () => { _pickedDragon = d.id; renderPetPick(); };
    grid.appendChild(div);
  });
}
function openPetModal() {
  const isChange = !!(currentUser.pet && currentUser.pet.dragonId);
  _pickedDragon = (currentUser.pet && currentUser.pet.dragonId) || DRAGON_KINDS[0].id;
  $('#petNameInput').value = currentUser.pet ? currentUser.pet.name || '' : '';
  $('#petMsg').textContent = '';
  $('#petModalTitle').textContent = isChange ? '更换伙伴' : '领养你的小龙 🐉';
  $('#petModalSub').textContent = isChange
    ? '你已经有一只龙龙了。更换伙伴会损失当前 20% 的经验值，且它已陪伴你的时光不会保留。'
    : '选一只龙龙做你的伙伴，它会在你每次默写时安静地陪着你。随着积分增长，龙龙会从蛋里孵化、逐渐长大！';
  $('#petChangeWarn').hidden = !isChange;
  renderPetPick();
  $('#petModal').hidden = false;
}
function closePetModal() { $('#petModal').hidden = true; }
$('#changePetBtn').onclick = openPetModal;
$('#petConfirmBtn').onclick = async () => {
  const name = $('#petNameInput').value.trim();
  $('#petMsg').textContent = '';
  if (!name) { $('#petMsg').textContent = '给龙龙取个名字吧'; return; }
  const isChange = !!(currentUser.pet && currentUser.pet.dragonId);
  if (isChange) {
    if (!confirm('更换伙伴将损失当前 20% 的经验值，龙龙可能会降级。确定要更换吗？')) return;
  }
  try {
    const r = await api('/api/pet', { method: 'POST', body: { dragonId: _pickedDragon, name } });
    if (currentUser) currentUser.pet = r.pet;
    if (typeof r.points === 'number') totalPoints = r.points;
    closePetModal();
    renderPetPanel();
    renderCornerPet();
    if (isChange && r.lostPoints > 0) {
      alert('已更换伙伴！本次损失了 ' + r.lostPoints + ' 点经验值。从今天起，好好陪你的新龙龙成长吧～');
    } else {
      alert('领养成功！你的「' + name + '」会陪着你的，记得每天来默写给它升级～');
    }
  } catch (e) { $('#petMsg').textContent = e.message; }
};

// ================= 请求封装 =================
function token() { return localStorage.getItem(TOKEN_KEY) || ''; }
async function api(path, opts) {
  const o = opts || {};
  o.headers = Object.assign({}, o.headers || {});
  if (token()) o.headers.Authorization = 'Bearer ' + token();
  if (o.body && !(o.body instanceof FormData)) {
    o.headers['Content-Type'] = 'application/json';
    o.body = JSON.stringify(o.body);
  }
  const res = await fetch(path, o);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) { doLogout(true); throw new Error(data.error || '登录已过期'); }
    throw new Error(data.error || '请求失败');
  }
  return data;
}

// ================= 认证流程 =================
function showAuth() { $('#appView').hidden = true; $('#authView').hidden = false; }
function showApp() { $('#authView').hidden = true; $('#appView').hidden = false; }

$('#tabLogin').onclick = () => { $('#tabLogin').classList.add('active'); $('#tabReg').classList.remove('active'); $('#loginForm').hidden = false; $('#regForm').hidden = true; };
$('#tabReg').onclick = () => { $('#tabReg').classList.add('active'); $('#tabLogin').classList.remove('active'); $('#loginForm').hidden = true; $('#regForm').hidden = false; };

$$('input[name="role"]').forEach(r => r.onchange = () => {
  $('#fieldClassName').hidden = r.value !== 'teacher';
  $('#fieldClassCode').hidden = r.value !== 'student';
});

$('#loginForm').onsubmit = async ev => {
  ev.preventDefault();
  const msg = $('#loginMsg');
  msg.textContent = '';
  try {
    const d = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: $('#loginUser').value.trim(), password: $('#loginPwd').value })
    }).then(r => r.json());
    if (!d.token) { msg.textContent = d.error || '登录失败'; return; }
    applyAuth(d);
  } catch (e) { msg.textContent = e.message; }
};

$('#regForm').onsubmit = async ev => {
  ev.preventDefault();
  const msg = $('#regMsg');
  msg.textContent = '';
  const role = $('input[name="role"]:checked').value;
  const body = {
    name: $('#regName').value.trim(),
    username: $('#regUser').value.trim(),
    password: $('#regPwd').value,
    role
  };
  if (role === 'teacher') body.className = $('#regClass').value.trim();
  else body.classCode = $('#regCode').value.trim();
  try {
    const d = await fetch('/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(r => r.json());
    if (!d.token) { msg.textContent = d.error || '注册失败'; return; }
    applyAuth(d);
  } catch (e) { msg.textContent = e.message; }
};

function applyAuth(d) {
  localStorage.setItem(TOKEN_KEY, d.token);
  currentUser = d.user;
  classInfo = d.classInfo;
  $('#userInfo').textContent = (d.user.role === 'teacher' ? '老师' : '学生') + '：' + (d.user.name || d.user.username);
  $('#classBadge').textContent = classInfo ? (d.user.role === 'teacher' ? '班级 ' + classInfo.name + '（' + classInfo.code + '）' : '班级 ' + classInfo.name) : '未加入班级';
  showApp();
  // 移动端底部 tab 栏：根据角色只显示对应的 3 个
  const tabbar = $('#mobileTabbar');
  tabbar.classList.toggle('is-teacher', currentUser.role === 'teacher');
  tabbar.classList.toggle('is-student', currentUser.role !== 'teacher');
  tabbar.hidden = false;
  if (currentUser.role === 'teacher') {
    $('#teacherNav').hidden = false;
    $('#studentNav').hidden = true;
    switchView('teacher-banks');
  } else {
    $('#teacherNav').hidden = true;
    $('#studentNav').hidden = false;
    switchView('student-banks');
    // 新注册学生（还没有宠物）→ 引导领养龙龙
    if (!currentUser.pet) openPetModal();
    renderCornerPet();
  }
}

function doLogout(expired) {
  localStorage.removeItem(TOKEN_KEY);
  currentUser = null;
  classInfo = null;
  session = null;
  $('#dueBanner').hidden = true;
  document.title = '英语默写助手';
  if (expired) alert('登录已过期，请重新登录');
  showAuth();
}

$('#logoutBtn').onclick = async () => {
  try { await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token() } }); } catch (e) {}
  doLogout(false);
};

(async function boot() {
  if (!token()) { showAuth(); return; }
  try {
    const d = await api('/api/me');
    applyAuth({ token: token(), user: d.user, classInfo: d.classInfo });
  } catch (e) {
    showAuth();
  }
})();

// ================= 导航 =================
function switchView(name) {
  $$('.view').forEach(v => v.hidden = v.id !== 'view-' + name);
  const nav = currentUser.role === 'teacher' ? $('#teacherNav') : $('#studentNav');
  Array.from(nav.querySelectorAll('button')).forEach(b => b.classList.toggle('active', b.dataset.view === name));
  // 底部 tab 栏 active 同步
  const tabbar = $('#mobileTabbar');
  if (tabbar) Array.from(tabbar.querySelectorAll('button')).forEach(b => b.classList.toggle('active', b.dataset.view === name));
  // 离开练习页时：退出沉浸式、停止键盘自适应
  if (name !== 'practice') {
    document.body.classList.remove('immersive');
    document.body.classList.remove('keyboard-up');
    $('#exitFullBtn').hidden = true;
  }
  if (name === 'teacher-banks') loadBanks();
  if (name === 'teacher-students') loadStudents();
  if (name === 'live') { enterLiveBoard(); return; }
  if (name === 'student-banks') loadStudentBanks();
  if (name === 'practice') { currentBank = null; prepareToday(); }
  if (name === 'stats') loadStats();
  stopLivePoll();
  // 切页后滚到顶（移动端 iOS 上 instant 比 smooth 体验更好）
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  // 切页后让 focus 离开输入框（避免 iOS 键盘不收起）
  try { if (document.activeElement && document.activeElement.tagName === 'INPUT') document.activeElement.blur(); } catch (e) {}
}
$$('nav button').forEach(b => b.onclick = () => switchView(b.dataset.view));
// 底部 tab 栏点击：与顶部 nav 行为一致
$$('#mobileTabbar button').forEach(b => b.onclick = () => switchView(b.dataset.view));

// ================= 声音 =================
let actx = null;
function ac() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(freq, start, dur, type, vol) {
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type || 'sine';
  o.frequency.value = freq;
  o.connect(g); g.connect(c.destination);
  const t = c.currentTime + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.25, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); o.stop(t + dur + 0.05);
}
function playCorrect() {
  tone(523, 0, 0.15, 'sine', 0.25);
  tone(659, 0.12, 0.15, 'sine', 0.25);
  tone(784, 0.24, 0.25, 'sine', 0.25);
  haptic(15);
}
function playWrong() {
  tone(220, 0, 0.2, 'sawtooth', 0.14);
  tone(150, 0.18, 0.32, 'sawtooth', 0.14);
  haptic([25, 50, 25]);
}
// 输入过程中的轻提示音（答错/拼写超长）
function playWarn() {
  tone(320, 0, 0.1, 'square', 0.12);
  haptic(8);
}
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.9;
  u.onstart = () => waveStart();
  u.onend = () => waveStop();
  u.onerror = () => waveStop();
  speechSynthesis.speak(u);
}

// ===== 朗读声纹动画 =====
let _waveTimer = null;
function waveStart() {
  const box = $('#waveBox');
  if (!box) return;
  box.innerHTML = '';
  for (let i = 0; i < 20; i++) {
    const b = document.createElement('div');
    b.className = 'wave-bar';
    b.style.height = (40 + Math.random() * 60) + '%';
    b.style.animationDelay = (Math.random() * 0.4) + 's';
    box.appendChild(b);
  }
  box.classList.add('on');
}
function waveStop() {
  const box = $('#waveBox');
  if (!box) return;
  box.classList.remove('on');
  if (_waveTimer) clearTimeout(_waveTimer);
  _waveTimer = setTimeout(() => { box.innerHTML = ''; }, 400);
}

// ================= 老师 · 题库管理 =================
$('#fileInput').addEventListener('change', async ev => {
  const file = ev.target.files[0];
  if (!file) return;
  setStatus('<span class="dot-pulse"></span><span class="dot-pulse"></span><span class="dot-pulse"></span> 正在解析文件，请稍候…');
  const fd = new FormData();
  fd.append('file', file);
  try {
    const d = await api('/api/parse', { method: 'POST', body: fd });
    if (!d.entries.length) { setStatus('未提取到条目。提示：扫描版 PDF 需先 OCR 转成文字，或改用 Word 文档。', true); return; }
    if (draft.length && !confirm('解析到 ' + d.entries.length + ' 条，是否替换当前草稿？')) { setStatus('已取消，草稿未变。'); return; }
    draft = d.entries;
    renderDraft();
    setStatus('成功解析 ' + d.entries.length + ' 条。请在下方检查修正后填写标题并发布。');
    if (window.innerWidth <= 720) toast('已解析 ' + d.entries.length + ' 条，请检查后发布');
  } catch (err) {
    setStatus('解析失败：' + err.message, true);
  }
  ev.target.value = '';
});

function setStatus(t, err) {
  const el = $('#parseStatus');
  el.innerHTML = t;
  el.className = 'status' + (err ? ' err' : ' ok');
}

function renderDraft() {
  $('#draftBox').hidden = !draft.length;
  if (!draft.length) return;
  const tb = $('#libTable tbody');
  const tbl = $('#libTable');
  // 小屏：表格 → 卡片；>=721：表格
  tbl.classList.toggle('mobile-as-cards', window.innerWidth <= 720);
  tb.innerHTML = '';
  draft.forEach((e, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '' +
      '<td>' + (i + 1) + '</td>' +
      '<td><input class="in-en" value="' + esc(e.english) + '"></td>' +
      '<td><input class="in-pos" value="' + esc(e.pos || '') + '" placeholder="n." style="width:56px"></td>' +
      '<td><input class="in-zh" value="' + esc(e.chinese) + '"></td>' +
      '<td><select class="in-type">' +
      '  <option value="word">单词</option>' +
      '  <option value="phrase">词组</option>' +
      '  <option value="sentence">句子</option>' +
      '</select></td>' +
      '<td><button class="del">删除</button></td>';
    tr.querySelector('.in-type').value = e.type || 'word';
    tr.querySelector('.del').onclick = () => { draft.splice(i, 1); renderDraft(); };
    tb.appendChild(tr);
  });
}

$('#addRowBtn').onclick = () => { draft.push({ english: '', chinese: '', pos: '', type: 'word' }); renderDraft(); };

$('#saveBtn').onclick = async () => {
  const rows = $$('#libTable tbody tr').map(tr => ({
    english: tr.querySelector('.in-en').value.trim(),
    chinese: tr.querySelector('.in-zh').value.trim(),
    pos: tr.querySelector('.in-pos').value.trim(),
    type: tr.querySelector('.in-type').value
  })).filter(x => x.english || x.chinese);
  if (!rows.length) { alert('题库为空，请先添加内容。'); return; }
  try {
    const title = $('#bankTitle').value.trim();
    if (editingBankId) {
      await api('/api/bank/' + editingBankId, { method: 'PUT', body: { title, entries: rows } });
      resetDraft();
      setStatus('已保存修改，学生端将看到更新后的题库。');
    } else {
      await api('/api/bank', { method: 'POST', body: { title, entries: rows } });
      resetDraft();
      setStatus('已发布，学生可在「我的题库」中查看。');
    }
    loadBanks();
  } catch (e) { setStatus('保存失败：' + e.message, true); }
};

$('#discardBtn').onclick = () => { resetDraft(); setStatus('已放弃草稿。'); };

let editingBankId = null; // 正在编辑的题库 id（null = 新建草稿）

async function loadBanks() {
  const d = await api('/api/bank');
  const wrap = $('#bankList');
  if (!d.banks.length) {
    wrap.innerHTML = '<div class="empty">还没有发布题库。上传文件并发布第一个题库吧。</div>';
    return;
  }
  wrap.innerHTML = '';
  d.banks.forEach(b => {
    const card = document.createElement('div');
    card.className = 'bank-card';
    const time = new Date(b.updatedAt).toLocaleString('zh-CN');
    const btns = document.createElement('div');
    btns.className = 'bank-btns';
    const editBtn = document.createElement('button');
    editBtn.className = 'ghost-btn';
    editBtn.textContent = '编辑';
    editBtn.onclick = () => editBank(b);
    const delBtn = document.createElement('button');
    delBtn.className = 'ghost-btn danger-btn';
    delBtn.textContent = '删除';
    delBtn.onclick = async () => {
      if (!confirm('确定删除题库「' + b.title + '」？学生进度不受影响，但题库将不可再练习。')) return;
      await api('/api/bank/' + b.id, { method: 'DELETE' });
      if (editingBankId === b.id) resetDraft();
      loadBanks();
    };
    btns.appendChild(editBtn);
    btns.appendChild(delBtn);
    card.appendChild(
      Object.assign(document.createElement('div'), {
        className: 'bank-main',
        innerHTML: '<b>' + esc(b.title) + '</b><span class="bank-meta">' + b.count + ' 条 · 更新于 ' + time + '</span>'
      })
    );
    card.appendChild(btns);
    wrap.appendChild(card);
  });
}

// 加载已发布题库进入编辑区
async function editBank(bank) {
  const d = await api('/api/bank/' + bank.id + '/edit');
  draft = d.entries.map(e => ({ english: e.english, chinese: e.chinese, pos: e.pos || '', type: e.type || 'word' }));
  editingBankId = d.bank.id;
  $('#bankTitle').value = d.bank.title;
  $('#saveBtn').textContent = '保存修改';
  $('#draftHeadLabel').textContent = '编辑题库：' + d.bank.title;
  renderDraft();
  setStatus('正在编辑已发布题库。修改后点「保存修改」，学生端将看到更新。');
  $('#draftBox').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetDraft() {
  editingBankId = null;
  draft = [];
  $('#bankTitle').value = '';
  $('#saveBtn').textContent = '发布 / 更新题库';
  $('#draftHeadLabel').textContent = '新建题库';
  renderDraft();
}

// ================= 老师 · 班级学生 =================
async function loadStudents() {
  const d = await api('/api/class/students');
  const wrap = $('#studentList');
  if (!d.students.length) {
    wrap.innerHTML = '<div class="empty">还没有学生加入班级。把班级码 <b>' + esc(classInfo.code) + '</b> 告诉学生，让他们注册时加入。</div>';
    return;
  }
  wrap.innerHTML = '<div class="empty" style="margin-bottom:12px">班级码：<b>' + esc(classInfo.code) + '</b>（共 ' + d.students.length + ' 名学生）</div>';
  if (window.innerWidth <= 720) {
    // 小屏：渲染卡片列表
    const cards = document.createElement('div');
    cards.className = 'stu-cards';
    d.students.forEach(s => {
      const last = s.lastActive ? new Date(s.lastActive).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '从未练习';
      const dragon = s.pet ? (DRAGON_KINDS.find(k => k.id === s.pet.dragonId) || null) : null;
      const petTxt = dragon ? (dragon.name + (s.pet.name ? '（' + s.pet.name + '）' : '')) : '未领养';
      const nameTxt = s.name && s.name !== s.username ? s.name + '（' + s.username + '）' : (s.name || s.username);
      const card = document.createElement('div');
      card.className = 'stu-card';
      card.innerHTML =
        '<div class="stu-name">' + esc(nameTxt) + ' <span style="font-weight:400;color:var(--ink-3);font-size:12px">· ' + esc(petTxt) + '</span></div>' +
        '<div class="stu-meta">总 <b>' + s.total + '</b></div>' +
        '<div class="stu-meta">掌握 <b>' + s.mastered + '</b></div>' +
        '<div class="stu-meta">待复习 <b>' + s.due + '</b></div>' +
        '<div class="stu-meta">得分 <b>' + s.points + '</b></div>' +
        '<div class="stu-meta" style="grid-column:1/-1;color:var(--ink-3);font-size:12px">最近：' + esc(last) + '</div>' +
        '<div class="stu-actions"><button class="ghost-btn" data-id="' + esc(s.id) + '" data-name="' + esc(s.name || s.username) + '">改名</button></div>';
      card.querySelector('button').onclick = () => {
        const cur = card.querySelector('button').dataset.name;
        const v = prompt('修改「' + cur + '」的姓名：', cur);
        if (v === null || !v.trim()) return;
        const sid = card.querySelector('button').dataset.id;
        api('/api/class/student/' + sid, { method: 'PUT', body: { name: v.trim() } })
          .then(r => { s.name = r.user.name; loadStudents(); })
          .catch(e => alert(e.message));
      };
      cards.appendChild(card);
    });
    wrap.appendChild(cards);
    return;
  }
  // 桌面：原表格
  const table = document.createElement('table');
  table.className = 'mini-table';
  table.innerHTML = '<thead><tr><th>学生</th><th>宠物</th><th>总条目</th><th>已掌握</th><th>待复习</th><th>得分</th><th>最近活跃</th><th></th></tr></thead>';
  const tb = document.createElement('tbody');
  d.students.forEach(s => {
    const tr = document.createElement('tr');
    const last = s.lastActive ? new Date(s.lastActive).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '从未练习';
    const dragon = s.pet ? (DRAGON_KINDS.find(k => k.id === s.pet.dragonId) || null) : null;
    const petTxt = dragon ? (dragon.name + (s.pet.name ? '(' + s.pet.name + ')' : '')) : '未领养';
    const nameTd = document.createElement('td');
    const nameTxt = s.name && s.name !== s.username ? s.name + '（' + s.username + '）' : (s.name || s.username);
    nameTd.textContent = nameTxt;
    const editTd = document.createElement('td');
    const editBtn = document.createElement('button');
    editBtn.className = 'ghost-btn';
    editBtn.textContent = '改名';
    editBtn.onclick = async () => {
      const cur = s.name || s.username;
      const v = prompt('修改「' + cur + '」的姓名：', cur);
      if (v === null || !v.trim()) return;
      try {
        const r = await api('/api/class/student/' + s.id, { method: 'PUT', body: { name: v.trim() } });
        s.name = r.user.name;
        loadStudents();
      } catch (e) { alert(e.message); }
    };
    editTd.appendChild(editBtn);
    tr.appendChild(nameTd);
    tr.appendChild(Object.assign(document.createElement('td'), { textContent: petTxt }));
    tr.appendChild(Object.assign(document.createElement('td'), { textContent: s.total }));
    tr.appendChild(Object.assign(document.createElement('td'), { textContent: s.mastered }));
    tr.appendChild(Object.assign(document.createElement('td'), { textContent: s.due }));
    tr.appendChild(Object.assign(document.createElement('td'), { textContent: s.points }));
    tr.appendChild(Object.assign(document.createElement('td'), { textContent: last }));
    tr.appendChild(editTd);
    tb.appendChild(tr);
  });
  table.appendChild(tb);
  wrap.appendChild(table);
}

// ================= 老师 · 大屏实时看板 =================
let _liveTimer = null;
function stopLivePoll() {
  if (_liveTimer) { clearInterval(_liveTimer); _liveTimer = null; }
}
function enterLiveBoard() {
  loadLiveBoard();
  if (_liveTimer) clearInterval(_liveTimer);
  _liveTimer = setInterval(loadLiveBoard, 2000);
}
async function loadLiveBoard() {
  let d;
  try { d = await api('/api/live/board'); } catch (e) { return; }
  renderLiveClock(d.session);
  renderLiveGrid(d.players, d.session);
}
function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return m + ':' + s;
}
function renderLiveClock(sess) {
  const num = $('#liveClockNum');
  const state = $('#liveClockState');
  if (!sess) { num.textContent = '00:00'; state.textContent = '未开始'; state.className = 'live-clock-state'; return; }
  num.textContent = fmtClock(sess.remaining);
  if (sess.ended || sess.remaining <= 0) {
    state.textContent = '已结束';
    num.textContent = sess.remaining <= 0 ? '00:00' : '00:00';
    state.className = 'live-clock-state timeup';
  } else {
    state.textContent = '默写中';
    state.className = 'live-clock-state running';
  }
}
function renderLiveGrid(players, sess) {
  const grid = $('#liveGrid');
  if (!players.length) {
    grid.innerHTML = '<div class="empty">还没有学生上线。让同学们打开练习页（老师开启开始默写后，学生端会显示倒计时横幅）。</div>';
    return;
  }
  grid.innerHTML = '';
  const active = players.filter(p => !p.done);
  const done = players.filter(p => p.done);
  [...active, ...done].forEach(p => {
    const card = document.createElement('div');
    const d = DRAGON_KINDS.find(k => k.id === p.dragonId) || DRAGON_KINDS[0];
    const pct = p.answered > 0 ? Math.min(100, Math.round(p.answered / (p.answered + p.wrong) * 100)) : 0;
    const typed = p.typedLen ? new Array(Math.min(p.typedLen, 30)).fill('▮').join('') : '';
    const dt = new Date(p.lastAt);
    const cardPane = document.createElement('div');
    card.className = 'lv-card' + (p.done ? ' done' : '');
    card.innerHTML =
      '<div class="lv-head">' +
      '<div class="lv-pet">' + dragonArt(d, p.stage) + '</div>' +
      '<div class="lv-name"><b>' + esc(p.username) + '</b><span>' + esc(p.petName || d.name) + '</span></div>' +
      '<div class="lv-score">' + p.score + ' 分</div>' +
      '</div>' +
      '<div class="lv-word" title="' + esc(p.word || '') + '">' + (p.done ? '✓ 已完成' : (p.word ? esc(p.word) : '准备中…')) + '</div>' +
      '<div class="lv-typed">' + (p.done ? '' : esc(typed) || '正在输入…') + '</div>' +
      '<div class="lv-bar"><div style="width:' + pct + '%"></div></div>' +
      '<div class="lv-stats"><span>进度 <b>' + p.answered + '</b></span><span>正确 <b>' + p.correct + '</b></span><span>错误 <b>' + p.wrong + '</b></span></div>' +
      '<div class="lv-time">' + dt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '</div>';
    grid.appendChild(card);
  });
}
$('#liveStartBtn').onclick = async () => {
  const minutes = Math.min(60, Math.max(1, parseInt($('#liveMinutes').value, 10) || 10));
  await api('/api/live/start', { method: 'POST', body: { minutes } });
  loadLiveBoard();
};
$('#liveStopBtn').onclick = async () => {
  await api('/api/live/stop', { method: 'POST' });
  loadLiveBoard();
};
$('#liveFullBtn').onclick = () => {
  const el = $('#view-live');
  if (document.fullscreenElement) { document.exitFullscreen(); }
  else if (el.requestFullscreen) el.requestFullscreen();
};

// ================= 学生 · 大屏自动上报 =================
let _liveReportTick = 0;
function liveStatus() {
  if (currentUser.role !== 'student') return;
  const word = session && session.current ? session.current.chinese : '';
  const answer = session && session.current ? session.current.english : '';
  const typedLen = session && !session.locked ? String($('#answerInput').value).replace(/\s+/g, '').length : 0;
  const total = session ? session.total : 0;
  const answered = session ? total - session.queue.length : 0;
  const done = !!(session && !session.queue.length && $('#practiceSummary') && !$('#practiceSummary').hidden);
  const d = myDragon() || DRAGON_KINDS[0];
  api('/api/live/report', {
    method: 'POST',
    body: {
      dragonId: d.id, petName: (currentUser.pet && currentUser.pet.name) || '',
      stage: currentStageIndex(totalPoints), points: totalPoints,
      word, answer, typedLen, answered,
      correct: session ? session.score : 0,
      wrong: session ? session.wrong : 0,
      score: session ? session.score : 0,
      done
    }
  }).catch(() => {});
}
function throttleLiveReport() {
  const now = Date.now();
  if (now - _liveReportTick < 800) return;
  _liveReportTick = now;
  liveStatus();
}

// ================= 学生 · 倒计时横幅 =================
let _liveClockTimer = null;
let _liveBannerHideTimer = null;
function studentLiveClock() {
  const banner = $('#liveBanner');
  if (!banner) return;
  // 切到非练习页时，强制隐藏并清掉自动隐藏定时器
  if (currentUser.role !== 'student' || $('#view-practice').hidden) {
    banner.hidden = true;
    if (_liveBannerHideTimer) { clearTimeout(_liveBannerHideTimer); _liveBannerHideTimer = null; }
    return;
  }
  api('/api/live').then(d => {
    if (d.active) {
      // 老师正在开启的默写 → 显示倒计时
      if (_liveBannerHideTimer) { clearTimeout(_liveBannerHideTimer); _liveBannerHideTimer = null; }
      banner.hidden = false;
      $('#liveBannerText').textContent = '老师已开启默写';
      $('#liveBannerClock').textContent = fmtClock(d.remaining);
      // 给倒计时一个强调色
      banner.classList.remove('ended');
    } else if (d.ended) {
      // 已结束（老师手动结束 / 自然超时）：显示一次，5 秒后自动隐藏
      banner.hidden = false;
      $('#liveBannerText').textContent = '默写已结束';
      $('#liveBannerClock').textContent = '00:00';
      banner.classList.add('ended');
      if (!_liveBannerHideTimer) {
        _liveBannerHideTimer = setTimeout(() => {
          banner.hidden = true;
          banner.classList.remove('ended');
          _liveBannerHideTimer = null;
        }, 5000);
      }
    } else {
      // 没有活动 session 也不处于"刚结束"状态 → 隐藏
      banner.hidden = true;
      banner.classList.remove('ended');
      if (_liveBannerHideTimer) { clearTimeout(_liveBannerHideTimer); _liveBannerHideTimer = null; }
    }
  }).catch(() => {
    banner.hidden = true;
    banner.classList.remove('ended');
  });
}
setInterval(studentLiveClock, 1000);
setInterval(throttleLiveReport, 1000);

// ================= 学生 · 题库 =================
async function loadStudentBanks() {
  const d = await api('/api/banks');
  $('#myClassInfo').textContent = d.classInfo ? '所在班级：' + d.classInfo.name : '你还没有加入班级，请找老师获取班级码后重新注册。';
  const wrap = $('#stuBankList');
  if (!d.banks.length) {
    wrap.innerHTML = '<div class="empty">老师还没有发布题库，稍后再来看看。</div>';
    return;
  }
  wrap.innerHTML = '';
  d.banks.forEach(b => {
    const card = document.createElement('div');
    card.className = 'bank-card';
    card.innerHTML = '' +
      '<div class="bank-main"><b>' + esc(b.title) + '</b>' +
      '<span class="bank-meta">' + b.count + ' 条</span></div>' +
      '<button class="primary" data-pick="' + b.id + '">开始默写</button>';
    card.querySelector('[data-pick]').onclick = () => startBankPractice(b);
    wrap.appendChild(card);
  });
}

let currentBank = null;
async function startBankPractice(bank) {
  let d;
  try {
    d = await api('/api/bank/' + bank.id);
  } catch (e) {
    alert('加载题库失败：' + e.message);
    return;
  }
  const now = Date.now();
  const items = d.entries
    .filter(e => (e.level || 0) < 4 && (e.nextDue || 0) <= now)
    .map(e => ({ id: e.id, english: e.english, chinese: e.chinese, pos: e.pos, type: e.type }));
  currentBank = { id: d.bank.id, title: d.bank.title };
  showPracticeView();
  preparePractice(items, '默写：' + d.bank.title, '共 ' + d.entries.length + ' 条，本次待默写 <b>' + items.length + '</b> 条');
}

// ================= 今日待复习 =================
async function prepareToday() {
  let d = { dueCount: 0, total: 0 };
  try { d = await api('/api/today'); } catch (e) { return; }
  if (typeof d.points === 'number') totalPoints = d.points;
  renderCornerPet();
  $('#dueBannerText').textContent = '今天有 ' + d.dueCount + ' 项待复习，坚持就是胜利！';
  $('#dueBanner').hidden = d.dueCount <= 0;
  document.title = d.dueCount > 0 ? '英语默写（待复习 ' + d.dueCount + '）' : '英语默写助手';
  if (session) return;
  preparePractice(null, '今日练习', '今天待复习 <b>' + d.dueCount + '</b> 项（题库共 ' + d.total + ' 项）');
}

$('#dueGoBtn').onclick = () => { switchView('practice'); startPractice(false); };

function preparePractice(items, title, sub) {
  session = null;
  $('#practiceReady').hidden = false;
  $('#practiceSummary').hidden = true;
  $('#practiceCard').hidden = true;
  $('#practiceTitle').textContent = title || '今日练习';
  $('#practiceSub').innerHTML = sub || '';
  if (items) {
    // 每次点击「开始」都重新洗牌，避免每次都是同一顺序
    $('#startBtn').onclick = () => startPracticeFrom(shuffle(items));
  } else {
    $('#startBtn').onclick = () => startPractice(false);
  }
}

async function startPractice(force) {
  let items;
  const d = await api('/api/today');
  if (d.dueCount) {
    items = d.items;
  } else if (force) {
    const dd = await api('/api/banks');
    if (dd.banks.length) {
      const bd = await api('/api/bank/' + dd.banks[0].id);
      const now = Date.now();
      items = bd.entries.filter(e => (e.level || 0) < 4 && (e.nextDue || 0) <= now)
        .map(e => ({ id: e.id, english: e.english, chinese: e.chinese, pos: e.pos, type: e.type }));
    }
  }
  if (!items || !items.length) {
    alert('题库为空或没有到期内容，请等待老师发布题库。');
    return;
  }
  // 今日练习走 force 路径时也要洗牌
  startPracticeFrom(shuffle(items));
}

function startPracticeFrom(items) {
  // items 进来时已经被 shuffle；这里不再洗，保证「再练一轮」也能复用同一乱序队列
  _skippedCount = 0;
  session = {
    queue: items.map(it => Object.assign({}, it, { missCount: 0 })),
    score: 0, wrong: 0, total: items.length,
    locked: false, flashTimer: null
  };
  checking = false;
  $('#practiceReady').hidden = true;
  $('#practiceSummary').hidden = true;
  $('#practiceCard').hidden = false;
  showNext();
}

$('#againBtn').onclick = () => startPractice(true);
$('#backBanksBtn').onclick = () => { if (currentUser.role === 'student') switchView('student-banks'); };

// Fisher-Yates 洗牌：把数组乱序。默写内容应该乱序出现，避免学生按顺序记忆。
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function typeLabel(t) { return ({ word: '单词', phrase: '词组', sentence: '句子' }[t]) || '单词'; }

function showNext() {
  if (!session.queue.length) { endSession(); return; }
  session.current = session.queue[0];
  const it = session.current;
  session.locked = false;
  if (session.flashTimer) { clearTimeout(session.flashTimer); session.flashTimer = null; }
  renderCornerPet();
  $('#cardType').textContent = typeLabel(it.type);
  $('#cardType').dataset.type = it.type;
  $('#cardPrompt').textContent = it.chinese;
  $('#cardPos').textContent = it.pos || '';
  $('#cardPos').hidden = !it.pos;
  $('#promptHint').innerHTML = (it.type === 'sentence' ? '根据中文写出英文句子' : (it.type === 'word' ? '根据中文写出单词' : '根据中文写出词组'));
  throttleLiveReport();
  buildLetterBox();
  $('#answerInput').value = '';
  $('#answerInput').disabled = false;
  $('#answerInput').focus();
  $('#feedback').innerHTML = '';
  $('#practiceCard').classList.remove('ok', 'bad', 'shake', 'flash');
  $('#score').textContent = session.score;
  $('#remaining').textContent = session.queue.length;
  _warned = false;
  checking = false;
}

// 根据答案生成字母格子：每个字母一个下划线格，词组/句子的空格显示为间隔
function buildLetterBox() {
  const it = session.current;
  const primary = String(it.english || '').split(/[\/；;]/)[0].trim();
  session.primary = primary;
  session.expLetters = primary.replace(/\s+/g, '').toLowerCase();
  session.letterCells = [];
  session.wordEnds = [];
  session._lastLen = 0;
  session._wasWrong = false;
  const box = $('#letterBox');
  box.innerHTML = '';
  const words = primary.split(/\s+/).filter(Boolean);
  let li = 0;
  words.forEach((word, w) => {
    if (w > 0) { const gap = document.createElement('div'); gap.className = 'l-gap'; box.appendChild(gap); }
    for (const ch of word) {
      const cell = document.createElement('div');
      cell.className = 'l-cell';
      cell.dataset.i = li;
      box.appendChild(cell);
      session.letterCells.push(cell);
      li++;
    }
    session.wordEnds.push(li);
  });
  renderLetterCells('');
  // 重新检测横向溢出（在新词长度变化时）
  setTimeout(updateLetterBoxOverflow, 0);
}

// 把当前输入渲染进字母格子；错字母标红并提示音；词组/句子自动补空格
function renderLetterCells(inputVal) {
  const cells = session.letterCells || [];
  const exp = session.expLetters || '';
  const typed = String(inputVal || '').replace(/\s+/g, '');
  cells.forEach((cell, i) => {
    cell.classList.remove('filled', 'wrong');
    if (i < typed.length) {
      cell.textContent = typed[i];
      cell.classList.add('filled');
      if (typed[i].toLowerCase() !== exp[i]) cell.classList.add('wrong');
    } else {
      cell.textContent = '';
    }
  });
  // 新敲入的字母是错的 → 提示音
  if (typed.length > session._lastLen) {
    const idx = session._lastLen;
    if (typed[idx] && typed[idx].toLowerCase() !== exp[idx]) playWarn();
  }
  session._lastLen = typed.length;
}

function autoSpace() {
  const el = $('#answerInput');
  const typed = session._lastLen;
  if (session.wordEnds.includes(typed) && typed < (session.expLetters || '').length && !el.value.endsWith(' ')) {
    el.value += ' ';
    renderLetterCells(el.value);
  }
}

function normalize(s) {
  return String(s).toLowerCase().replace(/\s+/g, ' ')
    .replace(/[.,，。:：;；!?！？()（）\[\]【】"'“”‘’·\-—]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function isCorrect(input, english) {
  const answers = String(english).split(/[\/；;]/).map(normalize).filter(Boolean);
  const inp = normalize(input);
  if (answers.some(a => a === inp)) return true;
  const strip = s => String(s).toLowerCase().replace(/[^a-z0-9']/g, '');
  return answers.some(a => strip(a) === strip(input));
}

// 输入时自动检测：拼写完整且正确时自动判定通过；明显拼错（超过正确长度）时提示音提醒
let _warned = false;
function autoCheckTyping() {
  if (checking || !session || !session.current) return;
  const input = $('#answerInput').value;
  if (!input.trim()) { _warned = false; return; }
  if (isCorrect(input, session.current.english)) {
    checkAnswer();
    return;
  }
  // 已输入的字符数超过正确答案长度，判定为拼写错误，提示音提醒（只在越过阈值时响一次）
  const ansLen = String(session.current.english).replace(/\s+/g, ' ').trim().length;
  if (input.trim().length > ansLen) {
    if (!_warned) { playWarn(); _warned = true; }
  } else {
    _warned = false;
  }
}

async function checkAnswer() {
  if (checking || !session || !session.current) return;
  if (session.locked && session.flashTimer) return; // 闪现答案期间忽略
  const it = session.current;
  const input = $('#answerInput').value;
  if (!input.trim()) return;
  const correct = isCorrect(input, it.english);
  checking = true;
  try {
    const r = await api('/api/result', { method: 'POST', body: { id: it.id, correct } });
    if (r && typeof r.points === 'number') totalPoints = r.points;
  } catch (e) { console.error(e); }
  renderCornerPet();

  if (correct) {
    // 正确：清掉锁定状态
    session.locked = false;
    if (session.flashTimer) { clearTimeout(session.flashTimer); session.flashTimer = null; }
    if (it.strike > 0) {
      // 曾答错过的词：需连续答对（strike）次才能得分
      it.strike--;
      if (it.strike <= 0) {
        session.score++;
        session.queue.shift();
        playCorrect();
        fxCorrect();
        $('#feedback').innerHTML = '<div class="fb-ok">连续答对！加 1 分</div>';
        $('#practiceCard').classList.add('ok');
        $('#score').textContent = session.score;
        setTimeout(showNext, 700);
      } else {
        playCorrect();
        $('#feedback').innerHTML = '<div class="fb-ok">答对了！还需连续答对 <b>' + it.strike + '</b> 次才能得分</div>';
        $('#practiceCard').classList.add('ok');
        const w = session.queue.shift();
        session.queue.push(w);
        setTimeout(showNext, 800);
      }
    } else {
      session.score++;
      session.queue.shift();
      playCorrect();
      fxCorrect();
      $('#feedback').innerHTML = '<div class="fb-ok">回答正确！加 1 分</div>';
      $('#practiceCard').classList.add('ok');
      $('#score').textContent = session.score;
      setTimeout(showNext, 700);
    }
  } else {
    // 答错：卡住本词，不进入下一词；提示音 + 闪现正确答案几秒后消失，再重新默写本词
    session.wrong++;
    if (it.strike === 0) it.strike = 3;
    session.locked = true;
    playWrong();
    shakeCard();
    flashAnswer();
    checking = false;
  }
}

// 闪现正确答案：显示几秒后消失，清空输入等待重新默写本词
function flashAnswer() {
  if (!session || !session.current || !session.locked) return;
  if (session.flashTimer) return;
  const it = session.current;
  $('#answerInput').value = '';
  renderLetterCells('');
  $('#answerInput').disabled = true;
  $('#feedback').innerHTML = '<div class="fb-flash">正确答案：<b>' + esc(it.english) + '</b></div>';
  speak(it.english);
  $('#practiceCard').classList.remove('bad');
  $('#practiceCard').classList.add('flash');
  session.flashTimer = setTimeout(clearFlash, 3000);
}

// 结束闪现：恢复输入框，等待重新默写本词（可被 Enter 提前触发，跳过等待）
function clearFlash() {
  if (!session) return;
  if (session.flashTimer) { clearTimeout(session.flashTimer); session.flashTimer = null; }
  $('#answerInput').value = '';
  renderLetterCells('');
  $('#answerInput').disabled = false;
  $('#answerInput').focus();
  $('#practiceCard').classList.remove('flash');
  $('#feedback').innerHTML = '';
  _warned = false;
  checking = false;
}

// 快捷键 Alt+V：直接查看答案，视为答错一次
function viewAnswer() {
  if (checking || !session || !session.current) return;
  if (session.flashTimer) return;
  const it = session.current;
  session.wrong++;
  if (it.strike === 0) it.strike = 3;
  session.locked = true;
  checking = true;
  playWrong();
  shakeCard();
  flashAnswer();
  checking = false;
}

// 手机端「偷看答案」按钮 = 直接查看答案，视为答错一次
$('#peekBtn').onclick = () => viewAnswer();

// 跳过当前单词：把单词插到队列中一个偏后的随机位置（不是队尾，避免按固定顺序回来）
// 也不算对/错，只是"稍后再来"
let _skippedCount = 0;
function skipCurrent() {
  if (!session || !session.current) return;
  if (session.locked && session.flashTimer) return; // 闪现答案时不允许跳过
  if (checking) return;
  const cur = session.queue.shift();
  if (!cur) return;
  // 计算插入位置：保证不会立刻又出现（跳过至少 3 个）
  const minPos = 3;
  const maxPos = Math.max(minPos, session.queue.length);
  const pos = minPos + Math.floor(Math.random() * (maxPos - minPos + 1));
  session.queue.splice(Math.min(pos, session.queue.length), 0, cur);
  _skippedCount++;
  haptic(8);
  $('#feedback').innerHTML = '<div class="fb-skip">已跳过，稍后会再来</div>';
  $('#practiceCard').classList.remove('ok', 'bad', 'flash', 'shake');
  $('#practiceCard').classList.add('skip');
  setTimeout(() => {
    $('#practiceCard').classList.remove('skip');
    showNext();
  }, 350);
}
$('#skipBtn').onclick = () => skipCurrent();

// ===== 沉浸式默写：进入练习时隐藏顶部导航，聚焦卡片 =====
function enterImmersive() {
  document.body.classList.add('immersive');
  $('#exitFullBtn').hidden = false;
}
function exitImmersive() {
  document.body.classList.remove('immersive');
  $('#exitFullBtn').hidden = true;
}
$('#exitFullBtn').onclick = () => {
  if (!session) return;
  endSession();
};
function showPracticeView() {
  $$('.view').forEach(v => v.hidden = v.id !== 'view-practice');
  Array.from($('#studentNav').querySelectorAll('button')).forEach(b => b.classList.toggle('active', b.dataset.view === 'practice'));
  enterImmersive();
}

// 正确时的游戏特效：分数飘升 + 星星
function fxCorrect() {
  renderCornerPet();
  const card = $('#practiceCard');
  const layer = $('#fxLayer');
  const sp = document.createElement('div');
  sp.className = 'fx-score';
  sp.textContent = '+1';
  layer.appendChild(sp);
  setTimeout(() => sp.remove(), 1000);
  const stars = ['⭐', '✨', '🌟', '🎉'];
  for (let i = 0; i < 6; i++) {
    const st = document.createElement('div');
    st.className = 'fx-star';
    st.textContent = stars[i % stars.length];
    st.style.left = (18 + Math.random() * 64) + '%';
    st.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px');
    st.style.setProperty('--dy', (-40 - Math.random() * 70) + 'px');
    layer.appendChild(st);
    setTimeout(() => st.remove(), 1000);
  }
  const pet = $('#cornerPet');
  pet.classList.remove('pop');
  void pet.offsetWidth;
  pet.classList.add('pop');
}

function shakeCard() {
  const card = $('#practiceCard');
  card.classList.remove('shake');
  void card.offsetWidth;
  card.classList.add('shake');
}

$('#checkBtn').onclick = () => checkAnswer();

// ================= 移动端体验增强 =================
// 1) 软键盘自适应：默写输入框获焦时给 body 加 .keyboard-up，让 CSS 隐藏角落宠物/压缩布局
//    失焦时移除；visualViewport 高度变化也能触发（更稳）
function syncKeyboardState() {
  const focused = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
  if (focused) document.body.classList.add('keyboard-up');
  else document.body.classList.remove('keyboard-up');
  // 同步：让输入框始终在可视区中央
  if (focused && 'visualViewport' in window) {
    setTimeout(() => {
      try {
        document.activeElement.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch (e) {}
    }, 200);
  }
}
document.addEventListener('focusin', syncKeyboardState);
document.addEventListener('focusout', syncKeyboardState);
window.addEventListener('resize', syncKeyboardState);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    // 键盘弹出时 visualViewport.height 显著小于 window.innerHeight
    if (window.visualViewport.height < window.innerHeight * 0.75) document.body.classList.add('keyboard-up');
    else document.body.classList.remove('keyboard-up');
  });
}

// 2) 屏幕宽度变化时：草稿表/班级学生在表格和卡片间重新渲染
let _lastMobile = window.innerWidth <= 720;
window.addEventListener('resize', () => {
  const isMobile = window.innerWidth <= 720;
  if (isMobile === _lastMobile) return;
  _lastMobile = isMobile;
  // 草稿可见则重渲染
  if (draft.length) renderDraft();
  // 班级学生列表可见则重渲染
  if (currentUser && currentUser.role === 'teacher' && !$('#view-teacher-students').hidden) loadStudents();
});

// 3) 触觉反馈：移动设备上答对/答错/警告时给个轻微振动
let _canVibrate = false;
try { _canVibrate = ('vibrate' in navigator); } catch (e) { _canVibrate = false; }
function haptic(pattern) {
  if (!_canVibrate) return;
  try { navigator.vibrate(pattern); } catch (e) {}
}

// 4) 字母格子横向滚动指示：检测 overflow 状态，给外层加 has-overflow-* 类
function updateLetterBoxOverflow() {
  const wrap = document.getElementById('letterBoxWrap');
  if (!wrap) return;
  const box = document.getElementById('letterBox');
  if (!box) return;
  const hasH = box.scrollWidth > box.clientWidth + 2;
  wrap.classList.toggle('has-overflow', hasH);
  if (hasH) {
    const left = box.scrollLeft > 2;
    const right = box.scrollLeft + box.clientWidth < box.scrollWidth - 2;
    wrap.classList.toggle('has-overflow-left', left);
    wrap.classList.toggle('has-overflow-right', right);
  } else {
    wrap.classList.remove('has-overflow-left', 'has-overflow-right');
  }
}

// 5) 输入时自动滚到当前字母，让用户始终看得到输入位置
function scrollLetterBoxToCaret() {
  const box = document.getElementById('letterBox');
  if (!box || !session || !session.letterCells) return;
  const idx = (session._lastLen || 0);
  const cell = session.letterCells[idx] || session.letterCells[session.letterCells.length - 1];
  if (!cell) return;
  // 仅在横向溢出时滚动
  if (box.scrollWidth > box.clientWidth + 2) {
    const boxRect = box.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    if (cellRect.left < boxRect.left || cellRect.right > boxRect.right) {
      box.scrollTo({ left: cell.offsetLeft - 16, behavior: 'smooth' });
    }
  }
  updateLetterBoxOverflow();
}

// 6) 简单的 toast 提示（替代部分 alert）
function toast(msg, ms) {
  let el = document.getElementById('toastEl');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toastEl';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), ms || 1600);
}
$('#answerInput').addEventListener('keydown', e => {
  if (e.altKey && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); if (session && session.current) speak(session.current.english); return; }
  if (e.altKey && (e.key === 'v' || e.key === 'V')) { e.preventDefault(); viewAnswer(); return; }
  if (e.key === 'Escape') { e.preventDefault(); skipCurrent(); return; }
  if (e.key === 'Enter') {
    e.preventDefault();
    // 遇到错误字母：回车撤销（删除）最后一个字符；输入正确时再提交
    const el = $('#answerInput');
    if (el.value && undoLastChar()) return;
    checkAnswer();
  }
});

// 回车撤销：若最后一个输入字符对应的格子被标红（与答案不一致），删除它；
// 否则不删，按回车进入提交流程。这样用户敲错时回车能立即取消错字母。
function undoLastChar() {
  const el = $('#answerInput');
  if (!el || !el.value) return false;
  const cells = session.letterCells || [];
  // 找到最后一个被填入的格子
  let lastIdx = -1;
  for (let i = cells.length - 1; i >= 0; i--) {
    if (cells[i].classList.contains('filled')) { lastIdx = i; break; }
  }
  if (lastIdx < 0) return false;
  // 该格子对应的期望字母
  const exp = session.expLetters || '';
  if (lastIdx >= exp.length) return false;
  // 当前值去掉所有空白后的对应位置字母
  const typedNoSpace = String(el.value).replace(/\s+/g, '');
  const cur = typedNoSpace[lastIdx] || '';
  if (cur && cur.toLowerCase() === exp[lastIdx]) return false; // 字母正确，回车不删，去走提交
  // 删除最后一个非空白字符（以及其后可能存在的自动补空格）
  el.value = el.value.replace(/\S\s*$/, '');
  renderLetterCells(el.value);
  _warned = false;
  return true;
}
// 闪现答案期间输入框被禁用，回车事件需在 document 上监听：回车可直接跳过闪现，立即重新默写
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (session && session.locked && session.flashTimer) { e.preventDefault(); clearFlash(); }
});
// 记录上一次输入值的长度，用于判断是「输入」还是「退格」；
// 退格时不再触发 autoSpace，否则会立即把刚删掉的空格补回来。
let _lastInputLen = 0;
$('#answerInput').addEventListener('input', () => {
  const el = $('#answerInput');
  const newVal = el.value;
  const isBackspace = newVal.length < _lastInputLen;
  _lastInputLen = newVal.length;
  renderLetterCells(newVal);
  if (!isBackspace) autoSpace();
  autoCheckTyping();
  throttleLiveReport();
  scrollLetterBoxToCaret();
});
// 重置时清掉旧长度，避免上一轮的字符数干扰下一轮
$('#answerInput').addEventListener('focus', () => { _lastInputLen = $('#answerInput').value.length; });
// 字母格子滚动时同步渐变指示
const _letterBox = document.getElementById('letterBox');
if (_letterBox) _letterBox.addEventListener('scroll', updateLetterBoxOverflow, { passive: true });
// 窗口尺寸变化时重新检测溢出
window.addEventListener('resize', updateLetterBoxOverflow);
window.addEventListener('orientationchange', () => setTimeout(updateLetterBoxOverflow, 300));
$('#speakBtn').onclick = () => { if (session && session.current) speak(session.current.english); };
$('#letterBox').onclick = () => $('#answerInput').focus();
$('#endBtn').onclick = endSession;

async function endSession() {
  if (!session) return;
  exitImmersive();
  try { await api('/api/sessionEnd', { method: 'POST' }); } catch (e) {}
  const s = session;
  const bank = currentBank;
  const skipped = _skippedCount;
  _skippedCount = 0;
  session = null;
  checking = false;
  $('#practiceCard').hidden = true;
  $('#practiceSummary').hidden = false;
  $('#sumScore').textContent = s.score;
  $('#sumTotal').textContent = s.total;
  $('#sumSkip').textContent = skipped;
  $('#sumWrong').textContent = s.wrong;
  $('#sumWrongList').innerHTML = s.wrong
    ? '<p>本轮出错的题目已按艾宾浩斯记忆法安排复习，明天记得再来！</p>'
    : '<p>全部正确，太棒了！继续保持！</p>';
  $('#backBanksBtn').hidden = !bank;
  prepareToday();
}

// ================= 统计 =================
async function loadStats() {
  const d = await api('/api/stats');
  totalPoints = d.points;
  renderPetPanel();
  renderCornerPet();
  $('#statTotal').textContent = d.total;
  $('#statDue').textContent = d.due;
  $('#statMastered').textContent = d.mastered;
  $('#statPoints').textContent = d.points;
  $('#statSessions').textContent = d.sessions;
  $('#scheduleBody').innerHTML = d.schedule.map(s => '<tr><td>' + s.date + '</td><td>' + s.count + ' 项</td></tr>').join('');
  $('#historyBody').innerHTML = d.history.length
    ? d.history.map(h => '<tr><td>' + h.date + '</td><td>' + h.correct + '</td><td>' + h.wrong + '</td></tr>').join('')
    : '<tr><td colspan="3">还没有练习记录</td></tr>';
}
