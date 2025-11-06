// server.js
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionsBitField } = require('discord.js');
const express = require('express');

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('Missing DISCORD_TOKEN in env.');
  process.exit(1);
}

// ---------- CONFIG - عدل هذه القيم حسب سيرفرك ----------
const OWNER_ID = 'YOUR_OWNER_ID_HERE'; // صاحب السيرفر/المنشئ - فقط هو يقدر يستخدم أوامر السلاش أيضا
const ADMIN_ROLE_ID = '1268350577499443283'; // الرتب العليا اللي تقدر تستخدم أوامر السلاش أيضاً
const SUPPORT_ROLE = '1406690376156319764'; // رتبة فريق الدعم (تمنشن في التذاكر)
const VERIFY_GIRLS_ROLE = '1407757087240359976'; // رتبة الموثقة
const CANNOT_BUY_ROLE = '1272270004968099907'; // ممنوع من شراء الرتب
const PROBOT_ID = '282859044593598464'; // ID البروبوت المراقب للمدفوعات
const PAYMENT_TARGET_ID = '801738764077891594'; // الحساب اللي يصير له التحويل
const DEFAULT_TICKET_PANEL_CHANNEL = '1406691864022745118'; // روم افتراضي لنشر البانل لو حبيت
// ----------------------------------------------------------------

// ترتيب رتب الشراء كما أعطيت - لا تغير هذه إن أردت نفس السلوك
const PURCHASE_ROLES = [
  { label: '! 𝗠𝟳 • 〢 𝗮𝗹𝗱𝗶𝘀𝘁𝗶𝗻𝗰𝘁𝗶𝘃𝗲  ❬✦❭', roleId: '1334249939680891013', amount: 3158 },
  { label: '! 𝗠𝟳 • 〢 𝗢𝘃𝗲𝗿 𝗛𝗮𝘃𝗲𝗻 ❬✦❭', roleId: '1332483925712568390', amount: 7369 },
  { label: '! 𝗠𝟳 • 〢 𝗠𝗮𝗷𝗲𝘀𝘁𝗶𝗰 ❬✦❭', roleId: '1332484125470490696', amount: 10527 },
  { label: '! 𝗠𝟳 • 〢 𝗞𝗶𝗻𝗴  ❬✦❭ / ! 𝗠𝟳 • 〢 𝗣𝗿𝗶𝗻𝗰𝗲𝘀𝘀  ❬✦❭', roleId: '1328701861896650882/1332743680934543393', amount: 13685, special: true },
  { label: '! 𝗠𝟳 • 〢 𝗖𝗿𝗮𝘇𝘆  ❬✦❭', roleId: '1323441766732402719', amount: 17895 },
  { label: '! 𝗠𝟳 • 〢 𝗧𝗵𝗲 𝗟𝗲𝗴𝗲𝗻𝗱 ❬✦❭', roleId: '1338166493992718347', amount: 24211 }
];

// ---------------- server بسيط ل uptime ----------------
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_, res) => res.send('Bot is running'));
app.listen(PORT, () => console.log(`Web server on port ${PORT}`));

// ---------------- client ----------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// مساعدة لتحليل topic
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

// تحقق صلاحية استخدام أوامر السلاش (owner أو من يملك الدور الإداري)
function canUseSlash(interaction) {
  if (!interaction.member) return false;
  if (String(interaction.user.id) === String(OWNER_ID)) return true;
  if (interaction.member.roles.cache.has(ADMIN_ROLE_ID)) return true;
  // يمكن إضافة صلاحيات أخرى إن رغبت
  return false;
}

