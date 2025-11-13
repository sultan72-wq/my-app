// server.js
require('dotenv').config();
const fs = require('fs');
const express = require('express');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionsBitField,
  ComponentType,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('Missing DISCORD_TOKEN in env.');
  process.exit(1);
}

// ========== CONFIG - عدل القيم التالية حسب سيرفرك ==========
const OWNER_ID = '1177580652317646958';
const ADMIN_ROLE_ID = '1319525397397897226';
const SUPPORT_ROLE = '1268350577499443283';
const VERIFY_GIRLS_ROLE = '1407757087240359976';
const CANNOT_BUY_ROLE = '1272270004968099907';
const PAYMENT_TARGET_ID = '801738764077891594';
const PROBOT_ID = '282859044593598464';
// ---------------------------------------------------------

// Purchase definitions
const PURCHASE_ROLES = [
  { label: '! 𝗠𝟳 • 〢 𝗮𝗹𝗱𝗶𝘀𝘁𝗶𝗻𝗰𝘁𝗶𝘃𝗲  ❬✦❭', roleId: '1334249939680891013', amountGross: 12632, amountNet: 12000 },
  { label: '! 𝗠𝟳 • 〢 𝗢𝘃𝗲𝗿 𝗛𝗮𝘃𝗲𝗻 ❬✦❭', roleId: '1332483925712568390', amountGross: 30527, amountNet: 29000 },
  { label: '! 𝗠𝟳 • 〢 𝗠𝗮𝗷𝗲𝘀𝘁𝗶𝗰 ❬✦❭', roleId: '1332484125470490696', amountGross: 48422, amountNet: 46000 },
  { label: '! 𝗠𝟳 • 〢 𝗞𝗶𝗻𝗴  ❬✦❭ / ! 𝗠𝟳 • 〢 𝗣𝗿𝗶𝗻𝘀𝗲𝘀𝘀  ❬✦❭', roleId: '1328701861896650882/1332743680934543393', amountGross: 66316, amountNet: 63000, special: true },
  { label: '! 𝗠𝟳 • 〢 𝗖𝗿𝗮𝘇𝘆  ❬✦❭', roleId: '1323441766732402719', amountGross: 89474, amountNet: 85000 },
  { label: '! 𝗠𝟳 • 〢 𝗧𝗵𝗲 𝗟𝗲𝗴𝗲𝗻𝗱 ❬✦❭', roleId: '1338166493992718347', amountGross: 126316, amountNet: 120000 }
];

// storage file paths
const STORAGE_FILE = path.join(__dirname, 'bot_setup.json');
const applyConfigPath = path.join(__dirname, 'apply_config.json');

let storage = {};
if (fs.existsSync(STORAGE_FILE)) {
  try { storage = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8')); } catch { storage = {}; }
}
function saveStorage() { fs.writeFileSync(STORAGE_FILE, JSON.stringify(storage, null, 2)); }

// ensure apply config exists
if (!fs.existsSync(applyConfigPath)) {
  fs.writeFileSync(applyConfigPath, JSON.stringify({ panelChannel: null, answersChannel: null }, null, 2));
}

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
  return member.roles?.cache?.has(ADMIN_ROLE_ID);
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

// register the main slash commands (setup & verify & reload) once ready
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('setup')
      .setDescription('إعداد بانل التذاكر واللوغز (منشئ/أدمن)')
      .addChannelOption(opt => opt.setName('panel_channel').setDescription('قناة بانل التذاكر').setRequired(true))
      .addChannelOption(opt => opt.setName('claim_log_channel').setDescription('قناة لوق استلام التذاكر').setRequired(true))
      .addChannelOption(opt => opt.setName('purchase_log_channel').setDescription('قناة لوق عمليات الشراء').setRequired(true)),
    new SlashCommandBuilder()
      .setName('verifysetup')
      .setDescription('نشر بانل توثيق البنات في القناة المختارة')
      .addChannelOption(opt => opt.setName('channel').setDescription('اختر القناة').setRequired(true)),
    new SlashCommandBuilder()
      .setName('reload-tickets')
      .setDescription('إعادة تحميل (تحديث) بانل التذاكر في نفس القناة')
      .addChannelOption(opt => opt.setName('channel').setDescription('قناة البانل (اختياري)').setRequired(false)),
    // admin apply registration done separately below to avoid duplicates
  ];

  try {
    await client.application.commands.set(commands);
    console.log('Main commands registered.');
  } catch (e) {
    console.warn('cmd register failed', e);
  }

  // register setup-admin-apply if not present
  try {
    const data = new SlashCommandBuilder()
      .setName('setup-admin-apply')
      .setDescription('إعداد بانل تقديم الإدارة')
      .addChannelOption(opt => opt.setName('panel_channel').setDescription('الروم الذي يُرسل فيه بانل التقديم').setRequired(true))
      .addChannelOption(opt => opt.setName('answers_channel').setDescription('الروم الذي تُرسل فيه الإجابات').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
    await client.application.commands.create(data);
    console.log('✅ أمر /setup-admin-apply تم تسجيله بنجاح');
  } catch (e) {
    // may already exist - ignore
    // console.warn('setup-admin-apply create failed', e);
  }
});

