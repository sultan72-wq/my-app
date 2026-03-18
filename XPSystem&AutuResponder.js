// FULL DISCORD BOT SYSTEM (XP + VOICE + TOP + RANK + AUTO REPLIES)
// جاهز للنسخ والتشغيل مباشرة

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

// ===== FILES =====
const XP_FILE = path.join(__dirname, 'xp_data.json');
const DAILY_FILE = path.join(__dirname, 'xp_daily.json');
const WEEKLY_FILE = path.join(__dirname, 'xp_weekly.json');
const MONTHLY_FILE = path.join(__dirname, 'xp_monthly.json');

let xp = {};
let daily = {};
let weekly = {};
let monthly = {};

try { xp = JSON.parse(fs.readFileSync(XP_FILE)); } catch { xp = {}; }
try { daily = JSON.parse(fs.readFileSync(DAILY_FILE)); } catch { daily = {}; }
try { weekly = JSON.parse(fs.readFileSync(WEEKLY_FILE)); } catch { weekly = {}; }
try { monthly = JSON.parse(fs.readFileSync(MONTHLY_FILE)); } catch { monthly = {}; }

const save = () => fs.writeFileSync(XP_FILE, JSON.stringify(xp, null, 2));
const saveDaily = () => fs.writeFileSync(DAILY_FILE, JSON.stringify(daily, null, 2));
const saveWeekly = () => fs.writeFileSync(WEEKLY_FILE, JSON.stringify(weekly, null, 2));
const saveMonthly = () => fs.writeFileSync(MONTHLY_FILE, JSON.stringify(monthly, null, 2));

// ===== LEVEL =====
function getLevel(xpVal) {
  let lvl = 0, need = 20;
  while (xpVal >= need) {
    xpVal -= need;
    lvl++;
    need *= 2;
  }
  return lvl;
}

const LEVEL_CHANNEL = '1373288985199378472';
const SUPPORT_ROLE = '1268350577499443283';

// ===== ROLE REWARDS =====
const levelRoles = {
  5: 'ROLE_ID_5',
  10: 'ROLE_ID_10',
  20: 'ROLE_ID_20',
  30: 'ROLE_ID_30',
  40: 'ROLE_ID_40',
  50: 'ROLE_ID_50'
};

async function levelUp(member, oldL, newL) {
  const ch = client.channels.cache.get(LEVEL_CHANNEL);

  // رسالة الروم (تبقى مثل ما هي)
  if (ch) {
    ch.send(`ألف مبروك 🥳 <@${member.id}>\nلقد انتقلت من المستوى ${oldL} إلى ${newL}\nواصل التقدم 🔥`);
  }

  // إذا فيه رتبة لهذا المستوى
  if (levelRoles[newL]) {
    try {
      await member.roles.add(levelRoles[newL]);

      // جلب اسم الرتبة
      const role = member.guild.roles.cache.get(levelRoles[newL]);
      const roleName = role ? role.name : 'رتبة جديدة';

      // رسالة الخاص (فقط هنا)
      await member.send(`مبرووك 🥳🎉, لقد وصلت الى المستوى ${newL} وحصلت على الرتبة ${roleName} 🔥\nاستمر يابطل 🫡`);

    } catch {}
  }
}

function addXP(id, amount, type = 'text', member) {
  if (!xp[id]) xp[id] = { text: 0, voice: 0, level: 0 };

  xp[id][type] += amount;

  const newL = getLevel(xp[id][type]);
  if (newL > xp[id].level) {
    const oldL = xp[id].level;
    xp[id].level = newL;
    levelUp(member, oldL, newL);
  }

  save();
}

function addTime(id, amount, type, store, saveFn) {
  if (!store[id]) store[id] = { text: 0, voice: 0 };
  store[id][type] += amount;
  saveFn();
}

