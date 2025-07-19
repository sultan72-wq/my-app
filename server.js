const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const express = require('express');
const fs = require('fs');

const app = express();
app.get('/', (_, res) => res.send('Bot is running'));
app.listen(3000, () => console.log('Web server ready'));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel]
});

const TOKEN = process.env.TOKEN;
const SUPPORT_ROLE = '1268350577499443283';
const TICKET_CHANNEL = '1226489036105973780';
const ADMIN = PermissionsBitField.Flags.Administrator;

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// ✅ ردود تلقائية
client.on('messageCreate', async msg => {
  if (msg.author.bot) return;

  const content = msg.content.toLowerCase();
  const member = msg.member;

  const replies = {
    "السلام عليكم": "وعليكم السلام ورحمة الله وبركاته منور/ه ❤️",
    "السلام عليكم ورحمة الله": "وعليكم السلام ورحمة الله وبركاته منور/ه ❤️",
    "السلام عليكم ورحمة الله وبركاته": "وعليكم السلام ورحمة الله وبركاته منور/ه ❤️",
    "سلام عليكم": "وعليكم السلام ورحمة الله وبركاته منور/ه ❤️",
    "سلام عليكم ورحمة الله": "وعليكم السلام ورحمة الله وبركاته منور/ه ❤️",
    "سلام عليكم ورحمة الله وبركاته": "وعليكم السلام ورحمة الله وبركاته منور/ه ❤️",
    "باك": "ولكم منور/ه ❤️",
    "شعار": member.roles.cache.has(SUPPORT_ROLE) ? "! 𝙈𝟳 I" : null,
    "-": member.roles.cache.has(SUPPORT_ROLE) ? `كان معك الاداري ${msg.author} لا تنسى تقييمك في https://discord.com/channels/1225825173358379131/1367573165898862602` : null,
    "تحويل": member.permissions.has(ADMIN) ? "التحويل الى Md7 فقط" : null
  };

  if (replies[content]) msg.reply(replies[content]);
});

// ✅ نظام التذاكر
let ticketCount = 1;

client.on('interactionCreate', async i => {
  if (!i.isButton()) return;
  const ch = i.channel;
  const m = i.member;

  if (i.customId === 'create_ticket') {
    const cat = ch.parent;
    const tick = await i.guild.channels.create({
      name: `ticket-${ticketCount++}`,
      type: 0,
      parent: cat.id,
      permissionOverwrites: [
        { id: i.guild.id, deny: ['ViewChannel'] },
        { id: m.id, allow: ['ViewChannel', 'SendMessages'] },
        { id: SUPPORT_ROLE, allow: ['ViewChannel'] }
      ]
    });

    await tick.send({
      content: `أهلا بك <@${m.id}>\nسوف يتم التعامل معك من قبل فريق الدعم قريبا\n<@&${SUPPORT_ROLE}>`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق تذكرة').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('إستلام').setStyle(ButtonStyle.Primary)
      )]
    });

    await i.reply({ content: `تم إنشاء التذكرة: <#${tick.id}>`, ephemeral: true });
  }

  else if (i.customId === 'claim_ticket') {
    if (!m.roles.cache.has(SUPPORT_ROLE)) {
      return i.reply({ content: "❌ لا يمكنك استلام التذكرة", ephemeral: true });
    }

    const claimed = ch.topic;
    if (claimed) {
      return i.reply({ content: `تم استلام هذه التذكرة بالفعل من قبل <@${claimed}>`, ephemeral: true });
    }

    await ch.setTopic(m.id);
    await ch.permissionOverwrites.edit(SUPPORT_ROLE, { SendMessages: false });
    await ch.permissionOverwrites.edit(m.id, { SendMessages: true });
    await ch.send(`سوف يتم التعامل معك من قبل الأداري ${m} اتفضل`);
    await i.reply({ content: "تم استلام التذكرة ✅", ephemeral: true });
  }

  else if (i.customId === 'close_ticket') {
    await ch.permissionOverwrites.set([
      { id: i.guild.id, deny: ['ViewChannel'] },
      { id: SUPPORT_ROLE, deny: ['ViewChannel'] },
      { id: ch.topic || i.user.id, deny: ['ViewChannel'] },
      { id: i.guild.members.me.id, allow: ['ViewChannel'] }
    ]);

    await ch.send({
      embeds: [new EmbedBuilder().setTitle("تحكم المسؤولين")],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('delete_ticket').setLabel('حذف التذكرة').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('reopen_ticket').setLabel('إعادة فتح').setStyle(ButtonStyle.Success)
      )]
    });
  }

  else if (i.customId === 'reopen_ticket') {
    const ownerId = ch.topic;
    await ch.permissionOverwrites.set([
      { id: i.guild.id, deny: ['ViewChannel'] },
      { id: SUPPORT_ROLE, allow: ['ViewChannel'] },
      { id: ownerId, allow: ['ViewChannel', 'SendMessages'] }
    ]);
    await i.reply("✅ تمت إعادة فتح التذكرة");
  }

  else if (i.customId === 'delete_ticket') {
    await ch.delete();
  }
});

client.on('ready', () => {
  const ch = client.channels.cache.get(TICKET_CHANNEL);
  if (!ch) return;
  ch.send({
    embeds: [new EmbedBuilder().setDescription("**لأنشاء تذكره يرجى النقر على الزر في الأسفل**")],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('create_ticket').setLabel('إنشاء تذكرة').setStyle(ButtonStyle.Primary)
    )]
  });
});

client.login(TOKEN);
