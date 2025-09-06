// server.js (الكود الكامل، لا تقطع أي جزء)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { createCanvas, loadImage } = require('canvas');
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  AttachmentBuilder,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType
} = require('discord.js');

// -------------------- إعداد المتغيرات والـ IDs --------------------
const TOKEN = process.env.TOKEN || process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('❌ لم يتم العثور على TOKEN في المتغيرات البيئية. ضع TOKEN في .env أو في متغيرات البيئة الخاصة بالخدمة.');
  process.exit(1);
}

// Channels & Roles (حسب ما أعطيتني)
const WELCOME_CHANNEL = '1273954331233747046';     // روم الترحيب
const CONGRATS_CHANNEL = '1273958175439060992';    // روم التهنئة بالمستويات
const TICKET_HUB_CHANNEL = '1413938199956295710';  // روم يتم إرسال رسالة فتح التذاكر فيه
const ADMIN_FORM_CHANNEL = '1406692048089780234';  // روم إرسال نموذج الإدارة عند الإقلاع

const SUPPORT_ROLE = '1406690376156319764';        // رتبة فريق الدعم (مشرفي التذاكر)
const ADMINISTRATOR_ROLE = '1268350577499443283';  // (مثلاً) رتبة أدمن ستريتور لو تُستخدم

// رتب الترقيات حسب المستويات (حسب القيم التي أعطيتني)
const LEVEL_ROLES = {
  6:  '1406688194187231373',
  11: '1406688443081162845',
  17: '1406688498366287922',
  24: '1406688532860375060',
  32: '1406688939359862937',
  39: '1406689175280812082',
  49: '1406689207757438996'
};

// مكان صورة الترحيب داخل المشروع
const WELCOME_IMAGE_PATH = path.join(__dirname, 'images', 'welcome.png');

// -------------------- ملفات البيانات (سيتم إنشاؤها تلقائياً إن لم تكن موجودة) --------------------
const DB = {
  XP_TEXT: path.join(__dirname, 'xp_text.json'),
  XP_VOICE: path.join(__dirname, 'xp_voice.json'),
  XP_TEXT_DAY: path.join(__dirname, 'xp_text_day.json'),
  XP_TEXT_WEEK: path.join(__dirname, 'xp_text_week.json'),
  XP_TEXT_MONTH: path.join(__dirname, 'xp_text_month.json'),
  XP_VOICE_DAY: path.join(__dirname, 'xp_voice_day.json'),
  XP_VOICE_WEEK: path.join(__dirname, 'xp_voice_week.json'),
  XP_VOICE_MONTH: path.join(__dirname, 'xp_voice_month.json')
};

function readJSON(p, fallback = {}) {
  try {
    if (!fs.existsSync(p)) return fallback;
    const txt = fs.readFileSync(p, 'utf8');
    return JSON.parse(txt || '{}');
  } catch (e) {
    console.error('JSON read error', p, e);
    return fallback;
  }
}
function writeJSON(p, data) {
  try { fs.writeFileSync(p, JSON.stringify(data, null, 2)); }
  catch (e) { console.error('JSON write error', p, e); }
}

// تحميل الداتا
let xpText = readJSON(DB.XP_TEXT, {});   // شكل: { userId: { xp, level, lastMsg } }
let xpVoice = readJSON(DB.XP_VOICE, {}); // شكل: { userId: xp }
let xpTextDay = readJSON(DB.XP_TEXT_DAY, {});
let xpTextWeek = readJSON(DB.XP_TEXT_WEEK, {});
let xpTextMonth = readJSON(DB.XP_TEXT_MONTH, {});
let xpVoiceDay = readJSON(DB.XP_VOICE_DAY, {});
let xpVoiceWeek = readJSON(DB.XP_VOICE_WEEK, {});
let xpVoiceMonth = readJSON(DB.XP_VOICE_MONTH, {});

