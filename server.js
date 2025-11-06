// server.js
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionsBitField, ComponentType } = require('discord.js');
const express = require('express');
const fs = require('fs');

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('Missing DISCORD_TOKEN in env.');
  process.exit(1);
}

// ========== CONFIG - عدل القيم التالية حسب سيرفرك ==========
const OWNER_ID = '1177580652317646958';
const ADMIN_ROLE_ID = '1319525397397897226';
const SUPPORT_ROLE = '1268350577499443283';
const VERIFY_GIRLS_ROLE = '1407757087240359976'; // رتبة الموثقة (اللي تقدر تستلم تكت التوثيق)
const CANNOT_BUY_ROLE = '1272270004968099907'; // ممنوع من فتح تكت الشراء (غير موثقة للبنات)
const PAYMENT_TARGET_ID = '801738764077891594'; // المستلم النهائي للفلوس (ID)
const PROBOT_ID = '282859044593598464'; // ID البروبوت الذي يرسل تأكيد التحويل
// ---------------------------------------------------------

// Purchase definitions: amount user must send (with fee) and net amount received
const PURCHASE_ROLES = [
  { label: '! 𝗠𝟳 • 〢 𝗮𝗹𝗱𝗶𝘀𝘁𝗶𝗻𝗰𝘁𝗶𝘃𝗲  ❬✦❭', roleId: '1334249939680891013', amountGross: 3158, amountNet: 3000 },
  { label: '! 𝗠𝟳 • 〢 𝗢𝘃𝗲𝗿 𝗛𝗮𝘃𝗲𝗻 ❬✦❭', roleId: '1332483925712568390', amountGross: 7369, amountNet: 7000 },
  { label: '! 𝗠𝟳 • 〢 𝗠𝗮𝗷𝗲𝘀𝘁𝗶𝗰 ❬✦❭', roleId: '1332484125470490696', amountGross: 10527, amountNet: 10000 },
  { label: '! 𝗠𝟳 • 〢 𝗞𝗶𝗻𝗴  ❬✦❭ / ! 𝗠𝟳 • 〢 𝗣𝗿𝗶𝗻𝘀𝗲𝘀𝘀  ❬✦❭', roleId: '1328701861896650882/1332743680934543393', amountGross: 13685, amountNet: 13000, special: true },
  { label: '! 𝗠𝟳 • 〢 𝗖𝗿𝗮𝘇𝘆  ❬✦❭', roleId: '1323441766732402719', amountGross: 17895, amountNet: 17000 },
  { label: '! 𝗠𝟳 • 〢 𝗧𝗵𝗲 𝗟𝗲𝗴𝗲𝗻𝗱 ❬✦❭', roleId: '1338166493992718347', amountGross: 24211, amountNet: 23000 }
];

// storage for setup (panel channel, logs)
const STORAGE_FILE = './bot_setup.json';
let storage = {};
if (fs.existsSync(STORAGE_FILE)) {
  try { storage = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8')); } catch { storage = {}; }
}
function saveStorage() { fs.writeFileSync(STORAGE_FILE, JSON.stringify(storage, null, 2)); }

// express for uptime
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_, res) => res.send('Bot is running'));
app.listen(PORT, () => console.log(`Web server on port ${PORT}`));

// client
const client = new Client({
  intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent ],
  partials: [ Partials.Channel ]
});

// helpers
function canUseSlash(member) {
  if (!member) return false;
  if (String(member.id) === String(OWNER_ID)) return true;
  return member.roles.cache.has(ADMIN_ROLE_ID);
}
function parseTopic(topic = '') {
  const obj = {};
  if (!topic) return obj;
  topic.split(';').forEach(p => {
    const [k, ...rest] = p.split(':');
    if (!k) return;
    obj[k] = rest.join(':') || '';
  });
  return obj;
}
function ticketNameFor(type, username) {
  const u = username.replace(/\s+/g, '-').slice(0, 60);
  if (type === 'support') return `support-${u}`;
  if (type === 'buy') return `buy-${u}`;
  if (type === 'complaint_member') return `report-M-${u}`;
  if (type === 'complaint_staff') return `report-A-${u}`;
  if (type === 'verify') return `verify-${u}`;
  return `ticket-${u}`;
}

