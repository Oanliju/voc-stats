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

// Charger config.json si présent
if (fs.existsSync(CONFIG_PATH)) {
    try {
        config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (err) {
        console.error("⚠️ Erreur de lecture de config.json, réinitialisation...");
    }
}

// Compteurs (sans les bots)
const counters = [
    { type: 'all', format: count => `🍂ゝMembres : ${count}` },
    { type: 'online', format: count => `🌴ゝEn ligne: ${count}` },
    { type: 'voice', format: count => `🔊ゝEn vocal: ${count}` }
];

// Enregistrement des commandes
const rest = new REST({ version: '10' }).setToken(token);
const commands = [
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configure les salons de compteur')
        .addChannelOption(option =>
            option.setName('category')
                .setDescription('Catégorie où créer les salons')
                .setRequired(true))
].map(cmd => cmd.toJSON());

// --- MISE À JOUR DES COMPTEURS --- //
async function updateCounters() {
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
}

// --- DÉTECTION AUTOMATIQUE --- //
async function detectExistingCounters() {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    if (!config.categoryId) return; // Rien à détecter si pas de catégorie connue

    const category = guild.channels.cache.get(config.categoryId);
    if (!category || category.type !== ChannelType.GuildCategory) return;

    const channels = category.children.cache;
    for (const counter of counters) {
        const found = channels.find(ch => 
            ch.type === ChannelType.GuildVoice && ch.name.startsWith(counter.format('').split(':')[0])
        );
        if (found) {
            config.counters[counter.type] = found.id;
        }
    }
    saveConfig();
}

// --- SAUVEGARDE CONFIG --- //
function saveConfig() {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4));
}

// --- ÉVÉNEMENT READY --- //
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
    updateCounters();
    setInterval(updateCounters, 5 * 60 * 1000); // Mise à jour toutes les 5 min
});

// --- GESTIONNAIRE DE SLASH COMMANDS --- //
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'setup') {
        const category = interaction.options.getChannel('category');
        if (category.type !== ChannelType.GuildCategory) {
            return interaction.reply({ content: '❌ Veuillez sélectionner une catégorie valide.', ephemeral: true });
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
        await interaction.reply({ content: '✅ Salons de compteur créés et sauvegardés.', ephemeral: true });
        updateCounters();
    }
});

client.login(token);

// --- SERVEUR HTTP POUR RENDER ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Discord en fonctionnement !');
}).listen(PORT, () => {
    console.log(`🌐 Serveur HTTP actif sur le port ${PORT}`);
});