// -------------------- ضبط الحفظ الدوري --------------------
function saveAll() {
  writeJSON(DB.XP_TEXT, xpText);
  writeJSON(DB.XP_VOICE, xpVoice);
  writeJSON(DB.XP_TEXT_DAY, xpTextDay);
  writeJSON(DB.XP_TEXT_WEEK, xpTextWeek);
  writeJSON(DB.XP_TEXT_MONTH, xpTextMonth);
  writeJSON(DB.XP_VOICE_DAY, xpVoiceDay);
  writeJSON(DB.XP_VOICE_WEEK, xpVoiceWeek);
  writeJSON(DB.XP_VOICE_MONTH, xpVoiceMonth);
}
setInterval(saveAll, 30_000); // كل 30 ثانية حفظ دوري

// -------------------- دوال مساعدة للنظام --------------------
function ensureTextUser(id) {
  if (!xpText[id]) xpText[id] = { xp: 0, level: 1, lastMsg: 0 };
}
function addTextXP(id, amount) {
  ensureTextUser(id);
  xpText[id].xp += amount;
  xpText[id].lastMsg = Date.now();
  xpTextDay[id] = (xpTextDay[id] || 0) + amount;
  xpTextWeek[id] = (xpTextWeek[id] || 0) + amount;
  xpTextMonth[id] = (xpTextMonth[id] || 0) + amount;
}
function addVoiceXP(id, amount) {
  xpVoice[id] = (xpVoice[id] || 0) + amount;
  xpVoiceDay[id] = (xpVoiceDay[id] || 0) + amount;
  xpVoiceWeek[id] = (xpVoiceWeek[id] || 0) + amount;
  xpVoiceMonth[id] = (xpVoiceMonth[id] || 0) + amount;
}
function requiredXP(level) {
  return 20 * Math.pow(2, Math.max(0, level - 1));
}
function sortMap(map) {
  // map can be either {id: number} or {id: {xp:..., ...}}
  return Object.entries(map)
    .map(([id, v]) => [id, typeof v === 'object' ? (v.xp || 0) : v])
    .sort((a, b) => b[1] - a[1]);
}
function findRank(sortedList, id) {
  return sortedList.findIndex(([uid]) => uid === id) + 1; // 1-based or 0 -> returns >0 or 0 -> not found
}

// -------------------- إعداد الـ Voice tracking --------------------
const voiceJoin = {}; // { userId: timestampMs }

// -------------------- إعداد البوت --------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel]
});

// -------------------- Express webserver (لـ UptimeRobot) --------------------
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Otaru Bot is alive 🚀'));
app.listen(PORT, () => console.log(`Web server listening on port ${PORT}`));

// -------------------- Reset يومي / أسبوعي / شهري عند 4:00 بتوقيت عمان (UTC+4) --------------------
let lastDailyReset = 0;
let lastWeeklyReset = 0;
let lastMonthlyReset = 0;

function checkResets() {
  const now = new Date();
  // حساب إذا عدينا 4:00 بتوقيت عمان => UTC time = 4 - 4 = 0 => أي يوم الساعة 0UTC
  // لكن هنا نستخدم التوقيت المحلي للـ server لذلك ننفذ فحص مرن:
  const nowUTC = new Date(now.getTime() + now.getTimezoneOffset() * 60000); // الوقت UTC
  const todayUTC_0 = new Date(Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate(), 0, 0, 0, 0)).getTime();

  // سنستخدم نهج أبسط: تحويل 4:00 عمان إلى UTC = 0:00 ؛
  // نتحقق على أساس تاريخ/ساعة UTC الآن.
  const currentUTCDate = nowUTC.getUTCDate();
  const currentUTCHour = nowUTC.getUTCHours();

  // يومي: تنفيذ مرة عندما تتحول الساعة UTC إلى 0:00 (أي 4:00 بتوقيت عمان)
  if (currentUTCHour === 0) {
    if (lastDailyReset < todayUTC_0) {
      xpTextDay = {};
      xpVoiceDay = {};
      lastDailyReset = Date.now();
      console.log('✅ Daily XP reset (UTC 00:00 => Oman 04:00)');
    }
  }

  // أسبوعي: إذا اليوم الأحد UTC (0) عند 0:00 UTC = Sunday 4am Oman
  if (nowUTC.getUTCDay() === 0 && currentUTCHour === 0) {
    if (lastWeeklyReset < todayUTC_0) {
      xpTextWeek = {};
      xpVoiceWeek = {};
      lastWeeklyReset = Date.now();
      console.log('✅ Weekly XP reset (Sunday 04:00 Oman)');
    }
  }

  // شهري: إذا يوم الشهر = 1 و الساعة UTC =0
  if (nowUTC.getUTCDate() === 1 && currentUTCHour === 0) {
    if (lastMonthlyReset < todayUTC_0) {
      xpTextMonth = {};
      xpVoiceMonth = {};
      lastMonthlyReset = Date.now();
      console.log('✅ Monthly XP reset (1st day 04:00 Oman)');
    }
  }

  // حفظ بعد أي تغيير
  saveAll();
}
setInterval(checkResets, 60_000); // تحقق كل دقيقة

