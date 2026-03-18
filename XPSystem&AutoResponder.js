const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');

module.exports = function(client) {
    // ===== FILES & STORAGE =====
    const XP_FILE = path.join(__dirname, 'xp_data.json');
    const DAILY_FILE = path.join(__dirname, 'xp_daily.json');
    const WEEKLY_FILE = path.join(__dirname, 'xp_weekly.json');
    const MONTHLY_FILE = path.join(__dirname, 'xp_monthly.json');

    let xp = {}, daily = {}, weekly = {}, monthly = {};

    const loadData = (file, target) => {
        try { return JSON.parse(fs.readFileSync(file)); } catch { return {}; }
    };

    xp = loadData(XP_FILE);
    daily = loadData(DAILY_FILE);
    weekly = loadData(WEEKLY_FILE);
    monthly = loadData(MONTHLY_FILE);

    const save = () => fs.writeFileSync(XP_FILE, JSON.stringify(xp, null, 2));
    const saveDaily = () => fs.writeFileSync(DAILY_FILE, JSON.stringify(daily, null, 2));
    const saveWeekly = () => fs.writeFileSync(WEEKLY_FILE, JSON.stringify(weekly, null, 2));
    const saveMonthly = () => fs.writeFileSync(MONTHLY_FILE, JSON.stringify(monthly, null, 2));

    // ===== CONFIG & HELPERS =====
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

    async function levelUp(member, oldL, newL) {
        const ch = client.channels.cache.get(LEVEL_CHANNEL);
        if (ch) ch.send(`ألف مبروك 🥳 <@${member.id}>\nلقد انتقلت من المستوى ${oldL} إلى ${newL}\nواصل التقدم 🔥`).catch(()=>{});
        
        if (levelRoles[newL]) {
            try {
                await member.roles.add(levelRoles[newL]);
                const role = member.guild.roles.cache.get(levelRoles[newL]);
                await member.send(`مبرووك 🥳🎉، لقد وصلت للمستوى ${newL} وحصلت على رتبة ${role ? role.name : ''} 🔥`).catch(()=>{});
            } catch(e) {}
        }
    }

    function addXP(id, amount, type = 'text', member) {
        if (!xp[id]) xp[id] = { text: 0, voice: 0, level: 0 };
        xp[id][type] += amount;

        // المستوى يعتمد على الكتابي فقط بناءً على طلبك
        if (type === 'text') {
            const newL = getLevel(xp[id].text);
            if (newL > xp[id].level) {
                const oldL = xp[id].level;
                xp[id].level = newL;
                levelUp(member, oldL, newL);
            }
        }
        save();
    }

    // ===== AUTO REPLIES =====
    const autoReplies = [
        { trigger: ['سلام عليكم','السلام عليكم','صباح الخير'], reply: 'وعليكم السلام ورحمة الله وبركاته منور/ه ❣️' },
        { trigger: ['هلا'], reply: 'اهلين منور/ه❣️' },
        { trigger: ['باك'], reply: 'ولكم منور/ه ❣️' },
        { trigger: ['-'], reply: 'ADMIN_REPLY', roles: [SUPPORT_ROLE] }
    ];

    client.on('messageCreate', async msg => {
        if (msg.author.bot || !msg.guild) return;

        // Auto Responder Logic
        for (const r of autoReplies) {
            if (r.trigger.some(t => msg.content.includes(t))) {
                if (r.roles && !msg.member.roles.cache.has(SUPPORT_ROLE)) continue;
                
                let content = r.reply;
                if (content === 'ADMIN_REPLY') {
                    content = `لا تنسى تقييمك للإداري <@${msg.author.id}> في https://discord.com`;
                }
                msg.channel.send(content).catch(()=>{});
                break;
            }
        }

        // XP Logic
        const xpAmount = Math.floor(Math.random() * 5) + 5;
        addXP(msg.author.id, xpAmount, 'text', msg.member);
    });

    // ===== VOICE XP =====
    const voiceTime = new Map();
    client.on('voiceStateUpdate', (oldState, newState) => {
        const member = newState.member;
        if (!oldState.channelId && newState.channelId) {
            voiceTime.set(member.id, Date.now());
        } else if (oldState.channelId && !newState.channelId) {
            const start = voiceTime.get(member.id);
            if (start) {
                const duration = Math.floor((Date.now() - start) / 60000);
                if (duration > 0) addXP(member.id, duration * 2, 'voice', member);
                voiceTime.delete(member.id);
            }
        }
    });

    // ===== RESET CRON =====
    cron.schedule('0 4 * * *', () => { daily = {}; saveDaily(); });
    cron.schedule('0 4 * * 0', () => { weekly = {}; saveWeekly(); });
    cron.schedule('0 4 1 * *', () => { monthly = {}; saveMonthly(); });

    console.log('✅ XP System & Auto Responder Loaded');
};
