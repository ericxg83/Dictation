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
// 每种龙都有一段符合初中生口味的简介：分类、生活年代、特征、性格、来历
const DRAGON_KINDS = [
  {
    id: 'trex', name: '霸王龙', main: '#EF8A3C', dark: '#B85C14', belly: '#FFE9C7', wing: false, trait: 'spikes',
    enName: 'Tyrannosaurus Rex', era: '白垩纪晚期 · 约 6800 万年前', habitat: '北美洲森林与河岸',
    summary: '恐龙界的暴君，陆地最强肉食者。最著名的明星恐龙，博物馆里的常客。',
    traits: ['🔪 香蕉大的牙齿，能咬碎骨头', '👀 视野和嗅觉极强', '🦵 后腿强壮，前肢只剩两根指头', '⚡ 短距离冲刺可达 30 km/h'],
    personality: '霸道、护短、有点小傲娇。一旦认定你是它的伙伴，就会用生命护你周全。',
    story: '在白垩纪晚期的北美大陆，霸王龙是站在食物链顶端的绝对王者。它最显眼的特征是那颗能塞下一整个小孩的巨颅，加上 60 颗像香蕉一样的锯齿牙，连骨头都能咬碎。卡通里常被画成大嗓门暴脾气，但真正的化石证据显示，它的咬合力是现存所有动物中最强的——比今天的鳄鱼还猛三倍。领养它，你会拥有一位霸气侧漏的贴身保镖。'
  },
  {
    id: 'stego', name: '剑龙', main: '#5FB85F', dark: '#2E7D32', belly: '#D8F0D8', wing: false, trait: 'plates',
    enName: 'Stegosaurus', era: '侏罗纪晚期 · 约 1.5 亿年前', habitat: '北美与欧洲的灌木平原',
    summary: '背上长着一排骨板的小憨憨，脑子只有核桃大，却是草食恐龙里的硬骨头。',
    traits: ['🛡️ 背上一排骨板可调节体温', '⚔️ 尾巴有 4 根尖刺，是它的看家武器', '🧠 脑子只有核桃大小', '🌿 每天要吃几百公斤植物'],
    personality: '温和、慢热、忠诚。不会主动挑事，但被惹急了会用尾刺给你一个深刻教训。',
    story: '剑龙最大的特点就是那两排骨板——科学家曾以为是用来防御的，但最新研究表明它更像"太阳能板"，能帮它调节体温。它的尾巴末端有 4 根锋利的尖刺，科学家管它叫"thagomizer"（剑尾），据说连同时代的异特龙都怕这招。脑子小归小，护崽时它可一点都不含糊，是恐龙界最佛系也最稳的"老大哥"。'
  },
  {
    id: 'tricera', name: '三角龙', main: '#4E9EE0', dark: '#1B5E9E', belly: '#D6E9FA', wing: false, trait: 'frill',
    enName: 'Triceratops', era: '白垩纪晚期 · 约 6800 万年前', habitat: '北美洲的针叶林',
    summary: '三只角的装甲坦克，霸王龙唯一不敢轻易招惹的对手。',
    traits: ['🦏 鼻上 1 角 + 眉上 2 角共 3 角', '🛡️ 巨大的颈盾可挡霸王龙的咬合', '🐘 体重超过 9 吨', '💪 冲撞力相当于一辆小卡车'],
    personality: '沉稳、坚定、爱护同伴。群体中通常担任护卫角色，关键时刻敢于冲锋。',
    story: '三角龙是恐龙界的"重装骑士"。它的头骨能长到 2.5 米，是所有陆地动物中最长的头骨之一。颈盾和三个角的组合，让它正面硬刚霸王龙都不落下风——科学家曾在一只三角龙的颈盾上发现过霸王龙的咬痕，而且那个伤口已经愈合了，说明三角龙成功挡住了攻击并活了下来。它和霸王龙是真正的"老对手"。'
  },
  {
    id: 'ptero', name: '翼龙', main: '#A989E0', dark: '#6D4FA8', belly: '#E7DDF7', wing: true, trait: 'crest',
    enName: 'Pteranodon', era: '白垩纪晚期 · 约 8600 万年前', habitat: '沿海与内陆湖上空',
    summary: '会飞的爬行动物，翼展超过 6 米，是恐龙时代的"滑翔机飞行员"。',
    traits: ['🪽 翼展可达 6–7 米，相当于一辆公交车', '🦴 中空的骨头让它能轻盈地飞起来', '🍴 长喙无牙，专门捕鱼', '🌬️ 主要靠滑翔节省体力'],
    personality: '自由、洒脱、向往远方。不喜欢被束缚，最爱带你看尽天边的云。',
    story: '翼龙虽然名字里带"龙"，但其实不是恐龙，而是会飞的爬行动物。它的后冠长达 1 米，科学家推测是用来"秀恩爱"和保持飞行稳定的。翼龙类是第一种演化出真正飞行能力的脊椎动物，比鸟类早了 7000 万年。它是天空的先驱者，领养它，你将拥有一位最酷的"飞行教练"。'
  },
  {
    id: 'brachio', name: '雷龙', main: '#5FC9B0', dark: '#1F8A70', belly: '#D6F2EA', wing: false, trait: 'long',
    enName: 'Brachiosaurus', era: '侏罗纪晚期 · 约 1.5 亿年前', habitat: '北美与非洲的针叶林',
    summary: '长脖子长腿的温柔巨人，抬起头可以够到四层楼高的树叶。',
    traits: ['🦒 脖子长达 9 米，可以够到四层楼', '🌲 一天能吃掉 200 公斤植物', '❤️ 心脏重达 400 磅才能把血泵到头顶', '👣 每一步都像小地震'],
    personality: '温柔、耐心、包容。会默默听你说话，用鼻息给你最温柔的回应。',
    story: '雷龙学名"腕龙"，意思是"长臂蜥蜴"，因为它的前肢比后肢还长，所以整个身体是斜着向上抬的。它的脖子长达 9 米，但科学家发现它并不是把脖子高高抬起去吃树叶，而是像起重机一样缓慢水平移动。它的心跳很慢，每分钟只有 8 次左右，是恐龙界的"佛系代表"。'
  },
  {
    id: 'spino', name: '棘龙', main: '#E8766B', dark: '#A63B30', belly: '#FADCD8', wing: false, trait: 'sail',
    enName: 'Spinosaurus', era: '白垩纪中期 · 约 9500 万年前', habitat: '北非的河流与沼泽',
    summary: '背上长着"蝙蝠翼"大帆的水陆两栖龙，比霸王龙还长，捕鱼高手。',
    traits: ['🚤 身体长达 15 米，比霸王龙还长', '⛵ 背帆高 2 米，可能用于展示或调温', '🐟 主要吃鱼，爪子适合抓鱼', '🏊 半水生，会游泳潜水'],
    personality: '神秘、独来独往、深藏不露。平时看着高冷，但关键时刻非常靠谱。',
    story: '棘龙是 2020 年科学家发现的新证据，证实它是一种会游泳的恐龙！它的背帆形状像蝙蝠的翅膀，长达 2 米，科学家推测可能是用来吸引异性或在水中保持稳定。它的嘴巴像鳄鱼一样又长又扁，牙齿是圆锥形的，专门用来叉鱼。比起陆地霸王龙，棘龙更像是一位"水上猎人"，领地是北非的河流。'
  },
  {
    id: 'ankylo', name: '甲龙', main: '#A98A5A', dark: '#6E5733', belly: '#EDE2CF', wing: false, trait: 'club',
    enName: 'Ankylosaurus', era: '白垩纪晚期 · 约 6800 万年前', habitat: '北美洲的针叶林',
    summary: '披着骨甲的"活坦克"，尾巴的骨锤能一击打碎霸王龙的腿。',
    traits: ['🛡️ 全身覆盖骨质鳞甲，连眼皮都是骨头的', '🔨 尾巴末端有巨大的骨锤', '🦷 牙齿很小，但消化系统超强', '🐢 趴下后连霸王龙都咬不动'],
    personality: '稳重、可靠、护短。一旦它认定你，你就是它要用生命守护的人。',
    story: '甲龙是恐龙时代的"防弹车"。它的背部、侧面、头顶甚至眼皮都覆盖着坚硬的骨板，连颈椎和肋骨都长着额外的骨刺，让它趴下后几乎无法被攻击。尾巴末端的骨锤有 50 公斤重，挥动时像一根大型棒球棍——科学家估计它的骨锤可以轻松击碎霸王龙的腿骨。甲龙不主动惹事，但谁也别想欺负它的伙伴。'
  },
  {
    id: 'euro', name: '欧洲龙', main: '#D95F7A', dark: '#9C2F4A', belly: '#F7DCE4', wing: true, trait: 'spiky',
    enName: 'European Dragon', era: '中世纪神话 · 约公元 8 世纪', habitat: '北欧的深山与火山',
    summary: '西方传说中最经典的龙，喷火、长翅膀、守着金山银山。',
    traits: ['🔥 喷火是中世纪欧洲龙的标配', '💰 传说中守着大堆金币和珠宝', '🪽 蝙蝠一样的巨翼能遮天蔽日', '👑 拥有高度智慧，会说话'],
    personality: '高傲、强大、重承诺。说要守护的东西，至死方休。',
    story: '欧洲龙源自北欧和英格兰的民间传说，是西方龙文化的鼻祖。最著名的故事包括《霍比特人》中史矛革、《指环王》和各种屠龙传说。它们住在山洞里，守护着成堆的金币，能喷火，能说话，被认为比人类还聪明。欧洲龙是中世纪"骑士与恶龙"故事中的灵魂角色，代表着力量、宝藏和对未知的恐惧。'
  },
  {
    id: 'east', name: '东方龙', main: '#E8B54A', dark: '#A97C12', belly: '#FBEECB', wing: false, trait: 'east',
    enName: 'Chinese Dragon', era: '远古神话 · 华夏文明起源', habitat: '云端、深渊、海洋',
    summary: '中华文明的图腾，呼风唤雨、腾云驾雾，是吉祥与权力的象征。',
    traits: ['☁️ 腾云驾雾、呼风唤雨', '🐟 蛇身、鹿角、鹰爪、鱼鳞集九种动物于一身', '🪙 掌管江河湖海与天气', '🍃 象征吉祥、力量和皇权'],
    personality: '威严、护佑、心怀天下。喜欢被仰望，但私下其实很护短。',
    story: '东方龙是中华民族的图腾，地位远高于西方龙——它不是被屠的对象，而是被敬仰的神明。相传黄帝乘龙升天，古代帝王自称"真龙天子"。东方龙集合了九种动物的特征：驼头、鹿角、兔眼、蛇颈、蜃腹、鲤鳞、鹰爪、虎掌、牛耳，象征着"集万物之长"。在十二生肖中，它是唯一虚构的。领养一只东方龙，就是给自己请来了一位"守护神"。'
  },
  {
    id: 'ice', name: '冰龙', main: '#7FB8E8', dark: '#3A6FA0', belly: '#DBEBF8', wing: true, trait: 'crystal',
    enName: 'Ice Dragon', era: '北境极寒之地 · 永恒冬季', habitat: '极北冰原与永冻山脉',
    summary: '从极北之地走来的冰蓝色精灵，能呼出冻气，性格冷静沉着。',
    traits: ['❄️ 呼出的气息能瞬间结冰', '🧊 翅膀如冰晶般半透明', '👁️ 冰蓝色的瞳孔能透视一切', '💎 鳞片坚硬如钢'],
    personality: '冷静、理性、内心温柔。表面看是"高冷男神/女神"，熟了之后超暖。',
    story: '冰龙是极北冰原传说中才有的神秘生物。它们住在永冻的冰山之巅，能呼出零下 200 度的冻气，所到之处都会飘下雪花。冰龙是少数能"冷静思考"的龙族——它们不会被愤怒冲昏头脑，每一次攻击都精确无误。在北欧神话和《冰与火之歌》中都有它们的身影。领养一只冰龙，你会拥有一位"夏日解暑神器"，因为它走到哪儿都自带冷气。'
  }
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
// 蛋的差异化：纹路 / 颜色 / 斑点暗示蛋中龙的种类
function eggArt(d) {
  if (!d) {
    return '<svg viewBox="0 0 120 140" class="dragon-svg">' +
      '<ellipse cx="60" cy="72" rx="38" ry="50" fill="#E8B54A" stroke="#A97C12" stroke-width="3"/>' +
      '<ellipse cx="60" cy="82" rx="22" ry="28" fill="#FBEECB"/>' +
      '<circle cx="48" cy="58" r="4" fill="rgba(255,255,255,.4)"/>' +
      '<circle cx="72" cy="64" r="3" fill="rgba(255,255,255,.35)"/>' +
      '<path d="M40 78 q4 -3 8 0 M68 80 q4 -3 8 0" stroke="#A97C12" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
      '</svg>';
  }
  // 按龙种类生成差异化蛋纹
  const c = d.main, k = d.dark, b = d.belly;
  let pattern = '';
  switch (d.trait) {
    case 'spikes': // 霸王龙：火焰斑
      pattern = '<path d="M58 50 q-8 6 0 14 q-8 -6 0 -14" fill="' + k + '" opacity=".5"/>' +
                '<path d="M70 70 l3 -8 l3 8 z M48 80 l3 -8 l3 8 z" fill="' + k + '" opacity=".55"/>';
      break;
    case 'plates': // 剑龙：菱形格
      pattern = '<path d="M40 60 l8 -6 l8 6 l-8 6 z M64 64 l8 -6 l8 6 l-8 6 z M52 84 l8 -6 l8 6 l-8 6 z" fill="' + k + '" opacity=".55"/>';
      break;
    case 'frill': // 三角龙：同心圆
      pattern = '<circle cx="60" cy="74" r="14" fill="none" stroke="' + k + '" stroke-width="2.5" opacity=".55"/>' +
                '<circle cx="60" cy="74" r="8" fill="none" stroke="' + k + '" stroke-width="2" opacity=".5"/>' +
                '<circle cx="60" cy="74" r="3" fill="' + k + '" opacity=".55"/>';
      break;
    case 'crest': // 翼龙：波浪
      pattern = '<path d="M38 76 q6 -8 12 0 q6 -8 12 0 q6 -8 12 0 q6 -8 12 0" stroke="' + k + '" stroke-width="2.5" fill="none" opacity=".6"/>';
      break;
    case 'long': // 雷龙：圆点阵
      pattern = '<circle cx="46" cy="60" r="3" fill="' + k + '" opacity=".55"/>' +
                '<circle cx="60" cy="56" r="3" fill="' + k + '" opacity=".55"/>' +
                '<circle cx="74" cy="60" r="3" fill="' + k + '" opacity=".55"/>' +
                '<circle cx="52" cy="80" r="3" fill="' + k + '" opacity=".55"/>' +
                '<circle cx="68" cy="80" r="3" fill="' + k + '" opacity=".55"/>';
      break;
    case 'sail': // 棘龙：锯齿条
      pattern = '<path d="M44 56 l4 -10 l4 10 l4 -10 l4 10 l4 -10 l4 10 l4 -10 l4 10" stroke="' + k + '" stroke-width="2.2" fill="none" opacity=".6"/>' +
                '<path d="M46 90 l4 -8 l4 8 l4 -8 l4 8 l4 -8 l4 8" stroke="' + k + '" stroke-width="2" fill="none" opacity=".55"/>';
      break;
    case 'club': // 甲龙：鳞片
      let scales = '';
      for (let yy = 50; yy < 100; yy += 10) {
        for (let xx = 42; xx < 82; xx += 10) {
          scales += '<path d="M' + xx + ' ' + yy + ' q5 -5 10 0" stroke="' + k + '" stroke-width="1.6" fill="none" opacity=".5"/>';
        }
      }
      pattern = scales;
      break;
    case 'spiky': // 欧洲龙：尖刺
      pattern = '<path d="M40 60 l4 -10 l4 10 z M56 54 l4 -10 l4 10 z M72 60 l4 -10 l4 10 z" fill="' + k + '" opacity=".55"/>' +
                '<path d="M48 84 l4 -8 l4 8 z M64 84 l4 -8 l4 8 z" fill="' + k + '" opacity=".5"/>';
      break;
    case 'east': // 东方龙：祥云
      pattern = '<path d="M40 64 q6 -6 12 0 q-6 6 0 6 q6 0 12 -6 q6 6 12 0" stroke="' + k + '" stroke-width="2" fill="none" opacity=".55"/>' +
                '<path d="M44 88 q6 -6 12 0 q6 -6 12 0 q6 -6 12 0" stroke="' + k + '" stroke-width="2" fill="none" opacity=".5"/>';
      break;
    case 'crystal': // 冰龙：六角雪花
      pattern = '<g transform="translate(60 70)" stroke="' + k + '" stroke-width="1.6" opacity=".65">' +
                '<line x1="-12" y1="0" x2="12" y2="0"/>' +
                '<line x1="0" y1="-12" x2="0" y2="12"/>' +
                '<line x1="-8" y1="-8" x2="8" y2="8"/>' +
                '<line x1="-8" y1="8" x2="8" y2="-8"/>' +
                '</g>' +
                '<g transform="translate(42 90)" stroke="' + k + '" stroke-width="1.3" opacity=".55">' +
                '<line x1="-6" y1="0" x2="6" y2="0"/>' +
                '<line x1="0" y1="-6" x2="0" y2="6"/>' +
                '<line x1="-4" y1="-4" x2="4" y2="4"/>' +
                '<line x1="-4" y1="4" x2="4" y2="-4"/>' +
                '</g>';
      break;
    default:
      pattern = '<circle cx="50" cy="68" r="3" fill="' + k + '" opacity=".5"/><circle cx="70" cy="78" r="3" fill="' + k + '" opacity=".5"/>';
  }
  return '<svg viewBox="0 0 120 140" class="dragon-svg">' +
    '<ellipse cx="60" cy="72" rx="38" ry="50" fill="' + c + '" stroke="' + k + '" stroke-width="3"/>' +
    '<ellipse cx="60" cy="82" rx="22" ry="28" fill="' + b + '" opacity=".75"/>' +
    pattern +
    '<ellipse cx="46" cy="56" rx="6" ry="3" fill="rgba(255,255,255,.35)"/>' +
    '</svg>';
}

// 主调度：按 d.id 派发到独立画法
function dragonArt(d, stage) {
  if (stage <= 0) return eggArt(d);
  const fn = DRAGON_DRAWERS[d.id] || drawGeneric;
  return fn(d, stage);
}

function drawGeneric(d, stage) {
  const s = stage === 1 ? 0.6 : stage === 2 ? 0.8 : 1;
  const m = d.main, k = d.dark, b = d.belly;
  return '<svg viewBox="0 0 150 140" class="dragon-svg">' +
    '<g transform="translate(75 72) scale(' + s + ') translate(-75 -72)">' +
    '<ellipse cx="74" cy="86" rx="40" ry="34" fill="' + m + '" stroke="' + k + '" stroke-width="3"/>' +
    '<ellipse cx="74" cy="94" rx="26" ry="20" fill="' + b + '"/>' +
    '<circle cx="112" cy="56" r="26" fill="' + m + '" stroke="' + k + '" stroke-width="3"/>' +
    '<circle cx="104" cy="50" r="6" fill="#fff" stroke="' + k + '" stroke-width="2"/>' +
    '<circle cx="106" cy="50" r="3" fill="' + k + '"/>' +
    '</g></svg>';
}

// ============== 1. 霸王龙 (T-Rex) ==============
// 标志：大头 + 短前肢 2 指 + 强壮后腿 + 长尾 + 锯齿牙
function drawTrex(d, stage) {
  const m = d.main, k = d.dark, b = d.belly;
  const s = stage === 1 ? 0.6 : stage === 2 ? 0.78 : 1;
  const adult = stage >= 3, teen = stage >= 2;
  const teeth = adult ?
    '<path d="M118 50 l2 5 l2 -5 l2 5 l2 -5 l2 5 l2 -5 l2 5 l2 -5 l2 5 l2 -5 l2 5" fill="#fff" stroke="' + k + '" stroke-width=".7"/>' +
    '<path d="M118 52 l2 -4 l2 4 l2 -4 l2 4 l2 -4 l2 4 l2 -4 l2 4 l2 -4 l2 4" fill="#fff" stroke="' + k + '" stroke-width=".7"/>' : '';
  return '<svg viewBox="0 0 160 140" class="dragon-svg">' +
    '<g transform="translate(80 70) scale(' + s + ') translate(-80 -70)">' +
    // 长尾（粗→细）
    '<path d="M50 78 C32 90 12 84 6 70 C2 60 14 56 22 64 L34 72 L48 80 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 后腿（粗壮，膝关节）
    '<path d="M52 84 L46 122 L40 128 L32 128 L40 122 L44 84 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M70 84 L72 124 L66 130 L58 130 L62 124 L60 84 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 短前肢（标志性！2 趾）
    (adult ?
      '<path d="M82 78 L80 88 L86 88 L86 78 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2"/>' +
      '<line x1="86" y1="86" x2="92" y2="92" stroke="' + k + '" stroke-width="2.2" stroke-linecap="round"/>' +
      '<line x1="88" y1="86" x2="94" y2="92" stroke="' + k + '" stroke-width="2.2" stroke-linecap="round"/>'
    : teen ?
      '<path d="M82 78 L80 86 L86 86 L86 78 Z" fill="' + m + '" stroke="' + k + '" stroke-width="1.5"/>' +
      '<line x1="86" y1="84" x2="90" y2="90" stroke="' + k + '" stroke-width="1.5" stroke-linecap="round"/>' +
      '<line x1="88" y1="84" x2="92" y2="90" stroke="' + k + '" stroke-width="1.5" stroke-linecap="round"/>'
    :
      '<ellipse cx="84" cy="82" rx="2" ry="4" fill="' + m + '" stroke="' + k + '" stroke-width="1"/>') +
    // 身体（横向粗壮，斜向上前）
    '<path d="M48 64 C46 76 54 88 72 90 C92 90 102 78 98 64 C94 52 78 48 66 50 C56 50 48 56 48 64 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5"/>' +
    '<ellipse cx="72" cy="80" rx="18" ry="8" fill="' + b + '" opacity=".7"/>' +
    // 短颈
    '<path d="M88 58 L102 50 L114 54 L106 66 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 巨颅（占 1/3 身长）
    '<path d="M100 40 C108 28 130 28 140 38 C146 44 144 54 134 58 L120 60 L106 54 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 上下颌
    '<path d="M118 56 L142 54 L138 62 L120 60 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2"/>' +
    teeth +
    // 眼窝（凶猛，眉骨突出）
    '<ellipse cx="116" cy="44" rx="6" ry="5" fill="' + k + '"/>' +
    '<circle cx="117" cy="44" r="2.6" fill="#FBBF24"/>' +
    '<circle cx="118" cy="43" r="1" fill="#fff"/>' +
    '<path d="M108 38 L122 34 L120 40 L110 42 Z" fill="' + k + '"/>' +
    // 鼻孔
    '<ellipse cx="134" cy="50" rx="2" ry="1.5" fill="' + k + '"/>' +
    // 颈背纹
    (teen ? '<path d="M88 60 L84 52 L92 56 Z M100 56 L98 48 L106 54 Z" fill="' + k + '" opacity=".7"/>' : '') +
    '</g></svg>';
}

// ============== 2. 剑龙 (Stegosaurus) ==============
// 标志：小头 + 17 块菱形背板（双排交错）+ 4 根尾刺 + 弓背
function drawStego(d, stage) {
  const m = d.main, k = d.dark, b = d.belly;
  const s = stage === 1 ? 0.6 : stage === 2 ? 0.78 : 1;
  const adult = stage >= 3, teen = stage >= 2;
  // 背板：双排交错，成年 5 对最大
  const plateCount = stage === 1 ? 3 : stage === 2 ? 4 : 5;
  let plates = '';
  const plateXs = [56, 68, 80, 92, 104];
  for (let i = 0; i < plateCount; i++) {
    const x = plateXs[i];
    const h = 14 + i * 2;
    plates += '<path d="M' + (x - 6) + ' 64 L' + x + ' ' + (64 - h) + ' L' + (x + 6) + ' 64 Z" fill="' + k + '" stroke="' + k + '" stroke-width="1.5"/>' +
              '<path d="M' + (x - 4) + ' 66 L' + x + ' ' + (66 - h + 4) + ' L' + (x + 4) + ' 66 Z" fill="' + b + '" opacity=".6"/>';
  }
  // 尾刺
  const spikes = adult ?
    '<line x1="20" y1="68" x2="6" y2="56" stroke="' + k + '" stroke-width="3" stroke-linecap="round"/>' +
    '<line x1="22" y1="70" x2="6" y2="62" stroke="' + k + '" stroke-width="3" stroke-linecap="round"/>' +
    '<line x1="24" y1="72" x2="10" y2="68" stroke="' + k + '" stroke-width="3" stroke-linecap="round"/>' +
    '<line x1="26" y1="74" x2="14" y2="76" stroke="' + k + '" stroke-width="3" stroke-linecap="round"/>'
    : (teen ?
      '<line x1="20" y1="70" x2="8" y2="64" stroke="' + k + '" stroke-width="2" stroke-linecap="round"/>' +
      '<line x1="22" y1="72" x2="12" y2="72" stroke="' + k + '" stroke-width="2" stroke-linecap="round"/>'
      : '');
  return '<svg viewBox="0 0 160 140" class="dragon-svg">' +
    '<g transform="translate(80 70) scale(' + s + ') translate(-80 -70)">' +
    // 长尾
    '<path d="M44 80 C30 92 16 90 10 80 C6 72 14 68 20 74 L32 78 L42 80 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    spikes +
    // 后腿（粗壮柱状）
    '<path d="M52 86 L48 122 L42 128 L36 128 L40 122 L46 86 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M88 86 L92 122 L98 128 L104 128 L100 122 L94 86 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 弓背身体（前低后高）
    '<path d="M44 84 C44 76 50 60 70 56 C90 54 100 70 100 84 C100 92 90 96 70 96 C50 96 44 92 44 84 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5"/>' +
    '<ellipse cx="70" cy="86" rx="22" ry="8" fill="' + b + '" opacity=".7"/>' +
    plates +
    // 小头
    '<path d="M96 64 C98 54 110 52 116 60 C118 66 114 72 108 74 L102 72 L96 68 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 喙
    '<path d="M114 68 L120 70 L116 74 L112 72 Z" fill="' + k + '"/>' +
    // 小眼
    '<circle cx="108" cy="62" r="2.5" fill="#fff" stroke="' + k + '" stroke-width="1.5"/>' +
    '<circle cx="109" cy="62" r="1.2" fill="' + k + '"/>' +
    // 前肢（短）
    '<path d="M60 90 L58 110 L56 114 L52 114 L54 110 L56 90 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2"/>' +
    (adult ? '<path d="M76 90 L78 110 L80 114 L84 114 L82 110 L80 90 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2"/>' : '') +
    '</g></svg>';
}

// ============== 3. 三角龙 (Triceratops) ==============
// 标志：巨大颈盾 + 2 眉角 + 1 鼻角 + 鹦鹉嘴 + 四足
function drawTricera(d, stage) {
  const m = d.main, k = d.dark, b = d.belly;
  const s = stage === 1 ? 0.6 : stage === 2 ? 0.78 : 1;
  const adult = stage >= 3, teen = stage >= 2;
  const hornLen = adult ? 16 : teen ? 12 : 8;
  return '<svg viewBox="0 0 160 140" class="dragon-svg">' +
    '<g transform="translate(80 70) scale(' + s + ') translate(-80 -70)">' +
    // 尾
    '<path d="M28 80 C18 86 8 80 8 72 C8 66 14 64 18 68 L26 72 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 四足
    '<path d="M40 92 L36 124 L32 128 L26 128 L30 124 L34 92 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M70 92 L72 124 L76 128 L82 128 L78 124 L74 92 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M88 92 L90 124 L94 128 L100 128 L96 124 L92 92 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 桶状身体
    '<path d="M36 84 C32 70 50 56 76 56 C100 56 108 70 104 84 C100 96 80 100 60 98 C42 96 36 92 36 84 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5"/>' +
    '<ellipse cx="70" cy="88" rx="24" ry="8" fill="' + b + '" opacity=".7"/>' +
    // 颈盾（巨大，半圆，边缘锯齿）
    '<path d="M96 56 C100 28 130 22 142 36 C146 46 142 58 132 62 L120 62 L108 60 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 颈盾纹
    '<path d="M108 50 L120 40 L132 50 M112 56 L124 46 M118 60 L130 54" stroke="' + k + '" stroke-width="1.5" fill="none" opacity=".6"/>' +
    // 头
    '<path d="M104 60 C108 52 122 52 130 60 L132 70 C130 78 118 80 110 76 L102 70 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 鹦鹉喙
    '<path d="M130 68 L142 70 L138 76 L130 74 Z" fill="' + k + '"/>' +
    // 鼻角（短粗）
    '<path d="M118 60 L120 50 L124 58 Z" fill="' + k + '" stroke="' + k + '" stroke-width="1.5"/>' +
    // 左眉角
    '<path d="M108 56 L' + (110 - hornLen / 2) + ' ' + (56 - hornLen) + ' L' + (114 - hornLen / 2) + ' 58 Z" fill="' + k + '" stroke="' + k + '" stroke-width="1.2"/>' +
    // 右眉角
    '<path d="M122 56 L' + (124 + hornLen / 2) + ' ' + (56 - hornLen) + ' L' + (126 + hornLen / 2) + ' 58 Z" fill="' + k + '" stroke="' + k + '" stroke-width="1.2"/>' +
    // 眼
    '<circle cx="114" cy="64" r="2.5" fill="#fff" stroke="' + k + '" stroke-width="1.2"/>' +
    '<circle cx="115" cy="64" r="1.2" fill="' + k + '"/>' +
    // 颈盾边缘锯齿
    '<path d="M100 38 l3 -4 l3 4 l3 -4 l3 4 l3 -4 l3 4 l3 -4 l3 4 l3 -4 l3 4 l3 -4 l3 4" stroke="' + k + '" stroke-width="1.5" fill="none"/>' +
    '</g></svg>';
}

// ============== 4. 翼龙 (Pteranodon) ==============
// 标志：巨大翅膀（翼指延伸）+ 长喙 + 后冠 + 飞行/站立
function drawPtero(d, stage) {
  const m = d.main, k = d.dark, b = d.belly;
  const s = stage === 1 ? 0.6 : stage === 2 ? 0.78 : 1;
  const adult = stage >= 3, teen = stage >= 2;
  const wingSpan = adult ? 70 : teen ? 56 : 40;
  return '<svg viewBox="0 0 160 140" class="dragon-svg">' +
    '<g transform="translate(80 70) scale(' + s + ') translate(-80 -70)">' +
    // 左翼（翼指延伸）
    '<path d="M70 70 Q' + (70 - wingSpan * 0.7) + ' ' + (70 - wingSpan * 0.4) + ' ' + (70 - wingSpan) + ' ' + (70 - wingSpan * 0.1) + ' Q' + (70 - wingSpan * 0.5) + ' ' + (70 + 10) + ' ' + (70 - wingSpan * 0.3) + ' ' + (70 + 18) + ' Z" fill="' + m + '" stroke="' + k + '" stroke-width="2" stroke-linejoin="round"/>' +
    '<line x1="70" y1="70" x2="' + (70 - wingSpan) + '" y2="' + (70 - wingSpan * 0.1) + '" stroke="' + k + '" stroke-width="1.2" opacity=".6"/>' +
    '<line x1="72" y1="72" x2="' + (70 - wingSpan * 0.6) + '" y2="' + (70 + 4) + '" stroke="' + k + '" stroke-width="1" opacity=".5"/>' +
    // 右翼
    '<path d="M88 70 Q' + (88 + wingSpan * 0.7) + ' ' + (70 - wingSpan * 0.4) + ' ' + (88 + wingSpan) + ' ' + (70 - wingSpan * 0.1) + ' Q' + (88 + wingSpan * 0.5) + ' ' + (70 + 10) + ' ' + (88 + wingSpan * 0.3) + ' ' + (70 + 18) + ' Z" fill="' + m + '" stroke="' + k + '" stroke-width="2" stroke-linejoin="round" opacity=".92"/>' +
    '<line x1="88" y1="70" x2="' + (88 + wingSpan) + '" y2="' + (70 - wingSpan * 0.1) + '" stroke="' + k + '" stroke-width="1.2" opacity=".6"/>' +
    // 身体（小，紧凑）
    '<ellipse cx="80" cy="76" rx="14" ry="16" fill="' + m + '" stroke="' + k + '" stroke-width="2.5"/>' +
    '<ellipse cx="80" cy="80" rx="8" ry="10" fill="' + b + '" opacity=".7"/>' +
    // 后冠（长，向后）
    '<path d="M76 64 L' + (76 - wingSpan * 0.3) + ' ' + (64 - 14) + ' L' + (78 - wingSpan * 0.3) + ' 60 L80 64 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2" stroke-linejoin="round"/>' +
    // 长喙（无牙）
    '<path d="M80 70 L120 74 L122 78 L118 80 L82 78 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2" stroke-linejoin="round"/>' +
    // 喙尖
    '<path d="M118 76 L122 78 L118 80 Z" fill="' + k + '"/>' +
    // 眼
    '<circle cx="86" cy="70" r="3" fill="#fff" stroke="' + k + '" stroke-width="1.5"/>' +
    '<circle cx="87" cy="70" r="1.5" fill="' + k + '"/>' +
    // 爪
    '<line x1="76" y1="90" x2="74" y2="106" stroke="' + k + '" stroke-width="2" stroke-linecap="round"/>' +
    '<line x1="84" y1="90" x2="86" y2="106" stroke="' + k + '" stroke-width="2" stroke-linecap="round"/>' +
    (adult ? '<path d="M70 106 l-2 4 M72 108 l-2 4 M74 110 l-2 4" stroke="' + k + '" stroke-width="1.5" stroke-linecap="round"/>' : '') +
    '</g></svg>';
}

// ============== 5. 雷龙 (Brachiosaurus) ==============
// 标志：极长颈（前肢比后肢长）+ 长尾 + 小头 + 柱状腿
function drawBrachio(d, stage) {
  const m = d.main, k = d.dark, b = d.belly;
  const s = stage === 1 ? 0.55 : stage === 2 ? 0.75 : 1;
  const adult = stage >= 3, teen = stage >= 2;
  return '<svg viewBox="0 0 200 160" class="dragon-svg">' +
    '<g transform="translate(100 80) scale(' + s + ') translate(-100 -80)">' +
    // 长尾
    '<path d="M40 90 C20 96 6 90 4 78 C2 68 12 64 20 70 L36 80 L52 88 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 后腿（短）
    '<path d="M52 96 L48 134 L42 140 L36 140 L40 134 L46 96 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 前腿（长！标志性）
    '<path d="M88 80 L86 140 L80 146 L74 146 L78 140 L82 80 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 桶状身体（前高后低）
    '<path d="M44 84 C44 70 60 56 86 56 C112 56 124 68 124 84 C124 96 110 100 88 100 C58 100 44 96 44 84 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5"/>' +
    '<ellipse cx="84" cy="90" rx="26" ry="8" fill="' + b + '" opacity=".7"/>' +
    // 长颈（从肩部斜向上）
    '<path d="M110 64 C124 50 140 36 152 26 C158 22 162 24 162 30 C160 38 148 50 132 60 L114 70 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 小头
    '<ellipse cx="158" cy="28" rx="12" ry="9" fill="' + m + '" stroke="' + k + '" stroke-width="2.5"/>' +
    // 鼻拱
    '<path d="M158 22 Q156 18 160 18 Q164 18 164 22 L168 24 L168 28 L160 28 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2"/>' +
    // 眼
    '<circle cx="156" cy="28" r="2" fill="#fff" stroke="' + k + '" stroke-width="1"/>' +
    '<circle cx="157" cy="28" r="1" fill="' + k + '"/>' +
    // 嘴
    '<path d="M168 30 L172 30 L172 32 L168 32" fill="' + k + '"/>' +
    // 颈纹
    (teen ? '<path d="M120 60 l-3 6 M132 50 l-3 6 M144 40 l-3 6" stroke="' + k + '" stroke-width="1.5" fill="none" opacity=".6"/>' : '') +
    '</g></svg>';
}

// ============== 6. 棘龙 (Spinosaurus) ==============
// 标志：巨大背帆（神经棘）+ 鳄鱼长嘴 + 粗壮身体
function drawSpino(d, stage) {
  const m = d.main, k = d.dark, b = d.belly;
  const s = stage === 1 ? 0.6 : stage === 2 ? 0.78 : 1;
  const adult = stage >= 3, teen = stage >= 2;
  const sailH = adult ? 50 : teen ? 38 : 26;
  // 背帆：半圆形带条纹
  let sail = '<path d="M50 ' + (84 - sailH) + ' Q80 ' + (84 - sailH - 8) + ' 110 ' + (84 - sailH) + ' L106 84 L54 84 Z" fill="' + b + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round" opacity=".85"/>';
  for (let i = 0; i < 5; i++) {
    const x = 56 + i * 12;
    sail += '<line x1="' + x + '" y1="' + (84 - sailH * (0.4 + i * 0.12)) + '" x2="' + x + '" y2="84" stroke="' + k + '" stroke-width="1.5" opacity=".5"/>';
  }
  return '<svg viewBox="0 0 160 140" class="dragon-svg">' +
    '<g transform="translate(80 70) scale(' + s + ') translate(-80 -70)">' +
    // 长尾
    '<path d="M50 84 C30 96 8 90 6 76 C4 66 14 62 22 70 L34 78 L48 84 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 后腿
    '<path d="M52 88 L48 122 L42 128 L36 128 L40 122 L46 88 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M70 88 L72 124 L66 130 L60 130 L62 124 L60 88 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 身体
    '<path d="M48 76 C46 86 54 92 72 92 C90 92 98 84 96 74 C92 64 78 60 66 62 C56 62 48 68 48 76 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5"/>' +
    sail +
    // 长鳄鱼嘴
    '<path d="M88 66 L130 64 L130 70 L92 72 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 嘴张开
    '<path d="M96 72 L128 70 L126 76 L100 76 Z" fill="' + k + '" opacity=".7"/>' +
    // 圆锥牙
    (adult ?
      '<path d="M104 70 l-1 5 M110 70 l-1 5 M116 70 l-1 5 M122 70 l-1 5" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>' +
      '<path d="M104 76 l-1 -4 M110 76 l-1 -4 M116 76 l-1 -4 M122 76 l-1 -4" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>'
    : '') +
    // 眼
    '<circle cx="98" cy="66" r="2.5" fill="#fff" stroke="' + k + '" stroke-width="1.2"/>' +
    '<circle cx="99" cy="66" r="1.2" fill="' + k + '"/>' +
    // 头顶小冠
    '<path d="M88 62 L86 56 L92 60 Z" fill="' + k + '"/>' +
    '</g></svg>';
}

// ============== 7. 甲龙 (Ankylosaurus) ==============
// 标志：全身骨甲 + 尾锤 + 矮胖身体 + 横向宽体
function drawAnkylo(d, stage) {
  const m = d.main, k = d.dark, b = d.belly;
  const s = stage === 1 ? 0.6 : stage === 2 ? 0.78 : 1;
  const adult = stage >= 3, teen = stage >= 2;
  // 骨甲：背上一排三角刺 + 体侧鳞甲
  let armor = '';
  for (let i = 0; i < 7; i++) {
    const x = 40 + i * 12;
    armor += '<path d="M' + (x - 4) + ' 62 L' + x + ' 54 L' + (x + 4) + ' 62 Z" fill="' + k + '"/>';
  }
  // 体侧鳞片
  let sideArmor = '';
  for (let i = 0; i < 4; i++) {
    const y = 78 + i * 6;
    sideArmor += '<path d="M40 ' + y + ' q6 -4 12 0 M60 ' + y + ' q6 -4 12 0 M80 ' + y + ' q6 -4 12 0" stroke="' + k + '" stroke-width="1.4" fill="none" opacity=".6"/>';
  }
  return '<svg viewBox="0 0 160 140" class="dragon-svg">' +
    '<g transform="translate(80 70) scale(' + s + ') translate(-80 -70)">' +
    // 尾（粗壮，末端锤）
    '<path d="M40 80 C28 86 18 88 12 80 C8 74 14 70 20 74 L34 78 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 尾锤（两个球）
    (adult ?
      '<circle cx="10" cy="80" r="8" fill="' + k + '" stroke="' + k + '" stroke-width="2"/>' +
      '<circle cx="6" cy="76" r="5" fill="' + k + '" stroke="' + k + '" stroke-width="1.5"/>' +
      '<circle cx="6" cy="84" r="5" fill="' + k + '" stroke="' + k + '" stroke-width="1.5"/>'
    : (teen ?
      '<circle cx="12" cy="80" r="6" fill="' + k + '" stroke="' + k + '" stroke-width="1.5"/>'
      : '<circle cx="14" cy="80" r="4" fill="' + k + '" stroke="' + k + '" stroke-width="1.2"/>')) +
    // 四足（短粗）
    '<path d="M44 96 L42 122 L36 128 L30 128 L34 122 L40 96 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M100 96 L102 122 L108 128 L114 128 L110 122 L106 96 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 矮胖宽体（几乎贴地）
    '<path d="M40 88 C36 76 50 64 70 62 C90 62 110 76 108 88 C106 100 90 104 70 102 C50 100 40 96 40 88 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5"/>' +
    '<ellipse cx="72" cy="92" rx="22" ry="6" fill="' + b + '" opacity=".6"/>' +
    armor +
    sideArmor +
    // 小头（低，几乎贴地）
    '<path d="M108 70 C112 60 124 60 128 68 L130 78 C128 84 118 86 112 82 L106 76 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 头甲
    '<path d="M112 64 L116 60 L120 64 L124 60 L128 64" stroke="' + k + '" stroke-width="1.5" fill="none"/>' +
    // 喙
    '<path d="M128 78 L134 80 L130 82 L126 80 Z" fill="' + k + '"/>' +
    // 眼
    '<circle cx="118" cy="72" r="2" fill="#fff" stroke="' + k + '" stroke-width="1"/>' +
    '<circle cx="119" cy="72" r="1" fill="' + k + '"/>' +
    // 角
    '<path d="M114 66 L112 60 L116 64 Z" fill="' + k + '"/>' +
    '<path d="M122 64 L120 58 L124 62 Z" fill="' + k + '"/>' +
    '</g></svg>';
}

// ============== 8. 欧洲龙 (Euro Dragon) ==============
// 标志：蝙蝠翼 + 尖刺背 + 喷火（嘴前火焰）+ 四足 + 角
function drawEuro(d, stage) {
  const m = d.main, k = d.dark, b = d.belly;
  const s = stage === 1 ? 0.6 : stage === 2 ? 0.78 : 1;
  const adult = stage >= 3, teen = stage >= 2;
  // 蝙蝠翼
  const wingSpan = adult ? 56 : teen ? 44 : 32;
  const leftWing = '<path d="M68 64 L' + (68 - wingSpan) + ' ' + (64 - wingSpan * 0.4) + ' L' + (60 - wingSpan * 0.6) + ' ' + (64 - wingSpan * 0.1) + ' L' + (50 - wingSpan * 0.4) + ' ' + (64 + wingSpan * 0.2) + ' L' + (60 - wingSpan * 0.2) + ' ' + (64 + wingSpan * 0.1) + ' L68 ' + (64 + wingSpan * 0.1) + ' Z" fill="' + k + '" stroke="' + k + '" stroke-width="1.5" stroke-linejoin="round" opacity=".9"/>';
  const rightWing = '<path d="M92 64 L' + (92 + wingSpan) + ' ' + (64 - wingSpan * 0.4) + ' L' + (100 + wingSpan * 0.6) + ' ' + (64 - wingSpan * 0.1) + ' L' + (110 + wingSpan * 0.4) + ' ' + (64 + wingSpan * 0.2) + ' L' + (100 + wingSpan * 0.2) + ' ' + (64 + wingSpan * 0.1) + ' L92 ' + (64 + wingSpan * 0.1) + ' Z" fill="' + k + '" stroke="' + k + '" stroke-width="1.5" stroke-linejoin="round" opacity=".9"/>';
  // 翼指骨
  const wingBones = '<line x1="68" y1="64" x2="' + (68 - wingSpan) + '" y2="' + (64 - wingSpan * 0.4) + '" stroke="' + k + '" stroke-width="1.5" opacity=".7"/>' +
                    '<line x1="68" y1="64" x2="' + (60 - wingSpan * 0.6) + '" y2="' + (64 - wingSpan * 0.1) + '" stroke="' + k + '" stroke-width="1.2" opacity=".6"/>' +
                    '<line x1="68" y1="64" x2="' + (50 - wingSpan * 0.4) + '" y2="' + (64 + wingSpan * 0.2) + '" stroke="' + k + '" stroke-width="1.2" opacity=".6"/>' +
                    '<line x1="92" y1="64" x2="' + (92 + wingSpan) + '" y2="' + (64 - wingSpan * 0.4) + '" stroke="' + k + '" stroke-width="1.5" opacity=".7"/>' +
                    '<line x1="92" y1="64" x2="' + (100 + wingSpan * 0.6) + '" y2="' + (64 - wingSpan * 0.1) + '" stroke="' + k + '" stroke-width="1.2" opacity=".6"/>' +
                    '<line x1="92" y1="64" x2="' + (110 + wingSpan * 0.4) + '" y2="' + (64 + wingSpan * 0.2) + '" stroke="' + k + '" stroke-width="1.2" opacity=".6"/>';
  return '<svg viewBox="0 0 180 140" class="dragon-svg">' +
    '<g transform="translate(90 70) scale(' + s + ') translate(-90 -70)">' +
    // 尾
    '<path d="M58 90 C42 100 24 96 18 86 C14 78 22 74 28 80 L42 88 L54 90 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 后腿
    '<path d="M60 92 L56 122 L50 128 L44 128 L48 122 L54 92 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 前腿
    '<path d="M88 92 L90 122 L94 128 L100 128 L96 122 L92 92 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 身体
    '<path d="M56 78 C54 90 64 100 82 100 C100 100 108 90 104 78 C100 66 84 60 70 62 C60 62 56 70 56 78 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5"/>' +
    '<ellipse cx="80" cy="86" rx="20" ry="8" fill="' + b + '" opacity=".7"/>' +
    // 翼
    leftWing + rightWing + wingBones +
    // 背刺
    (teen ? '<path d="M64 64 l-2 -8 l4 6 z M76 60 l-2 -10 l4 8 z M88 60 l-2 -10 l4 8 z M100 64 l-2 -8 l4 6 z" fill="' + k + '"/>' : '') +
    // 颈
    '<path d="M100 70 L114 60 L126 64 L114 76 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 头
    '<path d="M118 60 C120 50 134 48 142 56 C146 62 142 70 134 72 L124 70 L118 66 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 角（双角后弯）
    '<path d="M126 50 L120 38 L128 48 Z" fill="' + k + '"/>' +
    '<path d="M134 48 L130 36 L138 46 Z" fill="' + k + '"/>' +
    // 嘴
    '<path d="M140 64 L150 62 L148 68 L142 68 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2"/>' +
    (adult ? '<path d="M148 64 l4 -4 l-2 6 l4 -2 l-2 6 l4 -2 l-2 6 l4 -2" fill="#FBBF24" stroke="#F97316" stroke-width="1"/>' : '') +
    // 眼（凶）
    '<ellipse cx="130" cy="60" rx="4" ry="3" fill="' + k + '"/>' +
    '<circle cx="131" cy="60" r="1.5" fill="#FBBF24"/>' +
    '<circle cx="131.5" cy="59.5" r=".6" fill="#fff"/>' +
    '</g></svg>';
}

// ============== 9. 东方龙 (Chinese Dragon) ==============
// 标志：蛇身 + 鹿角 + 鹰爪 + 鱼鳞 + 长须 + 飘逸
function drawEast(d, stage) {
  const m = d.main, k = d.dark, b = d.belly;
  const s = stage === 1 ? 0.55 : stage === 2 ? 0.75 : 1;
  const adult = stage >= 3, teen = stage >= 2;
  // 蛇身（S 形）
  const bodyPath = 'M30 110 C20 90 40 70 50 80 C60 90 50 110 70 100 C90 90 80 60 100 50 C120 40 130 30 130 30';
  return '<svg viewBox="0 0 180 140" class="dragon-svg">' +
    '<g transform="translate(90 70) scale(' + s + ') translate(-90 -70)">' +
    // 蛇身主路径
    '<path d="' + bodyPath + '" fill="none" stroke="' + k + '" stroke-width="22" stroke-linecap="round"/>' +
    '<path d="' + bodyPath + '" fill="none" stroke="' + m + '" stroke-width="18" stroke-linecap="round"/>' +
    // 鳞片（沿线排列）
    (teen ? '<path d="M40 100 l4 4 l-2 -6 l4 4 l-2 -6 l4 4 l-2 -6 l4 4 l-2 -6 l4 4 l-2 -6 l4 4 M60 90 l4 4 l-2 -6 l4 4 l-2 -6 l4 4 l-2 -6 l4 4 l-2 -6 l4 4 l-2 -6 l4 4 M85 75 l4 4 l-2 -6 l4 4 l-2 -6 l4 4 l-2 -6 l4 4 l-2 -6 l4 4 l-2 -6 l4 4 M110 50 l4 4 l-2 -6 l4 4 l-2 -6 l4 4" stroke="' + k + '" stroke-width="1.4" fill="none" opacity=".6"/>' : '') +
    // 鳍
    '<path d="M52 78 l-4 -10 l8 4 z" fill="' + m + '" stroke="' + k + '" stroke-width="1.5"/>' +
    '<path d="M72 96 l4 -12 l-8 6 z" fill="' + m + '" stroke="' + k + '" stroke-width="1.5"/>' +
    '<path d="M90 76 l-4 -10 l8 4 z" fill="' + m + '" stroke="' + k + '" stroke-width="1.5"/>' +
    // 鹰爪（4 趾）
    '<path d="M28 110 l-4 8 m4 -8 l0 8 m4 -8 l4 8" stroke="' + k + '" stroke-width="2" stroke-linecap="round" fill="none"/>' +
    // 鹿角
    '<path d="M124 32 L116 22 L120 26 L114 16 L122 24 L120 14" stroke="' + k + '" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
    '<path d="M134 28 L140 16 L138 22 L146 12 L142 22" stroke="' + k + '" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
    // 头（长吻）
    '<path d="M120 36 C118 30 132 26 140 32 C144 36 142 42 138 44 L130 44 L122 40 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 长须
    '<path d="M138 44 q12 0 14 12" stroke="' + k + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
    '<path d="M136 46 q14 4 14 16" stroke="' + k + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
    // 鼻
    '<ellipse cx="140" cy="38" rx="2" ry="1.5" fill="' + k + '"/>' +
    // 眼
    '<circle cx="130" cy="36" r="2.5" fill="#fff" stroke="' + k + '" stroke-width="1.2"/>' +
    '<circle cx="131" cy="36" r="1.2" fill="' + k + '"/>' +
    // 眉
    '<path d="M126 32 L132 30 L130 34 Z" fill="' + k + '"/>' +
    // 嘴须
    '<path d="M138 42 q4 2 6 0" stroke="' + k + '" stroke-width="1.5" fill="none"/>' +
    '</g></svg>';
}

// ============== 10. 冰龙 (Ice Dragon) ==============
// 标志：冰晶翼 + 冰角 + 冰锥背刺 + 冰蓝色调
function drawIce(d, stage) {
  const m = d.main, k = d.dark, b = d.belly;
  const s = stage === 1 ? 0.6 : stage === 2 ? 0.78 : 1;
  const adult = stage >= 3, teen = stage >= 2;
  // 冰晶翼（晶体形状）
  const wingSpan = adult ? 50 : teen ? 40 : 30;
  const iceWingLeft = '<path d="M70 60 L' + (70 - wingSpan) + ' ' + (60 - wingSpan * 0.5) + ' L' + (50 - wingSpan * 0.4) + ' ' + (60 + wingSpan * 0.3) + ' L70 ' + (60 + wingSpan * 0.2) + ' Z" fill="' + b + '" stroke="' + k + '" stroke-width="1.8" stroke-linejoin="round" opacity=".7"/>' +
                      '<path d="M70 60 L' + (40 - wingSpan * 0.2) + ' ' + (60 - wingSpan * 0.2) + ' M70 60 L' + (60 - wingSpan * 0.4) + ' ' + (60 + wingSpan * 0.1) + '" stroke="' + k + '" stroke-width="1.2" opacity=".6"/>' +
                      '<path d="M' + (70 - wingSpan * 0.5) + ' ' + (60 - wingSpan * 0.3) + ' l-3 -6 l6 3 z" fill="#fff" opacity=".8"/>' +
                      '<path d="M' + (50 - wingSpan * 0.3) + ' ' + (60 + wingSpan * 0.1) + ' l-3 4 l6 -2 z" fill="#fff" opacity=".7"/>';
  const iceWingRight = '<path d="M90 60 L' + (90 + wingSpan) + ' ' + (60 - wingSpan * 0.5) + ' L' + (110 + wingSpan * 0.4) + ' ' + (60 + wingSpan * 0.3) + ' L90 ' + (60 + wingSpan * 0.2) + ' Z" fill="' + b + '" stroke="' + k + '" stroke-width="1.8" stroke-linejoin="round" opacity=".7"/>' +
                       '<path d="M90 60 L' + (120 + wingSpan * 0.2) + ' ' + (60 - wingSpan * 0.2) + ' M90 60 L' + (100 + wingSpan * 0.4) + ' ' + (60 + wingSpan * 0.1) + '" stroke="' + k + '" stroke-width="1.2" opacity=".6"/>' +
                       '<path d="M' + (90 + wingSpan * 0.5) + ' ' + (60 - wingSpan * 0.3) + ' l3 -6 l-6 3 z" fill="#fff" opacity=".8"/>' +
                       '<path d="M' + (110 + wingSpan * 0.3) + ' ' + (60 + wingSpan * 0.1) + ' l3 4 l-6 -2 z" fill="#fff" opacity=".7"/>';
  // 冰锥背刺
  const iceSpines = teen ?
    '<path d="M62 64 l-2 -10 l4 8 z M76 60 l-2 -12 l4 10 z M90 60 l-2 -12 l4 10 z M104 64 l-2 -10 l4 8 z" fill="#DFF3FF" stroke="' + k + '" stroke-width="1"/>'
    : '';
  return '<svg viewBox="0 0 180 140" class="dragon-svg">' +
    '<g transform="translate(90 70) scale(' + s + ') translate(-90 -70)">' +
    // 尾
    '<path d="M50 88 C30 96 10 92 6 80 C4 70 14 66 22 72 L36 80 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 后腿
    '<path d="M52 92 L48 122 L42 128 L36 128 L40 122 L46 92 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 前腿
    '<path d="M88 92 L90 122 L94 128 L100 128 L96 122 L92 92 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 身体
    '<path d="M48 76 C46 88 56 96 76 96 C96 96 104 88 102 76 C98 64 84 60 70 62 C58 62 48 68 48 76 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5"/>' +
    '<ellipse cx="76" cy="84" rx="20" ry="8" fill="' + b + '" opacity=".7"/>' +
    // 冰翼
    iceWingLeft + iceWingRight + iceSpines +
    // 颈
    '<path d="M98 64 L110 54 L120 58 L110 70 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 头
    '<path d="M112 54 C114 44 128 42 134 50 C138 56 134 64 126 66 L118 64 L114 60 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2.5" stroke-linejoin="round"/>' +
    // 冰角（透明）
    '<path d="M120 48 L116 32 L122 44 Z" fill="#DFF3FF" stroke="' + k + '" stroke-width="1.5"/>' +
    '<path d="M128 46 L126 28 L132 42 Z" fill="#DFF3FF" stroke="' + k + '" stroke-width="1.5"/>' +
    '<path d="M132 48 L138 34 L134 50 Z" fill="#DFF3FF" stroke="' + k + '" stroke-width="1.5"/>' +
    // 嘴
    '<path d="M132 60 L142 58 L140 64 L134 64 Z" fill="' + m + '" stroke="' + k + '" stroke-width="2"/>' +
    // 鼻息（冷气）
    (adult ? '<path d="M142 60 q4 -2 6 0 q-2 4 -6 2 M144 56 q4 -4 8 -2 q-2 4 -6 4" stroke="' + k + '" stroke-width="1.2" fill="none" opacity=".6"/>' : '') +
    // 眼（冰蓝）
    '<circle cx="122" cy="54" r="2.5" fill="#fff" stroke="' + k + '" stroke-width="1"/>' +
    '<circle cx="123" cy="54" r="1.2" fill="#22D3EE"/>' +
    '</g></svg>';
}

// 各龙独立画法索引
const DRAGON_DRAWERS = {
  trex: drawTrex,
  stego: drawStego,
  tricera: drawTricera,
  ptero: drawPtero,
  brachio: drawBrachio,
  spino: drawSpino,
  ankylo: drawAnkylo,
  euro: drawEuro,
  east: drawEast,
  ice: drawIce
};

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

// ===== 龙龙图鉴（点击宠物头像 / 名字打开） =====
let _handbookTab = 'mine'; // 'mine' 当前伙伴 | 'all' 全部图鉴 | 'pick' 浏览某只龙的详情
let _handbookPickId = null;

function openHandbook(pickId) {
  _handbookPickId = pickId || null;
  _handbookTab = pickId ? 'pick' : (myDragon() ? 'mine' : 'all');
  renderHandbook();
  $('#handbookModal').hidden = false;
  haptic(10);
}
function closeHandbook() { $('#handbookModal').hidden = true; }

function renderHandbook() {
  const my = myDragon();
  const stageIdx = currentStageIndex(totalPoints);
  const stageName = (DRAGON_STAGES[stageIdx] || DRAGON_STAGES[0]).name;
  // 默认展示目标：优先选中的 pickId，否则当前伙伴
  const focus = _handbookPickId
    ? DRAGON_KINDS.find(d => d.id === _handbookPickId)
    : my;
  // ===== 顶部 hero =====
  if (focus) {
    $('#handbookHero').innerHTML =
      '<div class="handbook-art">' + dragonArt(focus, DRAGON_MAX_STAGE) + '</div>' +
      '<div class="handbook-hero-info">' +
        '<h2>' + esc(focus.name) +
          (my && my.id === focus.id ? ' <span class="stage-pill">' + stageName + '</span>' : '') +
        '</h2>' +
        '<div class="en">' + esc(focus.enName) + ' · ' + esc(focus.era) + '</div>' +
        '<div class="meta">🏠 ' + esc(focus.habitat) + '</div>' +
      '</div>';
  } else {
    $('#handbookHero').innerHTML =
      '<div class="handbook-art">' + eggArt(null) + '</div>' +
      '<div class="handbook-hero-info">' +
        '<h2>神秘龙蛋</h2>' +
        '<div class="en">Mystery Egg</div>' +
        '<div class="meta">领养你的第一只龙龙，解锁专属图鉴吧～</div>' +
      '</div>';
  }
  // ===== Tab =====
  const tabs = [];
  if (my) tabs.push({ id: 'mine', label: '🐉 我的伙伴' });
  tabs.push({ id: 'all', label: '📖 全部图鉴' });
  $('#handbookTabs').innerHTML = tabs.map(t =>
    '<button class="handbook-tab' + (_handbookTab === t.id ? ' active' : '') + '" data-tab="' + t.id + '">' + t.label + '</button>'
  ).join('') + (focus && _handbookTab === 'pick' ? '<button class="handbook-tab active" style="margin-left:auto">' + esc(focus.name) + '</button>' : '');
  $$('#handbookTabs .handbook-tab').forEach(btn => {
    if (!btn.dataset.tab) return;
    btn.onclick = () => { _handbookTab = btn.dataset.tab; _handbookPickId = null; renderHandbook(); };
  });
  // ===== 内容区 =====
  const body = $('#handbookBody');
  if (_handbookTab === 'pick' && focus) {
    body.innerHTML = renderHandbookDetail(focus, my && my.id === focus.id);
  } else if (_handbookTab === 'mine' && my) {
    body.innerHTML = renderHandbookDetail(my, true);
  } else {
    body.innerHTML = renderHandbookAll(my);
  }
}

function renderHandbookDetail(d, isMine) {
  const traits = (d.traits || []).map(t => '<li>' + esc(t) + '</li>').join('');
  return '' +
    '<div class="detail-section">' +
      '<h4>📌 一句话简介</h4>' +
      '<p class="summary">' + esc(d.summary) + '</p>' +
    '</div>' +
    '<div class="detail-section">' +
      '<h4>✨ 招牌特征</h4>' +
      '<ul class="trait-list">' + traits + '</ul>' +
    '</div>' +
    '<div class="detail-section">' +
      '<h4>💖 性格</h4>' +
      '<p>' + esc(d.personality) + '</p>' +
    '</div>' +
    '<div class="detail-section">' +
      '<h4>📜 来历故事</h4>' +
      '<p>' + esc(d.story) + '</p>' +
    '</div>' +
    (isMine ? '' : '<div class="detail-section" style="text-align:center;background:rgba(251,191,36,.08);border-color:rgba(251,191,36,.3)"><p style="font-size:13px;color:#FCD34D">⚠️ 这只龙龙你还没领养，点击「更换伙伴」可切换</p></div>');
}

function renderHandbookAll(myDragonObj) {
  let html = '<div class="all-grid">';
  DRAGON_KINDS.forEach(d => {
    const isMine = myDragonObj && myDragonObj.id === d.id;
    html += '<div class="all-card' + (isMine ? ' mine' : '') + '" data-id="' + esc(d.id) + '">' +
      '<div class="all-card-art">' + dragonArt(d, DRAGON_MAX_STAGE) + '</div>' +
      '<div class="all-card-name">' + esc(d.name) + '</div>' +
      '<div class="all-card-en">' + esc(d.enName) + '</div>' +
      '<div class="all-card-summary">' + esc(d.summary) + '</div>' +
    '</div>';
  });
  html += '</div>';
  return html;
}

// 事件委托：图鉴卡点击 → 打开对应龙的详情
$('#handbookBody').addEventListener('click', e => {
  const card = e.target.closest('.all-card');
  if (!card) return;
  _handbookPickId = card.dataset.id;
  _handbookTab = 'pick';
  renderHandbook();
});

// 绑定入口：点击宠物面板左侧区域（头像/名字）
function bindHandbookEntry() {
  const el = $('#petClickable');
  if (!el) return;
  el.onclick = () => openHandbook();
  el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openHandbook(); } };
}
bindHandbookEntry();
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
  $('#userInfo').textContent = (d.user.role === 'teacher' ? '老师' : '学生') + '·' + (d.user.name || d.user.username);
  // 班级徽章只显示班级名，🏫 图标由 CSS ::before 提供；移动端超长会自动省略
  $('#classBadge').textContent = classInfo ? classInfo.name : '未加入班级';
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
  // 默写 ready 模式：给 body 加 class，让 header 切换为超紧凑样式
  document.body.classList.toggle('practice-mode', name === 'practice');
  // 离开练习页时：退出沉浸式、停止键盘自适应
  if (name !== 'practice') {
    document.body.classList.remove('immersive');
    document.body.classList.remove('keyboard-up');
    $('#exitFullBtn').hidden = true;
  }
  if (name === 'teacher-banks') loadBanks();
  if (name === 'teacher-students') loadStudents();
  if (name === 'rollcall') showRollcall();
  if (name !== 'rollcall' && _rollTimer) {
    clearInterval(_rollTimer); _rollTimer = null; _rolling = false;
  }
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
// ===== 语音合成：预热声纹列表，避免首次朗读卡顿 =====
let _voicesReady = false;
let _enVoice = null;
function _pickEnVoice(voices) {
  if (!voices || !voices.length) return null;
  // 优先选 en-US，其次任何 en-*，最后兜底第一个
  return voices.find(v => /^en[-_]US/i.test(v.lang))
      || voices.find(v => /^en/i.test(v.lang))
      || voices[0];
}
function _loadVoices() {
  if (!('speechSynthesis' in window)) return;
  const voices = speechSynthesis.getVoices();
  if (voices && voices.length) {
    _enVoice = _pickEnVoice(voices);
    _voicesReady = true;
  }
}
if ('speechSynthesis' in window) {
  _loadVoices();
  speechSynthesis.addEventListener?.('voiceschanged', _loadVoices);
  // 兼容老写法
  speechSynthesis.onvoiceschanged = _loadVoices;
}
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  // 首次未就绪时再尝试取一次（部分浏览器 voiceschanged 不触发）
  if (!_voicesReady) _loadVoices();
  speechSynthesis.cancel();
  // 极短的延时让 cancel 完成，避免在某些浏览器上 cancel 与 speak 冲突
  setTimeout(() => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    if (_enVoice) u.voice = _enVoice;
    u.rate = 0.9;
    u.onstart = () => waveStart();
    u.onend = () => waveStop();
    u.onerror = () => waveStop();
    speechSynthesis.speak(u);
  }, 30);
}
// 首次用户交互时静默播一个空字符，解锁 iOS Safari 等需要手势激发的浏览器
let _speechUnlocked = false;
function _unlockSpeech() {
  if (_speechUnlocked || !('speechSynthesis' in window)) return;
  _speechUnlocked = true;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  } catch (e) {}
}
document.addEventListener('click', _unlockSpeech, { once: true });
document.addEventListener('touchstart', _unlockSpeech, { once: true, passive: true });

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