// -------------------- عند الجاهزية (ready) --------------------
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // إرسال نموذج تقديم الإدارة مرة عند إقلاع البوت (في روم ADMIN_FORM_CHANNEL)
  try {
    const ch = await client.channels.fetch(ADMIN_FORM_CHANNEL).catch(() => null);
    if (ch && ch.isTextBased()) {
      await ch.send({
        content: "**__بسم الله تم فتح باب تقديم الاداره\n\n نموذج تقديم اداره\n-\nاسمك :\n-\nعمرك : \n-\nمن وين : \n-\nخبراتك :\n-\nكم لك ب دسكورد : \n-\nماذا نستفيد منك :\n-\nتستعمل شعارنا : \n\nكم صرت اداري ب سيرفرات : \n-\nقوانين - ممنوع السب ممنوع التخريب على\n الآخرين \n-\nلاتسرق نموذج ناس ولا تكذب !__**\n@everyone @here"
      }).catch(() => {});
    }
  } catch (e) {
    console.warn('Could not send admin form message at ready:', e?.message || e);
  }

  // إرسال رسالة قائمة التذاكر (select menu) في hub
  try {
    const hub = await client.channels.fetch(TICKET_HUB_CHANNEL).catch(() => null);
    if (hub && hub.isTextBased()) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId('ticket_menu')
        .setPlaceholder('اختَر نوع التذكرة من هنا')
        .addOptions(
          { label: 'الدعم الفني ⚖️', value: 'support', description: 'مشكلة/استفسار عام - فريق الدعم', emoji: '⚖️' },
          { label: 'تقديم إدارة 👨‍💻', value: 'admin_apply', description: 'تقديم انضمام لفريق الإدارة', emoji: '👨‍💻' },
          { label: 'شكوى على عضو ⚠️', value: 'complaint_member', description: 'إبلاغ عن عضو', emoji: '⚠️' },
          { label: 'شكوى على إداري ☣️', value: 'complaint_staff', description: 'إبلاغ عن إداري', emoji: '☣️' }
        );

      const row = new ActionRowBuilder().addComponents(menu);
      await hub.send({
        embeds: [new EmbedBuilder().setTitle('نظام التذاكر').setDescription('**لإنشاء تذكرة اختر نوع التذكرة من القائمة أدناه**').setColor(0xE53935)],
        components: [row]
      }).catch(() => {});
    }
  } catch (e) {
    console.warn('Could not post ticket hub message:', e?.message || e);
  }
});

