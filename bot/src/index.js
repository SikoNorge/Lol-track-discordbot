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
        const args = message.content.slice(prefix.length).trim().split('#');
        const gameName = args[0] ? args[0].trim() : null;
        const tagLine = args[1] ? args[1].trim() : null;

        if (!gameName || !tagLine) {
            return message.reply('Bitte gib eine vollständige Riot ID an! Beispiel: `!summoner SpielerName#TAG`');
        }

        if (!RIOT_API_KEY) {
            return message.reply('Der Riot API Key ist nicht konfiguriert. Bitte den Bot-Admin informieren.');
        }

        // Wähle deine Region. Beispiele: euw1, eun1, na1, kr, etc.
        // Du könntest dies auch per Befehl oder Konfiguration änderbar machen.
        const regionPlatform = 'euw1'; // z.B. EU West
        const regionRouting = 'europe'; // z.B. europe, americas, asia für Match-V5

        try {
            // Schritt 1: PUUID über Riot ID (gameName#tagLine) abrufen
            const accountApiUrl = `https://${regionPlatform}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;

            message.channel.send(`Suche nach Riot ID: ${gameName}#${tagLine}...`);

            const accountResponse = await axios.get(accountApiUrl, {
                headers: {
                    "X-Riot-Token": RIOT_API_KEY
                }
            });

            const puuid = accountResponse.data.puuid;
            if (!puuid) {
                return message.reply(`Konnte keine PUUID für ${gameName}#${tagLine} finden.`);
            }

            let replyMessage = `Riot ID: ${accountResponse.data.gameName}#${accountResponse.data.tagLine}\nPUUID: ${puuid}\n`;

            // Schritt 2: LoL-spezifische Summoner-Daten mit der PUUID abrufen
            try {
                const summonerApiUrl = `https://${regionRouting}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
                const summonerResponse = await axios.get(summonerApiUrl, {
                    headers: {
                        "X-Riot-Token": RIOT_API_KEY
                    }
                });
                const summonerData = summonerResponse.data;
                replyMessage += `LoL Name: ${summonerData.name}\nLevel: ${summonerData.summonerLevel}\nAccount ID (LoL): ${summonerData.accountId}`;

            } catch (summonerError) {
                console.error("Fehler beim Abrufen der LoL Summoner-Daten:", summonerError.response ? summonerError.response.data : summonerError.message);
                replyMessage += "\nKonnte zusätzliche LoL-Summoner-Daten nicht abrufen.";
                // Hier nicht abbrechen, PUUID ist trotzdem nützlich
            }

            message.channel.send(`\`\`\`${replyMessage}\`\`\``);

        } catch (error) {
            console.error("Fehler bei der Riot API Anfrage (Account API):", error.response ? error.response.data : error.message);
            if (error.response) {
                if (error.response.status === 404) {
                    message.reply(`Riot ID "${gameName}#${tagLine}" nicht gefunden.`);
                } else if (error.response.status === 403) {
                    message.reply('Riot API Key ist ungültig, abgelaufen oder hat keine Berechtigung (Forbidden). Bitte überprüfe deinen Key im Riot Developer Portal!');
                } else if (error.response.status === 429) {
                    message.reply('Riot API Rate Limit erreicht. Bitte später erneut versuchen.');
                } else {
                    message.reply(`Fehler bei der Riot API Anfrage (Account API): Status ${error.response.status}`);
                }
            } else {
                message.reply('Ein unbekannter Fehler ist bei der Kommunikation mit der Riot API (Account API) aufgetreten.');
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