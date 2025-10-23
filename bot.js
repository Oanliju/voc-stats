const {
    Client,
    GatewayIntentBits,
    Partials,
    ChannelType,
    PermissionFlagsBits,
    REST,
    Routes,
    SlashCommandBuilder,
    ActivityType
} = require("discord.js");
const fs = require("fs");
const http = require("http");
require("dotenv").config();

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CONFIG_PATH = "./config.json";

// --- INITIALISATION DU CLIENT ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.GuildMember]
});

let config = { categoryId: null, counters: {} };

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
            console.log("📁 Config chargée :", config);
        } else {
            console.log("⚠️ Aucun fichier config.json trouvé.");
        }
    } catch (err) {
        console.error("❌ Erreur de lecture de la config :", err);
    }
}

function saveConfig() {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4));
    console.log("💾 Config sauvegardée :", config);
}

// --- COMMANDE SLASH ---
const commands = [
    new SlashCommandBuilder()
        .setName("setup")
        .setDescription("Créer les salons de stats")
        .addChannelOption(opt =>
            opt
                .setName("categorie")
                .setDescription("Catégorie cible")
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName("update")
        .setDescription("Force la mise à jour des stats")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

// --- CALCUL DES STATS ---
async function updateCounters() {
    console.log("\n=== 🔄 Début updateCounters() ===");
    loadConfig();

    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) {
        console.error("❌ Impossible de trouver la guilde !");
        return;
    }

    console.log("📋 Fetch des membres et présences...");
    await guild.members.fetch().catch(console.error);

    const totalMembers = guild.memberCount;
    const onlineMembers = guild.members.cache.filter(
        m =>
            m.presence &&
            ["online", "idle", "dnd"].includes(m.presence.status)
    ).size;
    const inVoice = guild.members.cache.filter(m => m.voice.channel).size;

    console.log("📊 Stats calculées :", {
        totalMembers,
        onlineMembers,
        inVoice
    });

    const formats = {
        all: `🍂ゝMembres : ${totalMembers}`,
        online: `🍡ゝEn ligne : ${onlineMembers}`,
        voice: `👒ゝEn vocal : ${inVoice}`
    };

    for (const [key, id] of Object.entries(config.counters)) {
        const ch = guild.channels.cache.get(id);
        if (!ch) {
            console.log(`⚠️ Salon manquant pour ${key}`);
            continue;
        }
        const newName = formats[key];
        console.log(`🔧 Mise à jour du salon ${key} → ${newName}`);
        await ch.setName(newName).catch(console.error);
    }

    console.log("✅ Fin de mise à jour.\n");
}

// --- SETUP DES SALONS ---
async function setupCounters(interaction) {
    const category = interaction.options.getChannel("categorie");
    if (!category || category.type !== ChannelType.GuildCategory) {
        return interaction.reply({
            content: "❌ Catégorie invalide.",
            ephemeral: true
        });
    }

    config.categoryId = category.id;
    config.counters = {};

    const formats = {
        all: "🍂ゝMembres : 0",
        online: "🍡ゝEn ligne : 0",
        voice: "👒ゝEn vocal : 0"
    };

    for (const [key, name] of Object.entries(formats)) {
        const ch = await interaction.guild.channels.create({
            name,
            type: ChannelType.GuildVoice,
            parent: category.id,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.Connect] }
            ]
        });
        config.counters[key] = ch.id;
        console.log(`🆕 Salon créé pour ${key} (${ch.id})`);
    }

    saveConfig();
    await interaction.reply({
        content: "✅ Salons créés avec succès.",
        ephemeral: true
    });
    await updateCounters();
}

// --- INTERACTIONS ---
client.on("interactionCreate", async interaction => {
    if (!interaction.isCommand()) return;
    try {
        if (interaction.commandName === "setup") await setupCounters(interaction);
        else if (interaction.commandName === "update") {
            await interaction.reply({
                content: "🔄 Mise à jour en cours...",
                ephemeral: true
            });
            await updateCounters();
            await interaction.editReply("✅ Compteurs mis à jour !");
        }
    } catch (err) {
        console.error("❌ Erreur interaction :", err);
        if (!interaction.replied)
            await interaction.reply({
                content: "⚠️ Erreur lors de l’exécution.",
                ephemeral: true
            });
    }
});

// --- READY EVENT ---
client.once("ready", async () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);
    client.user.setActivity("pourtoi", {
        type: ActivityType.Watching
    });

    try {
        await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), {
            body: commands
        });
        console.log("✅ Commandes slash enregistrées !");
    } catch (err) {
        console.error("❌ Erreur commandes :", err);
    }

    loadConfig();
    await updateCounters();

    setInterval(updateCounters, 5 * 60 * 1000);
    console.log("⏰ Mise à jour programmée toutes les 5 minutes !");
});

// --- SERVEUR HTTP (Render) ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Bot Discord en ligne !");
}).listen(PORT, () => console.log(`🌐 Serveur HTTP sur le port ${PORT}`));

client.login(TOKEN);