// single unified interactionCreate handler
client.on('interactionCreate', async interaction => {
  try {
    // ---------------- chat input commands ----------------
    if (interaction.isChatInputCommand()) {
      // permission check for setup-like commands
      if (!canUseSlash(interaction.member) && interaction.commandName !== 'setup-admin-apply' && interaction.commandName !== 'verifysetup') {
        // allow owner explicitly
        if (interaction.commandName !== 'setup-admin-apply') {
          return interaction.reply({ content: '❌ ليس لديك صلاحية استخدام هذه الأوامر.', ephemeral: true });
        }
      }

      // /setup
      if (interaction.commandName === 'setup') {
        if (!canUseSlash(interaction.member)) return interaction.reply({ content: '❌ ليس لديك صلاحية استخدام هذه الأوامر.', ephemeral: true });

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

      // setup-admin-apply (create panel + save config)
      if (interaction.commandName === 'setup-admin-apply') {
        // only owner or admins allowed
        if (String(interaction.user.id) !== String(OWNER_ID) && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          return interaction.reply({ content: '❌ لا تملك صلاحية استخدام هذا الأمر.', ephemeral: true });
        }

        const panelChannel = interaction.options.getChannel('panel_channel');
        const answersChannel = interaction.options.getChannel('answers_channel');

        if (!panelChannel || !answersChannel || !panelChannel.isTextBased() || !answersChannel.isTextBased()) {
          return interaction.reply({ content: '❌ يرجى اختيار روم البانل وروم استقبال الإجابات (قنوات نصية).', ephemeral: true });
        }

        const config = { panelChannel: panelChannel.id, answersChannel: answersChannel.id };
        fs.writeFileSync(applyConfigPath, JSON.stringify(config, null, 2));

        // send panel embed + button
        const embed = new EmbedBuilder()
          .setTitle('📋 تقديم الإدارة')
          .setDescription('للتقديم على طاقم الإدارة في مجتمعنا، اضغط الزر بالأسفل وأجب عن الأسئلة المطلوبة.')
          .setColor(0x2b2d31);

        const button = new ButtonBuilder()
          .setCustomId('apply_admin')
          .setLabel('تقديم الإدارة')
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);
        await panelChannel.send({ embeds: [embed], components: [row] }).catch(()=>{});

        await interaction.reply({
          content: `✅ تم إرسال بانل التقديم في ${panelChannel}`,
          ephemeral: true
        });
        return;
      }
    }

    // ---------------- component interactions ----------------
    // ticket menu select from panel
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_menu') {
      await interaction.deferReply({ ephemeral: true }).catch(()=>{});
      const choice = interaction.values[0];
      const guild = interaction.guild;
      const member = interaction.member;
      const key = `${guild.id}:${member.user.id}`;
      if (openTicketsByUser.has(key)) return interaction.editReply({ content: 'عندك تكت مفتوح بالفعل! يرجى إغلاقه قبل فتح تكت جديد.', ephemeral: true });

      if (choice === 'reload_panel') {
        const ch = interaction.channel;
        await sendTicketPanel(ch);
        return interaction.editReply({ content: 'تم تحديث البانل هنا.', ephemeral: true });
      }

      if (choice === 'buy_role') {
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

        const options = PURCHASE_ROLES.map((r, i) => ({ label: r.label.slice(0, 100), value: String(i) }));
        const menu = new StringSelectMenuBuilder().setCustomId(`buy_select|${member.user.id}`).setPlaceholder('اختر الرتبة').addOptions(options);
        await ticket.send({ content: `أهلا بك <@${member.user.id}>\nاختر الرتبة التي تريد شراؤها من الأسفل` , components: [new ActionRowBuilder().addComponents(menu)] }).catch(()=>{});
        await interaction.editReply({ content: `✅ تم إنشاء تذكرتك: <#${ticket.id}>`, ephemeral: true });
        return;
      }

      // support / complaints
      let addSupport = false;
      if (choice === 'support' || choice === 'complaint_member') addSupport = true;

      const ticketTypeName = choice;
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

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('إستلام').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق تذكرة').setStyle(ButtonStyle.Danger)
      );
      await ticket.send({ content: `أهلا بك <@${member.user.id}>\nسوف يتم التعامل معك قريباً\n${addSupport ? `<@&${SUPPORT_ROLE}>` : ''}`, components: [buttons] }).catch(()=>{});
      await interaction.editReply({ content: `✅ تم إنشاء التذكرة: <#${ticket.id}>`, ephemeral: true });
      return;
    }

    // buy select inside ticket
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('buy_select|')) {
      await interaction.deferReply({ ephemeral: true }).catch(()=>{});
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
    if (interaction.isButton() && interaction.customId === 'apply_admin') {
      // show modal with 5 questions
      const modal = new ModalBuilder().setCustomId('admin_apply_modal').setTitle('📝 نموذج تقديم الإدارة');

      const q1 = new TextInputBuilder().setCustomId('q1').setLabel('1- اسمك؟').setStyle(TextInputStyle.Short).setRequired(true);
      const q2 = new TextInputBuilder().setCustomId('q2').setLabel('2- عمرك؟').setStyle(TextInputStyle.Short).setRequired(true);
      const q3 = new TextInputBuilder().setCustomId('q3').setLabel('3- خبراتك؟ (بالتفصيل)').setStyle(TextInputStyle.Paragraph).setRequired(true);
      const q4 = new TextInputBuilder().setCustomId('q4').setLabel('4 - هل كنت أداري من قبل؟ (اجابه ب نعم او لا)').setStyle(TextInputStyle.Paragraph).setRequired(true);
      const q5 = new TextInputBuilder().setCustomId('q5').setLabel('5 - تستعمل شعارنا؟ (اجباري)').setStyle(TextInputStyle.Paragraph).setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(q1),
        new ActionRowBuilder().addComponents(q2),
        new ActionRowBuilder().addComponents(q3),
        new ActionRowBuilder().addComponents(q4),
        new ActionRowBuilder().addComponents(q5)
      );

      await interaction.showModal(modal).catch(err => {
        // handle "Unknown interaction" / "already acknowledged" gracefully
        console.error('showModal error:', err);
      });
      return;
    }

    // modal submit -> send to answersChannel saved in applyConfigPath
    if (interaction.isModalSubmit() && interaction.customId === 'admin_apply_modal') {
      // Defer reply so user gets confirmation
      await interaction.deferReply({ ephemeral: true }).catch(()=>{});

      const answers = {
        name: interaction.fields.getTextInputValue('q1'),
        age: interaction.fields.getTextInputValue('q2'),
        exp: interaction.fields.getTextInputValue('q3'),
        adminBefore: interaction.fields.getTextInputValue('q4'),
        reason: interaction.fields.getTextInputValue('q5')
      };

      let cfg = { panelChannel: null, answersChannel: null };
      try { cfg = JSON.parse(fs.readFileSync(applyConfigPath, 'utf8')); } catch (e) { /* keep defaults */ }

      const answersChannel = cfg.answersChannel ? await interaction.guild.channels.fetch(cfg.answersChannel).catch(()=>null) : null;

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
          `**5- تستعمل الشعار؟**\n${answers.reason}`
        )
        .setTimestamp();

      if (answersChannel && answersChannel.isTextBased()) {
const row = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId(`admin_accept|${interaction.user.id}`)
    .setLabel('قبول')
    .setStyle(ButtonStyle.Success),
  new ButtonBuilder()
    .setCustomId(`admin_reject|${interaction.user.id}`)
    .setLabel('رفض')
    .setStyle(ButtonStyle.Danger)
);