// -------------------- ترحيب مُعدل بالصورة (Canvas) --------------------
client.on('guildMemberAdd', async (member) => {
  try {
    const ch = await member.guild.channels.fetch(WELCOME_CHANNEL).catch(() => null);
    if (!ch || !ch.isTextBased()) return;

    // تحميل الخلفية (التي وضعتها في ./images/welcome.png)
    if (!fs.existsSync(WELCOME_IMAGE_PATH)) {
      // لو ما فيه صورة، نرسل رسالة نصية فقط
      return ch.send({ content: `**نورتـ/ـي سيرفرنا ${member}\n\nانتـ/ـي الآن في Otaru Community**` }).catch(() => {});
    }

    const bg = await loadImage(WELCOME_IMAGE_PATH);
    const canvas = createCanvas(bg.width, bg.height);
    const ctx = canvas.getContext('2d');

    // رسم الخلفية
    ctx.drawImage(bg, 0, 0, bg.width, bg.height);

    // تحميل صورة الافاتار
    const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
    const res = await fetch(avatarURL);
    const buf = Buffer.from(await res.arrayBuffer());
    const avatar = await loadImage(buf);

    // حساب أبعاد الافاتار الموضوعة بالوسط
    const avSize = Math.floor(Math.min(bg.width, bg.height) * 0.28);
    const avX = Math.floor(bg.width / 2 - avSize / 2);
    const avY = Math.floor(bg.height * 0.25);

    // رسم دائرة وقطع الصورة لافاتار دائري
    ctx.save();
    ctx.beginPath();
    ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, avX, avY, avSize, avSize);
    ctx.restore();

    // اسم المستخدم تحته
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    const nameFontSize = Math.floor(avSize * 0.20);
    ctx.font = `${nameFontSize}px sans-serif`;
    ctx.fillText(member.user.username, bg.width / 2, avY + avSize + Math.floor(avSize * 0.33));

    // نص الترحيب ضمن المحتوى
    const contentText = `**نورتـ/ـي سيرفرنا ${member}\n\nانتـ/ـي الآن في Otaru Community\n\nلتتعرفـ/ـي على سيرفرنا اكثر توجهـ/ـي الى :\n<#1373309259709681694>\n\nلا تنسى قراءة <#1250410826981179514>\n\nنتمنى لكـ/ـي تجربة رائعة في سيرفرنا المتواضع 🔥**`;

    const attachment = new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'welcome.png' });
    await ch.send({ content: contentText, files: [attachment] }).catch(() => {});
  } catch (e) {
    console.error('Welcome canvas error:', e);
  }
});