// تتبع تذاكر مفتوحة لكل عضو لمنع التكرار
const openTicketsByUser = new Map(); // guildId:userId => channelId

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  // register slash commands (global)
  const commands = [
    {
      name: 'setup-ticket',
      description: 'نشر بانل التذاكر في روم تختاره',
      options: [{ name: 'channel', description: 'اختر القناة', type: 7, required: true }]
    },
    {
      name: 'applysetup',
      description: 'نشر بانل التقديم (اختر روم البانل وروم استقبال النتائج)',
      options: [
        { name: 'panel_channel', description: 'روم البانل', type: 7, required: true },
        { name: 'answers_channel', description: 'روم استقبال الاجابات', type: 7, required: true }
      ]
    },
    {
      name: 'verifysetup',
      description: 'نشر بانل توثيق البنات (اختر روم)',
      options: [{ name: 'channel', description: 'اختر القناة', type: 7, required: true }]
    },
    {
      name: 'reload-tickets',
      description: 'إعادة تحميل بانل التذاكر (يقوم بتحديث نفس البانل)',
    }
  ];

  try {
    await client.application.commands.set(commands);
    console.log('Slash commands registered.');
  } catch (e) {
    console.warn('Failed to register slash commands', e);
  }
});

// --------- تعامل مع الانتر اكشنز (سلاش، أزرار، سيلكت) ----------
client.on('interactionCreate', async (interaction) => {
  try {
    // ---- سلاش كوماندس ----
    if (interaction.isChatInputCommand()) {
      if (!canUseSlash(interaction)) {
        return interaction.reply({ content: '❌ ليس لديك صلاحية استخدام هذه الأوامر.', ephemeral: true });
      }

      // setup-ticket
      if (interaction.commandName === 'setup-ticket') {
        const ch = interaction.options.getChannel('channel');
        if (!ch?.isTextBased()) return interaction.reply({ content: 'اختر روم نصي صالح.', ephemeral: true });

        const embed = new EmbedBuilder()
          .setTitle('𝐌𝐝𝟕 𝐂𝐨𝐦𝐦𝐮𝐧𝐢𝐭𝐲 𝐒𝐮𝐩𝐩𝐨𝐫𝐭')
          .setDescription([
            'الـقـوانـيـن',
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

        await ch.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
        return interaction.reply({ content: 'تم نشر بانل التذاكر.', ephemeral: true });
      }

      // applysetup
      if (interaction.commandName === 'applysetup') {
        const panel = interaction.options.getChannel('panel_channel');
        const answers = interaction.options.getChannel('answers_channel');
        if (!panel?.isTextBased() || !answers?.isTextBased()) return interaction.reply({ content: 'اختر روم نصي صالح.', ephemeral: true });

        const btn = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`apply_open|${answers.id}`).setLabel('تقديم').setStyle(ButtonStyle.Primary)
        );

        const embed = new EmbedBuilder()
          .setTitle('تقديم الإدارة')
          .setDescription('للتقديم لطاقم الإدارة أنقر الزر بالأسفل')
          .setColor(0xC62828);

        await panel.send({ embeds: [embed], components: [btn] });
        return interaction.reply({ content: 'تم نشر بانل التقديم.', ephemeral: true });
      }

      // verifysetup
      if (interaction.commandName === 'verifysetup') {
        const ch = interaction.options.getChannel('channel');
        if (!ch?.isTextBased()) return interaction.reply({ content: 'اختر روم نصي صالح.', ephemeral: true });

        const embed = new EmbedBuilder()
          .setTitle('🎀 توثيق البنات')
          .setDescription('لفتح تذكرة التوثيق يرجى النقر على الزر فالأسفل\n\nملاحظه : لا يمكنك شراء اي رتبة شرائيه حتى تتوثقي')
          .setColor(0xE91E63);

        const btn = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`verify_panel_open|${ch.id}`).setLabel('فتح تذكرة').setStyle(ButtonStyle.Primary)
        );

        await ch.send({ embeds: [embed], components: [btn] });
        return interaction.reply({ content: 'تم نشر بانل التوثيق.', ephemeral: true });
      }

      // reload-tickets (يجدد البانل في نفس القناة)
      if (interaction.commandName === 'reload-tickets') {
        // نحتاج معرفة أي قناة نريد نحدث فيها. سنستخدم القناة التي استدعى فيها الأمر أو نستخدم القناة الافتراضية
        const target = interaction.channel || (await client.channels.fetch(DEFAULT_TICKET_PANEL_CHANNEL).catch(()=>null));
        if (!target || !target.isTextBased()) return interaction.reply({ content: 'لا أستطيع الوصول إلى قناة لتحديث البانل.', ephemeral: true });

        // نحدث الرسالة بإرسال بانل جديد ثم نحذف الرسائل القديمة؟ (ببساطة نرسل بانل جديدة كـ refresh)
        const embed = new EmbedBuilder()
          .setTitle('𝐌𝐝𝟕 𝐂𝐨𝐦𝐦𝐮𝐧𝐢𝐭𝐲 𝐒𝐮𝐩𝐩𝐨𝐫𝐭')
          .setDescription([
            'الـقـوانـيـن',
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

        await target.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] }).catch(()=>{});
        return interaction.reply({ content: '✅ تم تحديث البانل (refresh).', ephemeral: true });
      }
    }

    // ---- Select menu from main ticket panel ----
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_menu') {
      await interaction.deferReply({ ephemeral: true });
      const choice = interaction.values[0]; // support | buy_role | complaint_member | complaint_staff | reload_panel
      const guild = interaction.guild;
      const member = interaction.member;
      const parent = interaction.channel.parentId || null;

      // منع فتح أكثر من تذكرة لنفس العضو
      const key = `${guild.id}:${member.user.id}`;
      if (openTicketsByUser.has(key)) {
        return interaction.editReply({ content: 'عندك تكت مفتوح بالفعل! يرجى إغلاقه قبل فتح تكت جديد.', ephemeral: true });
      }

      // reload_panel
      if (choice === 'reload_panel') {
        // نعيد نشر البانل في نفس القناة لكن لا نرسل بانل ثانية - هنا نعتبر "التحديث" بإرسال بانل محدث
        const embed = new EmbedBuilder()
          .setTitle('𝐌𝐝𝟕 𝐂𝐨𝐦𝐦𝐮𝐧𝐢𝐭𝐲 𝐒𝐮𝐩𝐩𝐨𝐫𝐭')
          .setDescription([
            'الـقـوانـيـن',
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

        // نرسل بانل محدث بدون حذف القديم - هذا ما طلبته كـ refresh
        await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] }).catch(()=>{});
        return interaction.editReply({ content: 'تم تحديث البانل.', ephemeral: true });
      }

      // خيار شراء رتبة
      if (choice === 'buy_role') {
        if (member.roles.cache.has(CANNOT_BUY_ROLE)) {
          return interaction.editReply({ content: '❌ غير مسموح لك فتح تذاكر الشراء.', ephemeral: true });
        }

        // إنشاء تكت خاص فقط للعضو + البوت
        const overwrites = [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: member.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];

        const ticket = await guild.channels.create({
          name: `buy-${member.user.username}`.slice(0, 90),
          type: ChannelType.GuildText,
          parent: parent ?? undefined,
          permissionOverwrites: overwrites,
          topic: `ticket_type:buy;owner:${member.user.id}`
        });

        // نضع علامة في الخريطة لمنع فتح تكت آخر
        openTicketsByUser.set(key, ticket.id);

        // قائمة اختيار الرتب
        const options = PURCHASE_ROLES.map((r, idx) => ({ label: r.label.slice(0, 100), value: String(idx) }));
        const menu = new StringSelectMenuBuilder().setCustomId(`buy_select|${member.user.id}`).setPlaceholder('اختر الرتبة').addOptions(options);

        await ticket.send({ content: `أهلا بك <@${member.user.id}>\nاختر الرتبة التي تريد شراؤها من الأسفل`, components: [new ActionRowBuilder().addComponents(menu)] });
        await interaction.editReply({ content: `✅ تم إنشاء تذكرتك: <#${ticket.id}>`, ephemeral: true });
        return;
      }

      // support, complaint_member, complaint_staff
      // كل هذه التذاكر ستمنشن العضو و رتبة الدعم إن كانت موجودة في السيرفر
      let overwrites = [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: member.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ];

      let mention = `<@${member.user.id}>`;
      let ticketName = `ticket-${member.user.username}`.slice(0, 90);
      let addSupport = false;
      if (choice === 'support') {
        addSupport = true;
        ticketName = `support-${member.user.username}`.slice(0, 90);
      } else if (choice === 'complaint_member') {
        addSupport = true;
        ticketName = `complaint-member-${member.user.username}`.slice(0, 90);
      } else if (choice === 'complaint_staff') {
        // شكوى على اداري: نمنع رؤية الدعم العادي، وسنمنشن everyone كما طلبت لكن في الحقيقة فقط من يتحكم بالصلاحيات العليا سيشاهده
        ticketName = `complaint-staff-${member.user.username}`.slice(0, 90);
        mention += ' @everyone';
      }

      if (addSupport) {
        overwrites.push({ id: SUPPORT_ROLE, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
      }

      // إنشاء التذكرة
      const ticket = await guild.channels.create({
        name: ticketName,
        type: ChannelType.GuildText,
        parent: parent ?? undefined,
        permissionOverwrites: overwrites,
        topic: `ticket_type:${choice};owner:${member.user.id}`
      });

      // منع فتح تكت آخر لنفس المستخدم
      openTicketsByUser.set(key, ticket.id);

      // داخل التكت: نعرض زرين: استلام واغلاق
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('إستلام').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق تذكرة').setStyle(ButtonStyle.Danger)
      );

      // نرسل الرسالة التي تحتوي المنشن (العضو + رتبة الدعم إذا موجودة)
      const contentMsg = `أهلا بك <@${member.user.id}>\nسوف يتم التعامل معك قريباً\n${addSupport ? `<@&${SUPPORT_ROLE}>` : ''}`;
      await ticket.send({ content: contentMsg, components: [buttons] });
      await interaction.editReply({ content: `✅ تم إنشاء التذكرة: <#${ticket.id}>`, ephemeral: true });
      return;
    }

    // ---- Button: apply_open -> فتح المودال الخاص بالتقديم ----
    if (interaction.isButton() && interaction.customId?.startsWith('apply_open|')) {
      const answersChannelId = interaction.customId.split('|')[1];
      const modal = new ModalBuilder().setCustomId(`apply_modal|${answersChannelId}`).setTitle('نموذج تقديم إدارة');

      const q1 = new TextInputBuilder().setCustomId('q1').setLabel('1 - أسمك؟').setStyle(TextInputStyle.Short).setRequired(true);
      const q2 = new TextInputBuilder().setCustomId('q2').setLabel('2 - عمرك؟').setStyle(TextInputStyle.Short).setRequired(true);
      const q3 = new TextInputBuilder().setCustomId('q3').setLabel('3 - خبراتك (بالتفصيل)').setStyle(TextInputStyle.Paragraph).setRequired(true);
      const q4 = new TextInputBuilder().setCustomId('q4').setLabel('4 - كم لك فالديسكورد').setStyle(TextInputStyle.Short).setRequired(true);
      const q5 = new TextInputBuilder().setCustomId('q5').setLabel('5 - تستعمل شعارنا؟ (اجباري)').setStyle(TextInputStyle.Short).setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(q1),
        new ActionRowBuilder().addComponents(q2),
        new ActionRowBuilder().addComponents(q3),
        new ActionRowBuilder().addComponents(q4),
        new ActionRowBuilder().addComponents(q5)
      );

      return interaction.showModal(modal);
    }

    // ---- Modal submit apply ----
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
          { name: 'كم لك في الديسكورد', value: ans4, inline: true }
        )
        .addFields(
          { name: 'خبراتك (بالتفصيل)', value: ans3 },
          { name: 'تستعمل شعارنا؟', value: ans5 }
        )
        .setThumbnail(interaction.user.displayAvatarURL({ extension: 'png' }))
        .setColor(0xC62828)
        .setFooter({ text: `المتقدم: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ extension: 'png' }) });

      if (ch?.isTextBased()) {
        await ch.send({ content: `<@&${SUPPORT_ROLE}> ${interaction.user}`, embeds: [embed] }).catch(()=>{});
      }
      return interaction.editReply({ content: 'تم إرسال نموذجك. شكراً لتقديمك!', ephemeral: true });
    }

    // ---- Verify panel open button: فتح تذكرة التوثيق ----
    if (interaction.isButton() && interaction.customId?.startsWith('verify_panel_open|')) {
      const parent = interaction.channel.parentId || null;
      const guild = interaction.guild;
      const member = interaction.member;

      // منع فتح أكثر من تكت توثيق للنفس
      const key = `${guild.id}:${member.user.id}`;
      if (openTicketsByUser.has(key)) {
        return interaction.reply({ content: 'عندك تكت مفتوح بالفعل! يرجى إغلاقه قبل فتح تكت جديد.', ephemeral: true });
      }

      // إنشاء تكت توثيق يظهر للعضوة + رتبة الموثقة فقط (المسؤولين لا يرونه)
      const overwrites = [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: member.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: VERIFY_GIRLS_ROLE, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ];

      const ticket = await guild.channels.create({
        name: `verify-${member.user.username}`.slice(0,90),
        type: ChannelType.GuildText,
        parent: parent ?? undefined,
        permissionOverwrites: overwrites,
        topic: `ticket_type:verify;owner:${member.user.id}`
      });

      // وضع مفتاح منع التكرار
      openTicketsByUser.set(key, ticket.id);

      // يمنشن العضوة و رتبة الموثقة
      await ticket.send({ content: `<@${member.user.id}> <@&${VERIFY_GIRLS_ROLE}> | تم فتح تذكرة توثيق جديدة` });
      return interaction.reply({ content: `تم إنشاء تذكرتك: <#${ticket.id}>`, ephemeral: true });
    }

    // ---- Buy select menu choice (اختيار رتبة للشراء) ----
    if (interaction.isStringSelectMenu() && interaction.customId?.startsWith('buy_select|')) {
      await interaction.deferReply({ ephemeral: true });
      const ownerId = interaction.customId.split('|')[1];
      const idx = Number(interaction.values[0]);
      const purchase = PURCHASE_ROLES[idx];
      if (!purchase) return interaction.editReply({ content: 'خيار غير صالح.', ephemeral: true });

      const ch = interaction.channel;
      // set topic for payment monitor
      await ch.setTopic(`ticket_type:buy;owner:${ownerId};choice:${idx}`).catch(()=>{});

      const embed = new EmbedBuilder()
        .setTitle('شراء رتبة')
        .setDescription(`لقد اخترت: **${purchase.label}**\n\n**الرجاء تحويل ${purchase.amount} إلى <@${PAYMENT_TARGET_ID}>**\nبعد التحويل انتظر التحقق.`)
        .setColor(0xF57C00);

      await ch.send({ content: `<@${ownerId}>`, embeds: [embed] }).catch(()=>{});
      return interaction.editReply({ content: 'تم تسجيل اختيارك. قم بتحويل المبلغ ثم انتظر التحقق.', ephemeral: true });
    }

    // ---- Buttons داخل التذاكر: استلام / اغلاق / اعادة فتح / حذف ----
    if (interaction.isButton()) {
      const cid = interaction.customId;
      const ch = interaction.channel;
      if (!ch?.topic) return interaction.reply({ content: 'هذا الإجراء غير متاح هنا.', ephemeral: true });

      const topic = parseTopic(ch.topic);
      const type = topic['ticket_type'];
      const owner = topic['owner'];

      // claim_ticket
      if (cid === 'claim_ticket') {
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        const isSupport = interaction.member.roles.cache.has(SUPPORT_ROLE);
        const isVerify = interaction.member.roles.cache.has(VERIFY_GIRLS_ROLE);

        // من يستطيع الاستلام؟ يعتمد على نوع التكت
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
        await ch.send(`سوف يتم التعامل معك من قبل الأداري ${interaction.member} اتفضل`);
        return interaction.reply({ content: '✅ تم استلام التذكرة', ephemeral: true });
      }

      // close_ticket
      if (cid === 'close_ticket') {
        // hide channel from everyone except bot & admins
        await ch.permissionOverwrites.set([
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.guild.members.me.id, allow: [PermissionsBitField.Flags.ViewChannel] }
        ]).catch(()=>{});

        // إزالة من خريطة التذاكر المفتوحة
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

        // إعادة تسجيل في الخريطة
        const key = `${interaction.guild.id}:${ownerId}`;
        openTicketsByUser.set(key, ch.id);

        return interaction.reply({ content: '✅ تمت إعادة فتح التذكرة', ephemeral: true });
      }

      // delete_ticket
      if (cid === 'delete_ticket') {
        // إزالة من الخريطة
        const ownerId = topic['owner'];
        const key = `${interaction.guild.id}:${ownerId}`;
        if (openTicketsByUser.has(key)) openTicketsByUser.delete(key);

        await ch.delete().catch(()=>{});
        return interaction.reply({ content: '🗑️ تم حذف التذكرة', ephemeral: true });
      }
    }
  } catch (err) {
    console.error('Interaction error:', err);
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content: 'حدث خطأ داخلي.', ephemeral: true });
      else await interaction.reply({ content: 'حدث خطأ.', ephemeral: true });
    } catch {}
  }
});