if (answersChannel && answersChannel.isTextBased()) {
  await answersChannel.send({ embeds: [embed], components: [row] }).catch(err => console.error('send to answersChannel failed:', err));
}

      } else {
        // if channel not found in this guild, try to find any channel with that id across client's cache
        try {
          const fallback = cfg.answersChannel ? await client.channels.fetch(cfg.answersChannel).catch(()=>null) : null;
          if (fallback && fallback.isTextBased()) {
            await fallback.send({ embeds: [embed] }).catch(()=>{});
          } else {
            console.warn('answersChannel not found or not text-based. ID:', cfg.answersChannel);
          }
        } catch (e) {
          console.error('fallback send error', e);
        }
      }

      // DM the user a confirmation
      try {
        await interaction.user.send('تم إرسال إجاباتك بنجاح ✅\nشكراً لاختيارك **Md7 Community** ❤️').catch(()=>{});

      } catch {
        // if DM failed (closed DM), send ephemeral reply
        await interaction.editReply({ content: 'لقد تم إرسال إجاباتك بنجاح ✅\nيرجى انتظار الرد.\nشكرًا لاختيارك **Md7 Community** ❤️', ephemeral: true }).catch(()=>{});
        return;
      }

      await interaction.editReply({ content: '✅ تم إرسال إجاباتك بنجاح!', ephemeral: true }).catch(()=>{});
      return;
    }

    if (interaction.isButton()) {
  const [action, userId] = interaction.customId.split('|');

  if ((action === 'admin_accept' || action === 'admin_reject') && userId) {
    const member = await interaction.guild.members.fetch(userId).catch(()=>null);
    if (!member) return interaction.reply({ content: 'المستخدم غير موجود.', ephemeral: true });

    if (action === 'admin_accept') {
      await member.send('لقد تم قبولك ✅\nيرجى التفاعل ابتداءً من الاحد القادم 🫡').catch(()=>{});
      await interaction.reply({ content: `✅ تم إرسال رسالة قبول للعضو <@${userId}>`, ephemeral: true });
    } else {
      await member.send('لقد تم رفضك ❌\nفرصة سعيدة في المرة القادمة 💪').catch(()=>{});
      await interaction.reply({ content: `❌ تم إرسال رسالة رفض للعضو <@${userId}>`, ephemeral: true });
    }

    // اجعل الزر غير قابل للضغط بعد ذلك
    const msg = await interaction.message.fetch();
    const disabledRow = new ActionRowBuilder().addComponents(
      ...msg.components[0].components.map(b => ButtonBuilder.from(b).setDisabled(true))
    );
    await msg.edit({ components: [disabledRow] }).catch(()=>{});
    return;
  }
}

    // generic buttons handling for tickets (claim/close/reopen/delete)
    if (interaction.isButton()) {
      const cid = interaction.customId;
      const ch = interaction.channel;
      // ensure channel topic exists for ticket actions
      if (!ch?.topic) return interaction.reply({ content: 'هذا الإجراء غير متاح هنا.', ephemeral: true }).catch(()=>{});
      const topic = parseTopic(ch.topic);
      const type = topic['ticket_type'];
      const owner = topic['owner'];

      // claim_ticket
      if (cid === 'claim_ticket') {
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

        const claimLogId = storage.claimLogChannel;
        if (claimLogId) {
          const logCh = await client.channels.fetch(claimLogId).catch(()=>null);
          if (logCh?.isTextBased()) {
            if (type === 'verify') {
              const emb = new EmbedBuilder()
                .setTitle('تسليم تذكرة توثيق')
                .setDescription(`لقد استلمت الموثقة **${interaction.user.tag}** تذكرة **${ch.name}** الخاصة بـ <@${owner}>\nنوع التذكرة : التوثيق 🎀`)
                .setThumbnail(interaction.user.displayAvatarURL({ extension: 'png' }))
                .setColor(0xE91E63);
              await logCh.send({ embeds: [emb] }).catch(()=>{});
            } else {
              const emb = new EmbedBuilder()
                .setTitle('تسليم تذكرة')
                .setDescription(`لقد استلم المسؤول **${interaction.user.tag}** تذكرة **${ch.name}** الخاصة بـ <@${owner}>\nنوع التذكرة : ${type === 'support' ? 'الدعم الفني' : type === 'buy' ? 'شراء رتبة' : (type === 'complaint_member' ? 'شكوى على عضو' : 'شكوى على إداري')}`)
                .setThumbnail(interaction.user.displayAvatarURL({ extension: 'png' }))
                .setColor(0x29B6F6);
              await logCh.send({ embeds: [emb] }).catch(()=>{});
            }
          }
        }

        return interaction.reply({ content: '✅ تم استلام التذكرة', ephemeral: true }).catch(()=>{});
      }

      // close_ticket
      if (cid === 'close_ticket') {
        await ch.permissionOverwrites.set([
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.guild.members.me.id, allow: [PermissionsBitField.Flags.ViewChannel] }
        ]).catch(()=>{});
        const key = `${interaction.guild.id}:${owner}`;
        if (openTicketsByUser.has(key)) openTicketsByUser.delete(key);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('delete_ticket').setLabel('حذف التذكرة').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('reopen_ticket').setLabel('إعادة فتح').setStyle(ButtonStyle.Success)
        );
        await ch.send({ embeds: [new EmbedBuilder().setTitle('تحكم المسؤولين')], components: [row] }).catch(()=>{});
        return interaction.reply({ content: '🔒 تم إغلاق التذكرة', ephemeral: true }).catch(()=>{});
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
        const key = `${interaction.guild.id}:${ownerId}`;
        openTicketsByUser.set(key, ch.id);
        return interaction.reply({ content: '✅ تمت إعادة فتح التذكرة', ephemeral: true }).catch(()=>{});
      }

      // delete_ticket
      if (cid === 'delete_ticket') {
        const ownerId = parseTopic(ch.topic || '').owner;
        const key = `${interaction.guild.id}:${ownerId}`;
        if (openTicketsByUser.has(key)) openTicketsByUser.delete(key);
        await ch.delete().catch(()=>{});
        return interaction.reply({ content: '🗑️ تم حذف التذكرة', ephemeral: true }).catch(()=>{});
      }
    }
  } catch (err) {
    console.error('Interaction error:', err);
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content: 'حدث خطأ داخلي.', ephemeral: true }).catch(()=>{});
      else await interaction.reply({ content: 'حدث خطأ.', ephemeral: true }).catch(()=>{});
    } catch {}
  }
});

