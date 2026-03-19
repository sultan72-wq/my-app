const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');

module.exports = function(client) {
    // ==========================================
    // 1. تعريف مسارات الملفات والبيانات
    // ==========================================
    const XP_FILE = path.join(__dirname, 'xp_data.json');
    const DAILY_FILE = path.join(__dirname, 'xp_daily.json');
    const WEEKLY_FILE = path.join(__dirname, 'xp_weekly.json');
    const MONTHLY_FILE = path.join(__dirname, 'xp_monthly.json');

    let xp = {}, daily = {}, weekly = {}, monthly = {};

    // دالة تحميل البيانات من الملفات
    const loadData = () => {
        try { if (fs.existsSync(XP_FILE)) xp = JSON.parse(fs.readFileSync(XP_FILE, 'utf8')); } catch { xp = {}; }
        try { if (fs.existsSync(DAILY_FILE)) daily = JSON.parse(fs.readFileSync(DAILY_FILE, 'utf8')); } catch { daily = {}; }
        try { if (fs.existsSync(WEEKLY_FILE)) weekly = JSON.parse(fs.readFileSync(WEEKLY_FILE, 'utf8')); } catch { weekly = {}; }
        try { if (fs.existsSync(MONTHLY_FILE)) monthly = JSON.parse(fs.readFileSync(MONTHLY_FILE, 'utf8')); } catch { monthly = {}; }
    };
    loadData();

    // دالة حفظ البيانات في الملفات
    const saveData = () => {
        fs.writeFileSync(XP_FILE, JSON.stringify(xp, null, 2));
        fs.writeFileSync(DAILY_FILE, JSON.stringify(daily, null, 2));
        fs.writeFileSync(WEEKLY_FILE, JSON.stringify(weekly, null, 2));
        fs.writeFileSync(MONTHLY_FILE, JSON.stringify(monthly, null, 2));
    };

    // ==========================================
    // 2. الإعدادات والرتب
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

        // --- أمر Rank ---
        if (content === 'rank' || content === 'رانك') {
            const userData = xp[userId] || { text: 0, voice: 0, level: 0 };
            const embed = new EmbedBuilder()
                .setAuthor({ name: msg.author.tag, iconURL: msg.author.displayAvatarURL() })
                .setTitle('📊 إحصائيات نقاطك')
                .addFields(
                    { name: '⭐ المستوى', value: `\`${userData.level}\``, inline: true },
                    { name: '📜 نقاط الكتابي', value: `\`${userData.text}\``, inline: true },
                    { name: '🎤 نقاط الصوتي', value: `\`${userData.voice}\``, inline: true }
                ).setColor(0x2b2d31);
            return msg.reply({ embeds: [embed] });
        }

        // --- نظام التوب المتطور ---
        if (args[0] === 'top','Top' || args[0] === 'توب') {
            let targetStore = xp;
            let timeLabel = "السيرفر";

            if (content.includes('day')) { targetStore = daily; timeLabel = "اليوم"; }
            else if (content.includes('week')) { targetStore = weekly; timeLabel = "الأسبوع"; }
            else if (content.includes('month')) { targetStore = monthly; timeLabel = "الشهر"; }

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

            const formatRow = (u, i) => `#${i + 1} | <@${u.id}> XP: ${u.xp}`;
            const getFooterRank = (list, limit) => {
                const idx = list.findIndex(u => u.id === userId);
                return (idx !== -1 && idx >= limit) ? `\n**#${idx + 1} | <@${userId}> XP: ${list[idx].xp}**` : "";
            };

            // الحالة 1: توب عام (عرض 5 كتابي + 5 صوتي)
            if (args.length === 1 || (args.length === 2 && (content.includes('day') || content.includes('week') || content.includes('month')))) {
                let textVal = textList.slice(0, 5).map((u, i) => formatRow(u, i)).join('\n') || 'لا يوجد';
                let voiceVal = voiceList.slice(0, 5).map((u, i) => formatRow(u, i)).join('\n') || 'لا يوجد';
                
                textVal += getFooterRank(textList, 5);
                voiceVal += getFooterRank(voiceList, 5);

                embed.addFields(
                    { name: '💬 أعلى ٥ كتابياً', value: textVal + `\n\n✨ المزيد؟ \`top text\``, inline: true },
                    { name: '🎙️ أعلى ٥ صوتياً', value: voiceVal + `\n\n✨ المزيد؟ \`top voice\``, inline: true }
                );
            } 
            // الحالة 2: توب مخصص (أعلى 10)
            else {
                const isVoice = content.includes('voice');
                const list = isVoice ? voiceList : textList;
                let mainContent = list.slice(0, 10).map((u, i) => formatRow(u, i)).join('\n') || 'لا توجد بيانات';
                mainContent += getFooterRank(list, 10);
                embed.setTitle(`🏆 متصدرين النقاط ${isVoice ? "صوتياً" : "كتابياً"} (${timeLabel})`).setDescription(mainContent);
            }
            return msg.reply({ embeds: [embed] });
        }
    }

    // ==========================================
    // 4. معالجة الرسائل (XP + الردود التلقائية)
    // ==========================================
    client.on('messageCreate', async msg => {
    if (msg.author.bot || !msg.guild) return;

    // تنفيذ الأوامر النصية
    await handleCommands(msg);

    // قائمة الردود التلقائية
    const autoReplies = [
        { trigger: ['السلام عليكم', 'سلام عليكم', 'السلام عليكم ورحمة الله وبركاته', 'السلام عليكم ورحمه الله وبركاته', 'سلام عليكم ورحمة الله وبركاته', 'سلام عليكم ورحمه الله وبركاته'], reply: 'وعليكم السلام ورحمة الله وبركاته منور/ه ❣️' },
        { trigger: ['هلا'], reply: 'اهلين منور/ه❣️' },
        { trigger: ['باك'], reply: 'ولكم منور/ه ❣️' },
        { trigger: ['-'], reply: `لا تنسى تقييمك للإداري <@${msg.author.id}> في https://discord.com/channels/1225825173358379131/1367573165898862602`, roles: [SUPPORT_ROLE] },
        { trigger: ['رابط'], reply: 'https://discord.gg/znkKxAsWWh', adminOnly: true },
        { trigger: ['شعار'], reply: '! 𝗠𝟳 -', roles: [SUPPORT_ROLE] }
    ];

    // تنظيف نص الرسالة من المسافات الزائدة (قبل وبعد الكلمة)
    const messageContent = msg.content.trim();

    for (const r of autoReplies) {
        // التعديل هنا: نتحقق إذا كان نص الرسالة كاملاً موجوداً ضمن الـ trigger
        if (r.trigger.includes(messageContent)) {
            
            // فحص صلاحية الأدمن
            if (r.adminOnly && !msg.member.permissions.has('Administrator')) continue;
            
            // فحص رتبة الدعم الفني
            if (r.roles && !msg.member.roles.cache.has(SUPPORT_ROLE)) continue;
            
            msg.reply({ content: r.reply }).catch(() => {});
            break; 
        }
    }
        // إضافة XP الكتابي (عشوائي بين 5 و 10)
        const xpGain = Math.floor(Math.random() * 6) + 5;
        const uid = msg.author.id;

        const updateAllStores = (store) => {
            if (!store[uid]) store[uid] = { text: 0, voice: 0, level: 0 };
            store[uid].text += xpGain;
        };

        [xp, daily, weekly, monthly].forEach(updateAllStores);

        // نظام رفع المستوى (كتابي فقط)
        const currentXP = xp[uid].text;
        const newL = getLevel(currentXP);
        if (newL > xp[uid].level) {
            const oldL = xp[uid].level;
            xp[uid].level = newL;
            
         const levelCh = client.channels.cache.get(LEVEL_CHANNEL);
         if (levelCh) {
         levelCh.send(`تهانينا، <@${uid}>! 🥳🎉\nلقد انتقلت من المستوى **${newL - 1}** إلى المستوى **${newL}** 🔥\nاستمر يا وحش 🫡`)
         .catch(() => {});
         }



        if (levelRoles[newL]) {
        msg.member.roles.add(levelRoles[newL]).catch(() => {});
        const role = msg.guild.roles.cache.get(levelRoles[newL]);
        const roleName = role ? role.name : 'جديدة';

        const levelUpEmbed = {
        color: 0xa30000, // اللون الذي اخترته (أحمر داكن)
        title: 'ارتفاع مستوى 🔥',
        description: `مبرووك 🥳🎉\nلقد ارتقيت للمستوى **${newL}** فحصلت على رتبة **${roleName}** 🔥\nنتمنى لك المزيد من التقدم 🫡`,
        timestamp: new Date(),
    };

        msg.author.send({ embeds: [levelUpEmbed] }).catch(() => {});
              }
        }
            
        saveData();
    });

    // ==========================================
    // 5. نظام XP الصوت (Voice XP)
    // ==========================================
    const voiceTracker = new Map();

    client.on('voiceStateUpdate', (oldS, newS) => {
        const uid = newS.member.id;
        // دخول الروم الصوتي
        if (!oldS.channelId && newS.channelId) {
            voiceTracker.set(uid, Date.now());
        } 
        // خروج من الروم الصوتي
        else if (oldS.channelId && !newS.channelId) {
            const startTime = voiceTracker.get(uid);
            if (startTime) {
                const minutes = Math.floor((Date.now() - startTime) / 60000);
                if (minutes > 0) {
                    const totalVoiceXP = minutes * 2;
                    [xp, daily, weekly, monthly].forEach(store => {
                        if (!store[uid]) store[uid] = { text: 0, voice: 0, level: 0 };
                        store[uid].voice += totalVoiceXP;
                    });
                    saveData();
                }
                voiceTracker.delete(uid);
            }
        }
    });

    // ==========================================
    // 6. الجدولة الزمنية للتصفيات (Reset)
    // ==========================================
    cron.schedule('0 4 * * *', () => { daily = {}; saveData(); }); // يومي 4 فجراً
    cron.schedule('0 4 * * 0', () => { weekly = {}; saveData(); }); // أسبوعي الأحد
    cron.schedule('0 4 1 * *', () => { monthly = {}; saveData(); }); // شهري يوم 1

    console.log('✅ XPSystem & AutoResponder Fully Loaded!');
};