// ---------- مراقبة رسائل ProBot لمنح الرتب بعد الدفع ----------
client.on('messageCreate', async (message) => {
  try {
    if (String(message.author.id) !== PROBOT_ID) return;
    const content = message.content;
    if (!content.includes(`<@${PAYMENT_TARGET_ID}>`)) return;

    // إيجاد المرسل (المشتري)
    let payerId = null;
    for (const [id] of message.mentions.users) {
      if (id !== PAYMENT_TARGET_ID) { payerId = id; break; }
    }
    if (!payerId) return;

    // استخراج المبلغ
    const m = content.match(/\$([\d,\.]+)/);
    if (!m) return;
    const amountNum = Number(String(m[1]).replace(/[,\.]/g, ''));

    // البحث في قنوات السيرفرات عن تذكره شراء تطابق المبلغ و المالك
    for (const guild of client.guilds.cache.values()) {
      for (const ch of guild.channels.cache.filter(c => c.isTextBased()).values()) {
        try {
          const topic = ch.topic || '';
          if (!topic.includes('ticket_type:buy') || !topic.includes(`owner:${payerId}`)) continue;
          // parse
          const parts = parseTopic(topic);
          const idx = Number(parts.choice);
          const purchase = PURCHASE_ROLES[idx];
          if (!purchase) continue;
          if (Number(purchase.amount) !== Number(amountNum)) continue;

          // تحديد ال role المراد اعطاؤه
          let giveRole = purchase.roleId;
          if (purchase.special) {
            const member = await guild.members.fetch(payerId).catch(()=>null);
            if (member) {
              if (member.roles.cache.has('1269801178146017370')) giveRole = purchase.roleId.split('/')[0];
              else if (member.roles.cache.has('1272361216840302592')) giveRole = purchase.roleId.split('/')[1];
              else giveRole = purchase.roleId.split('/')[0];
            } else giveRole = purchase.roleId.split('/')[0];
          }
          giveRole = String(giveRole).split('/')[0];

          const member = await guild.members.fetch(payerId).catch(()=>null);
          if (member) {
            await member.roles.add(giveRole).catch(()=>{});
            try { await member.send(`تم إضافة رتبتك بنجاح: <@&${giveRole}>`).catch(()=>{}); } catch {}
          }

          await ch.send({ content: `تم استلام دفعتك وتمت إضافة الرتبة <@&${giveRole}>. سيتم إغلاق التذكرة.` }).catch(()=>{});
          // ازالة من الخريطة openTicketsByUser
          const key = `${guild.id}:${payerId}`;
          if (openTicketsByUser.has(key)) openTicketsByUser.delete(key);
          setTimeout(()=>{ ch.delete().catch(()=>{}); }, 3000);
        } catch (err) {
          console.warn('Payment handling error:', err);
        }
      }
    }
  } catch (e) {
    console.error('ProBot monitor error:', e);
  }
});

// ---------- login ----------
client.login(TOKEN).catch(err => {
  console.error('Failed to login :', err);
  process.exit(1);
});
