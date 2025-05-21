// index.js
require('dotenv').config(); // Umgebungsvariablen aus .env laden
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionsBitField } = require('discord.js');
const axios = require('axios');
const { calculateUtilityScore } = require('./utils/utilityCalculator'); // Importiere die ausgelagerte Funktion

const FOCUS_DATA_PATH = path.join(__dirname, 'focus_player_data.json');
// WICHTIG: Ersetze "der-einzig-wahre-talk" durch die ECHTE numerische ID deines Kanals
// oder lasse das Array leer: const ALLOWED_CHANNEL_IDS = []; um die Beschränkung aufzuheben.
const ALLOWED_CHANNEL_IDS = ["1374125421460852916"];

// --- Helferfunktionen für Datenspeicherung ---
function loadFocusData() {
    try {
        if (fs.existsSync(FOCUS_DATA_PATH)) {
            const data = fs.readFileSync(FOCUS_DATA_PATH, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error("Fehler beim Laden der focus_player_data.json:", error);
    }
    return {};
}

function saveFocusData(data) {
    try {
        fs.writeFileSync(FOCUS_DATA_PATH, JSON.stringify(data, null, 4), 'utf8');
    } catch (error) {
        console.error("Fehler beim Speichern der focus_player_data.json:", error);
    }
}

let focusData = loadFocusData();

// --- Konfiguration und Client Initialisierung ---
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const RIOT_API_KEY = process.env.RIOT_API_KEY;

if (!DISCORD_TOKEN) {
    console.error("FEHLER: DISCORD_TOKEN nicht in .env Datei gefunden! Bot kann nicht starten.");
    process.exit(1);
}
if (!RIOT_API_KEY) {
    console.warn("WARNUNG: RIOT_API_KEY nicht in .env Datei gefunden! Riot API Anfragen werden fehlschlagen.");
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
});

const LOL_DDRAGON_VERSION = "15.10.1"; // Regelmäßig prüfen und anpassen!
const POLLING_INTERVAL_MS = 2 * 1000; // 20 sekunden
const MATCHES_TO_CHECK_PER_POLL = 5;
const MAX_RECENT_GAMES = 10;

// --- Helferfunktion für Win/Loss Text ---
function winStatus(win) {
    return win ? "Sieg" : "Niederlage";
}

// --- Funktion zum Analysieren und Posten eines einzelnen Spiels ---
async function analyzeAndPostMatch(matchId, puuid, targetChannel, playerInfo, isInitialFocusAnalysis = false, fromPolling = false) {
    if (!RIOT_API_KEY) {
        console.error("[analyzeAndPostMatch] RIOT_API_KEY nicht verfügbar.");
        if (targetChannel) await targetChannel.send("Fehler: Riot API Key nicht konfiguriert.").catch(console.error);
        return null;
    }
    const matchApiRoutingValue = playerInfo.apiRoutingValue || 'europe';

    try {
        const matchDetailsApiUrl = `https://${matchApiRoutingValue}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
        const matchDetailsResponse = await axios.get(matchDetailsApiUrl, { headers: { "X-Riot-Token": RIOT_API_KEY } });
        const matchData = matchDetailsResponse.data;

        if (!matchData || !matchData.info || !matchData.info.gameEndTimestamp) {
            console.log(`[analyzeAndPostMatch] Match ${matchId} unvollständig oder ohne End-Timestamp. Überspringe.`);
            return null;
        }
        const playerStats = matchData.info.participants.find(p => p.puuid === puuid);
        if (!playerStats) {
            console.log(`[analyzeAndPostMatch] Spielerdaten für PUUID ${puuid} nicht im Match ${matchId} gefunden.`);
            return null;
        }

        const kills = playerStats.kills;
        const deaths = playerStats.deaths;
        const assists = playerStats.assists;
        let kdaRatio = deaths === 0 ? (kills + assists) * 1.2 : (kills + assists) / deaths; // Kleiner Bonus für keine Tode, wenn Assists/Kills da sind
        if (deaths === 0 && (kills > 0 || assists > 0) && kdaRatio === 0) kdaRatio = (kills + assists) * 1.2;


        const totalDamageToChampions = playerStats.totalDamageDealtToChampions;
        const goldEarned = playerStats.goldEarned;
        const totalGameDamageAllPlayers = matchData.info.participants.reduce((sum, p) => sum + p.totalDamageDealtToChampions, 0);
        const averageGameDamage = matchData.info.participants.length > 0 ? Math.round(totalGameDamageAllPlayers / matchData.info.participants.length) : 0;
        const totalGameGoldAllPlayers = matchData.info.participants.reduce((sum, p) => sum + p.goldEarned, 0);
        const averageGameGold = matchData.info.participants.length > 0 ? Math.round(totalGameGoldAllPlayers / matchData.info.participants.length) : 0;

        // HIER wird die ausgelagerte Funktion aufgerufen!
        const utilityScore = calculateUtilityScore(playerStats, matchData.info.participants, matchData.info.gameDuration);

        const isGoodKDA = kdaRatio > 1;
        let specialKdaMessage = isGoodKDA ? "**WAS EINE KD VON ÜBER 1?!?!?!** 🔥\n" : "";
        let gameResponseMessage = isGoodKDA ? "🎉 Super Runde! 🎉" : "Da war der Kopf wohl nicht auf Hochtouren!";
        if (deaths === 0 && (kills > 0 || assists > 0)) gameResponseMessage = "✨ PERFEKTE KDA! ✨";

        const embedTitlePrefix = fromPolling ? "Neues Spiel entdeckt: " : (isInitialFocusAnalysis ? "Analyse Spiel: " : "");

        const embed = new EmbedBuilder()
            .setTitle(`${embedTitlePrefix}${playerStats.championName} - ${matchData.info.gameMode}`)
            .setColor(utilityScore >= 7.5 ? '#34A853' : (utilityScore >= 4.5 ? '#FBBC05' : '#EA4335')) // Grün >=7.5, Gelb >=4.5, sonst Rot
            .setDescription(`${specialKdaMessage}${winStatus(playerStats.win)} (${Math.floor(matchData.info.gameDuration / 60)}m ${matchData.info.gameDuration % 60}s)\n*${gameResponseMessage}*`)
            .setThumbnail(`http://ddragon.leagueoflegends.com/cdn/${LOL_DDRAGON_VERSION}/img/champion/${playerStats.championName}.png`)
            .addFields(
                { name: 'K/D/A', value: `${kills}/${deaths}/${assists} (${kdaRatio.toFixed(2)})`, inline: true },
                { name: 'Nützlichkeit', value: `**${utilityScore} / 10**`, inline: true },
                { name: 'Schaden an Champs', value: `${totalDamageToChampions.toLocaleString('de-DE')} (Avg: ${averageGameDamage.toLocaleString('de-DE')})`, inline: false }, // inline: false für mehr Platz
                { name: 'Gold', value: `${goldEarned.toLocaleString('de-DE')} (Avg: ${averageGameGold.toLocaleString('de-DE')})`, inline: true },
                { name: 'Vision Score', value: playerStats.visionScore.toString(), inline: true },
                { name: 'Objective Dmg', value: (playerStats.damageDealtToObjectives || 0).toLocaleString('de-DE'), inline: true }
            )
            .setTimestamp(new Date(matchData.info.gameEndTimestamp))
            .setFooter({ text: `Match ID: ${matchId} | Für ${playerInfo.riotId}` });

        if (targetChannel) await targetChannel.send({ embeds: [embed] }).catch(console.error);

        return { matchId, win: playerStats.win, kdaRatio, gameEndTimestamp: matchData.info.gameEndTimestamp, utilityScore }; // Utility Score zurückgeben
    } catch (error) {
        console.error(`[analyzeAndPostMatch] Fehler für Match ${matchId} (PUUID ${puuid}):`, error.response ? JSON.stringify(error.response.data) : error.message);
        if (targetChannel && error.response?.status === 429) {
            await targetChannel.send(`API Limit erreicht beim Abrufen von Match ${matchId}.`).catch(console.error);
        }
        return null;
    }
}

// --- Streak-Logik Funktionen ---
async function checkAndAnnounceStreaks(recentGames, targetChannel, playerInfo, guildId) {
    if (!targetChannel || !playerInfo || recentGames.length < 3) return; // playerInfo hinzugefügt für gameName
    const lastThreeGames = recentGames.slice(0, 3);
    const playerFocusData = focusData[guildId]?.focusedPlayer;
    if (!playerFocusData) return;

    // Win Streak
    if (lastThreeGames.every(g => g.win)) {
        if (!playerFocusData.winStreakNotified) {
            await targetChannel.send({ embeds: [new EmbedBuilder().setColor('#FFD700').setTitle(`🔥 ${playerInfo.gameName} ist auf einer Siegessträhne! 🔥`).setDescription("DREI Siege in Folge! Weiter so, Champion! 🚀").setTimestamp()] }).catch(console.error);
            playerFocusData.winStreakNotified = true;
        }
    } else {
        playerFocusData.winStreakNotified = false;
    }

    // Loss Streak
    if (lastThreeGames.every(g => !g.win)) {
        if (!playerFocusData.lossStreakNotified) {
            await targetChannel.send({ embeds: [new EmbedBuilder().setColor('#708090').setTitle(`💀 ${playerInfo.gameName}, was ist da los? 💀`).setDescription("Drei Niederlagen am Stück... Kleine Pause? 🍵 Oder weiterfeeden! 😉").setTimestamp()] }).catch(console.error);
            playerFocusData.lossStreakNotified = true;
        }
    } else {
        playerFocusData.lossStreakNotified = false;
    }

    // Bad KDA Streak
    const currentBadKdaStreak = lastThreeGames.every(g => g.kdaRatio < 1);
    if (currentBadKdaStreak) {
        if (!playerFocusData.onBadKdaStreakNotified) {
            await targetChannel.send({ embeds: [new EmbedBuilder().setColor('#A52A2A').setTitle(`📉 ${playerInfo.gameName}, KDA im Keller! 📉`).setDescription("Drei Spiele mit KDA < 1. Zeit das Ruder rumzureißen!").setTimestamp()] }).catch(console.error);
            playerFocusData.onBadKdaStreak = true;
            playerFocusData.onBadKdaStreakNotified = true;
        }
    } else {
        if (playerFocusData.onBadKdaStreak && recentGames[0].kdaRatio >= 1) {
            await targetChannel.send({ embeds: [new EmbedBuilder().setColor('#34A853').setTitle(`✨ ${playerInfo.gameName} hat die KDA-Kurve gekriegt! ✨`).setDescription(`Stark! KDA < 1 Serie gebrochen mit KDA ${recentGames[0].kdaRatio.toFixed(2)}! 💪`).setTimestamp()] }).catch(console.error);
        }
        playerFocusData.onBadKdaStreak = false;
        playerFocusData.onBadKdaStreakNotified = false;
    }
    saveFocusData(focusData);
}

// --- Polling Funktion ---
async function checkFocusedPlayerForNewGames() {
    if (!RIOT_API_KEY) return;
    console.log(`[${new Date().toLocaleString()}] [FocusTracker] Starte Prüfung...`);
    for (const guildId in focusData) {
        const guildConfig = focusData[guildId];
        if (!guildConfig.notificationChannelId || !guildConfig.focusedPlayer?.puuid) continue;
        const player = guildConfig.focusedPlayer;
        const channel = client.channels.cache.get(guildConfig.notificationChannelId);
        if (!channel) { console.warn(`[FocusTracker] Kanal ${guildConfig.notificationChannelId} für Guild ${guildId} nicht gefunden.`); continue; }

        const matchApiRoutingValue = player.apiRoutingValue || 'europe';
        try {
            console.log(`[FocusTracker] Prüfe Spieler: ${player.riotId}`);
            const matchIdsApiUrl = `https://${matchApiRoutingValue}.api.riotgames.com/lol/match/v5/matches/by-puuid/${player.puuid}/ids?count=${MATCHES_TO_CHECK_PER_POLL}&type=normal&type=ranked&type=tourney`;
            const matchIdsResponse = await axios.get(matchIdsApiUrl, { headers: { "X-Riot-Token": RIOT_API_KEY }});
            if (!matchIdsResponse.data || matchIdsResponse.data.length === 0) continue;

            let newMatchIdsToProcess = [];
            for (const matchId of matchIdsResponse.data) {
                if (matchId === player.lastAnnouncedGameIdInPolling) break;
                newMatchIdsToProcess.push(matchId);
            }
            const gamesToProcessChronologically = newMatchIdsToProcess.reverse();

            if (gamesToProcessChronologically.length > 0) {
                console.log(`[FocusTracker] ${gamesToProcessChronologically.length} neue(s) Spiel(e) für ${player.riotId}.`);
                let latestProcessedMatchIdThisRun = player.lastAnnouncedGameIdInPolling;
                for (const newMatchId of gamesToProcessChronologically) {
                    const gameAnalysisResult = await analyzeAndPostMatch(newMatchId, player.puuid, channel, player, false, true);
                    if (gameAnalysisResult) {
                        latestProcessedMatchIdThisRun = newMatchId;
                        if (focusData[guildId]?.focusedPlayer) { // Erneuter Check, falls Fokus während der Schleife entfernt wurde
                            const playerToUpdate = focusData[guildId].focusedPlayer;
                            if (!playerToUpdate.recentGames) playerToUpdate.recentGames = [];
                            playerToUpdate.recentGames.unshift(gameAnalysisResult);
                            if (playerToUpdate.recentGames.length > MAX_RECENT_GAMES) playerToUpdate.recentGames.pop();
                            await checkAndAnnounceStreaks(playerToUpdate.recentGames, channel, playerToUpdate, guildId);
                        }
                    }
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Pause zwischen Verarbeitung einzelner neuer Spiele
                }
                if (latestProcessedMatchIdThisRun !== player.lastAnnouncedGameIdInPolling && focusData[guildId]?.focusedPlayer) {
                    focusData[guildId].focusedPlayer.lastAnnouncedGameIdInPolling = latestProcessedMatchIdThisRun;
                }
                saveFocusData(focusData); // Einmal speichern nach Verarbeitung aller neuen Spiele für diesen Spieler
            } else if (matchIdsResponse.data.length > 0 && !player.lastAnnouncedGameIdInPolling && focusData[guildId]?.focusedPlayer) {
                focusData[guildId].focusedPlayer.lastAnnouncedGameIdInPolling = matchIdsResponse.data[0];
                saveFocusData(focusData);
                console.log(`[FocusTracker] Initiales lastAnnouncedGameIdInPolling für ${player.riotId} auf ${matchIdsResponse.data[0]} gesetzt.`);
            }
        } catch (error) { console.error(`[FocusTracker] Fehler Spieler ${player.riotId}:`, error.response ? JSON.stringify(error.response.data) : error.message); }
        await new Promise(resolve => setTimeout(resolve, 5000)); // Pause vor dem nächsten Guild-Check
    }
    console.log(`[${new Date().toLocaleString()}] [FocusTracker] Prüfung abgeschlossen.`);
}

// --- Client Event Handler ---
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}! Auf ${client.guilds.cache.size} Servern.`);
    client.user.setActivity('LoL Matches', { type: 'WATCHING' });
    if (RIOT_API_KEY) {
        console.log("[FocusTracker] Starte Polling...");
        setInterval(checkFocusedPlayerForNewGames, POLLING_INTERVAL_MS);
        setTimeout(checkFocusedPlayerForNewGames, 10000); // Erster Check nach 10 Sekunden
    } else { console.warn("[FocusTracker] Polling nicht gestartet: RIOT_API_KEY fehlt."); }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    // Kanalbeschränkung - WICHTIG: "DEINE_ECHTE_KANAL_ID_HIER" ersetzen oder Array leer lassen/Zeilen auskommentieren
    // const ALLOWED_CHANNEL_IDS = ["DEINE_ECHTE_KANAL_ID_HIER"]; // Beispiel
    if (ALLOWED_CHANNEL_IDS.length > 0 && !ALLOWED_CHANNEL_IDS.includes(message.channel.id)) {
        // console.log(`Befehl in nicht erlaubtem Kanal ${message.channel.name} (ID: ${message.channel.id}) ignoriert.`);
        return;
    }

    const prefix = '!';
    if (!message.content.startsWith(prefix)) return;

    const argsWithoutPrefix = message.content.slice(prefix.length).trim();
    const commandArgs = argsWithoutPrefix.split(/ +/);
    const command = commandArgs.shift().toLowerCase();

    if (command === 'help' || command === 'hilfe') {
        const helpEmbed = new EmbedBuilder()
            .setColor('#0099ff').setTitle('Bot Befehlsübersicht').setDescription('Verfügbare Befehle:')
            .addFields(
                { name: `${prefix}ping`, value: 'Bot-Status.' },
                { name: `${prefix}hallo`, value: 'Begrüßung.' },
                { name: `${prefix}setfocuschannel #kanal`, value: '**Rolle "Eule":** Kanal für Analyse-Posts.' },
                { name: `${prefix}focus <RiotID#TAG>`, value: 'Fokus setzen & letzte 3 Spiele analysieren. Startet 30-Minuten-Tracking.' },
                { name: `${prefix}currentfocus`, value: 'Zeigt fokussierten Spieler.' },
                { name: `${prefix}unfocus`, value: 'Entfernt Fokus & stoppt Tracking.' },
                { name: `${prefix}help / ${prefix}hilfe`, value: 'Diese Hilfe.' }
            ).setTimestamp().setFooter({ text: 'LoL Analyse Bot' });
        message.channel.send({ embeds: [helpEmbed] }).catch(console.error); return;
    }
    if (command === 'ping') { message.reply('Pong!').catch(console.error); return; }
    if (command === 'hallo') { message.channel.send(`Hallo ${message.author.username}! API Key: ${RIOT_API_KEY ? 'OK' : 'FEHLT'}`).catch(console.error); return; }

    if (command === 'setfocuschannel') {
        const requiredRoleName = "Eule"; // Passe diesen Namen an eure Rolle an!
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && !message.member.roles.cache.some(role => role.name.toLowerCase() === requiredRoleName.toLowerCase())) {
            return message.reply(`Admin-Rechte oder Rolle "${requiredRoleName}" benötigt.`).catch(console.error);
        }
        const mentionedChannel = message.mentions.channels.first();
        if (!mentionedChannel) return message.reply("Kanal erwähnen: `!setfocuschannel #kanal`").catch(console.error);
        const guildId = message.guild.id;
        if (!focusData[guildId]) focusData[guildId] = { notificationChannelId: null, focusedPlayer: null };
        focusData[guildId].notificationChannelId = mentionedChannel.id;
        saveFocusData(focusData);
        message.reply(`Analyse-Kanal auf ${mentionedChannel} gesetzt!`).catch(console.error); return;
    }

    if (command === 'unfocus') {
        const guildId = message.guild.id;
        if (focusData[guildId]?.focusedPlayer) {
            const oldFocusRiotId = focusData[guildId].focusedPlayer.riotId;
            focusData[guildId].focusedPlayer = null;
            saveFocusData(focusData);
            message.reply(`${oldFocusRiotId} nicht mehr im Fokus. Tracking gestoppt.`).catch(console.error);
        } else { message.reply("Kein Spieler im Fokus.").catch(console.error); } return;
    }

    if (command === 'currentfocus') {
        const guildId = message.guild.id;
        if (focusData[guildId]?.focusedPlayer) {
            message.reply(`Aktuell im Fokus: ${focusData[guildId].focusedPlayer.riotId}`).catch(console.error);
        } else { message.reply("Kein Spieler im Fokus.").catch(console.error); } return;
    }

    if (command === 'focus') {
        if (commandArgs.length === 0) return message.reply('Riot ID angeben: `!focus Name#TAG`').catch(console.error);
        const riotIdFull = commandArgs.join(" ");
        const parts = riotIdFull.split('#');
        const gameNameInput = parts[0]?.trim();
        const tagLineInput = parts[1]?.trim();

        if (!gameNameInput || !tagLineInput) return message.reply('Format: `!focus Name#TAG`').catch(console.error);
        if (!RIOT_API_KEY) return message.reply('API Key fehlt.').catch(console.error);
        const guildId = message.guild.id;
        if (!focusData[guildId]?.notificationChannelId) return message.reply("Analyse-Kanal fehlt (`!setfocuschannel`)").catch(console.error);

        const notificationChannel = client.channels.cache.get(focusData[guildId].notificationChannelId);
        if (!notificationChannel) return message.reply("Analyse-Kanal nicht gefunden.").catch(console.error);

        const accountApiRoutingValue = 'europe';
        const matchApiRoutingValue = 'europe';

        try {
            await message.channel.send(`Suche Account für ${gameNameInput}#${tagLineInput}...`).catch(console.error);
            const accountApiUrl = `https://${accountApiRoutingValue}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameNameInput)}/${encodeURIComponent(tagLineInput)}`;
            const accountResponse = await axios.get(accountApiUrl, { headers: { "X-Riot-Token": RIOT_API_KEY } });
            const { puuid, gameName: apiGameName, tagLine: apiTagLine } = accountResponse.data;
            if (!puuid) return message.reply(`PUUID für ${gameNameInput}#${tagLineInput} nicht gefunden.`).catch(console.error);

            const playerInfo = { puuid, riotId: `${apiGameName}#${apiTagLine}`, gameName: apiGameName, tagLine: apiTagLine, apiRoutingValue: matchApiRoutingValue };

            if (!focusData[guildId]) focusData[guildId] = { notificationChannelId: focusData[guildId].notificationChannelId, focusedPlayer: null };
            focusData[guildId].focusedPlayer = {
                ...playerInfo,
                lastAnnouncedGameIdInPolling: null, recentGames: [],
                winStreakNotified: false, lossStreakNotified: false, onBadKdaStreak: false, onBadKdaStreakNotified: false
            };
            // Speichern erst nach der initialen Analyse, um Race Conditions mit Polling zu vermeiden, wenn es sehr schnell ginge
            // saveFocusData(focusData);
            await notificationChannel.send(`Fokus auf **${apiGameName}#${apiTagLine}**. Initiale Analyse (letzte 3 Spiele)...`).catch(console.error);

            const matchIdsApiUrl = `https://${matchApiRoutingValue}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?count=3&type=normal&type=ranked&type=tourney`;
            const matchIdsResponse = await axios.get(matchIdsApiUrl, { headers: { "X-Riot-Token": RIOT_API_KEY } });
            if (!matchIdsResponse.data?.length) return notificationChannel.send(`Keine Spiele für ${apiGameName}#${apiTagLine}.`).catch(console.error);

            await notificationChannel.send(`--- Initiale Analyse für ${apiGameName}#${apiTagLine} ---`).catch(console.error);
            let analyzedGameCount = 0;
            let latestAnalyzedMatchIdForPollingInit = null;
            const initialGamesForStreak = []; // Wird von alt nach neu gefüllt für korrekte Streak-Logik

            for (const matchId of [...matchIdsResponse.data].reverse()) { // Kopiere und reverse für chronologische Verarbeitung
                await new Promise(resolve => setTimeout(resolve, 1500));
                const gameAnalysisResult = await analyzeAndPostMatch(matchId, puuid, notificationChannel, playerInfo, true, false);
                if (gameAnalysisResult) {
                    analyzedGameCount++;
                    latestAnalyzedMatchIdForPollingInit = gameAnalysisResult.matchId; // Das *letzte* verarbeitete ist das neueste für Polling-Start
                    initialGamesForStreak.push(gameAnalysisResult); // Füge am Ende an (chronologisch)
                }
            }

            if (focusData[guildId]?.focusedPlayer) {
                // `recentGames` soll neuestes Spiel an Index 0 haben
                focusData[guildId].focusedPlayer.recentGames = initialGamesForStreak.reverse().slice(0, MAX_RECENT_GAMES);
                if (latestAnalyzedMatchIdForPollingInit) { // Sollte das neueste der 3 analysierten sein
                    focusData[guildId].focusedPlayer.lastAnnouncedGameIdInPolling = latestAnalyzedMatchIdForPollingInit;
                }
                // Prüfe Streaks nach initialer Analyse
                await checkAndAnnounceStreaks(focusData[guildId].focusedPlayer.recentGames, notificationChannel, focusData[guildId].focusedPlayer, guildId);
            }
            saveFocusData(focusData); // Jetzt speichern, nachdem alles initialisiert wurde
            await notificationChannel.send(`--- Initiale Analyse (${analyzedGameCount} Spiele) für ${apiGameName}#${apiTagLine} abgeschlossen ---`).catch(console.error);
        } catch (error) {
            console.error(`[focus] Fehler für ${gameNameInput}#${tagLineInput}:`, error.response ? JSON.stringify(error.response.data) : error.message);
            if (error.response) {
                if (error.response.status === 403) { message.reply('API Key ungültig/abgelaufen.').catch(console.error); }
                else if (error.response.status === 404) { message.reply(`Spieler ${gameNameInput}#${tagLineInput} nicht gefunden.`).catch(console.error); }
                else if (error.response.status === 429) { message.reply('API Rate Limit erreicht.').catch(console.error); }
                else { message.reply(`API Fehler (${error.response.status}).`).catch(console.error); }
            } else { message.reply('Unbekannter Fehler beim Fokus-Setzen.').catch(console.error); }
        }
        return;
    }
});

client.login(DISCORD_TOKEN).catch(err => {
    console.error("FEHLER beim Einloggen des Bots:", err);
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log("Bot wird heruntergefahren...");
    client.destroy();
    process.exit(0);
});