// Umgebungsvariablen laden (wichtig: als Erstes!)
require('dotenv').config();

const { Client, GatewayIntentBits, Partials } = require('discord.js');
// const axios = require('axios'); // Wird später für Riot API benötigt

// Token aus den Umgebungsvariablen holen
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const RIOT_API_KEY = process.env.RIOT_API_KEY; // Wird später verwendet

if (!DISCORD_TOKEN) {
    console.error("FEHLER: DISCORD_TOKEN nicht in .env Datei gefunden!");
    process.exit(1);
}

// Erstelle einen neuen Client (Bot)
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Benötigt, um Nachrichteninhalt zu lesen
        // GatewayIntentBits.GuildMembers, // Ggf. später für User-Infos
    ],
    partials: [Partials.Channel, Partials.Message], // Ggf. für ältere Nachrichten
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log(`Bot ist bereit und auf ${client.guilds.cache.size} Servern aktiv.`);
    // Hier könntest du eine Aktivität setzen, z.B. "Schaut LoL-Spiele"
    client.user.setActivity('League of Legends', { type: 'WATCHING' });
});

client.on('messageCreate', async message => {
    if (message.author.bot) return; // Ignoriere Nachrichten von anderen Bots

    // Einfacher Test-Befehl
    if (message.content.toLowerCase() === '!ping') {
        message.reply('Pong!');
    }

    if (message.content.toLowerCase() === '!hallo') {
        message.channel.send(`Hallo ${message.author.username}! Riot API Key geladen: ${RIOT_API_KEY ? 'Ja' : 'Nein (bitte konfigurieren!)'}`);
    }

    // Hier kommt später die Logik für das Abrufen von LoL-Spielen hinzu
    // z.B. if (message.content.startsWith('!track')) { ... }
});

// Mit dem Discord Token einloggen
client.login(DISCORD_TOKEN)
    .catch(err => {
        console.error("Fehler beim Einloggen des Bots:", err);
        process.exit(1);
    });

// Optional: Graceful Shutdown
process.on('SIGINT', () => {
    console.log("Bot wird heruntergefahren...");
    client.destroy();
    process.exit(0);
});