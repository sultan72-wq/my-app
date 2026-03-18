const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = function(client) {
    // ==========================================
    // 1. تعريف الملفات والبيانات
    // ==========================================
    const XP_FILE = path.join(__dirname, 'xp_data.json');
    const DAILY_FILE = path.join(__dirname, 'xp_daily.json');
    const WEEKLY_FILE = path.join(__dirname, 'xp_weekly.json');
    const MONTHLY_FILE = path.join(__dirname, 'xp_monthly.json');

    let xp = {}, daily = {}, weekly = {}, monthly = {};

    const loadData = () => {
        try { xp = JSON.parse(fs.readFileSync(XP_FILE, 'utf8')); } catch { xp = {}; }
        try { daily = JSON.parse(fs.readFileSync(DAILY_FILE, 'utf8')); } catch { daily = {}; }
        try { weekly = JSON.parse(fs.readFileSync(WEEKLY_FILE, 'utf8')); } catch { weekly = {}; }
        try { monthly = JSON.parse(fs.readFileSync(MONTHLY_FILE, 'utf8')); } catch { monthly = {}; }
    };
    loadData();

    const saveData = () => {
        fs.writeFileSync(XP_FILE, JSON.stringify(xp, null, 2));
        fs.writeFileSync(DAILY_FILE, JSON.stringify(daily, null, 2));
        fs.writeFileSync(WEEKLY_FILE, JSON.stringify(weekly, null, 2));
        fs.writeFileSync(MONTHLY_FILE, JSON.stringify(monthly, null, 2));
    };

    // ==========================================
    // 2. الإعدادات (Config)
    // ==========================================
    const LEVEL_CHANNEL = '1373288985199378472';
    const SUPPORT_ROLE = '1268350577499443283';
    const levelRoles = {
        5: '1269799133057777738', 10: '1269799647765991444',
        20: '1269799898921046038', 30: '1269800227855138927',
        40: '1269765734704218254', 50: '1268377832514519154'
    };

    function getLevel(xpVal) {
        let lvl = 0, need = 20;
        while (xpVal >= need) { xpVal -= need; lvl++; need *= 2; }
        return lvl;
    }

    // ==========================================
    // 3. نظام الأوامر (Rank & Top)
    // ==========================================
    async function handleCommands(msg) {
        const content = msg.content.toLowerCase().trim();
        const args = content.split(/\s+/);
        const userId = msg.author.id;

        // --- أمر Rank / رانك ---
        if (content === 'rank' || content === 'رانك') {
            const userData = xp[userId] || { text: 0, voice: 0, level: 0 };
            const embed = new EmbedBuilder()
                .setAuthor({ name: msg.author.tag, iconURL: msg.author.displayAvatarURL() })
                .setTitle('📊 إحصائيات نقاطك')
                .addFields(
                    { name: '⭐ المستوى', value: `\`${userData.level}\``, inline: true },
                    { name: '📜 نقاط الكتابي', value: `\`${userData.text}\``, inline: true },
                    { name: '🎤 نقاط الصوتي', value: `\`${userData.voice}\``, inline: true }
                )
                .setColor(0x2b2d31);
            return msg.reply({ embeds: [embed] });
        }

        // --- معالجة أوامر Top المتقدمة ---
        if (args[0] === 'top' || args[0] === 'توب') {
            let targetStore = xp;
            let timeLabel = "السيرفر";

            if (content.includes('day') || content.includes('يوم')) { targetStore = daily; timeLabel = "اليوم"; }
            else if (content.includes('week') || content.includes('اسبوع')) { targetStore = weekly; timeLabel = "الأسبوع"; }
            else if (content.includes('month') || content.includes('شهر')) { targetStore = monthly; timeLabel = "الشهر"; }

            const getSortedList = (type) => Object.entries(targetStore)
                .map(([id, v]) => ({ id, xp: v[type] || 0 }))
                .filter(u => u.xp > 0)
                .sort((a, b) => b.xp - a.xp);

            const textList = getSortedList('text');
            const voiceList = getSortedList('voice');

            const embed = new EmbedBuilder()
                .setAuthor({ name: `📋 لائحة متصدرين نقاط ${timeLabel}`, iconURL: msg.guild.iconURL() })
                .setColor(0x2b2d31)
                .setTimestamp();

            // دالة تنسيق السطر الواحد
            const formatRow = (u, i) => `#${i + 1} | <@${u.id}> XP: ${u.xp}`;

            // دالة جلب ترتيب الشخص إذا كان خارج القائمة
            const getFooterRank = (list, limit) => {
                const idx = list.findIndex(u => u.id === userId);
                if (idx !== -1 && idx >= limit) return `\n**#${idx + 1} | <@${userId}> XP: ${list[idx].xp}**`;
                return "";
            };

            // الحالة 1: توب عام (عرض 5 كتابي + 5 صوتي)
            if (args.length === 1 || (args.length === 2 && (content.includes('day') || content.includes('week') || content.includes('month')))) {
                let textContent = textList.slice(0, 5).map((u, i) => formatRow(u, i)).join('\n') || 'لا يوجد';
                let voiceContent = voiceList.slice(0, 5).map((u, i) => formatRow(u, i)).join('\n') || 'لا يوجد';

                textContent += getFooterRank(textList, 5);
                voiceContent += getFooterRank(voiceList, 5);

                embed.addFields(
                    { name: '💬 أعلى ٥ كتابياً', value: textContent + `\n\n✨ المزيد؟ \`top text ${timeLabel !== "السيرفر" ? args[1] : ""}\``, inline: true },
                    { name: '🎙️ أعلى ٥ صوتياً', value: voiceContent + `\n\n✨ المزيد؟ \`top voice ${timeLabel !== "السيرفر" ? args[1] : ""}\``, inline: true }
                );
            } 
            // الحالة 2: توب مخصص (أعلى 10)
            else {
                const isVoice = content.includes('voice') || content.includes('صوت');
                const list = isVoice ? voiceList : textList;
                const typeName = isVoice ? "صوتياً" : "كتابياً";

                let mainContent = list.slice(0, 10).map((u, i) => formatRow(u, i)).join('\n') || 'لا توجد بيانات';
                mainContent += getFooterRank(list, 10);

                embed.setTitle(`🏆 متصدرين النقاط ${typeName} (${timeLabel})`);
                embed.setDescription(mainContent);
            }

            return msg.reply({ embeds: [embed] });
        }
    }

    // ==========================================
    // 4. معالجة الرسائل (XP + Auto Replies)
    // ==========================================
    client.on('messageCreate', async msg => {
        if (msg.author.bot || !msg.guild) return;

        // تنفيذ الأوامر
        await handleCommands(msg);

                // --- الردود التلقائية المحدثة (مع خاصية الـ Reply) ---
        const autoReplies = [
            { trigger: ['سلام عليكم', 'السلام عليكم', 'سلام'], reply: 'وعليكم السلام ورحمة الله وبركاته منور/ه ❣️' },
            { trigger: ['هلا'], reply: 'اهلين منور/ه❣️' },
            { trigger: ['باك'], reply: 'ولكم منور/ه ❣️' },
            { trigger: ['-'], reply: `لا تنسى تقييمك للإداري <@${msg.author.id}> في https://discord.com`, roles: [SUPPORT_ROLE] }
        ];

        for (const r of autoReplies) {
            if (r.trigger.some(t => msg.content.includes(t))) {
                if (r.roles && !msg.member.roles.cache.has(SUPPORT_ROLE)) continue;
                
                // التعديل هنا: استخدام reply بدلاً من channel.send
                msg.reply({ content: r.reply, allowedMentions: { repliedUser: true } }).catch(() => {});
                break; 
            }
        }


        // إضافة XP الكتابي
        const xpGain = Math.floor(Math.random() * 5) + 5;
        const uid = msg.author.id;

        const updateStore = (store) => {
            if (!store[uid]) store[uid] = { text: 0, voice: 0, level: 0 };
            store[uid].text += xpGain;
        };

        [xp, daily, weekly, monthly].forEach(updateStore);

        // رفع اللفل (كتابي فقط)
        const newL = getLevel(xp[uid].text);
        if (newL > xp[uid].level) {
            const oldL = xp[uid].level;
            xp[uid].level = newL;
            
            const levelCh = client.channels.cache.get(LEVEL_CHANNEL);
            if (levelCh) levelCh.send(`ألف مبروك 🥳 <@${uid}>\nلقد انتقلت من المستوى ${oldL} إلى ${newL}\nواصل التقدم 🔥`).catch(() => {});

            if (levelRoles[newL]) {
                msg.member.roles.add(levelRoles[newL]).catch(() => {});
                const roleName = msg.guild.roles.cache.get(levelRoles[newL])?.name || "رتبة جديدة";
                msg.author.send(`مبرووك 🥳🎉، لقد وصلت للمستوى ${newL} وحصلت على الرتبة ${roleName} 🔥`).catch(() => {});
            }
        }
        saveData();
    });

    // ==========================================
    // 5. XP الصوت (Voice XP)
    // ==========================================
    const voiceTracker = new Map();

    client.on('voiceStateUpdate', (oldS, newS) => {
        const uid = newS.member.id;
        // دخول الروم
        if (!oldS.channelId && newS.channelId) {
            voiceTracker.set(uid, Date.now());
        } 
        // خروج من الروم
        else if (oldS.channelId && !newS.channelId) {
            const startTime = voiceTracker.get(uid);
            if (startTime) {
                const minutes = Math.floor((Date.now() - startTime) / 60000);
                if (minutes > 0) {
                    const xpVoice = minutes * 2;
                    [xp, daily, weekly, monthly].forEach(store => {
                        if (!store[uid]) store[uid] = { text: 0, voice: 0, level: 0 };
                        store[uid].voice += xpVoice;
                    });
                    saveData();
                }
                voiceTracker.delete(uid);
            }
        }
    });

    // ==========================================
    // 6. تصفية البيانات تلقائياً (Cron Jobs)
    // ==========================================
    cron.schedule('0 4 * * *', () => { daily = {}; saveData(); console.log('Daily XP Reset'); });
    cron.schedule('0 4 * * 0', () => { weekly = {}; saveData(); console.log('Weekly XP Reset'); });
    cron.schedule('0 4 1 * *', () => { monthly = {}; saveData(); console.log('Monthly XP Reset'); });

    console.log('✅ XP & Auto-Responder System Fully Loaded (Comprehensive Version)');
};
