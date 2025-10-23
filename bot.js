const { 
    Client, 
    GatewayIntentBits, 
    SlashCommandBuilder, 
    Routes, 
    REST, 
    ActivityType, 
    ChannelType, 
    PermissionFlagsBits 
} = require('discord.js');
const fs = require('fs');
const http = require('http');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;

// --- CONFIGURATION --- //
const CONFIG_PATH = './config.json';
let config = { categoryId: null, counters: {} };

function loadConfig() {
    if (fs.existsSync(CONFIG_PATH)) {
        try {
            config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            console.log("📁 Configuration rechargée :", config);
        } catch (err) {
            console.error("⚠️ Erreur de lecture de config.json :", err);
        }
    }
}
loadConfig();

const counters = [
    { type: 'all', format: count => `🍂ゝMembres : ${count}` },
    { type: 'online', format: count => `🍡ゝEn ligne: ${count}` },
    { type: 'voice', format: count => `👒ゝEn vocal: ${count}` }
];

const rest = new REST({ version: '10' }).setToken(token);
const commands = [
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configure les salons de compteur')
        .addChannelOption(option =>
            option.setName('category')
                .setDescription('Catégorie où créer les salons')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('update')
        .setDescription('Met à jour les compteurs immédiatement et relance le timer')
].map(cmd => cmd.toJSON());

// --- FONCTIONS --- //
async function updateCounters() {
    loadConfig();
    const guild = client.guilds.cache.first();
    if (!guild) return;

    await guild.members.fetch();
    await guild.channels.fetch();

    const totalMembers = guild.memberCount;
    const onlineMembers = guild.members.cache.filter(m => 
        m.presence?.status === 'online' || 
        m.presence?.status === 'idle' || 
        m.presence?.status === 'dnd'
    ).size;
    const inVoice = guild.members.cache.filter(m => m.voice.channel).size;

    const stats = { all: totalMembers, online: onlineMembers, voice: inVoice };

    for (const [type, channelId] of Object.entries(config.counters)) {
        const channel = guild.channels.cache.get(channelId);
        const format = counters.find(c => c.type === type)?.format;
        if (channel && format) {
            await channel.setName(format(stats[type])).catch(console.error);
        }
    }

    console.log("🔁 Compteurs mis à jour :", stats);
}

async function detectExistingCounters() {
    const guild = client.guilds.cache.first();
    if (!guild || !config.categoryId) return;

    const category = guild.channels.cache.get(config.categoryId);
    if (!category || category.type !== ChannelType.GuildCategory) return;

    const channels = category.children.cache;
    for (const counter of counters) {
        const found = channels.find(ch => 
            ch.type === ChannelType.GuildVoice && ch.name.startsWith(counter.format('').split(':')[0])
        );
        if (found) config.counters[counter.type] = found.id;
    }
    saveConfig();
}

function saveConfig() {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4));
}

let updateInterval = null;
function restartUpdateTimer() {
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(updateCounters, 5 * 60 * 1000);
    console.log("⏰ Nouveau timer lancé (5 minutes)");
}

// --- READY --- //
client.once('ready', async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);
    client.user.setActivity('pourtoi', { type: ActivityType.Watching });

    try {
        await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
        console.log('✅ Commandes enregistrées.');
    } catch (error) {
        console.error('⚠️ Erreur lors de l’enregistrement des commandes :', error);
    }

    await detectExistingCounters();
    await updateCounters();
    restartUpdateTimer();
});

// --- COMMANDES --- //
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    try {
        if (interaction.commandName === 'setup') {
            const category = interaction.options.getChannel('category');
            if (category.type !== ChannelType.GuildCategory) {
                return interaction.reply({ content: '❌ Veuillez sélectionner une catégorie valide.', flags: 64 });
            }

            config.categoryId = category.id;
            config.counters = {};

            for (const counter of counters) {
                const channel = await interaction.guild.channels.create({
                    name: counter.format(0),
                    type: ChannelType.GuildVoice,
                    parent: category.id,
                    permissionOverwrites: [
                        { id: interaction.guild.id, deny: [PermissionFlagsBits.Connect] }
                    ]
                });
                config.counters[counter.type] = channel.id;
            }

            saveConfig();
            await interaction.reply({ content: '✅ Salons de compteur créés et sauvegardés.', flags: 64 });
            await updateCounters();
            restartUpdateTimer();
        }

        if (interaction.commandName === 'update') {
            await interaction.reply({ content: '🔄 Mise à jour en cours...', flags: 64 });
            await updateCounters();
            restartUpdateTimer();
            await interaction.editReply('✅ Compteurs mis à jour et timer relancé.');
        }
    } catch (err) {
        console.error('❌ Erreur sur interaction :', err);
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply('⚠️ Une erreur est survenue.');
        } else {
            await interaction.reply({ content: '⚠️ Une erreur est survenue.', flags: 64 });
        }
    }
});

// --- SERVEUR HTTP POUR RENDER --- //
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Discord en fonctionnement !');
}).listen(PORT, () => {
    console.log(`🌐 Serveur HTTP actif sur le port ${PORT}`);
});

client.login(token);