// message monitor - watch ProBot payment messages
client.on('messageCreate', async message => {
  try {
    if (String(message.author.id) !== PROBOT_ID) return;

    const content = message.content;

    // Accept patterns like: **ـ q._73, قام بتحويل `$95` لـ <@!1271574575716761662> ** |:moneybag:
    const strictRegex = /\*\*ـ\s*(.+?),\s*قام\s*بتحويل\s*`?\$?(\d+)`?\s*لـ\s*<@!?(?:\s*)?(\d+)>?\s*\*\*\s*\|\:moneybag:/;
    let m = content.match(strictRegex);

    if (!m) {
      // fallback that requires PAYMENT_TARGET_ID mention
      const altRegex = new RegExp("\\*\\*ـ\\s*(.+?),\\s*قام\\s*بتحويل\\s*`?\\$?(\\d+)`?\\s*لـ\\s*<@!?(?:" + PAYMENT_TARGET_ID + ")>\\s*\\*\\*\\s*\\|:moneybag:");
      m = content.match(altRegex);
    }
    if (!m) return;

    const senderName = m[1]?.trim();
    const amountStr = m[2]?.trim();
    const amountNum = Number(amountStr);

    // ensure target is PAYMENT_TARGET_ID
    if (!content.includes(`<@!${PAYMENT_TARGET_ID}>`) && !content.includes(`<@${PAYMENT_TARGET_ID}>`)) return;

    const channel = message.channel;
    if (!channel) return;
    const topic = channel.topic || '';
    if (!topic.includes('ticket_type:buy') || !topic.includes('owner:')) return;
    const parsed = parseTopic(topic);
    const ownerId = parsed.owner;
    const choiceIdx = parsed.choice ? Number(parsed.choice) : NaN;
    if (Number.isNaN(choiceIdx)) return;
    const purchase = PURCHASE_ROLES[choiceIdx];
    if (!purchase) return;

    // find payer id from mentions (excluding PAYMENT_TARGET_ID)
    let payerId = null;
    if (message.mentions && message.mentions.users) {
      for (const [id] of message.mentions.users) {
        if (String(id) !== String(PAYMENT_TARGET_ID)) { payerId = id; break; }
      }
    }
    if (!payerId) payerId = ownerId;

    if (String(payerId) !== String(ownerId)) return;

    // match net amount (purchase.amountNet)
    if (Number(purchase.amountNet) !== Number(amountNum)) {
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

    // grant role
    const guild = channel.guild;
    const member = await guild.members.fetch(ownerId).catch(()=>null);
    if (!member) return;
    let giveRoleId = purchase.roleId;
    if (purchase.special) {
      const parts = String(purchase.roleId).split('/');
      if (member.roles.cache.has('1269801178146017370')) giveRoleId = parts[0];
      else if (member.roles.cache.has('1272361216840302592')) giveRoleId = parts[1];
      else giveRoleId = parts[0];
    }
    giveRoleId = String(giveRoleId).split('/')[0];

    if (!member.roles.cache.has(giveRoleId)) {
      await member.roles.add(giveRoleId).catch(err => console.error('role add failed', err));
    }

    try {
      await member.send(`تم إضافة رتبة **${purchase.label}** الى قائمة رتبك بنجاح ✅\nشكرًا لدعمك مجتمع Md7 Community 💫`).catch(()=>{});
    } catch {}

    // send purchase log
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

    // close/hide and delete ticket after short timeout
    setTimeout(async () => {
      try {
        const key = `${guild.id}:${ownerId}`;
        if (openTicketsByUser.has(key)) openTicketsByUser.delete(key);
        await channel.permissionOverwrites.set([
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
        ]).catch(()=>{});
        setTimeout(()=>{ channel.delete().catch(()=>{}); }, 3000);
      } catch (e) {
        console.error('closing ticket after payment error', e);
      }
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
      'ملاحظه : أي مخالفه لهذي القواعد ممكن توصل فيك للباند النهائي من السيرفر ⚠️ !!'
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
    );

  await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] }).catch(()=>{});
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

// login
client.login(TOKEN).catch(err => {
  console.error('Failed to login :', err);
  process.exit(1);
});
