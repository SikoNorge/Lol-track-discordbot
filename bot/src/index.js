// Umgebungsvariablen laden (wichtig: als Erstes!)
require('dotenv').config();
const axios = require('axios');

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

    const prefix = '!'; // Definiere ein Prefix für deine Befehle
    if (message.content.startsWith(`${prefix}summoner`)) {
        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase(); // 'summoner'
        const summonerName = args.join(' '); // Der Rest ist der Summoner Name

        if (!summonerName) {
            return message.reply('Bitte gib einen Summoner-Namen an! Beispiel: `!summoner Dein Name`');
        }

        if (!RIOT_API_KEY) {
            return message.reply('Der Riot API Key ist nicht konfiguriert. Bitte den Bot-Admin informieren.');
        }

        // Wähle deine Region. Beispiele: euw1, eun1, na1, kr, etc.
        // Du könntest dies auch per Befehl oder Konfiguration änderbar machen.
        const regionPlatform = 'euw1'; // z.B. EU West
        const regionRouting = 'europe'; // z.B. europe, americas, asia für Match-V5

        try {
            const apiUrl = `https://${regionPlatform}.api.riotgames.com/lol/summoner/v4/summoners/by-name/${encodeURIComponent(summonerName)}`;

            message.channel.send(`Suche nach Summoner: ${summonerName}...`);

            const response = await axios.get(apiUrl, {
                headers: {
                    "X-Riot-Token": RIOT_API_KEY
                }
            });

            const summonerData = response.data;
            const replyMessage = `
            Summoner gefunden:
            Name: ${summonerData.name}
            Level: ${summonerData.summonerLevel}
            Account ID: ${summonerData.accountId}
            PUUID: ${summonerData.puuid} 
            `;
            // PUUID ist SEHR wichtig für spätere Abfragen (z.B. Match History)
            message.channel.send(`\`\`\`${replyMessage}\`\`\``);

        } catch (error) {
            console.error("Fehler bei der Riot API Anfrage:", error.response ? error.response.data : error.message);
            if (error.response) {
                if (error.response.status === 404) {
                    message.reply(`Summoner "${summonerName}" nicht gefunden in Region ${regionPlatform}.`);
                } else if (error.response.status === 403) {
                    message.reply('Riot API Key ist ungültig oder hat keine Berechtigung (Forbidden).');
                } else if (error.response.status === 429) {
                    message.reply('Riot API Rate Limit erreicht. Bitte später erneut versuchen.');
                } else {
                    message.reply(`Fehler bei der Riot API Anfrage: Status ${error.response.status}`);
                }
            } else {
                message.reply('Ein unbekannter Fehler ist bei der Kommunikation mit der Riot API aufgetreten.');
            }
        }
    }
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