// server.js
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionsBitField } = require('discord.js');
const express = require('express');

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('Missing DISCORD_TOKEN in env.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel]
});

// ----- إعدادات ثابتة من عندك (IDs) -----
const SUPPORT_ROLE = '1406690376156319764';
const ADMINISTRATOR_ROLE = '1268350577499443283';

const TICKET_HUB_CHANNEL_DEFAULT = '1406691864022745118'; // افتراضي إن احتجت
const APPLY_ANSWERS_DEFAULT = '1406692048089780234'; // روم الإجابات الافتراضي إن احتجت

// ProBot info (مراقبة الرسائل)
const PROBOT_ID = '282859044593598464';
const PAYMENT_TARGET_ID = '801738764077891594'; // المكان اللي يرسل لهم المبالغ

// Role purchase options (ترتيب الخيارات مع المبالغ المطلوبة)
const PURCHASE_ROLES = [
  { label: '! 𝗠𝟳 • 〢 𝗮𝗹𝗱𝗶𝘀𝘁𝗶𝗻𝗰𝘁𝗶𝘃𝗲  ❬✦❭', roleId: '1334249939680891013', amount: 3158 },
  { label: '! 𝗠𝟳 • 〢 𝗢𝘃𝗲𝗿 𝗛𝗮𝘃𝗲𝗻 ❬✦❭', roleId: '1332483925712568390', amount: 7369 },
  { label: '! 𝗠𝟳 • 〢 𝗠𝗮𝗷𝗲𝘀𝘁𝗶𝗰 ❬✦❭', roleId: '1332484125470490696', amount: 10527 },
  { label: '! 𝗠𝟳 • 〢 𝗞𝗶𝗻𝗴  ❬✦❭ / ! 𝗠𝟳 • 〢 𝗣𝗿𝗶𝗻𝗰𝗲𝘀𝘀  ❬✦❭', roleId: '1328701861896650882/1332743680934543393', amount: 13685, special: true },
  { label: '! 𝗠𝟳 • 〢 𝗖𝗿𝗮𝘇𝘆  ❬✦❭', roleId: '1323441766732402719', amount: 17895 },
  { label: '! 𝗠𝟳 • 〢 𝗧𝗵𝗲 𝗟𝗲𝗴𝗲𝗻𝗱 ❬✦❭', roleId: '1338166493992718347', amount: 24211 }
];

// ممنوع يفتح خيار الشراء لو عنده هالرتبة:
const CANNOT_BUY_ROLE = '1272270004968099907';

// موثقة بنات رتبتها
const VERIFY_GIRLS_ROLE = '1407757087240359976';

// ----------------- Express webserver (لـ UptimeRobot) -----------------
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Otaru Bot alive'));
app.listen(PORT, () => console.log(`Web server on port ${PORT}`));

// ----------------- Helpers -----------------
function isTextChannel(ch) {
  return ch && (ch.type === ChannelType.GuildText || ch.type === ChannelType.PublicThread || ch.type === ChannelType.PrivateThread);
}

// Helper to create ticket channel with given overwrites
async function createTicketChannel(guild, name, overwrites, parentId) {
  return await guild.channels.create({
    name: name.slice(0, 90),
    type: ChannelType.GuildText,
    parent: parentId || undefined,
    permissionOverwrites: overwrites,
    topic: `ticket_owner:${overwrites.find(o => o.allow && o.allow.includes(PermissionsBitField.Flags.SendMessages))?.id || 'unknown'}`
  });
}

// ----------------- Slash commands registration (on ready) -----------------
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Register two global slash commands: setup-ticket & setup-apply
  const data = [
    {
      name: 'setup-ticket',
      description: 'عرض بانل التذاكر في روم تحدده',
      options: [
        {
          name: 'channel',
          description: 'الروم الذي تريد نشر بانل التذاكر فيه',
          type: 7, // CHANNEL
          required: true
        }
      ]
    },
    {
      name: 'setup-apply',
      description: 'نشر رسالة التقديم: حدد روم البانل وروم استقبال الاجابات',
      options: [
        { name: 'panel_channel', description: 'اختر الروم حيث سيظهر زر التقديم', type: 7, required: true },
        { name: 'answers_channel', description: 'اختر الروم الذي تستقبل الاجابات منه', type: 7, required: true }
      ]
    }
  ];

  try {
    await client.application.commands.set(data);
    console.log('Slash commands registered.');
  } catch (e) {
    console.warn('Could not register slash commands:', e);
  }
});