// 年级分类：6/7/8/9 年级，null/空 表示未分类
const GRADES = ['6', '7', '8', '9'];
const GRADE_LABELS = { '6': '六年级', '7': '七年级', '8': '八年级', '9': '九年级' };
const GRADE_COLORS = {
  '6': 'linear-gradient(135deg, #10B981, #06B6D4)',   // 绿
  '7': 'linear-gradient(135deg, #6366F1, #8B5CF6)',   // 紫
  '8': 'linear-gradient(135deg, #F59E0B, #F472B6)',   // 橙粉
  '9': 'linear-gradient(135deg, #EC4899, #A855F7)'    // 玫红紫
};
function gradeLabel(g) { return g && GRADE_LABELS[g] ? GRADE_LABELS[g] : '未分类'; }
function gradeColor(g) { return g && GRADE_COLORS[g] ? GRADE_COLORS[g] : 'linear-gradient(135deg, #6B7280, #9CA3AF)'; }
function gradeMatch(bankGrade, filter) {
  // filter: '' = 全部；'6'..'9' = 对应年级；'none' = 未分类
  if (!filter || filter === '') return true;
  if (filter === 'none') return !bankGrade;
  return bankGrade === filter;
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
  // 同步当前选中的年级 chip
  syncGradeChips('#gradeChips', editingGrade);
}