// ===== AUTO REPLIES =====
const autoReplies = [
  { trigger: ['سلام عليكم','السلام عليكم','سلام عليكم ورحمة الله وبركاته','السلام عليكم ورحمة الله وبركاته','سلام عليكم ورحمة الله','السلام عليكم ورحمه الله','السلام عليكم ورحمه الله وبركاته','سلام عليكم ورحمه الله وبركاته'], reply: 'وعليكم السلام ورحمة الله وبركاته منور/ه ❣️' },
  { trigger: ['هلا'], reply: 'اهلين منور/ه❣️' },
  { trigger: ['باك'], reply: 'ولكم منور/ه ❣️' },
  { trigger: ['بروح','سلام'], reply: 'الله معك 🫡' },
  { trigger: ['رابط'], reply: 'https://discord.gg/4sX5Pagbh5', adminOnly: true },
  { trigger: ['-'], reply: 'لا تنسى تقييمك للاداري (الشخص الي ارسل الرساله) في https://discord.com/channels/1225825173358379131/1367573165898862602', roles: [SUPPORT_ROLE] }
];

client.on('messageCreate', async msg => {
  if (msg.author.bot) return;

  for (const r of autoReplies) {
    const triggers = Array.isArray(r.trigger) ? r.trigger : [r.trigger];
    if (triggers.some(t => msg.content.includes(t))) {

      if (r.roles && !r.roles.some(id => msg.member.roles.cache.has(id))) continue;
      if (r.adminOnly && !msg.member.permissions.has('Administrator')) continue;

      msg.channel.send(r.reply).catch(()=>{});
      break;
    }
  }

  const xpAmount = Math.floor(Math.random() * 5) + 5;
  addXP(msg.author.id, xpAmount, 'text', msg.member);
  addTime(msg.author.id, xpAmount, 'text', daily, saveDaily);
  addTime(msg.author.id, xpAmount, 'text', weekly, saveWeekly);
  addTime(msg.author.id, xpAmount, 'text', monthly, saveMonthly);
});

// ===== VOICE XP =====
const voiceTime = new Map();

client.on('voiceStateUpdate', (oldState, newState) => {
  const member = newState.member;

  if (!oldState.channel && newState.channel) {
    voiceTime.set(member.id, Date.now());
  }

  if (oldState.channel && !newState.channel) {
    const start = voiceTime.get(member.id);
    if (!start) return;

    const duration = Math.floor((Date.now() - start) / 60000);
    if (duration > 0) {
      addXP(member.id, duration * 2, 'voice', member);
      addTime(member.id, duration * 2, 'voice', daily, saveDaily);
      addTime(member.id, duration * 2, 'voice', weekly, saveWeekly);
      addTime(member.id, duration * 2, 'voice', monthly, saveMonthly);
    }

    voiceTime.delete(member.id);
  }
});

// ===== RANK COMMAND =====
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) return;

  if (i.commandName === 'rank') {
    const user = i.user.id;
    const data = xp[user] || { text: 0, voice: 0, level: 0 };

    const embed = new EmbedBuilder()
      .setTitle('📊 معلوماتك')
      .addFields(
        { name: '📜 كتابي', value: String(data.text) },
        { name: '🎤 صوتي', value: String(data.voice) },
        { name: '⭐ المستوى', value: String(data.level) }
      );

    i.reply({ embeds: [embed] });
  }

  if (i.commandName === 'top') {
    const sort = (data, type) => Object.entries(data).map(([id,v])=>({id,xp:v[type]||0})).sort((a,b)=>b.xp-a.xp);

    const textTop = sort(xp,'text').slice(0,5);
    const voiceTop = sort(xp,'voice').slice(0,5);

    const embed = new EmbedBuilder()
      .setTitle('🏆 المتصدرين')
      .addFields(
        { name: '📜 كتابي', value: textTop.map((u,i)=>`${i+1}. <@${u.id}> — ${u.xp}`).join('\n')||'لا يوجد' },
        { name: '🎤 صوتي', value: voiceTop.map((u,i)=>`${i+1}. <@${u.id}> — ${u.xp}`).join('\n')||'لا يوجد' }
      );

    i.reply({ embeds: [embed] });
  }
});

// ===== RESET =====
cron.schedule('0 4 * * *', () => { daily = {}; saveDaily(); });
cron.schedule('0 4 * * 0', () => { weekly = {}; saveWeekly(); });
cron.schedule('0 4 1 * *', () => { monthly = {}; saveMonthly(); });