// prevent multiple open tickets per user per guild
const openTicketsByUser = new Map(); // key guildId:userId => channelId

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  // register slash commands (global)
  const commands = [
    {
      name: 'setup',
      description: 'إعداد بانل التذاكر واللوغز (منشئ/أدمن)',
      options: [
        { name: 'panel_channel', description: 'قناة بانل التذاكر', type: 7, required: true },
        { name: 'claim_log_channel', description: 'قناة لوق استلام التذاكر', type: 7, required: true },
        { name: 'purchase_log_channel', description: 'قناة لوق عمليات الشراء', type: 7, required: true }
      ]
    },
     {
      name: "setup-admin-apply",
      description: "إعداد بانل تقديم الإدارة",
      options: [
        { name: 'panel_channel', description: 'قناة بانل التقديم', type: 7, required: true },
        { name: 'answer_channel', description: 'قناة اجابات التقديم', type: 7, required: true },
      ]
    },
    {
      name: 'verifysetup',
      description: 'نشر بانل توثيق البنات في القناة المختارة',
      options: [{ name: 'channel', description: 'اختر القناة', type: 7, required: true }]
    },
    {
      name: 'reload-tickets',
      description: 'إعادة تحميل (تحديث) بانل التذاكر في نفس القناة',
      options: [{ name: 'channel', description: 'قناة البانل (اختياري)', type: 7, required: false }]
    }
  ];
  try { await client.application.commands.set(commands); } catch(e){ console.warn('cmd register failed', e); }
});