// ----------------- Interaction handler -----------------
client.on('interactionCreate', async (interaction) => {
  try {
    // ===== Slash commands =====
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'setup-ticket') {
        const channel = interaction.options.getChannel('channel');
        if (!channel || !channel.isTextBased()) return interaction.reply({ content: 'اختر روم نصي صالح.', ephemeral: true });

        // build select menu
        const menu = new StringSelectMenuBuilder()
          .setCustomId('ticket_menu')
          .setPlaceholder('اختَر نوع التذكرة من هنا')
          .addOptions(
            { label: 'الدعم الفني ⚖️', value: 'support', description: 'مشكلة أو استفسار عام' },
            { label: 'شراء رتبة 💵', value: 'buy_role', description: 'شراء رتبة بشكل آمن' },
            { label: 'شكوى على عضو ⚠️', value: 'complaint_member', description: 'الإبلاغ عن عضو' },
            { label: 'شكوى على إداري ⛔️', value: 'complaint_staff', description: 'إبلاغ عن إداري (للأدمن فقط)' },
            { label: 'توثيق بنات 🎀', value: 'verify_girls', description: 'توثيق بنات (خاص)' }
          );

        const row = new ActionRowBuilder().addComponents(menu);
        await channel.send({
          embeds: [new EmbedBuilder().setTitle('نظام التذاكر').setDescription('اضغط القائمة لاختيار نوع التذكرة').setColor(0xE53935)],
          components: [row]
        });

        return interaction.reply({ content: 'تم نشر بانل التذاكر.', ephemeral: true });
      }

      if (interaction.commandName === 'setup-apply') {
        const panel = interaction.options.getChannel('panel_channel');
        const answers = interaction.options.getChannel('answers_channel');
        if (!panel?.isTextBased() || !answers?.isTextBased()) return interaction.reply({ content: 'يرجى اختيار روم نصي صالح للبانل و لروم الاستقبال.', ephemeral: true });

        // Save mapping by message id is optional; here we just send the panel with a button that will open modal
        const btn = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`apply_open|${answers.id}`).setLabel('تقديم').setStyle(ButtonStyle.Primary)
        );

        const embed = new EmbedBuilder()
          .setTitle('تقديم الأدارة')
          .setDescription('للتقديم لطاقم الأداره أنقر الزر بالأسفل')
          .setColor(0xC62828);

        await panel.send({ embeds: [embed], components: [btn] });
        return interaction.reply({ content: 'تم نشر بانل التقديم.', ephemeral: true });
      }
    }

    // ===== Select menu for tickets =====
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_menu') {
      await interaction.deferReply({ ephemeral: true });
      const choice = interaction.values[0]; // support | buy_role | complaint_member | complaint_staff | verify_girls
      const guild = interaction.guild;
      const parentId = interaction.channel.parentId || null;

      // if buy_role: check if user has forbidden role
      if (choice === 'buy_role') {
        const member = interaction.member;
        if (member.roles.cache.has(CANNOT_BUY_ROLE)) return interaction.editReply({ content: '❌ غير مسموح لك فتح تذاكر الشراء.', ephemeral: true });

        // create private ticket: visible ONLY to member + bot
        const overwrites = [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];
        const ticket = await guild.channels.create({
          name: `buy-${member.user.username}`,
          type: ChannelType.GuildText,
          parent: parentId ?? undefined,
          permissionOverwrites: overwrites,
          topic: `ticket_type:buy;owner:${member.id}`
        });

        // send initial message with role selection menu (or buttons)
        // Use select menu for role choices
        const options = PURCHASE_ROLES.map((r, idx) => ({
          label: r.label.slice(0, 100),
          value: String(idx)
        }));
        const menu = new StringSelectMenuBuilder()
          .setCustomId(`buy_select|${member.id}`)
          .setPlaceholder('اختر الرتبة التي تريد شراؤها')
          .addOptions(options);

        await ticket.send({
          content: `أهلا بك <@${member.id}>\nاختر الرتبة التي تريد شراؤها من الأسفل`,
          components: [new ActionRowBuilder().addComponents(menu)]
        });

        await interaction.editReply({ content: `✅ تم إنشاء تذكرتك: <#${ticket.id}>`, ephemeral: true });
        return;
      }

      // support, complaint_member, complaint_staff, verify_girls
      // Permission rules:
      // - complaint_staff and admin-only -> only admins can claim
      // - verify_girls -> only role VERIFY_GIRLS_ROLE can claim
      // - support & complaint_member -> support role can see and claim
      const member = interaction.member;
      const overwrites = [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ];

      if (choice === 'support' || choice === 'complaint_member') {
        overwrites.push({ id: SUPPORT_ROLE, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
      }
      // for complaint_staff: no support see, only admins later can claim
      // for verify_girls:
      if (choice === 'verify_girls') {
        overwrites.push({ id: VERIFY_GIRLS_ROLE, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
      }

      const nameMap = {
        support: `support-${member.user.username}`,
        complaint_member: `complaint-member-${member.user.username}`,
        complaint_staff: `complaint-staff-${member.user.username}`,
        verify_girls: `verify-${member.user.username}`
      };
      const ticket = await guild.channels.create({
        name: (nameMap[choice] || `ticket-${member.user.username}`).slice(0, 90),
        type: ChannelType.GuildText,
        parent: parentId ?? undefined,
        permissionOverwrites: overwrites,
        topic: `ticket_type:${choice};owner:${member.id}`
      });

      // message inside ticket with claim/close buttons (except buy_role which had no claim/close as per request)
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('إستلام').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق تذكرة').setStyle(ButtonStyle.Danger)
      );

      await ticket.send({
        content: `أهلا بك <@${member.id}>\nسوف يتم التعامل معك قريباً\n${choice === 'support' || choice === 'complaint_member' ? `<@&${SUPPORT_ROLE}>` : ''}`,
        components: [buttons]
      });

      await interaction.editReply({ content: `✅ تم إنشاء التذكرة: <#${ticket.id}>`, ephemeral: true });
      return;
    }

    // ===== Button: apply open (open modal) =====
    if (interaction.isButton() && interaction.customId && interaction.customId.startsWith('apply_open|')) {
      const args = interaction.customId.split('|');
      const answersChannelId = args[1];
      // Build modal with the questions you provided earlier
      const modal = new ModalBuilder().setCustomId(`apply_modal|${answersChannelId}`).setTitle('نموذج تقديم إدارة');

      const q1 = new TextInputBuilder().setCustomId('q_name').setLabel('اسمك').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50);
      const q2 = new TextInputBuilder().setCustomId('q_age').setLabel('عمرك').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10);
      const q3 = new TextInputBuilder().setCustomId('q_from').setLabel('من وين').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60);
      const q4 = new TextInputBuilder().setCustomId('q_experience').setLabel('خبراتك').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000);
      const q5 = new TextInputBuilder().setCustomId('q_time').setLabel('كم لك ب دسكورد').setStyle(TextInputStyle.Short).setRequired(true);
      const q6 = new TextInputBuilder().setCustomId('q_benefit').setLabel('ماذا نستفيد منك').setStyle(TextInputStyle.Paragraph).setRequired(true);
      const q7 = new TextInputBuilder().setCustomId('q_use').setLabel('تستعمل شعارنا؟ (نعم/لا)').setStyle(TextInputStyle.Short).setRequired(true);
      const q8 = new TextInputBuilder().setCustomId('q_admin_before').setLabel('كم صرت اداري ب سيرفرات').setStyle(TextInputStyle.Short).setRequired(true);
      const q9 = new TextInputBuilder().setCustomId('q_rules_ack').setLabel('أكد أنك قرأت القوانين').setStyle(TextInputStyle.Paragraph).setRequired(true);

      // Add inputs in ActionRows (modal supports up to 5 components per modal => must use multiple modals? Discord limits 5 inputs per modal)
      // Workaround: group some answers together in longer Paragraph inputs to fit within 5 inputs.
      // Here we will include 5 inputs combining multiple fields in some.
      // Build 5 inputs:
      const a1 = new TextInputBuilder().setCustomId('a1').setLabel('1) الاسم | 2) العمر | 3) من وين').setStyle(TextInputStyle.Paragraph).setRequired(true);
      const a2 = new TextInputBuilder().setCustomId('a2').setLabel('4) خبراتك').setStyle(TextInputStyle.Paragraph).setRequired(true);
      const a3 = new TextInputBuilder().setCustomId('a3').setLabel('5) كم لك ب دسكورد | 6) ماذا نستفيد منك').setStyle(TextInputStyle.Paragraph).setRequired(true);
      const a4 = new TextInputBuilder().setCustomId('a4').setLabel('7) تستعمل شعارنا؟ | 8) كم صرت اداري ب سيرفرات').setStyle(TextInputStyle.Short).setRequired(true);
      const a5 = new TextInputBuilder().setCustomId('a5').setLabel('9) تأكيد قراءة القوانين').setStyle(TextInputStyle.Paragraph).setRequired(true);

      // Attach inputs to modal (max 5)
      const row1 = new ActionRowBuilder().addComponents(a1);
      const row2 = new ActionRowBuilder().addComponents(a2);
      const row3 = new ActionRowBuilder().addComponents(a3);
      const row4 = new ActionRowBuilder().addComponents(a4);
      const row5 = new ActionRowBuilder().addComponents(a5);

      modal.addComponents(row1, row2, row3, row4, row5);
      return interaction.showModal(modal);
    }

    // ===== Modal submit for apply =====
    if (interaction.isModalSubmit() && interaction.customId && interaction.customId.startsWith('apply_modal|')) {
      await interaction.deferReply({ ephemeral: true }).catch(()=>{});
      const args = interaction.customId.split('|');
      const answersChannelId = args[1];
      const answersChannel = await client.channels.fetch(answersChannelId).catch(()=>null);
      // Gather answers
      const a1 = interaction.fields.getTextInputValue('a1');
      const a2 = interaction.fields.getTextInputValue('a2');
      const a3 = interaction.fields.getTextInputValue('a3');
      const a4 = interaction.fields.getTextInputValue('a4');
      const a5 = interaction.fields.getTextInputValue('a5');
      // Build embed and send to answersChannel
      const embed = new EmbedBuilder()
        .setTitle(`تقديم الادارة - ${interaction.user.username}`)
        .setDescription(`**معلومات المتقدم**`)
        .addFields(
          { name: 'تفاصيل', value: `${a1}\n\n${a2}\n\n${a3}\n\n${a4}\n\n${a5}` }
        )
        .setThumbnail(interaction.user.displayAvatarURL({ extension: 'png' }))
        .setColor(0xC62828)
        .setFooter({ text: `المتقدم: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ extension: 'png' }) });

      if (answersChannel && answersChannel.isTextBased()) {
        await answersChannel.send({ content: `<@&${SUPPORT_ROLE}> ${interaction.user}`, embeds: [embed] }).catch(()=>{});
      }
      await interaction.editReply({ content: 'تم إرسال نموذجك. شكراً لتقديمك!', ephemeral: true });
      return;
    }

    // ===== Select menu inside buy ticket (choose role) =====
    if (interaction.isStringSelectMenu() && interaction.customId && interaction.customId.startsWith('buy_select|')) {
      await interaction.deferReply({ ephemeral: true });
      const args = interaction.customId.split('|');
      const ownerId = args[1];
      const choiceIdx = Number(interaction.values[0]);
      const purchase = PURCHASE_ROLES[choiceIdx];
      if (!purchase) return interaction.editReply({ content: 'خيار غير صالح.', ephemeral: true });

      const channel = interaction.channel;
      // Store chosen role id & amount in channel topic
      await channel.setTopic(`ticket_type:buy;owner:${ownerId};choice:${choiceIdx}`).catch(()=>{});

      // Send instruction with amount and target
      const embed = new EmbedBuilder()
        .setTitle('شراء رتبة')
        .setDescription(`لقد اخترت: **${purchase.label}**\n\n**الرجاء تحويل ${purchase.amount} إلى <@${PAYMENT_TARGET_ID}>**\nبعد التحويل انتظر تأكيد الدفع.`)
        .setColor(0xF57C00);

      await channel.send({ content: `<@${ownerId}>`, embeds: [embed] });
      await interaction.editReply({ content: 'تم تسجيل اختيارك. قم بتحويل المبلغ ثم انتظر التحقق.', ephemeral: true });
      return;
    }

    // ===== Buttons in general: claim/close/reopen/delete =====
    if (interaction.isButton()) {
      const cid = interaction.customId;
      const ch = interaction.channel;
      if (!ch || !ch.topic) return interaction.reply({ content: 'هذا الإجراء غير متاح هنا.', ephemeral: true });

      const topicObj = Object.fromEntries(ch.topic.split(';').map(kv => kv.split(':')));
      const type = topicObj['ticket_type'];
      const owner = topicObj['owner'];

      // Claim
      if (cid === 'claim_ticket') {
        // Determine who can claim depending on type
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        const isSupport = interaction.member.roles.cache.has(SUPPORT_ROLE);
        const isVerify = interaction.member.roles.cache.has(VERIFY_GIRLS_ROLE);

        if (type === 'complaint_staff' || type === 'admin_apply') {
          if (!isAdmin) return interaction.reply({ content: '❌ هذه التذكرة مخصصة للأدمن فقط.', ephemeral: true });
        } else if (type === 'verify_girls') {
          if (!isVerify) return interaction.reply({ content: '❌ لا يمكنك استلام هذه التذكرة.', ephemeral: true });
        } else {
          if (!isSupport && !isAdmin) return interaction.reply({ content: '❌ لا يمكنك استلام هذه التذكرة.', ephemeral: true });
        }

        if (topicObj.claimer) return interaction.reply({ content: `تم استلام هذه التذكرة مسبقاً من قبل <@${topicObj.claimer}>`, ephemeral: true });

        const newTopic = ch.topic + `;claimer:${interaction.user.id}`;
        await ch.setTopic(newTopic).catch(()=>{});
        // Prevent others from writing if support role - allow claimer
        if (type !== 'buy') {
          await ch.permissionOverwrites.edit(SUPPORT_ROLE, { SendMessages: false }).catch(()=>{});
        }
        await ch.permissionOverwrites.edit(interaction.user.id, { SendMessages: true }).catch(()=>{});
        await ch.send(`سوف يتم التعامل معك من قبل الأداري ${interaction.member} اتفضل`);
        return interaction.reply({ content: '✅ تم استلام التذكرة', ephemeral: true });
      }

      // Close
      if (cid === 'close_ticket') {
        // hide channel from everyone except bots & admins (we will leave only bot visible)
        await ch.permissionOverwrites.set([
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.guild.members.me.id, allow: [PermissionsBitField.Flags.ViewChannel] }
        ]).catch(()=>{});
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('delete_ticket').setLabel('حذف التذكرة').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('reopen_ticket').setLabel('إعادة فتح').setStyle(ButtonStyle.Success)
        );
        await ch.send({ embeds: [new EmbedBuilder().setTitle('تحكم المسؤولين')], components: [row] }).catch(()=>{});
        return interaction.reply({ content: '🔒 تم إغلاق التذكرة', ephemeral: true });
      }

      // Reopen
      if (cid === 'reopen_ticket') {
        // find owner from topic
        const ownerId = topicObj.owner;
        const perms = [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: ownerId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ];
        // if type allowed support, add support role back
        if (type === 'support' || type === 'complaint_member' || type === 'verify_girls') {
          perms.push({ id: SUPPORT_ROLE, allow: [PermissionsBitField.Flags.ViewChannel] });
        }
        await ch.permissionOverwrites.set(perms).catch(()=>{});
        return interaction.reply({ content: '✅ تمت إعادة فتح التذكرة', ephemeral: true });
      }

      // Delete
      if (cid === 'delete_ticket') {
        await ch.delete().catch(()=>{});
        return interaction.reply({ content: '🗑️ تم حذف التذكرة', ephemeral: true });
      }
    }
  } catch (err) {
    console.error('Interaction error:', err);
    if (interaction.replied || interaction.deferred) {
      try { await interaction.editReply({ content: 'حدث خطأ داخلي.', ephemeral: true }); } catch {}
    } else {
      try { await interaction.reply({ content: 'حدث خطأ.', ephemeral: true }); } catch {}
    }
  }
});

// ----------------- Message listener to monitor ProBot payment confirmations -----------------
client.on('messageCreate', async (message) => {
  try {
    // only from ProBot
    if (String(message.author.id) !== PROBOT_ID) return;

    // check message content pattern examples given:
    // e.g. "ـ (user), قام بتحويل `$3000` لـ <@801738764077891594> ** |:moneybag:"
    const content = message.content;
    if (!content.includes(`<@${PAYMENT_TARGET_ID}>`)) return;

    // find user mention in content (the sender mention is usually in the message)
    // We'll attempt to capture the first mention of a user (not the target)
    const mentions = message.mentions.users;
    // mentions might include the PAYMENT_TARGET_ID as well; we need the other one
    let payerId = null;
    for (const [id, user] of mentions) {
      if (id !== PAYMENT_TARGET_ID) { payerId = id; break; }
    }
    if (!payerId) {
      // maybe the message includes a textual username — fallback: try to parse pattern `ـ (user),`
      // but we'll skip if can't find payer
      return;
    }

    // Extract amount from the message like `$3000` or `\$3000` etc
    const amountMatch = content.match(/\$([\d,\.]+)/);
    if (!amountMatch) return;
    const amountNum = Number(String(amountMatch[1]).replace(/[,\.]/g, ''));

    // Now we must find if there's an open ticket for this payer that expects a purchase with this amount
    // Search in guild channels for a channel topic that contains owner:payerId and type:buy and choice index
    for (const guild of client.guilds.cache.values()) {
      // iterate channels in guild
      const channels = guild.channels.cache.filter(c => c.isTextBased());
      for (const ch of channels.values()) {
        try {
          const topic = ch.topic || '';
          if (!topic.includes('ticket_type:buy') || !topic.includes(`owner:${payerId}`)) continue;
          // parse choice
          const parsed = Object.fromEntries(topic.split(';').map(s => s.split(':')));
          const choiceIdx = Number(parsed.choice);
          const purchase = PURCHASE_ROLES[choiceIdx];
          if (!purchase) continue;
          // compare amounts: purchase.amount vs amountNum (approx)
          // Because amounts in messages may be like 3000 vs 3158 etc; we'll require exact match to be safe
          if (Number(purchase.amount) !== Number(amountNum)) continue;
          // Also verify target mention present (already checked)
          // Grant role:
          // For special choice (index 3) roleId contains two ids separated by '/'
          let roleIdToGive = purchase.roleId;
          if (purchase.special) {
            // special handling: if user has role 1269801178146017370 give King (first id),
            // else if has 1272361216840302592 give Princess (second id)
            const member = await guild.members.fetch(payerId).catch(()=>null);
            if (member) {
              if (member.roles.cache.has('1269801178146017370')) {
                roleIdToGive = purchase.roleId.split('/')[0]; // first
              } else if (member.roles.cache.has('1272361216840302592')) {
                roleIdToGive = purchase.roleId.split('/')[1]; // second
              } else {
                // If none, default to first id
                roleIdToGive = purchase.roleId.split('/')[0];
              }
            } else {
              roleIdToGive = purchase.roleId.split('/')[0];
            }
          }

          // Give role
          const member = await guild.members.fetch(payerId).catch(()=>null);
          if (member) {
            // roleIdToGive might be string with slash in some cases, ensure pick first if comma
            roleIdToGive = String(roleIdToGive).split('/')[0];
            await member.roles.add(roleIdToGive).catch(()=>{});
            // send DM
            try {
              await member.send(`تم إضافة رتبةك بنجاح: <@&${roleIdToGive}>`).catch(()=>{});
            } catch {}
          }

          // Close ticket: either delete channel or hide & send confirmation
          await ch.send({ content: `تم استلام دفعتك وتمت إضافة الرتبة <@&${roleIdToGive}>. سيتم إغلاق التذكرة.` }).catch(()=>{});
          // we can delete channel after short delay
          setTimeout(()=>{ ch.delete().catch(()=>{}); }, 3000);

        } catch (err) {
          console.warn('Error processing payment message for channel', ch.id, err);
        }
      }
    }

  } catch (e) {
    console.error('ProBot monitor error:', e);
  }
});

// ----------------- Login -----------------
client.login(TOKEN).catch(err => {
  console.error('Failed to login :', err);
  process.exit(1);
});