// 当前选中的年级（用于新建 / 编辑题库时写入）
let editingGrade = null;   // null = 未分类
function syncGradeChips(containerSel, value) {
  const chips = $$(containerSel + ' .grade-chip');
  chips.forEach(c => {
    const g = c.dataset.grade;
    // 'none' 代表 null；正常 data-grade 为 '' / '6'/'7'/'8'/'9'
    let isSel;
    if (g === 'none') isSel = !value;
    else isSel = (g === (value || ''));
    c.classList.toggle('sel', isSel);
  });
}
// 老师 · 草稿区年级 chip 点击
$$('#gradeChips .grade-chip').forEach(b => {
  b.onclick = () => {
    const g = b.dataset.grade;
    editingGrade = (g === '' || g === 'none') ? null : g;
    syncGradeChips('#gradeChips', editingGrade);
  };
});

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
    const body = { title, entries: rows, grade: editingGrade };
    if (editingBankId) {
      await api('/api/bank/' + editingBankId, { method: 'PUT', body });
      resetDraft();
      setStatus('已保存修改，学生端将看到更新后的题库。');
    } else {
      await api('/api/bank', { method: 'POST', body });
      resetDraft();
      setStatus('已发布，学生可在「我的题库」中查看。');
    }
    loadBanks();
  } catch (e) { setStatus('保存失败：' + e.message, true); }
};