// interaction handler
client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (!canUseSlash(interaction.member)) return interaction.reply({ content: '❌ ليس لديك صلاحية استخدام هذه الأوامر.', ephemeral: true });

      // /setup
      if (interaction.commandName === 'setup') {
        const panel = interaction.options.getChannel('panel_channel');
        const claimLog = interaction.options.getChannel('claim_log_channel');
        const purchaseLog = interaction.options.getChannel('purchase_log_channel');
        if (!panel?.isTextBased() || !claimLog?.isTextBased() || !purchaseLog?.isTextBased())
          return interaction.reply({ content: 'اختر قنوات نصية صحيحة.', ephemeral: true });

        storage.panelChannel = panel.id;
        storage.claimLogChannel = claimLog.id;
        storage.purchaseLogChannel = purchaseLog.id;
        saveStorage();
        await interaction.reply({ content: 'تم حفظ إعدادات البانل واللوغ.', ephemeral: true });
        // send initial panel
        await sendTicketPanel(panel);
        return;
      }

      // /verifysetup
      if (interaction.commandName === 'verifysetup') {
        const ch = interaction.options.getChannel('channel');
        if (!ch?.isTextBased()) return interaction.reply({ content: 'اختر قناة نصية صالحة.', ephemeral: true });
        await sendVerifyPanel(ch);
        return interaction.reply({ content: 'تم نشر بانل التوثيق 🎀', ephemeral: true });
      }

      // /reload-tickets
      if (interaction.commandName === 'reload-tickets') {
        const ch = interaction.options.getChannel('channel') || (storage.panelChannel ? await client.channels.fetch(storage.panelChannel).catch(()=>null) : null);
        if (!ch?.isTextBased()) return interaction.reply({ content: 'لا يمكن الوصول لقناة البانل.', ephemeral: true });
        await sendTicketPanel(ch);
        return interaction.reply({ content: 'تم تحديث بانل التذاكر.', ephemeral: true });
      }
    }

    // select menu from panel
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_menu') {
      await interaction.deferReply({ ephemeral: true });
      const choice = interaction.values[0];
      const guild = interaction.guild;
      const member = interaction.member;
      const key = `${guild.id}:${member.user.id}`;
      if (openTicketsByUser.has(key)) return interaction.editReply({ content: 'عندك تكت مفتوح بالفعل! يرجى إغلاقه قبل فتح تكت جديد.', ephemeral: true });

      // reload option
      if (choice === 'reload_panel') {
        const ch = interaction.channel;
        await sendTicketPanel(ch);
        return interaction.editReply({ content: 'تم تحديث البانل هنا.', ephemeral: true });
      }

      // buy role
      if (choice === 'buy_role') {
        // check forbidden role
        if (member.roles.cache.has(CANNOT_BUY_ROLE) && !member.roles.cache.has(VERIFY_GIRLS_ROLE))
          return interaction.editReply({ content: '❌ غير مسموح لك فتح تذاكر الشراء.', ephemeral: true });

        const ticketName = ticketNameFor('buy', member.user.username);
        const overwrites = [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: member.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];
        const ticket = await guild.channels.create({
          name: ticketName,
          type: ChannelType.GuildText,
          parent: interaction.channel.parentId || undefined,
          permissionOverwrites: overwrites,
          topic: `ticket_type:buy;owner:${member.user.id}`
        });
        openTicketsByUser.set(key, ticket.id);

        // send select menu for purchase options
        const options = PURCHASE_ROLES.map((r, i) => ({ label: r.label.slice(0, 100), value: String(i) }));
        const menu = new StringSelectMenuBuilder().setCustomId(`buy_select|${member.user.id}`).setPlaceholder('اختر الرتبة').addOptions(options);
        await ticket.send({ content: `أهلا بك <@${member.user.id}>\nاختر الرتبة التي تريد شراؤها من الأسفل` , components: [new ActionRowBuilder().addComponents(menu)] });
        await interaction.editReply({ content: `✅ تم إنشاء تذكرتك: <#${ticket.id}>`, ephemeral: true });
        return;
      }

      // support, complaint_member, complaint_staff
      let addSupport = false;
      let topicType = choice;
      if (choice === 'support') addSupport = true;
      if (choice === 'complaint_member') addSupport = true;

      const ticketTypeName = choice; // will be used in topic
      const ticketName = ticketNameFor(choice, member.user.username);
      const overwrites = [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: member.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ];
      if (addSupport) overwrites.push({ id: SUPPORT_ROLE, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });

      const ticket = await guild.channels.create({
        name: ticketName,
        type: ChannelType.GuildText,
        parent: interaction.channel.parentId || undefined,
        permissionOverwrites: overwrites,
        topic: `ticket_type:${ticketTypeName};owner:${member.user.id}`
      });
      openTicketsByUser.set(key, ticket.id);

      // send message with claim & close buttons
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('إستلام').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق تذكرة').setStyle(ButtonStyle.Danger)
      );
      const mentionText = `<@${member.user.id}>${addSupport ? ` <@&${SUPPORT_ROLE}>` : ''}`;
      await ticket.send({ content: `أهلا بك <@${member.user.id}>\nسوف يتم التعامل معك قريباً\n${addSupport ? `<@&${SUPPORT_ROLE}>` : ''}`, components: [buttons] });
      await interaction.editReply({ content: `✅ تم إنشاء التذكرة: <#${ticket.id}>`, ephemeral: true });
      return;
    }

    // buy select menu inside ticket
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('buy_select|')) {
      await interaction.deferReply({ ephemeral: true });
      const ownerId = interaction.customId.split('|')[1];
      const idx = Number(interaction.values[0]);
      const purchase = PURCHASE_ROLES[idx];
      if (!purchase) return interaction.editReply({ content: 'خيار غير صالح.', ephemeral: true });

      const ch = interaction.channel;
      await ch.setTopic(`ticket_type:buy;owner:${ownerId};choice:${idx}`).catch(()=>{});
      const embed = new EmbedBuilder()
        .setTitle('شراء رتبة')
        .setDescription(`لقد اخترت: **${purchase.label}**\n\n**الرجاء تحويل \`${purchase.amountGross}\` إلى <@!${PAYMENT_TARGET_ID}>**\n(سيصل الصافي: ${purchase.amountNet})\n\n*انتظر رسالة تأكيد التحويل من البروبوت*`)
        .setColor(0xF57C00);
      await ch.send({ content: `<@${ownerId}>`, embeds: [embed] }).catch(()=>{});
      return interaction.editReply({ content: 'تم تسجيل اختيارك. قم بالتحويل وانتظر تأكيد بروبوت الدفع.', ephemeral: true });
    }

    // apply button -> open modal
    if (interaction.isButton() && interaction.customId?.startsWith('apply_open|')) {
      const answersChannelId = interaction.customId.split('|')[1];
      const modal = new ModalBuilder().setCustomId(`apply_modal|${answersChannelId}`).setTitle('نموذج تقديم إدارة');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q1').setLabel('1 - أسمك؟').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q2').setLabel('2 - عمرك؟').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q3').setLabel('3 - خبراتك (بالتفصيل)').setStyle(TextInputStyle.Paragraph).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q4').setLabel('4 - كم لك فالديسكورد').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q5').setLabel('5 - تستعمل شعارنا؟ (اجباري)').setStyle(TextInputStyle.Short).setRequired(true))
      );
      return interaction.showModal(modal);
    }

    // modal submit
    if (interaction.isModalSubmit() && interaction.customId?.startsWith('apply_modal|')) {
      await interaction.deferReply({ ephemeral: true }).catch(()=>{});
      const answersChannelId = interaction.customId.split('|')[1];
      const ch = await client.channels.fetch(answersChannelId).catch(()=>null);
      const ans1 = interaction.fields.getTextInputValue('q1');
      const ans2 = interaction.fields.getTextInputValue('q2');
      const ans3 = interaction.fields.getTextInputValue('q3');
      const ans4 = interaction.fields.getTextInputValue('q4');
      const ans5 = interaction.fields.getTextInputValue('q5');
      const embed = new EmbedBuilder()
        .setTitle(`تقديم الادارة - ${interaction.user.username}`)
        .addFields(
          { name: 'الاسم', value: ans1, inline: true },
          { name: 'العمر', value: ans2, inline: true },
          { name: 'كم لك في الديسكورد', value: ans4, inline: true },
          { name: 'تستعمل شعارنا؟', value: ans5, inline: true },
          { name: 'خبراتك (بالتفصيل)', value: ans3 }
        )
        .setThumbnail(interaction.user.displayAvatarURL({ extension: 'png' }))
        .setColor(0xC62828)
        .setFooter({ text: `المتقدم: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ extension: 'png' }) });
      if (ch?.isTextBased()) await ch.send({ content: `<@&${SUPPORT_ROLE}> ${interaction.user}`, embeds: [embed] }).catch(()=>{});
      return interaction.editReply({ content: 'تم إرسال نموذجك. شكراً لتقديمك!', ephemeral: true });
    }

    // buttons handling (claim/close/reopen/delete) - generic
    if (interaction.isButton()) {
      const cid = interaction.customId;
      const ch = interaction.channel;
      if (!ch?.topic) return interaction.reply({ content: 'هذا الإجراء غير متاح هنا.', ephemeral: true });
      const topic = parseTopic(ch.topic);
      const type = topic['ticket_type'];
      const owner = topic['owner'];

      // claim_ticket
      if (cid === 'claim_ticket') {
        // special: if ticket_type === 'verify' only VERIFY_GIRLS_ROLE can claim
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        const isSupport = interaction.member.roles.cache.has(SUPPORT_ROLE);
        const isVerify = interaction.member.roles.cache.has(VERIFY_GIRLS_ROLE);
        if (type === 'complaint_staff') {
          if (!isAdmin) return interaction.reply({ content: '❌ هذه التذكرة مخصصة للأدمن فقط.', ephemeral: true });
        } else if (type === 'verify') {
          if (!isVerify) return interaction.reply({ content: '❌ لا يمكنك استلام هذه التذكرة.', ephemeral: true });
        } else {
          if (!isSupport && !isAdmin) return interaction.reply({ content: '❌ لا يمكنك استلام هذه التذكرة.', ephemeral: true });
        }
        if (topic['claimer']) return interaction.reply({ content: `تم استلام هذه التذكرة مسبقاً من قبل <@${topic['claimer']}>`, ephemeral: true });

        await ch.setTopic(ch.topic + `;claimer:${interaction.user.id}`).catch(()=>{});
        if (type !== 'buy') {
          await ch.permissionOverwrites.edit(SUPPORT_ROLE, { SendMessages: false }).catch(()=>{});
        }
        await ch.permissionOverwrites.edit(interaction.user.id, { SendMessages: true }).catch(()=>{});
        await ch.send({ content: `سوف يتم التعامل معك من قبل ${interaction.member}`, allowedMentions: { users: [], roles: [] } }).catch(()=>{});

        // log: different wording for verify
        const claimLogId = storage.claimLogChannel;
        if (claimLogId) {
          const logCh = await client.channels.fetch(claimLogId).catch(()=>null);
          if (logCh?.isTextBased()) {
            if (type === 'verify') {
              const embed = new EmbedBuilder()
                .setTitle('تسليم تذكرة توثيق')
                .setDescription(`لقد استلمت الموثقة **${interaction.user.tag}** تذكرة **${ch.name}** الخاصة بـ <@${owner}>\nنوع التذكرة : التوثيق 🎀`)
                .setThumbnail(interaction.user.displayAvatarURL({ extension: 'png' }))
                .setColor(0xE91E63);
              await logCh.send({ embeds: [embed] }).catch(()=>{});
            } else {
              const embed = new EmbedBuilder()
                .setTitle('تسليم تذكرة')
                .setDescription(`لقد استلم المسؤول **${interaction.user.tag}** تذكرة **${ch.name}** الخاصة بـ <@${owner}>\nنوع التذكرة : ${type === 'support' ? 'الدعم الفني' : type === 'buy' ? 'شراء رتبة' : (type === 'complaint_member' ? 'شكوى على عضو' : 'شكوى على إداري')}`)
                .setThumbnail(interaction.user.displayAvatarURL({ extension: 'png' }))
                .setColor(0x29B6F6);
              await logCh.send({ embeds: [embed] }).catch(()=>{});
            }
          }
        }

        return interaction.reply({ content: '✅ تم استلام التذكرة', ephemeral: true });
      }

      // close_ticket
      if (cid === 'close_ticket') {
        // hide channel from everyone except bot & admins
        await ch.permissionOverwrites.set([
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.guild.members.me.id, allow: [PermissionsBitField.Flags.ViewChannel] }
        ]).catch(()=>{});
        // remove from open map
        const key = `${interaction.guild.id}:${owner}`;
        if (openTicketsByUser.has(key)) openTicketsByUser.delete(key);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('delete_ticket').setLabel('حذف التذكرة').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('reopen_ticket').setLabel('إعادة فتح').setStyle(ButtonStyle.Success)
        );
        await ch.send({ embeds: [new EmbedBuilder().setTitle('تحكم المسؤولين')], components: [row] }).catch(()=>{});
        return interaction.reply({ content: '🔒 تم إغلاق التذكرة', ephemeral: true });
      }

      // reopen_ticket
      if (cid === 'reopen_ticket') {
        const ownerId = topic['owner'];
        const perms = [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: ownerId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];
        if (type === 'support' || type === 'complaint_member' || type === 'verify') {
          perms.push({ id: SUPPORT_ROLE, allow: [PermissionsBitField.Flags.ViewChannel] });
        }
        await ch.permissionOverwrites.set(perms).catch(()=>{});
        // re-register open
        const key = `${interaction.guild.id}:${ownerId}`;
        openTicketsByUser.set(key, ch.id);
        return interaction.reply({ content: '✅ تمت إعادة فتح التذكرة', ephemeral: true });
      }

      // delete_ticket
      if (cid === 'delete_ticket') {
        const ownerId = parseTopic(ch.topic || '').owner;
        const key = `${interaction.guild.id}:${ownerId}`;
        if (openTicketsByUser.has(key)) openTicketsByUser.delete(key);
        await ch.delete().catch(()=>{});
        return interaction.reply({ content: '🗑️ تم حذف التذكرة', ephemeral: true });
      }
    }
  } catch (err) {
    console.error('Interaction error:', err);
    try { if (interaction.deferred || interaction.replied) await interaction.editReply({ content: 'حدث خطأ داخلي.', ephemeral: true }); else await interaction.reply({ content: 'حدث خطأ.', ephemeral: true }); } catch {}
  }
});

// message monitor - only to watch ProBot payment messages
client.on('messageCreate', async message => {
  try {
    // ignore bots except PROBOT
    if (String(message.author.id) !== PROBOT_ID) return;

    // the exact format is:
    // **ـ user, قام بتحويل `amount` لـ <@!801738764077891594> ** |:moneybag:
    const content = message.content;
    // build regex matching Arabic dash marker 'ـ' plus pattern
    // capture username (any chars except comma), amount (digits), target mention (<@!id> or <@id>)
    const regex = /\*\*ـ\s*(.+?),\s*قام بتحويل\s*`(\d+)`\s*لـ\?\s*/; // fallback (won't match) - keep safe
    // We'll use a stricter pattern for the real message:
    const strictRegex = /\*\*ـ\s*(.+?),\s*قام\s*بتحويل\s*`?\$?(\d+)`?\s*لـ\s*<@!?(?:\s*)?(\d+)>?\s*\*\*\s*\|\:moneybag:/;

    // try strict
    let m = content.match(strictRegex);
    if (!m) {
      // sometimes spaces or punctuation differ, attempt alternative that tolerates minor spacing but requires PAYMENT_TARGET_ID
      const altRegex = new RegExp(`\\*\\*ـ\\s*(.+?),\\s*قام\\s*بتحويل\\s*\`?(\\d+)\`?\\s*لـ\\s*<@!?(?:${PAYMENT_TARGET_ID})>\\s*\\*\\*\\s*\\|:moneybag:`);
      m = content.match(altRegex);
    }
    if (!m) return;

    // m groups: [full, senderName, amount, targetId(optional depending regex)]
    const senderName = m[1]?.trim();
    const amountStr = m[2]?.trim();
    const amountNum = Number(amountStr);
    // check target mention contains PAYMENT_TARGET_ID
    if (!content.includes(`<@!${PAYMENT_TARGET_ID}>`) && !content.includes(`<@${PAYMENT_TARGET_ID}>`)) return;

    // Now find which guild & channel this message belongs to and if there's a buy ticket expecting it
    const channel = message.channel;
    if (!channel) return;
    // check channel topic for buy ticket owner
    const topic = channel.topic || '';
    if (!topic.includes('ticket_type:buy') || !topic.includes('owner:')) return;
    const parsed = parseTopic(topic);
    const ownerId = parsed.owner;
    const choiceIdx = parsed.choice ? Number(parsed.choice) : (parsed.choice === '' ? NaN : Number(parsed.choice));
    // in some cases choice might be missing if user didn't choose; try to find by channel name
    let choiceIndex = Number.isNaN(choiceIdx) ? null : choiceIdx;
    if (choiceIndex === null || Number.isNaN(choiceIndex)) {
      // attempt parsing from channel name (buy-<username>) - can't get index reliably
      // ignore if no stored choice
      return;
    }
    const purchase = PURCHASE_ROLES[choiceIndex];
    if (!purchase) return;

    // verify that payer is the same as the buyer (ownerId)
    // ProBot message includes senderName, but not mention id; we must rely on message.mentions to find payer id
    // get first mentioned user that's not PAYMENT_TARGET_ID (if any)
    let payerId = null;
    if (message.mentions && message.mentions.users) {
      for (const [id] of message.mentions.users) {
        if (String(id) !== String(PAYMENT_TARGET_ID)) { payerId = id; break; }
      }
    }
    // fallback: if no mention found, but the message was sent in the ticket channel and the ticket owner is ownerId, assume payer is ownerId
    if (!payerId) payerId = ownerId;

    if (String(payerId) !== String(ownerId)) {
      // payer not owner -> ignore
      return;
    }

    // check amount matches net amount
    if (Number(purchase.amountNet) !== Number(amountNum)) {
      // mismatch - ignore and optionally notify inside ticket? user asked to be silent - so do nothing
      // But we can send a small ephemeral (silent) log in purchase log channel if configured (optional)
      const purchaseLog = storage.purchaseLogChannel;
      if (purchaseLog) {
        const logCh = await client.channels.fetch(purchaseLog).catch(()=>null);
        if (logCh?.isTextBased()) {
          const em = new EmbedBuilder()
            .setTitle('تحويل خاطئ مرصود')
            .setDescription(`تم رصد تحويل بمبلغ ${amountNum} في قناة <#${channel.id}> لكنه لا يطابق المبلغ الصافي المطلوب ${purchase.amountNet}.\nالمستخدم: <@${ownerId}>\nالرتبة: ${purchase.label}`)
            .setColor(0xFFA000)
            .setTimestamp();
          await logCh.send({ embeds: [em] }).catch(()=>{});
        }
      }
      return;
    }

    // All checks passed -> grant role
    const guild = channel.guild;
    const member = await guild.members.fetch(ownerId).catch(()=>null);
    if (!member) return;
    let giveRoleId = purchase.roleId;
    if (purchase.special) {
      // choose between two role ids split by '/'
      const parts = String(purchase.roleId).split('/');
      if (member.roles.cache.has('1269801178146017370')) giveRoleId = parts[0];
      else if (member.roles.cache.has('1272361216840302592')) giveRoleId = parts[1];
      else giveRoleId = parts[0];
    }
    giveRoleId = String(giveRoleId).split('/')[0];

    // do not give if already has
    if (!member.roles.cache.has(giveRoleId)) {
      await member.roles.add(giveRoleId).catch(()=>{});
    }

    // DM the member
    try {
      await member.send(`تم إضافة رتبة **${purchase.label}** الى قائمة رتبك بنجاح ✅\nشكرًا لدعمك مجتمع Md7 Community 💫`).catch(()=>{});
    } catch {}

    // send purchase log embed
    const purchaseLog = storage.purchaseLogChannel;
    if (purchaseLog) {
      const logCh = await client.channels.fetch(purchaseLog).catch(()=>null);
      if (logCh?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle('عملية شراء رتبة')
          .setDescription(`لقد قام العضو <@${ownerId}> بشراء رتبة **${purchase.label}** التي تبلغ قيمتها **${purchase.amountNet}** صافي.`)
          .setThumbnail(member.user.displayAvatarURL({ extension: 'png' }))
          .setColor(0x4CAF50)
          .setTimestamp();
        await logCh.send({ embeds: [embed] }).catch(()=>{});
      }
    }

    // close ticket silently after short delay (as requested: silent)
    setTimeout(async () => {
      // attempt to delete channel or hide it
      try {
        // remove open map
        const key = `${guild.id}:${ownerId}`;
        if (openTicketsByUser.has(key)) openTicketsByUser.delete(key);
        // hide channel then delete after small delay
        await channel.permissionOverwrites.set([
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
        ]).catch(()=>{});
        setTimeout(()=>{ channel.delete().catch(()=>{}); }, 3000);
      } catch {}
    }, 2000);

  } catch (e) {
    console.error('Payment monitor error:', e);
  }
});