// -------------------- الردود التلقائية --------------------
client.on('messageCreate', async (msg) => {
  if (!msg.guild || msg.author.bot) return;
  const content = msg.content.trim().toLowerCase();

  const isSupport = msg.member.roles.cache.has(SUPPORT_ROLE);
  const isAdmin = msg.member.permissions.has(PermissionsBitField.Flags.Administrator);

  const replies = {
    "السلام عليكم": "وعليكم السلام ورحمة الله وبركاته منور/ه ❤️",
    "السلام عليكم ورحمة الله": "وعليكم السلام ورحمة الله وبركاته منور/ه ❤️",
    "السلام عليكم ورحمة الله وبركاته": "وعليكم السلام ورحمة الله وبركاته منور/ه ❤️",
    "سلام عليكم": "وعليكم السلام ورحمة الله وبركاته منور/ه ❤️",
    "سلام عليكم ورحمة الله": "وعليكم السلام ورحمة الله وبركاته منور/ه ❤️",
    "سلام عليكم ورحمة الله وبركاته": "وعليكم السلام ورحمة الله وبركاته منور/ه ❤️",
    "باك": "ولكم منور/ه ❤️",
    "شعار": isSupport ? "! 𝙈𝟳 I" : null,
    // "!" تم طلب حذفه سابقاً
    "-": isSupport ? `كان معك الاداري ${msg.author} لا تنسى تقييمك في https://discord.com/channels/1225825173358379131/1367573165898862602` : null,
    "تحويل": isAdmin ? "التحويل الى Md7 فقط" : null
  };

  if (replies[content]) {
    try { await msg.reply(replies[content]); } catch {}
  }

  // ====== نظام XP الكتابي (رسائل) ======
  try {
    const uid = msg.author.id;
    ensureTextUser(uid);
    const now = Date.now();
    if (now - (xpText[uid].lastMsg || 0) > 10000) {
      // يحصل 5 XP لكل رسالة كل 10 ثواني
      addTextXP(uid, 5);

      // تحقق ترقية
      const currentLevel = xpText[uid].level;
      const need = requiredXP(currentLevel);
      if (xpText[uid].xp >= need) {
        const oldLevel = currentLevel;
        xpText[uid].level = currentLevel + 1;
        // تهنئة روم
        try { await (msg.guild.channels.cache.get(CONGRATS_CHANNEL) || (await msg.guild.channels.fetch(CONGRATS_CHANNEL))).send(`ألف مبروك 🥳 <@${uid}>\nلقد انتقلت من المستوى ${oldLevel} إلى ${currentLevel + 1}\nواصل التقدم 🔥`); } catch {}
        // إعطاء رتبة إن وُجدت
        if (LEVEL_ROLES[currentLevel + 1]) {
          try { (await msg.guild.members.fetch(uid)).roles.add(LEVEL_ROLES[currentLevel + 1]).catch(() => {}); } catch {}
        }
      }
    }
  } catch (e) { console.warn('XP text error', e); }

  // الأوامر (top / top text / top voice / rank / رانك)
  // نقوم بفحص الأوامر في هنا لتسهيل التنفيذ بدون نظام أوامر معقد
  if (!content.startsWith('top') && !content.startsWith('t') && content !== 'rank' && content !== 'رانك') return;

  // ------------------------------------------
  // وظيفة بناء إمبيد الـ top و عرض النتائج
  // ------------------------------------------
  try {
    const args = content.split(/\s+/).filter(Boolean); // e.g. ["top", "text", "day"]
    const baseCmd = args[0]; // top or t
    // determine mode: both/text/voice
    let mode = 'both';
    if (args[1]) {
      if (args[1] === 'text') mode = 'text';
      else if (args[1] === 'voice') mode = 'voice';
    }
    // period
    let period = 'all';
    if (args.includes('day')) period = 'day';
    else if (args.includes('week')) period = 'week';
    else if (args.includes('month')) period = 'month';

    // pick datasets
    function pickText(scope) {
      if (scope === 'all') {
        // flatten xpText map to {id: xp}
        const flat = {};
        for (const [id, v] of Object.entries(xpText)) flat[id] = v.xp || 0;
        return flat;
      } else if (scope === 'day') return xpTextDay;
      else if (scope === 'week') return xpTextWeek;
      else if (scope === 'month') return xpTextMonth;
      return {};
    }
    function pickVoice(scope) {
      if (scope === 'all') return xpVoice;
      else if (scope === 'day') return xpVoiceDay;
      else if (scope === 'week') return xpVoiceWeek;
      else if (scope === 'month') return xpVoiceMonth;
      return {};
    }

    const textMap = pickText(period);
    const voiceMap = pickVoice(period);

    const sortedText = sortMap(textMap); // [ [id, xp], ... ]
    const sortedVoice = sortMap(voiceMap);

    const uid = msg.author.id;

    if (mode === 'both') {
      // top -> عرض 5 كتابي و 5 صوتي في ذات الإمبيد
      const topText = sortedText.slice(0, 5);
      const topVoice = sortedVoice.slice(0, 5);

      // لاحظ: لو المستخدم خارج الخمسة نضيف مركزه تحت المركز الخامس
      let textField = '';
      for (let i = 0; i < 5; i++) {
        if (topText[i]) textField += `**${i + 1}. <@${topText[i][0]}> - ${topText[i][1]} XP**\n`;
        else textField += '\n';
      }
      const userTextRank = findRank(sortedText, uid);
      if (userTextRank > 5) {
        const userXPval = (sortedText.find(([u]) => u === uid) || [null, 0])[1];
        textField += `**${userTextRank}. <@${uid}> - ${userXPval} XP**\n`;
      }

      let voiceField = '';
      for (let i = 0; i < 5; i++) {
        if (topVoice[i]) voiceField += `**${i + 1}. <@${topVoice[i][0]}> - ${topVoice[i][1]} XP**\n`;
        else voiceField += '\n';
      }
      const userVoiceRank = findRank(sortedVoice, uid);
      if (userVoiceRank > 5) {
        const userVoiceXPval = (sortedVoice.find(([u]) => u === uid) || [null, 0])[1];
        voiceField += `**${userVoiceRank}. <@${uid}> - ${userVoiceXPval} XP**\n`;
      }

      const embed = new EmbedBuilder()
        .setTitle(`📊 المتصدرين (${period === 'all' ? 'الكل' : period})`)
        .addFields(
          { name: 'كتابي 📝', value: textField || 'لا يوجد', inline: true },
          { name: 'صوتي 🎤', value: voiceField || 'لا يوجد', inline: true }
        )
        .setColor(0xC62828);

      return void msg.channel.send({ embeds: [embed] });
    }

    if (mode === 'text' || mode === 'voice') {
      const map = mode === 'text' ? textMap : voiceMap;
      const sorted = (mode === 'text' ? sortedText : sortedVoice).slice(0, 10);
      let out = '';
      for (let i = 0; i < sorted.length; i++) {
        out += `**${i + 1}. <@${sorted[i][0]}> - ${sorted[i][1]} XP**\n`;
      }
      if (!out) out = 'لا يوجد';
      const embed = new EmbedBuilder()
        .setTitle(`📊 ${mode === 'text' ? 'كتابي 📝' : 'صوتي 🎤'} (${period === 'all' ? 'الكل' : period})`)
        .setDescription(out)
        .setColor(0xAD1457);
      return void msg.channel.send({ embeds: [embed] });
    }

    // أمر رانك
    if (content === 'rank' || content === 'رانك') {
      const tx = (xpText[uid] && xpText[uid].xp) || 0;
      const lv = (xpText[uid] && xpText[uid].level) || 1;
      const vx = xpVoice[uid] || 0;
      const embed = new EmbedBuilder()
        .setTitle(`🎖️ معلومات ${msg.author.username}`)
        .setColor(0x1E88E5)
        .addFields(
          { name: 'XP الكتابي', value: `${tx} XP`, inline: true },
          { name: 'المستوى الكتابي', value: `${lv}`, inline: true },
          { name: 'XP الصوتي', value: `${vx} XP`, inline: true }
        );
      return void msg.channel.send({ embeds: [embed] });
    }
  } catch (e) {
    console.error('Top/Rank handler error:', e);
  }
});