$('#discardBtn').onclick = () => { resetDraft(); setStatus('已放弃草稿。'); };

let editingBankId = null; // 正在编辑的题库 id（null = 新建草稿）

// 老师 · 已发布题库筛选状态
let bankFilterGrade = '';   // '' = 全部；'6'/'7'/'8'/'9'/'none'
$$('#bankGradeFilter .grade-chip').forEach(b => {
  b.onclick = () => {
    bankFilterGrade = b.dataset.grade;
    syncGradeChips('#bankGradeFilter', bankFilterGrade === 'none' ? 'none' : bankFilterGrade);
    renderBankList(_cachedTeacherBanks || []);
  };
});
let _cachedTeacherBanks = [];

function renderBankList(banks) {
  _cachedTeacherBanks = banks;
  const wrap = $('#bankList');
  if (!banks.length) {
    wrap.innerHTML = '<div class="empty">还没有发布题库。上传文件并发布第一个题库吧。</div>';
    return;
  }
  // 筛选
  const filterVal = bankFilterGrade;
  const filtered = banks.filter(b => {
    if (!filterVal) return true;
    if (filterVal === 'none') return !b.grade;
    return b.grade === filterVal;
  });
  if (!filtered.length) {
    wrap.innerHTML = '<div class="empty">该分类下还没有题库。试试其它分类或发布新题库吧。</div>';
    return;
  }
  // 按年级分组：每个年级一段，section header 醒目
  const groups = { '6': [], '7': [], '8': [], '9': [], none: [] };
  filtered.forEach(b => { (b.grade && groups[b.grade] ? groups[b.grade] : groups.none).push(b); });
  const order = ['6', '7', '8', '9', 'none'];
  wrap.innerHTML = '';
  // 仅显示有内容的分组
  order.forEach(g => {
    const list = groups[g];
    if (!list.length) return;
    if (!filterVal) {
      // 全部模式：渲染分组标题
      const head = document.createElement('div');
      head.className = 'grade-section-head';
      head.innerHTML = '<span class="grade-section-dot" style="background:' + gradeColor(g) + '"></span>' + gradeLabel(g) + ' <span class="grade-section-count">' + list.length + ' 个题库</span>';
      wrap.appendChild(head);
    }
    list.forEach(b => {
      const card = document.createElement('div');
      card.className = 'bank-card';
      const time = new Date(b.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      const btns = document.createElement('div');
      btns.className = 'bank-btns';
      const editBtn = document.createElement('button');
      editBtn.className = 'ghost-btn';
      editBtn.textContent = '✏️ 编辑';
      editBtn.onclick = () => editBank(b);
      const delBtn = document.createElement('button');
      delBtn.className = 'ghost-btn danger-btn';
      delBtn.textContent = '🗑 删除';
      delBtn.onclick = async () => {
        if (!confirm('确定删除题库「' + b.title + '」？学生进度不受影响，但题库将不可再练习。')) return;
        await api('/api/bank/' + b.id, { method: 'DELETE' });
        if (editingBankId === b.id) resetDraft();
        loadBanks();
      };
      btns.appendChild(editBtn);
      btns.appendChild(delBtn);
      const main = document.createElement('div');
      main.className = 'bank-main';
      main.innerHTML =
        '<div class="bank-title-row">' +
          '<b>' + esc(b.title) + '</b>' +
          '<span class="grade-badge" style="background:' + gradeColor(b.grade) + '">' + esc(gradeLabel(b.grade)) + '</span>' +
        '</div>' +
        '<div class="bank-meta">' +
          '<span class="bank-meta-item bank-meta-count">📚 ' + b.count + ' 条</span>' +
          '<span class="bank-meta-item">🕒 ' + esc(time) + '</span>' +
        '</div>';
      card.appendChild(main);
      card.appendChild(btns);
      wrap.appendChild(card);
    });
  });
}

// ================= 老师 · 题库列表（已发布） =================
async function loadBanks() {
  const d = await api('/api/bank');
  $('#bankGradeFilter').hidden = !d.banks.length;
  renderBankList(d.banks);
}

// 加载已发布题库进入编辑区
async function editBank(bank) {
  const d = await api('/api/bank/' + bank.id + '/edit');
  draft = d.entries.map(e => ({ english: e.english, chinese: e.chinese, pos: e.pos || '', type: e.type || 'word' }));
  editingBankId = d.bank.id;
  editingGrade = d.bank.grade || null;
  $('#bankTitle').value = d.bank.title;
  $('#saveBtn').textContent = '保存修改';
  $('#draftHeadLabel').textContent = '编辑题库：' + d.bank.title;
  renderDraft();
  setStatus('正在编辑已发布题库。修改后点「保存修改」，学生端将看到更新。');
  $('#draftBox').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetDraft() {
  editingBankId = null;
  editingGrade = null;
  draft = [];
  $('#bankTitle').value = '';
  $('#saveBtn').textContent = '发布 / 更新题库';
  $('#draftHeadLabel').textContent = '新建题库';
  renderDraft();
  syncGradeChips('#gradeChips', null);
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
      const petTxt = dragon ? (dragon.name + (s.pet.name ? '（' + s.pet.name + '）' : '')) : '未领养龙龙';
      const nameTxt = s.name && s.name !== s.username ? s.name + '（' + s.username + '）' : (s.name || s.username);
      const card = document.createElement('div');
      card.className = 'stu-card';
      const stageIdx = dragon ? Math.min(3, Math.floor((s.points || 0) / 10)) : 0;
      const stageLabel = dragon ? (['龙蛋', '幼龙', '少年龙', '成年龙'][stageIdx] || '龙蛋') : '';
      card.innerHTML =
        '<div class="stu-pet">' + (dragon ? dragonArt(dragon, stageIdx) : '🥚') + '</div>' +
        '<div class="stu-card-body">' +
          '<div class="stu-name">' + esc(nameTxt) + '</div>' +
          '<div class="stu-pet-name">' + esc(petTxt) + (stageLabel ? ' · ' + stageLabel : '') + '</div>' +
          '<div class="stu-stats">' +
            '<div class="stu-stat">📚 总 <b>' + s.total + '</b></div>' +
            '<div class="stu-stat mastered">🌱 掌握 <b>' + s.mastered + '</b></div>' +
            '<div class="stu-stat due">⏰ 待复习 <b>' + s.due + '</b></div>' +
            '<div class="stu-stat pts">⭐ 得分 <b>' + s.points + '</b></div>' +
          '</div>' +
        '</div>' +
        '<div class="stu-last-active">🕒 ' + esc(last) + '</div>' +
        '<div class="stu-actions"><button class="ghost-btn" data-id="' + esc(s.id) + '" data-name="' + esc(s.name || s.username) + '">✏️ 改名</button></div>';
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
  // 桌面：原表格（也升级一下表头）
  const table = document.createElement('table');
  table.className = 'mini-table';
  table.innerHTML = '<thead><tr><th>学生</th><th>宠物</th><th>总条目</th><th>已掌握</th><th>待复习</th><th>得分</th><th>最近活跃</th><th></th></tr></thead>';
  const tb = document.createElement('tbody');
  d.students.forEach(s => {
    const tr = document.createElement('tr');
    const last = s.lastActive ? new Date(s.lastActive).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '从未练习';
    const dragon = s.pet ? (DRAGON_KINDS.find(k => k.id === s.pet.dragonId) || null) : null;
    const petTxt = dragon ? (dragon.name + (s.pet.name ? '（' + s.pet.name + '）' : '')) : '未领养';
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
  console.log('[loadLiveBoard]', { players: d.players.length, sessionActive: d.session && !d.session.ended });
  renderLiveClock(d.session);
  renderLiveStats(d.players, d.session);
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
    num.textContent = '00:00';
    state.className = 'live-clock-state timeup';
  } else {
    state.textContent = '默写中';
    state.className = 'live-clock-state running';
  }
}
// 顶部汇总：在线人数 / 完成数 / 最高分 / 平均分
function renderLiveStats(players, sess) {
  const el = $('#liveStats');
  if (!sess || !players.length) { el.innerHTML = ''; return; }
  const done = players.filter(p => p.done).length;
  const total = players.reduce((s, p) => s + (p.total || 0), 0);
  const scores = players.map(p => p.score || 0);
  const max = scores.length ? Math.max.apply(null, scores) : 0;
  const avg = scores.length ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length) : 0;
  el.innerHTML =
    '<div class="lv-stat-item"><b>' + players.length + '</b><span>在线</span></div>' +
    '<div class="lv-stat-item"><b>' + done + ' / ' + players.length + '</b><span>完成</span></div>' +
    '<div class="lv-stat-item"><b>' + max + '</b><span>最高分</span></div>' +
    '<div class="lv-stat-item"><b>' + avg + '</b><span>平均分</span></div>' +
    '<div class="lv-stat-item total"><b>' + total + '</b><span>题数</span></div>';
}
// 直播感：把学生正在敲的字母逐个显示，对/错用颜色区分，末尾闪光标
function liveTypedHtml(p) {
  if (p.done) return '<div class="lv-live away"><span class="lv-badge">✓</span><span>全部完成</span></div>';
  if (p.locked) return '<div class="lv-live bad"><span class="lv-badge">✗</span><span>答错了 · 正在看答案…</span></div>';
  const typed = String(p.typed || '').replace(/\s+/g, '');
  const answer = String(p.answer || '').split(/[\/；;]/)[0].replace(/[^A-Za-z' ]/g, '').replace(/\s+/g, '').toLowerCase();
  if (!typed && !p.word) return '<div class="lv-live"><span class="lv-wait-dot"></span><span>已上线 · 等待开始…</span></div>';
  let html = '';
  const limit = 60;
  const chars = typed.split('');
  chars.slice(0, limit).forEach((ch, i) => {
    const ok = answer && answer[i] != null && ch.toLowerCase() === answer[i];
    html += '<span class="lv-ch' + (ok ? ' ok' : ' bad') + '">' + esc(ch) + '</span>';
  });
  if (chars.length > limit) html += '<span class="lv-ch">…</span>';
  html += '<span class="lv-cur"></span>';
  return '<div class="lv-live"><span class="lv-typed-box">' + html + '</span></div>';
}
function renderLiveGrid(players, sess) {
  const grid = $('#liveGrid');
  if (!players.length) {
    grid.innerHTML = '<div class="empty"><b>还没有学生上线</b><span>同学们打开「今日练习」开始默写后，实时输入会像直播一样显示在这里</span></div>';
    return;
  }
  grid.innerHTML = '';
  const all = players;
  all.forEach((p, i) => {
    console.log('[renderLiveGrid] player:', p.username, 'typed:', (p.typed || '').substring(0, 20), 'word:', p.word);
    const d = DRAGON_KINDS.find(k => k.id === p.dragonId) || DRAGON_KINDS[0];
    const total = p.total || 0;
    const answered = Math.min(p.answered || 0, total);
    const pct = total > 0 ? Math.min(100, Math.round(answered / total * 100)) : 0;
    const dt = new Date(p.lastAt);
    const card = document.createElement('div');
    card.className = 'lv-card' +
      (p.done ? ' done' : '') +
      (p.locked ? ' locked' : '') +
      (i === 0 ? ' top1' : i === 1 ? ' top2' : i === 2 ? ' top3' : '');
    card.innerHTML =
      '<div class="lv-head">' +
        '<div class="lv-rank">' + (i + 1) + '</div>' +
        '<div class="lv-pet">' + dragonArt(d, p.stage) + '</div>' +
        '<div class="lv-name"><b>' + esc(p.username) + '</b><span>' + esc(p.petName || d.name) + '</span></div>' +
        '<div class="lv-score"><b>' + (p.score || 0) + '</b><span>得分</span></div>' +
      '</div>' +
      '<div class="lv-progress">' +
        '<div class="lv-progress-head"><span>进度</span><span class="lv-prog-num"><b>' + (total ? answered : '—') + '</b>' + (total ? ' / ' + total : '') + '</span></div>' +
        '<div class="lv-bar"><div style="width:' + pct + '%"></div></div>' +
        '<div class="lv-pct">' + (total ? pct + '%' : '—') + '</div>' +
      '</div>' +
      '<div class="lv-typing">' +
        '<div class="lv-typing-head"><span class="lv-live-flag"></span><span class="lv-word">' + (p.word ? esc(p.word) : '&nbsp;') + '</span></div>' +
        liveTypedHtml(p) +
      '</div>' +
      '<div class="lv-foot">' +
        '<div class="lv-stats">' +
          '<span>正确 <b class="ok">' + (p.correct || 0) + '</b></span>' +
          '<span>错误 <b class="bad">' + (p.wrong || 0) + '</b></span>' +
        '</div>' +
        '<div class="lv-time">' + dt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '</div>' +
      '</div>';
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

// ================= 老师 · 随机点名 =================
const ROLLCALL_KEY = 'dict_rollcall_names';
let _rollTimer = null;
let _rollIdx = 0;
let _rolling = false;
let _rollNamesActive = [];
let _rollLastWin = null;

function rollNamesFromText() {
  const seen = new Set();
  return String($('#rollcallNames').value || '')
    .split(/[\n,，、;；]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => { const k = s.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}
function refreshRollcallMeta() {
  const n = rollNamesFromText().length;
  $('#rollcallCount').textContent = n + ' 名';
  $('#rollcallTip').textContent = n ? '共 ' + n + ' 名同学参与点名' : '名单里还没有学生，请先在下方录入～';
}
function showRollcall() {
  const saved = localStorage.getItem(ROLLCALL_KEY);
  if (saved != null && !String($('#rollcallNames').value || '').trim()) {
    $('#rollcallNames').value = saved;
  }
  if (!_rolling) {
    const names = rollNamesFromText();
    if (_rollLastWin && names.indexOf(_rollLastWin) !== -1) {
      $('#rollcallName').textContent = _rollLastWin;
      $('#rollcallDisplay').classList.add('settled');
      $('#rollcallDisplay').classList.remove('rolling');
      $('#rollcallAgainBtn').hidden = false;
      $('#rollcallBadge').hidden = false;
    } else {
      _rollLastWin = null;
      $('#rollcallName').textContent = names.length ? '准备点名' : '点名啦～';
      $('#rollcallDisplay').classList.remove('rolling', 'settled');
      $('#rollcallAgainBtn').hidden = true;
      $('#rollcallBadge').hidden = true;
    }
    $('#rollcallStartBtn').disabled = false;
    $('#rollcallStopBtn').disabled = true;
  }
  refreshRollcallMeta();
}
function startRollcall() {
  const names = rollNamesFromText();
  if (!names.length) { alert('请先填写学生名单'); return; }
  _rollLastWin = null;
  _rollNamesActive = names;
  _rolling = true;
  _rollIdx = Math.floor(Math.random() * names.length);
  const display = $('#rollcallDisplay');
  display.classList.remove('settled');
  display.classList.add('rolling');
  $('#rollcallBadge').hidden = true;
  $('#rollcallStartBtn').disabled = true;
  $('#rollcallStopBtn').disabled = false;
  $('#rollcallAgainBtn').hidden = true;
  clearInterval(_rollTimer);
  $('#rollcallName').textContent = names[_rollIdx];
  _rollTimer = setInterval(() => {
    _rollIdx = (_rollIdx + 1) % names.length;
    $('#rollcallName').textContent = names[_rollIdx];
  }, 60);
}
function stopRollcall() {
  if (!_rolling) return;
  clearInterval(_rollTimer); _rollTimer = null;
  _rolling = false;
  const names = _rollNamesActive.length ? _rollNamesActive : rollNamesFromText();
  const win = names[_rollIdx] || names[0] || '';
  _rollLastWin = win;
  $('#rollcallName').textContent = win;
  $('#rollcallDisplay').classList.remove('rolling');
  $('#rollcallDisplay').classList.add('settled');
  $('#rollcallBadge').hidden = false;
  $('#rollcallStartBtn').disabled = false;
  $('#rollcallStopBtn').disabled = true;
  $('#rollcallAgainBtn').hidden = false;
  playCorrect();
}
function saveRollcallNames() {
  localStorage.setItem(ROLLCALL_KEY, $('#rollcallNames').value || '');
  refreshRollcallMeta();
}
$('#rollcallStartBtn').onclick = startRollcall;
$('#rollcallStopBtn').onclick = stopRollcall;
$('#rollcallAgainBtn').onclick = startRollcall;
$('#rollcallSaveBtn').onclick = saveRollcallNames;
$('#rollcallClearBtn').onclick = () => {
  if (!confirm('确定清空名单吗？')) return;
  $('#rollcallNames').value = '';
  localStorage.removeItem(ROLLCALL_KEY);
  _rollLastWin = null;
  showRollcall();
};
$('#rollcallImportBtn').onclick = async () => {
  try {
    const d = await api('/api/class/students');
    const names = (d.students || []).map(s => s.name || s.username);
    if (!names.length) { alert('班级里还没有学生注册，无法导入'); return; }
    const cur = String($('#rollcallNames').value || '').trim();
    $('#rollcallNames').value = cur ? cur + '\n' + names.join('\n') : names.join('\n');
    saveRollcallNames();
    showRollcall();
  } catch (e) { alert(e.message); }
};
$('#rollcallFullBtn').onclick = () => {
  const el = $('#rollcallStage');
  if (document.fullscreenElement) { document.exitFullscreen(); }
  else if (el.requestFullscreen) el.requestFullscreen();
};
let _rollSaveTimer = null;
$('#rollcallNames').addEventListener('input', () => {
  clearTimeout(_rollSaveTimer);
  _rollSaveTimer = setTimeout(saveRollcallNames, 400);
});

// ================= 学生 · 大屏自动上报 =================
let _liveReportTick = 0;
function liveStatus() {
  if (!currentUser || currentUser.role !== 'student') return;
  const word = session && session.current ? session.current.chinese : '';
  const answer = session && session.current ? session.current.english : '';
  const typed = session && !session.locked ? String($('#answerInput').value) : '';
  const typedLen = typed.replace(/\s+/g, '').length;
  const total = session ? session.total : 0;
  const answered = session ? total - session.queue.length : 0;
  const done = !!(session && !session.queue.length && $('#practiceSummary') && !$('#practiceSummary').hidden);
  const locked = !!(session && session.locked);
  const d = myDragon() || DRAGON_KINDS[0];
  console.log('[liveStatus]', { word, typed: typed.substring(0, 20), typedLen, locked, hasSession: !!session });
  api('/api/live/report', {
    method: 'POST',
    body: {
      dragonId: d.id, petName: (currentUser.pet && currentUser.pet.name) || '',
      stage: currentStageIndex(totalPoints), points: totalPoints,
      word, answer, typed, typedLen, total, answered, locked,
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
  const wrap = $('#liveBannerWrap');
  if (!banner || !wrap) return;
  if (!currentUser) return;
  // 切到非练习页时，强制隐藏并清掉自动隐藏定时器
  if (currentUser.role !== 'student' || $('#view-practice').hidden) {
    wrap.hidden = true;
    if (_liveBannerHideTimer) { clearTimeout(_liveBannerHideTimer); _liveBannerHideTimer = null; }
    return;
  }
  api('/api/live').then(d => {
    if (d.active) {
      // 老师正在开启的默写 → 显示倒计时
      if (_liveBannerHideTimer) { clearTimeout(_liveBannerHideTimer); _liveBannerHideTimer = null; }
      wrap.hidden = false;
      $('#liveBannerText').textContent = '老师已开启默写';
      $('#liveBannerClock').textContent = fmtClock(d.remaining);
      // 给倒计时一个强调色
      banner.classList.remove('ended');
    } else if (d.ended) {
      // 已结束（老师手动结束 / 自然超时）：显示一次，5 秒后自动隐藏
      wrap.hidden = false;
      $('#liveBannerText').textContent = '默写已结束';
      $('#liveBannerClock').textContent = '00:00';
      banner.classList.add('ended');
      if (!_liveBannerHideTimer) {
        _liveBannerHideTimer = setTimeout(() => {
          wrap.hidden = true;
          banner.classList.remove('ended');
          _liveBannerHideTimer = null;
        }, 5000);
      }
    } else {
      // 没有活动 session 也不处于"刚结束"状态 → 隐藏
      wrap.hidden = true;
      banner.classList.remove('ended');
      if (_liveBannerHideTimer) { clearTimeout(_liveBannerHideTimer); _liveBannerHideTimer = null; }
    }
  }).catch(() => {
    wrap.hidden = true;
    banner.classList.remove('ended');
  });
}
setInterval(studentLiveClock, 1000);
setInterval(throttleLiveReport, 1000);

// ================= 学生 · 题库 =================
let stuBankFilterGrade = '';
let _cachedStuBanks = [];
$$('#stuGradeFilter .grade-chip').forEach(b => {
  b.onclick = () => {
    stuBankFilterGrade = b.dataset.grade;
    syncGradeChips('#stuGradeFilter', stuBankFilterGrade === 'none' ? 'none' : stuBankFilterGrade);
    renderStuBankList(_cachedStuBanks);
  };
});

function renderStuBankList(banks) {
  _cachedStuBanks = banks;
  const wrap = $('#stuBankList');
  if (!banks.length) {
    wrap.innerHTML = '<div class="empty">老师还没有发布题库，稍后再来看看～</div>';
    return;
  }
  const filterVal = stuBankFilterGrade;
  const filtered = banks.filter(b => {
    if (!filterVal) return true;
    if (filterVal === 'none') return !b.grade;
    return b.grade === filterVal;
  });
  if (!filtered.length) {
    wrap.innerHTML = '<div class="empty">该年级还没有题库。试试其它年级吧～</div>';
    return;
  }
  // 按年级分组（全部模式）或 单一列表
  wrap.innerHTML = '';
  if (filterVal) {
    renderStuBankCards(filtered, wrap, 0);
  } else {
    const groups = { '6': [], '7': [], '8': [], '9': [], none: [] };
    filtered.forEach(b => { (b.grade && groups[b.grade] ? groups[b.grade] : groups.none).push(b); });
    const order = ['6', '7', '8', '9', 'none'];
    let offset = 0;
    order.forEach(g => {
      const list = groups[g];
      if (!list.length) return;
      const head = document.createElement('div');
      head.className = 'grade-section-head';
      head.innerHTML = '<span class="grade-section-dot" style="background:' + gradeColor(g) + '"></span>' + gradeLabel(g) + ' <span class="grade-section-count">' + list.length + ' 个题库</span>';
      wrap.appendChild(head);
      offset = renderStuBankCards(list, wrap, offset);
    });
  }
}

function renderStuBankCards(banks, wrap, startIdx) {
  banks.forEach((b, i) => {
    const idx = startIdx + i;
    const card = document.createElement('div');
    card.className = 'bank-card is-student';
    const emojis = ['📚', '✏️', '🎯', '🌟', '🚀', '🎓', '💪', '🔥', '🧠', '⚡'];
    const emoji = emojis[idx % emojis.length];
    card.innerHTML =
      '<div class="bank-main">' +
        '<div class="bank-title-row">' +
          '<b>' + emoji + ' ' + esc(b.title) + '</b>' +
          '<span class="grade-badge" style="background:' + gradeColor(b.grade) + '">' + esc(gradeLabel(b.grade)) + '</span>' +
        '</div>' +
        '<div class="bank-meta">' +
          '<span class="bank-meta-item bank-meta-count">📚 ' + b.count + ' 条单词</span>' +
          '<span class="bank-meta-item">⚡ 点击开始挑战</span>' +
        '</div>' +
      '</div>' +
      '<button class="primary" data-pick="' + b.id + '">开始默写 🚀</button>';
    card.querySelector('[data-pick]').onclick = () => startBankPractice(b);
    wrap.appendChild(card);
  });
  return startIdx + banks.length;
}

async function loadStudentBanks() {
  const d = await api('/api/banks');
  $('#myClassInfo').textContent = d.classInfo ? '所在班级：' + d.classInfo.name : '你还没有加入班级，请找老师获取班级码后重新注册。';
  $('#stuGradeFilter').hidden = !d.banks.length;
  renderStuBankList(d.banks);
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
  // 优先用今日待复习作为默写列表，方便选择器展示最大可默写数；
  // 待复习为 0 时传 null，仍走旧的 startPractice(false) 兜底流程
  const items = (d.dueCount > 0 && Array.isArray(d.items) && d.items.length) ? d.items : null;
  preparePractice(items, '今日练习', '今天待复习 <b>' + d.dueCount + '</b> 项（题库共 ' + d.total + ' 项）');
}

$('#dueGoBtn').onclick = () => { switchView('practice'); startPractice(false); };

function preparePractice(items, title, sub) {
  session = null;
  $('#practiceReady').hidden = false;
  $('#practiceSummary').hidden = true;
  $('#practiceCard').hidden = true;
  $('#practiceTitle').textContent = title || '今日练习';
  $('#practiceSub').innerHTML = sub || '';
  if (items && items.length) {
    renderCountPicker(items.length);
    $('#startBtn').onclick = () => {
      // 自定义模式：实时读 input 的最新值
      let useCount = _pickCount;
      if (useCount === -1) {
        const inp = $('#countCustomInput');
        const v = inp ? parseInt(inp.value, 10) : NaN;
        if (v >= 10 && v <= _maxCount) useCount = v;
        else if (v >= 10) useCount = _maxCount;
        else {
          // 无效输入：轻微提示，回退到「全部」
          if (inp) {
            inp.classList.add('invalid');
            setTimeout(() => inp.classList.remove('invalid'), 600);
          }
          toast('请输入至少 10 个');
          useCount = 0;
        }
      }
      const useItems = sliceItems(items, useCount);
      startPracticeFrom(shuffle(useItems));
    };
  } else {
    renderCountPicker(0); // 隐藏选择器
    $('#startBtn').onclick = () => startPractice(false);
  }
}

// ================= 默写数量选择器 =================
let _pickCount = 0;   // 0 = 全部；-1 = 自定义（待输入）；>0 = 具体数量
let _maxCount = 0;    // 本次可默写的最大数量

function renderCountPicker(maxCount) {
  _maxCount = maxCount;
  const wrap = $('#countPicker');
  if (!wrap) return;
  if (!maxCount || maxCount <= 0) { wrap.hidden = true; return; }
  wrap.hidden = false;
  const chips = $$('.count-chip');
  // 总数不足 10 时只显示「全部」（保持最小 10 个的约束）
  if (maxCount < 10) {
    chips.forEach(c => { c.hidden = c.dataset.count !== '0'; });
    _pickCount = 0;
  } else {
    chips.forEach(c => {
      const v = parseInt(c.dataset.count, 10);
      c.hidden = v !== 0 && v > maxCount;
    });
    // 自适应：之前选中的数 > maxCount 时回退到「全部」
    if (_pickCount > maxCount || (_pickCount < -1)) _pickCount = 0;
  }
  // 标记选中：-1 和「非预设值」都归属「自定义」chip
  chips.forEach(c => {
    const v = parseInt(c.dataset.count, 10);
    let isSel = false;
    if (v === -1) isSel = _pickCount === -1;
    else isSel = v === _pickCount;
    c.classList.toggle('sel', isSel);
  });
  // 自定义输入框状态
  const customDiv = $('#countCustom');
  if (_pickCount === -1) {
    customDiv.hidden = false;
    const inp = $('#countCustomInput');
    inp.max = maxCount;
    if (!inp.value || parseInt(inp.value, 10) < 10) {
      inp.value = Math.min(20, maxCount);
    }
  } else {
    customDiv.hidden = true;
    const inp = $('#countCustomInput');
    if (inp) inp.classList.remove('invalid');
  }
}

// 事件委托：避免每次 renderCountPicker 都重新绑定
const _countChips = $('#countChips');
if (_countChips) {
  _countChips.addEventListener('click', e => {
    const chip = e.target.closest('.count-chip');
    if (!chip || chip.hidden) return;
    const v = parseInt(chip.dataset.count, 10);
    if (v === -1) {
      _pickCount = -1;
      renderCountPicker(_maxCount);
      setTimeout(() => {
        const inp = $('#countCustomInput');
        if (inp) { inp.focus(); inp.select(); }
      }, 60);
      haptic(8);
    } else {
      _pickCount = v;
      renderCountPicker(_maxCount);
      haptic(8);
    }
  });
}
const _countCustomInput = $('#countCustomInput');
if (_countCustomInput) {
  _countCustomInput.addEventListener('input', e => {
    const inp = e.target;
    let v = parseInt(inp.value, 10);
    if (isNaN(v) || v < 10) {
      inp.classList.add('invalid');
      // 仍保留 -1 标记，保持自定义 chip 选中
      _pickCount = -1;
      return;
    }
    if (v > _maxCount) { inp.value = _maxCount; v = _maxCount; }
    inp.classList.remove('invalid');
    _pickCount = v;
  });
  // 失焦时若输入合法则同步到 _pickCount（兜底）
  _countCustomInput.addEventListener('change', e => {
    let v = parseInt(e.target.value, 10);
    if (!isNaN(v) && v >= 10) {
      if (v > _maxCount) { e.target.value = _maxCount; v = _maxCount; }
      _pickCount = v;
      e.target.classList.remove('invalid');
    }
  });
}

// 根据 _pickCount 截取默写列表；0 / 越界 / 负数都返回原数组（默写全部）
function sliceItems(items, count) {
  if (!Array.isArray(items) || !items.length) return items;
  if (!count || count <= 0 || count >= items.length) return items;
  return items.slice(0, count);
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
  // 应用数量选择：「再练一轮」时复用最近一次选择（含自定义值）
  let useCount = _pickCount;
  if (useCount === -1) {
    const inp = $('#countCustomInput');
    const v = inp ? parseInt(inp.value, 10) : NaN;
    if (v >= 10 && v <= items.length) useCount = v;
    else if (v >= 10) useCount = items.length;
    else useCount = 0;
  }
  // 今日练习走 force 路径时也要洗牌
  startPracticeFrom(shuffle(sliceItems(items, useCount)));
}

function startPracticeFrom(items) {
  // items 进来时已经被 shuffle；这里不再洗，保证「再练一轮」也能复用同一乱序队列
  _skippedCount = 0;
  _combo = 0; _maxCombo = 0;
  const badge = $('#comboBadge'); if (badge) badge.classList.remove('show');
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
  const ph = $('#promptHint'); if (ph) ph.textContent = (it.type === 'sentence' ? '根据中文写出英文句子' : (it.type === 'word' ? '根据中文写出单词' : '根据中文写出词组'));
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
// 标点提示：空格自动变间隔，逗号/句号/撇号/连字符等非字母字符直接显示，无需默写
function buildLetterBox() {
  const it = session.current;
  const primary = String(it.english || '').split(/[\/；;]/)[0].trim();
  session.primary = primary;
  session.expLetters = primary.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  session.letterCells = [];
  session.wordEnds = [];
  session._lastLen = 0;
  session._wasWrong = false;
  const box = $('#letterBox');
  box.innerHTML = '';
  // 顶部小标签：词性 + 字符数
  const tip = document.createElement('div');
  tip.className = 'letter-box-tip';
  tip.innerHTML = '<span class="tip-dot"></span><span>' + typeLabel(it.type) + '</span><span class="tip-count">· 共 ' + session.expLetters.length + ' 个字母</span>';
  box.appendChild(tip);
  // 真正容纳格子的容器（display: contents 让子元素直接参与父 flex 流）
  const inner = document.createElement('div');
  inner.className = 'letter-box-inner';
  box.appendChild(inner);
  const words = primary.split(/\s+/).filter(Boolean);
  let li = 0;
  words.forEach((word, w) => {
    if (w > 0) { const gap = document.createElement('div'); gap.className = 'l-gap'; inner.appendChild(gap); }
    for (const ch of word) {
      if (/[A-Za-z0-9]/.test(ch)) {
        const cell = document.createElement('div');
        cell.className = 'l-cell';
        cell.dataset.i = li;
        inner.appendChild(cell);
        session.letterCells.push(cell);
        li++;
      } else {
        // 标点提示（逗号/句号/撇号/连字符等）：直接显示，无需默写
        const punct = document.createElement('div');
        punct.className = 'l-punct';
        punct.textContent = ch;
        inner.appendChild(punct);
      }
    }
    session.wordEnds.push(li);
  });
  // 期望输入长度 = 字母数 + 词间空格数（用于拼写过长判断）
  session.expectedLen = session.expLetters.length + Math.max(0, words.length - 1);
  renderLetterCells('');
  // 重新检测横向溢出（在新词长度变化时）
  setTimeout(updateLetterBoxOverflow, 0);
}

// 把当前输入渲染进字母格子；错字母标红并提示音；词组/句子自动补空格
function renderLetterCells(inputVal) {
  if (!session) return;
  const cells = session.letterCells || [];
  const exp = session.expLetters || '';
  // 输入中的标点视为提示（如手打逗号/撇号），不参与逐格比对
  const typed = String(inputVal || '').replace(/[^A-Za-z0-9\s]/g, '').replace(/\s+/g, '');
  cells.forEach((cell, i) => {
    cell.classList.remove('filled', 'wrong', 'current');
    if (i < typed.length) {
      cell.textContent = typed[i];
      cell.classList.add('filled');
      if (typed[i].toLowerCase() !== exp[i]) cell.classList.add('wrong');
    } else {
      cell.textContent = '';
      // 当前应填入的位置：脉冲提示
      if (i === typed.length && i < exp.length) cell.classList.add('current');
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
  const ansLen = session.expectedLen || (session.expLetters || '').length;
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
    bumpCombo();
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
        // 即时切到下一词（飘升/星星已挂到 body，不受切卡影响）
        showNext();
      } else {
        playCorrect();
        $('#feedback').innerHTML = '<div class="fb-ok">答对了！还需连续答对 <b>' + it.strike + '</b> 次才能得分</div>';
        $('#practiceCard').classList.add('ok');
        const w = session.queue.shift();
        session.queue.push(w);
        showNext();
      }
    } else {
      session.score++;
      session.queue.shift();
      playCorrect();
      fxCorrect();
      $('#feedback').innerHTML = '<div class="fb-ok">回答正确！加 1 分</div>';
      $('#practiceCard').classList.add('ok');
      $('#score').textContent = session.score;
      // 即时切到下一词（飘升/星星已挂到 body，不受切卡影响）
      showNext();
    }
  } else {
    // 答错：卡住本词，不进入下一词；提示音 + 闪现正确答案几秒后消失，再重新默写本词
    resetCombo();
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
  resetCombo();
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
  // 跳过会中断连击（不算答对）
  resetCombo();
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

// 正确时的游戏特效：分数飘升 + 星星 + 角落宠物弹跳
// 用 fixed 定位挂到 body 上，这样切到下一词时这些动效不会被一起清掉
function fxCorrect() {
  renderCornerPet();
  const card = $('#practiceCard');
  if (!card) return;
  const rect = card.getBoundingClientRect();
  // 飘升 +1 的起点：卡片正上方
  const startX = rect.left + rect.width / 2;
  const startY = rect.top + 12;
  const sp = document.createElement('div');
  sp.className = 'fx-score fx-score-global';
  sp.textContent = '+1';
  sp.style.left = startX + 'px';
  sp.style.top = startY + 'px';
  document.body.appendChild(sp);
  setTimeout(() => sp.remove(), 1000);
  const stars = ['⭐', '✨', '🌟', '🎉'];
  for (let i = 0; i < 6; i++) {
    const st = document.createElement('div');
    st.className = 'fx-star fx-star-global';
    st.textContent = stars[i % stars.length];
    // 从卡片范围内随机位置发射
    st.style.left = (rect.left + rect.width * (0.18 + Math.random() * 0.64)) + 'px';
    st.style.top = (rect.top + 40 + Math.random() * 40) + 'px';
    st.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px');
    st.style.setProperty('--dy', (-40 - Math.random() * 70) + 'px');
    document.body.appendChild(st);
    setTimeout(() => st.remove(), 1000);
  }
  const pet = $('#cornerPet');
  pet.classList.remove('pop');
  void pet.offsetWidth;
  pet.classList.add('pop');
}

// ===== 连击 combo 系统 =====
// 连续答对累积，达到 3/5/8/10/15 时触发大字 + 成就提示
let _combo = 0;
let _maxCombo = 0;
function bumpCombo() {
  _combo++;
  if (_combo > _maxCombo) _maxCombo = _combo;
  const badge = $('#comboBadge');
  if (badge) {
    badge.classList.remove('show');
    void badge.offsetWidth;
    badge.classList.add('show');
    $('#comboNum').textContent = _combo;
    // 隐藏计时器：10 秒无新连击自动收起
    clearTimeout(bumpCombo._t);
    bumpCombo._t = setTimeout(() => badge.classList.remove('show'), 10000);
  }
  // 大字只在 3 连击及以上出现
  if (_combo >= 3) {
    showComboFlash(_combo);
  }
  // 成就：达成 5/8/10/15 连击
  if ([5, 8, 10, 15, 20, 30].includes(_combo)) {
    showAchievement('🔥 ' + _combo + ' 连击！', '太稳了，键盘都在冒烟～');
  }
}
function resetCombo() {
  if (_combo >= 3) {
    // 之前的连击中断了，给个温柔的提示
    if (_combo >= 5) showAchievement('💔 连击中断', '答对 ' + _combo + ' 次，再来！');
  }
  _combo = 0;
  const badge = $('#comboBadge');
  if (badge) {
    badge.classList.remove('show');
    setTimeout(() => { badge.hidden = true; }, 300);
  }
}
function showComboFlash(n) {
  const el = $('#comboFlash');
  if (!el) return;
  el.textContent = n + ' COMBO!';
  el.hidden = false;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.hidden = true; }, 200);
  }, 1100);
}
let _achT = null;
function showAchievement(title, desc) {
  const el = $('#achievement');
  if (!el) return;
  $('#achievementTitle').textContent = title;
  $('#achievementDesc').textContent = desc;
  el.hidden = false;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  if (_achT) clearTimeout(_achT);
  _achT = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.hidden = true; }, 500);  // 等待动画结束再隐藏
  }, 2800);
  haptic([20, 60, 20]);
}

// 礼花：完成练习 / 达成里程碑时全屏爆炸
function fireworks() {
  const colors = ['#6366F1', '#8B5CF6', '#EC4899', '#FB923C', '#10B981', '#06B6D4', '#FBBF24'];
  // 4 个发射点：屏幕四个角
  const origins = [
    { x: window.innerWidth * 0.15, y: window.innerHeight * 0.7 },
    { x: window.innerWidth * 0.5,  y: window.innerHeight * 0.85 },
    { x: window.innerWidth * 0.85, y: window.innerHeight * 0.7 },
    { x: window.innerWidth * 0.3,  y: window.innerHeight * 0.85 },
    { x: window.innerWidth * 0.7,  y: window.innerHeight * 0.85 }
  ];
  origins.forEach((o, idx) => {
    setTimeout(() => {
      for (let i = 0; i < 14; i++) {
        const d = document.createElement('div');
        d.className = 'firework';
        d.style.background = colors[Math.floor(Math.random() * colors.length)];
        d.style.left = o.x + 'px';
        d.style.top = o.y + 'px';
        const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
        const dist = 80 + Math.random() * 100;
        d.style.setProperty('--fx', Math.cos(angle) * dist + 'px');
        d.style.setProperty('--fy', Math.sin(angle) * dist - 30 + 'px');
        document.body.appendChild(d);
        setTimeout(() => d.remove(), 1300);
      }
    }, idx * 200);
  });
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
  // 当前值去掉所有空白后的对应位置字母（标点视为提示，不参与比对）
  const typedNoSpace = String(el.value).replace(/[^A-Za-z0-9\s]/g, '').replace(/\s+/g, '');
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
  // 保存本轮最大连击，结算时用
  const maxCombo = _maxCombo;
  const isPerfect = !s.wrong && skipped === 0 && s.score > 0;
  _combo = 0; _maxCombo = 0;
  const badge = $('#comboBadge'); if (badge) badge.classList.remove('show');
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
  // 礼花：全对 / 最高连击 >= 5 / 完成超过 10 题 → 触发全屏礼花
  if (isPerfect || maxCombo >= 5 || s.total >= 10) fireworks();
  // 成就
  if (isPerfect) {
    setTimeout(() => showAchievement('🏆 完美通关！', '本轮 ' + s.score + ' 题全部正确，太牛了！'), 600);
  } else if (maxCombo >= 8) {
    setTimeout(() => showAchievement('🔥 最高 ' + maxCombo + ' 连击！', '手感来了，下次再创纪录～'), 600);
  } else if (maxCombo >= 5) {
    setTimeout(() => showAchievement('🔥 最高 ' + maxCombo + ' 连击！', '节奏感很棒，继续保持～'), 600);
  }
  prepareToday();
}

// ================= 统计 =================
// 进度环动画：把数字 0 → 目标，offset 0 → 目标
function animateRing(ring, numEl, target) {
  if (!ring) return;
  // 圆周长 ≈ 263.9 (r=42)
  const C = 263.9;
  const max = Math.max(target, 1);
  // 让进度按"满分=一定上限"展示，避太小看不出进度
  const denom = Math.max(max, 20);
  const pct = Math.min(1, target / denom);
  const offset = C * (1 - pct);
  // 强制先设成 0 再过渡到目标
  ring.style.strokeDashoffset = C;
  setTimeout(() => { ring.style.strokeDashoffset = offset; }, 50);
  // 数字递增动画
  const start = parseInt(numEl.textContent, 10) || 0;
  const dur = 900;
  const t0 = performance.now();
  function step(t) {
    const k = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - k, 3);
    numEl.textContent = Math.round(start + (target - start) * eased);
    if (k < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

async function loadStats() {
  const d = await api('/api/stats');
  totalPoints = d.points;
  renderPetPanel();
  renderCornerPet();
  // 大数字：累计得分
  const hero = $('#statPointsHero');
  if (hero) {
    const start = parseInt(hero.textContent, 10) || 0;
    const dur = 1200;
    const t0 = performance.now();
    function step(t) {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      hero.textContent = Math.round(start + (d.points - start) * eased);
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  // 4 个进度环：总/已掌握/待复习/练习次数
  animateRing($('#ringTotal'), $('#statTotal'), d.total);
  animateRing($('#ringMastered'), $('#statMastered'), d.mastered);
  animateRing($('#ringDue'), $('#statDue'), d.due);
  animateRing($('#ringSessions'), $('#statSessions'), d.sessions);
  // 复习计划：渲染为带柱状图的卡片
  renderScheduleCards(d.schedule || []);
  // 练习记录：渲染为带条形图 + 正确率环的卡片
  renderHistoryCards(d.history || []);
}

// 复习计划：横向柱状卡片，柱长按 max(计划数) 归一化
function renderScheduleCards(schedule) {
  const wrap = $('#scheduleBody');
  if (!wrap) return;
  if (!schedule.length) { wrap.innerHTML = '<tr><td colspan="2" class="empty-cell">还没有复习计划</td></tr>'; return; }
  const max = Math.max(1, ...schedule.map(s => s.count || 0));
  // 移动端用 div 卡片，桌面端用 tr；统一先渲染为桌面 tr 模板，再让 CSS 在 ≤720px 切换为卡片
  wrap.innerHTML = schedule.map((s, i) => {
    const today = new Date().toISOString().slice(0, 10) === s.date;
    const pct = Math.round((s.count / max) * 100);
    return '<tr class="data-row' + (today ? ' is-today' : '') + '">' +
      '<td class="data-date"><span class="data-day-d">' + s.date.slice(5).replace('-', '/') + '</span>' + (today ? '<span class="data-today-tag">今天</span>' : '') + '</td>' +
      '<td class="data-bar-cell"><div class="data-bar"><div class="data-bar-fill" style="width:' + pct + '%"></div></div><span class="data-bar-num">' + s.count + '</span></td>' +
      '</tr>';
  }).join('');
}

// 练习记录：每天一个 row，绿色=答对（条向右），红色=答错
function renderHistoryCards(history) {
  const wrap = $('#historyBody');
  if (!wrap) return;
  if (!history.length) { wrap.innerHTML = '<tr><td colspan="3" class="empty-cell">还没有练习记录</td></tr>'; return; }
  // 总数最大的那天决定归一化分母
  const max = Math.max(1, ...history.map(h => (h.correct || 0) + (h.wrong || 0)));
  wrap.innerHTML = history.map(h => {
    const c = h.correct || 0, w = h.wrong || 0, total = c + w;
    const cPct = Math.round(c / max * 100);
    const wPct = Math.round(w / max * 100);
    const acc = total ? Math.round(c / total * 100) : 0;
    return '<tr class="data-row">' +
      '<td class="data-date"><span class="data-day-d">' + h.date.slice(5).replace('-', '/') + '</span></td>' +
      '<td class="data-bar-cell">' +
        '<div class="hist-row">' +
          '<div class="hist-line hist-ok" style="width:' + cPct + '%"></div>' +
          '<div class="hist-line hist-bad" style="width:' + wPct + '%"></div>' +
        '</div>' +
        '<div class="hist-legend">' +
          '<span class="hist-ok-text">✓ ' + c + '</span>' +
          '<span class="hist-bad-text">✗ ' + w + '</span>' +
        '</div>' +
      '</td>' +
      '<td class="data-acc"><span class="acc-pill acc-' + (acc >= 80 ? 'good' : acc >= 60 ? 'mid' : 'bad') + '">' + acc + '%</span></td>' +
      '</tr>';
  }).join('');
}