// helper to send main ticket panel
async function sendTicketPanel(channel) {
  const embed = new EmbedBuilder()
    .setTitle('𝐌𝐝𝟕 𝐂𝐨𝐦𝐦𝐮𝐧𝐢𝐭𝐲 𝐒𝐮𝐩𝐩𝐨𝐫𝐭')
    .setDescription([
      '**الـقـوانـيـن**',
      '',
      'مـمـنوع تـزعـج الاداره بالمنشنات',
      '',
      'مـمـنوع تــفــتــح  تـكـت بـدون سبـب',
      '',
      'مـمـنوع تـسـتهـبل بالـتكـت',
      '',
      'ملاحظه : أي مخالفه لهذي القواعد ممكن توصل فيك للباند النهائي من السيرفر!!'
    ].join('\n'))
    .setColor(0xC62828);

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_menu')
    .setPlaceholder('اختَر نوع التذكرة من هنا')
    .addOptions(
      { label: 'الدعم الفني 🛠️', value: 'support' },
      { label: 'شراء رتبة 💵', value: 'buy_role' },
      { label: 'شكوى على عضو ☢️', value: 'complaint_member' },
      { label: 'شكوى على إداري ☣️', value: 'complaint_staff' },
      { label: 'إعادة تحميل 🔄️', value: 'reload_panel' }
    );

  await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] }).catch(()=>{});
  // store panel channel
  storage.panelChannel = channel.id;
  saveStorage();
}