// -------------------- نظام الصوت (احتساب) --------------------
client.on('voiceStateUpdate', (oldState, newState) => {
  // دخول قناة صوتية
  try {
    // newState.channelId non-null means joined some channel
    if (!oldState.channelId && newState.channelId) {
      voiceJoin[newState.id] = Date.now();
    }
    // خروج من قناة صوتية
    if (oldState.channelId && !newState.channelId) {
      const start = voiceJoin[newState.id];
      if (!start) return;
      const mins = Math.floor((Date.now() - start) / 60000);
      // نظامك: كل نصف ساعة = 20 XP (مطابق لطلبك السابق)
      const chunks = Math.floor(mins / 30);
      const earned = chunks * 20;
      if (earned > 0) {
        addVoiceXP(newState.id, earned);
        // أيضاً ننظر هل نريد إضافة لتكوين الترقيات الصوتية — هنا نتركها فقط كـ xpVoice
      }
      delete voiceJoin[newState.id];
    }
  } catch (e) {
    console.warn('Voice XP error', e);
  }
});

// -------------------- نظام التذاكر (قائمة + أزرار) --------------------
client.on('interactionCreate', async (interaction) => {
  try {
    // =================================================
    // اختيار من القائمة لفتح التذكرة
    // =================================================
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_menu') {
      await interaction.deferReply({ ephemeral: true });
      const choice = interaction.values[0]; // support | admin_apply | complaint_member | complaint_staff
      const hub = await client.channels.fetch(TICKET_HUB_CHANNEL).catch(() => null);
      const parentId = hub?.parentId || interaction.channel?.parentId || null;

      // نوع التذكرة و الضوابط
      const isAdminOnly = (choice === 'admin_apply' || choice === 'complaint_staff');
      const isSupportOnly = (choice === 'support' || choice === 'complaint_member');

      // إعداد صلاحيات القناة المنشأة
      const overwrites = [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }, // @everyone ممنوع
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ];

      if (!isAdminOnly) {
        overwrites.push({ id: SUPPORT_ROLE, allow: [PermissionsBitField.Flags.ViewChannel] });
      } else {
        // إن كانت مخصصة للأدمن، لا نعرض لفريق الدعم، فقط للأدمن/أصحاب الصلاحية
        // سنعتمد على من يضغط استلام لاحقاً (فقط الأدمن يستطيع استلام)
      }

      // اسم القناة
      const nameMap = {
        support: `support-${interaction.user.username}`,
        admin_apply: `apply-${interaction.user.username}`,
        complaint_member: `complaint-member-${interaction.user.username}`,
        complaint_staff: `complaint-staff-${interaction.user.username}`
      };
      const channelName = (nameMap[choice] || `ticket-${interaction.user.username}`).slice(0, 90);

      const ticket = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: parentId ?? undefined,
        permissionOverwrites: overwrites,
        topic: `type:${choice};owner:${interaction.user.id}`
      });

      // إذا الخيار admin_apply نرسل نموذج الإدارة داخل روم خاص (ADMIN_FORM_CHANNEL) أيضاً يُنشر فور الإنشاء
      const hereMention = (choice === 'admin_apply' || choice === 'complaint_staff') ? '@here ' : '';
      const supportPing = (choice === 'support' || choice === 'complaint_member') ? `<@&${SUPPORT_ROLE}>` : hereMention;

      // رسالة داخل التذكرة
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('إستلام').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق تذكرة').setStyle(ButtonStyle.Danger)
      );

      await ticket.send({
        content: `${hereMention}أهلاً بك <@${interaction.user.id}>\nسوف يتم التعامل معك قريباً\n${supportPing}`,
        components: [buttons]
      });

      // لو الخيار admin_apply نرسل النموذج داخل روم ADMIN_FORM_CHANNEL كما طلبت (أيضاً نمنشن everyone/here داخل ذلك الروم فقط مرة عند الإنشاء)
      if (choice === 'admin_apply') {
        try {
          const adminFormRoom = await client.channels.fetch(ADMIN_FORM_CHANNEL).catch(() => null);
          if (adminFormRoom && adminFormRoom.isTextBased()) {
            await adminFormRoom.send({
              content: `**__بسم الله تم فتح باب تقديم الاداره\n\n نموذج تقديم اداره\n-\nاسمك :\n-\nعمرك : \n-\nمن وين : \n-\nخبراتك :\n-\nكم لك ب دسكورد : \n-\nماذا نستفيد منك : \n-\nتستعمل شعارنا : \n\nكم صرت اداري ب سيرفرات : \n-\nقوانين - ممنوع السب ممنوع التخريب على\n الآخرين \n-\nلاتسرق نموذج ناس ولا تكذب !__**\n@here`
            }).catch(() => {});
          }
        } catch (e) { console.warn('Could not post admin apply form', e); }
      }

      await interaction.editReply({ content: `✅ تم إنشاء التذكرة: <#${ticket.id}>`, ephemeral: true });
      return;
    }

    // =================================================
    // أزرار التذكرة: إستلام / إغلاق / إعادة فتح / حذف
    // =================================================
    if (interaction.isButton()) {
      const customId = interaction.customId;
      const ch = interaction.channel;
      if (!ch || !ch.topic) return interaction.reply({ content: 'لا يمكن تنفيذ هذا الإجراء هنا.', ephemeral: true });

      const parsed = Object.fromEntries(ch.topic.split(';').map(s => s.split(':')));
      const type = parsed.type;
      const owner = parsed.owner;

      // استلام
      if (customId === 'claim_ticket') {
        // مُن يحق له الاستلام؟
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        const isSupport = interaction.member.roles.cache.has(SUPPORT_ROLE);

        if (type === 'admin_apply' || type === 'complaint_staff') {
          if (!isAdmin) return interaction.reply({ content: '❌ هذه التذكرة مخصصة للأدمن فقط.', ephemeral: true });
        } else {
          if (!isSupport && !isAdmin) return interaction.reply({ content: '❌ لا يمكنك استلام هذه التذكرة.', ephemeral: true });
        }

        // لو تم استلامها مسبقاً
        if (parsed.claimer) {
          return interaction.reply({ content: `تم استلام هذه التذكرة بالفعل من قبل <@${parsed.claimer}>`, ephemeral: true });
        }

        // تحديث التوبيك
        const newTopic = `${ch.topic};claimer:${interaction.user.id}`;
        await ch.setTopic(newTopic).catch(() => {});

        // منع فريق الدعم من الكتابة كلهم و السماح للمستلم فقط
        if (type !== 'admin_apply' && type !== 'complaint_staff') {
          await ch.permissionOverwrites.edit(SUPPORT_ROLE, { SendMessages: false }).catch(() => {});
        }
        await ch.permissionOverwrites.edit(interaction.user.id, { SendMessages: true }).catch(() => {});

        await ch.send(`سوف يتم التعامل معك من قبل الأداري ${interaction.member} اتفضل`);
        return interaction.reply({ content: '✅ تم استلام التذكرة', ephemeral: true });
      }

      // إغلاق
      if (customId === 'close_ticket') {
        // إخفاء القناة عن الجميع (يستطيع المدير فقط رؤيتها بعد الإغلاق)
        await ch.permissionOverwrites.set([
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: SUPPORT_ROLE, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: owner, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.guild.members.me.id, allow: [PermissionsBitField.Flags.ViewChannel] }
        ]).catch(() => {});

        // إرسال رسالة تحكم مع أزرار حذف/إعادة فتح
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('delete_ticket').setLabel('حذف التذكرة').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('reopen_ticket').setLabel('إعادة فتح').setStyle(ButtonStyle.Success)
        );
        await ch.send({ embeds: [new EmbedBuilder().setTitle('تحكم المسؤولين')], components: [row] }).catch(() => {});
        return interaction.reply({ content: '🔒 تم إغلاق التذكرة', ephemeral: true });
      }

      // إعادة فتح
      if (customId === 'reopen_ticket') {
        const ownerId = parsed.owner;
        const perms = [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: ownerId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];
        if (type !== 'admin_apply' && type !== 'complaint_staff') {
          perms.push({ id: SUPPORT_ROLE, allow: [PermissionsBitField.Flags.ViewChannel] });
        }
        await ch.permissionOverwrites.set(perms).catch(() => {});
        return interaction.reply({ content: '✅ تمت إعادة فتح التذكرة', ephemeral: true });
      }

      // حذف
      if (customId === 'delete_ticket') {
        await ch.delete().catch(() => {});
        return interaction.reply({ content: '🗑️ تم حذف القناة', ephemeral: true }).catch(() => {});
      }
    }
  } catch (e) {
    console.error('Interaction handler error:', e);
  }
});

// -------------------- حفظ نهائي قبل الخروج --------------------
process.on('SIGINT', () => {
  console.log('SIGINT received — saving data and exiting...');
  saveAll(); process.exit();
});
process.on('SIGTERM', () => {
  console.log('SIGTERM received — saving data and exiting...');
  saveAll(); process.exit();
});

// -------------------- تسجيل الدخول --------------------
client.login(TOKEN).catch(err => {
  console.error('Failed to login:', err);
  process.exit(1);
});