// helper to send verify panel
async function sendVerifyPanel(channel) {
  const embed = new EmbedBuilder()
    .setTitle('🎀 توثيق البنات')
    .setDescription('لفتح تذكرة التوثيق يرجى النقر على الزر فالأسفل\n\nملاحظه : لا يمكنك شراء اي رتبة شرائية حتى تتوثقي')
    .setColor(0xE91E63);
  const btn = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`verify_panel_open|${channel.id}`).setLabel('فتح تذكرة').setStyle(ButtonStyle.Primary)
  );
  await channel.send({ embeds: [embed], components: [btn] }).catch(()=>{});
}
// =============== نظام تقديم الإدارة ===============

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'setup-admin-apply') return;

  // التحقق من الصلاحيات (المنشئ أو الرتب العليا فقط)
  if (interaction.user.id !== ownerId && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: '❌ لا تملك صلاحية استخدام هذا الأمر.', ephemeral: true });
  }

  const panelChannel = interaction.options.getChannel('panel_channel');
  const answersChannel = interaction.options.getChannel('answers_channel');

  if (!panelChannel || !answersChannel) {
    return interaction.reply({ content: '❌ يرجى اختيار روم البانل وروم استقبال الإجابات.', ephemeral: true });
  }

  const config = { panelChannel: panelChannel.id, answersChannel: answersChannel.id };
  fs.writeFileSync(applyConfigPath, JSON.stringify(config, null, 2));

  // إرسال بانل التقديم
  const embed = new EmbedBuilder()
    .setTitle('📋 تقديم الإدارة')
    .setDescription('للتقديم على طاقم الإدارة في مجتمعنا، اضغط الزر بالأسفل وأجب عن الأسئلة المطلوبة.')
    .setColor(0x2b2d31);

  const button = new ButtonBuilder()
    .setCustomId('apply_admin')
    .setLabel('تقديم الإدارة')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(button);
  await panelChannel.send({ embeds: [embed], components: [row] });

  await interaction.reply({
    content: `✅ تم إرسال بانل التقديم في ${panelChannel}`,
    ephemeral: true
  });
});

// ===== نظام الأسئلة والرد =====
client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton() && interaction.customId === 'apply_admin') {
    const modal = new ModalBuilder()
      .setCustomId('admin_apply_modal')
      .setTitle('📝 نموذج تقديم الإدارة');

    const q1 = new TextInputBuilder()
      .setCustomId('q1')
      .setLabel('1- اسمك الحقيقي؟')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const q2 = new TextInputBuilder()
      .setCustomId('q2')
      .setLabel('2- كم عمرك؟')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const q3 = new TextInputBuilder()
      .setCustomId('q3')
      .setLabel('3- كم لديك خبرة في الإدارة؟')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const q4 = new TextInputBuilder()
      .setCustomId('q4')
      .setLabel('4- هل سبق أن كنت إدارياً في سيرفر آخر؟')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const q5 = new TextInputBuilder()
      .setCustomId('q5')
      .setLabel('5- لماذا ترغب بالانضمام إلى طاقم الإدارة؟')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const rows = [q1, q2, q3, q4, q5].map(q => new ActionRowBuilder().addComponents(q));
    modal.addComponents(...rows);

    await interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'admin_apply_modal') {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const answers = {
      name: interaction.fields.getTextInputValue('q1'),
      age: interaction.fields.getTextInputValue('q2'),
      exp: interaction.fields.getTextInputValue('q3'),
      adminBefore: interaction.fields.getTextInputValue('q4'),
      reason: interaction.fields.getTextInputValue('q5')
    };

    // قراءة إعداد الروم
    const config = JSON.parse(fs.readFileSync(applyConfigPath, 'utf8'));
    const answersChannel = interaction.guild.channels.cache.get(config.answersChannel);

    // إنشاء الإمبيد للإجابات
    const embed = new EmbedBuilder()
      .setTitle('📩 تقديم جديد للإدارة')
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .setColor(0x5865f2)
      .setDescription(
        `👤 **العضو:** ${interaction.user}\n\n` +
        `**1- اسمك؟**\n${answers.name}\n\n` +
        `**2- عمرك؟**\n${answers.age}\n\n` +
        `**3- خبرتك الإدارية؟**\n${answers.exp}\n\n` +
        `**4- هل كنت إدارياً من قبل؟**\n${answers.adminBefore}\n\n` +
        `**5- سبب رغبتك بالانضمام:**\n${answers.reason}`
      )
      .setTimestamp();

    // إرسال الإمبيد في الروم المحدد
    if (answersChannel) {
      await answersChannel.send({ embeds: [embed] }).catch(() => {});
    }

    // إرسال رسالة الشكر
    try {
      await interaction.user.send('لقد تم إرسال إجاباتك بنجاح ✅\nيرجى انتظار الرد.\nشكرًا لاختيارك **Md7 Community** ❤️');
    } catch {
      await interaction.followUp({
        content: 'لقد تم إرسال إجاباتك بنجاح ✅\nيرجى انتظار الرد.\nشكرًا لاختيارك **Md7 Community** ❤️',
        ephemeral: true
      });
    }
  }
});

// ===== تسجيل أمر السلاش (مرة واحدة فقط) =====
client.once('ready', async () => {
  const data = new SlashCommandBuilder()
    .setName('setup-admin-apply')
    .setDescription('إعداد بانل تقديم الإدارة')
    .addChannelOption(opt => opt.setName('panel_channel').setDescription('الروم الذي يُرسل فيه بانل التقديم').setRequired(true))
    .addChannelOption(opt => opt.setName('answers_channel').setDescription('الروم الذي تُرسل فيه الإجابات').setRequired(true));

  await client.application.commands.create(data);
  console.log('✅ أمر /setup-admin-apply تم تسجيله بنجاح');
});


client.login(TOKEN).catch(err => {
  console.error('Failed to login :', err);
  process.exit(1);
});
