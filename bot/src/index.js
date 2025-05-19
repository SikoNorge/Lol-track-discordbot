// index.js
require('dotenv').config(); // Umgebungsvariablen aus .env laden
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionsBitField } = require('discord.js');
const axios = require('axios');

const FOCUS_DATA_PATH = path.join(__dirname, 'focus_player_data.json');
const ALLOWED_CHANNEL_IDS = ["der-einzig-wahre-talk"];

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

const LOL_DDRAGON_VERSION = "14.10.1"; // Regelmäßig prüfen und anpassen!
const POLLING_INTERVAL_MS = 30 * 60 * 1000; // 30 Minuten
const MATCHES_TO_CHECK_PER_POLL = 5;
const MAX_RECENT_GAMES = 10; // Max. Anzahl Spiele in der Historie für Streaks

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
            console.log(`[analyzeAndPostMatch] Match ${matchId} unvollständig. Überspringe.`);
            return null;
        }
        const playerStats = matchData.info.participants.find(p => p.puuid === puuid);
        if (!playerStats) return null;

        const kills = playerStats.kills;
        const deaths = playerStats.deaths;
        const assists = playerStats.assists;
        let kdaRatio = deaths === 0 ? (kills + assists) : ((kills + assists) / deaths);
        if (deaths === 0 && (kills > 0 || assists > 0) && kdaRatio === 0) kdaRatio = kills + assists;

        const totalDamageToChampions = playerStats.totalDamageDealtToChampions;
        const goldEarned = playerStats.goldEarned;
        const totalGameDamage = matchData.info.participants.reduce((sum, p) => sum + p.totalDamageDealtToChampions, 0);
        const averageGameDamage = matchData.info.participants.length > 0 ? Math.round(totalGameDamage / matchData.info.participants.length) : 0;
        const totalGameGold = matchData.info.participants.reduce((sum, p) => sum + p.goldEarned, 0);
        const averageGameGold = matchData.info.participants.length > 0 ? Math.round(totalGameGold / matchData.info.participants.length) : 0;

        const isGoodKDA = kdaRatio > 1;
        let specialKdaMessage = isGoodKDA ? "**WAS EINE KD VON ÜBER 1?!?!?!** 🔥\n" : "";
        let gameResponseMessage = isGoodKDA ? "🎉 Super Runde! 🎉" : "Da war der Kopf wohl nicht auf Hochtouren!";
        if (deaths === 0 && (kills > 0 || assists > 0)) gameResponseMessage = "✨ PERFEKTE KDA! ✨";

        const embedTitlePrefix = fromPolling ? "Neues Spiel entdeckt: " : "";
        const embed = new EmbedBuilder()
            .setTitle(`${embedTitlePrefix}${playerStats.championName} - ${matchData.info.gameMode}`)
            .setColor(isGoodKDA ? '#34A853' : '#EA4335')
            .setDescription(`${specialKdaMessage}${winStatus(playerStats.win)} (${Math.floor(matchData.info.gameDuration / 60)}m ${matchData.info.gameDuration % 60}s)\n*${gameResponseMessage}*`)
            .setThumbnail(`http://ddragon.leagueoflegends.com/cdn/${LOL_DDRAGON_VERSION}/img/champion/${playerStats.championName}.png`)
            .addFields(
                { name: 'K/D/A', value: `${kills}/${deaths}/${assists} (${kdaRatio.toFixed(2)})`, inline: true },
                { name: 'Schaden an Champs', value: `${totalDamageToChampions.toLocaleString('de-DE')} (Avg: ${averageGameDamage.toLocaleString('de-DE')})`, inline: true },
                { name: 'Gold', value: `${goldEarned.toLocaleString('de-DE')} (Avg: ${averageGameGold.toLocaleString('de-DE')})`, inline: true }
            )
            .setTimestamp(new Date(matchData.info.gameEndTimestamp))
            .setFooter({ text: `Match ID: ${matchId} | Für ${playerInfo.riotId}` });
        if (targetChannel) await targetChannel.send({ embeds: [embed] }).catch(console.error);

        return { matchId, win: playerStats.win, kdaRatio, gameEndTimestamp: matchData.info.gameEndTimestamp };
    } catch (error) {
        console.error(`[analyzeAndPostMatch] Fehler für Match ${matchId} (PUUID ${puuid}):`, error.response ? JSON.stringify(error.response.data) : error.message);
        if (targetChannel && error.response && error.response.status === 429) {
            await targetChannel.send(`API Limit erreicht beim Abrufen von Match ${matchId}.`).catch(console.error);
        }
        return null;
    }
}

// --- Streak-Logik Funktionen ---
async function checkAndAnnounceStreaks(recentGames, targetChannel, playerInfo, guildId) {
    if (!targetChannel || recentGames.length < 3) return;

    const lastThreeGames = recentGames.slice(0, 3);
    const playerFocusData = focusData[guildId]?.focusedPlayer; // Zugriff auf die Daten zum Speichern von Streak-Flags

    // 3 Siege in Folge
    if (lastThreeGames.every(game => game.win === true)) {
        if (!playerFocusData.winStreakNotified) {
            const embed = new EmbedBuilder().setColor('#FFD700').setTitle(`🔥 ${playerInfo.gameName} ist auf einer Siegessträhne! 🔥`).setDescription("DREI Siege in Folge! Weiter so, Champion! 🚀").setTimestamp();
            await targetChannel.send({ embeds: [embed] }).catch(console.error);
            if (playerFocusData) playerFocusData.winStreakNotified = true;
        }
    } else {
        if (playerFocusData) playerFocusData.winStreakNotified = false; // Streak gebrochen
    }

    // 3 Niederlagen in Folge
    if (lastThreeGames.every(game => game.win === false)) {
        if (!playerFocusData.lossStreakNotified) {
            const embed = new EmbedBuilder().setColor('#708090').setTitle(`💀 ${playerInfo.gameName}, was ist da los? 💀`).setDescription("Drei Niederlagen am Stück... Kleine Pause? 🍵 Oder weiterfeeden! 😉").setTimestamp();
            await targetChannel.send({ embeds: [embed] }).catch(console.error);
            if (playerFocusData) playerFocusData.lossStreakNotified = true;
        }
    } else {
        if (playerFocusData) playerFocusData.lossStreakNotified = false; // Streak gebrochen
    }

    // 3 Spiele mit KDA < 1
    const onActualBadKdaStreak = lastThreeGames.every(game => game.kdaRatio < 1);
    if (onActualBadKdaStreak) {
        if (!playerFocusData.onBadKdaStreakNotified) { // Nur einmal benachrichtigen, wenn die Streak beginnt
            const embed = new EmbedBuilder().setColor('#A52A2A').setTitle(`📉 ${playerInfo.gameName}, deine KDA braucht etwas Liebe! 📉`).setDescription("Drei Spiele hintereinander mit einer KDA unter 1. Zeit, das Ruder rumzureißen!").setTimestamp();
            await targetChannel.send({ embeds: [embed] }).catch(console.error);
            if (playerFocusData) {
                playerFocusData.onBadKdaStreak = true;
                playerFocusData.onBadKdaStreakNotified = true;
            }
        }
    } else {
        // Wenn die aktuelle 3er Serie nicht schlecht ist, aber vorher eine markiert war
        if (playerFocusData && playerFocusData.onBadKdaStreak) {
            // Prüfen, ob das LETZTE Spiel die Serie gebrochen hat
            if (recentGames[0].kdaRatio >= 1) {
                const embed = new EmbedBuilder().setColor('#34A853').setTitle(`✨ ${playerInfo.gameName} hat die KDA-Kurve gekriegt! ✨`).setDescription(`Starke Leistung! Die Serie mit KDA unter 1 wurde durchbrochen mit einer KDA von ${recentGames[0].kdaRatio.toFixed(2)}! 💪`).setTimestamp();
                await targetChannel.send({ embeds: [embed] }).catch(console.error);
            }
            playerFocusData.onBadKdaStreak = false; // Streak ist definitiv vorbei
            playerFocusData.onBadKdaStreakNotified = false; // Für nächste Streak wieder benachrichtigen
        }
        // Auch wenn keine "Bruch"-Nachricht gesendet wurde, ist die Streak vorbei.
        if (playerFocusData) playerFocusData.onBadKdaStreakNotified = false;
    }
    saveFocusData(focusData); // Speichere die aktualisierten Streak-Flags
}


// --- Polling Funktion ---
async function checkFocusedPlayerForNewGames() {
    if (!RIOT_API_KEY) return;
    console.log(`[${new Date().toLocaleString()}] [FocusTracker] Starte Prüfung auf neue Spiele...`);

    for (const guildId in focusData) {
        const guildConfig = focusData[guildId];
        if (!guildConfig.notificationChannelId || !guildConfig.focusedPlayer || !guildConfig.focusedPlayer.puuid) {
            continue;
        }

        const player = guildConfig.focusedPlayer;
        const channel = client.channels.cache.get(guildConfig.notificationChannelId);
        if (!channel) {
            console.warn(`[FocusTracker] Kanal ${guildConfig.notificationChannelId} für Guild ${guildId} nicht gefunden.`);
            continue;
        }

        const matchApiRoutingValue = player.apiRoutingValue || 'europe';

        try {
            console.log(`[FocusTracker] Prüfe Spieler: ${player.riotId}`);
            const matchIdsApiUrl = `https://${matchApiRoutingValue}.api.riotgames.com/lol/match/v5/matches/by-puuid/${player.puuid}/ids?count=${MATCHES_TO_CHECK_PER_POLL}&type=normal&type=ranked&type=tourney`;
            const matchIdsResponse = await axios.get(matchIdsApiUrl, { headers: { "X-Riot-Token": RIOT_API_KEY } });

            if (!matchIdsResponse.data || matchIdsResponse.data.length === 0) continue;

            let newGamesFoundInApi = [];
            for (const matchId of matchIdsResponse.data) { // Neueste zuerst von API
                if (matchId === player.lastAnnouncedGameIdInPolling) {
                    break;
                }
                newGamesFoundInApi.push(matchId);
            }
            const gamesToProcessChronologically = newGamesFoundInApi.reverse(); // Ältestes zuerst verarbeiten

            if (gamesToProcessChronologically.length > 0) {
                console.log(`[FocusTracker] ${gamesToProcessChronologically.length} neue(s) Spiel(e) für ${player.riotId} gefunden.`);
                let latestProcessedMatchIdThisRun = player.lastAnnouncedGameIdInPolling;

                for (const newMatchId of gamesToProcessChronologically) {
                    const gameAnalysisResult = await analyzeAndPostMatch(newMatchId, player.puuid, channel, player, false, true);
                    if (gameAnalysisResult) {
                        latestProcessedMatchIdThisRun = newMatchId;
                        if (focusData[guildId]?.focusedPlayer) {
                            const playerToUpdate = focusData[guildId].focusedPlayer;
                            if (!playerToUpdate.recentGames) playerToUpdate.recentGames = [];
                            playerToUpdate.recentGames.unshift({
                                matchId: gameAnalysisResult.matchId,
                                win: gameAnalysisResult.win,
                                kdaRatio: gameAnalysisResult.kdaRatio,
                                timestamp: gameAnalysisResult.gameEndTimestamp
                            });
                            if (playerToUpdate.recentGames.length > MAX_RECENT_GAMES) {
                                playerToUpdate.recentGames.pop();
                            }
                            await checkAndAnnounceStreaks(playerToUpdate.recentGames, channel, playerToUpdate, guildId);
                        }
                    }
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                if (latestProcessedMatchIdThisRun !== player.lastAnnouncedGameIdInPolling && focusData[guildId]?.focusedPlayer) {
                    focusData[guildId].focusedPlayer.lastAnnouncedGameIdInPolling = latestProcessedMatchIdThisRun;
                }
                saveFocusData(focusData);
            } else if (matchIdsResponse.data.length > 0 && !player.lastAnnouncedGameIdInPolling) {
                if (focusData[guildId]?.focusedPlayer) {
                    focusData[guildId].focusedPlayer.lastAnnouncedGameIdInPolling = matchIdsResponse.data[0];
                    saveFocusData(focusData);
                    console.log(`[FocusTracker] Initiales lastAnnouncedGameIdInPolling für ${player.riotId} auf ${matchIdsResponse.data[0]} gesetzt.`);
                }
            }
        } catch (error) {
            console.error(`[FocusTracker] Fehler beim Prüfen von Spieler ${player.riotId}:`, error.response ? JSON.stringify(error.response.data) : error.message);
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    console.log(`[${new Date().toLocaleString()}] [FocusTracker] Polling-Durchlauf abgeschlossen.`);
}

// --- Client Event Handler ---
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log(`Bot ist bereit und auf ${client.guilds.cache.size} Servern aktiv.`);
    client.user.setActivity('League of Legends', { type: 'WATCHING' });

    if (RIOT_API_KEY) {
        console.log("[FocusTracker] Starte Polling-Intervall...");
        setInterval(checkFocusedPlayerForNewGames, POLLING_INTERVAL_MS);
        setTimeout(checkFocusedPlayerForNewGames, 10000);
    } else {
        console.warn("[FocusTracker] Polling nicht gestartet, da kein RIOT_API_KEY vorhanden ist.");
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!ALLOWED_CHANNEL_IDS.includes(message.channel.id)) {
        // Optional: eine stille Nachricht an den Nutzer oder einfach ignorieren
        // console.log(`Befehl von ${message.author.tag} in nicht erlaubtem Kanal ${message.channel.name} ignoriert.`);
        // message.reply("Diesen Befehl bitte nur in den dafür vorgesehenen Kanälen verwenden.").catch(console.error); // Vorsicht mit Spam
        return; // Befehl in diesem Kanal nicht bearbeiten
    }
    const prefix = '!';
    if (!message.content.startsWith(prefix)) return;

    const argsWithoutPrefix = message.content.slice(prefix.length).trim();
    const commandArgs = argsWithoutPrefix.split(/ +/);
    const command = commandArgs.shift().toLowerCase();

    // --- HILFE BEFEHL ---
    if (command === 'help' || command === 'hilfe') {
        const helpEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Bot Befehlsübersicht')
            .setDescription('Hier sind alle verfügbaren Befehle:')
            .addFields(
                { name: `${prefix}ping`, value: 'Bot-Status prüfen.' },
                { name: `${prefix}hallo`, value: 'Freundliche Begrüßung.' },
                { name: `${prefix}setfocuschannel #kanal`, value: '**Admin:** Kanal für Analyse-Posts festlegen.' },
                { name: `${prefix}focus <RiotID#TAG>`, value: 'Fokus setzen & letzte 3 Spiele analysieren. Startet 30-minütiges Tracking.' },
                // { name: `${prefix}currentfocus`, value: 'Zeigt den aktuell fokussierten Spieler.' },
                { name: `${prefix}unfocus`, value: 'Entfernt den Fokus & stoppt Tracking.' },
                { name: `${prefix}help / ${prefix}hilfe`, value: 'Zeigt diese Hilfe.' }
            )
            .setTimestamp().setFooter({ text: 'LoL Analyse Bot' });
        message.channel.send({ embeds: [helpEmbed] }).catch(console.error);
        return;
    }

    // --- Standard Befehle ---
    if (command === 'ping') { message.reply('Pong!').catch(console.error); return; }
    if (command === 'hallo') { message.channel.send(`Hallo ${message.author.username}! API Key: ${RIOT_API_KEY ? 'OK' : 'FEHLT'}`).catch(console.error); return; }

    // --- Fokus-Management Befehle ---
    // if (command === 'setfocuschannel') {
    //     if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    //         return message.reply("Du benötigst Administrator-Rechte.").catch(console.error);
    //     }
    //     const mentionedChannel = message.mentions.channels.first();
    //     if (!mentionedChannel) {
    //         return message.reply("Bitte Kanal erwähnen: `!setfocuschannel #kanal`").catch(console.error);
    //     }
    //     const guildId = message.guild.id;
    //     if (!focusData[guildId]) focusData[guildId] = { notificationChannelId: null, focusedPlayer: null };
    //     focusData[guildId].notificationChannelId = mentionedChannel.id;
    //     saveFocusData(focusData);
    //     message.reply(`Analyse-Kanal auf ${mentionedChannel} gesetzt!`).catch(console.error);
    //     return;
    // }

    if (command === 'unfocus') {
        const guildId = message.guild.id;
        if (focusData[guildId]?.focusedPlayer) {
            const oldFocusRiotId = focusData[guildId].focusedPlayer.riotId;
            focusData[guildId].focusedPlayer = null;
            saveFocusData(focusData);
            message.reply(`${oldFocusRiotId} nicht mehr im Fokus. Tracking gestoppt.`).catch(console.error);
        } else { message.reply("Kein Spieler im Fokus.").catch(console.error); }
        return;
    }

    if (command === 'currentfocus') {
        const guildId = message.guild.id;
        if (focusData[guildId]?.focusedPlayer) {
            message.reply(`Aktuell im Fokus: ${focusData[guildId].focusedPlayer.riotId}`).catch(console.error);
        } else { message.reply("Kein Spieler im Fokus.").catch(console.error); }
        return;
    }

    // --- Hauptbefehl: !focus ---
    if (command === 'focus') {
        if (commandArgs.length === 0) return message.reply('Riot ID angeben: `!focus Name#TAG`').catch(console.error);
        const riotIdFull = commandArgs.join(" ");
        const parts = riotIdFull.split('#');
        const gameNameInput = parts[0]?.trim();
        const tagLineInput = parts[1]?.trim();

        if (!gameNameInput || !tagLineInput) return message.reply('Format: `!focus Name#TAG`').catch(console.error);
        if (!RIOT_API_KEY) return message.reply('Riot API Key fehlt.').catch(console.error);

        const guildId = message.guild.id;
        if (!focusData[guildId]?.notificationChannelId) return message.reply("Analyse-Kanal fehlt. `!setfocuschannel #kanal`").catch(console.error);

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
                lastAnnouncedGameIdInPolling: null,
                recentGames: [],
                winStreakNotified: false, // Streak-Flags initialisieren
                lossStreakNotified: false,
                onBadKdaStreak: false,
                onBadKdaStreakNotified: false
            };
            saveFocusData(focusData);
            await notificationChannel.send(`Fokus gesetzt auf **${apiGameName}#${apiTagLine}**. Initiale Analyse der letzten 3 Spiele...`).catch(console.error);

            const matchIdsApiUrl = `https://${matchApiRoutingValue}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?count=3&type=normal&type=ranked&type=tourney`;
            const matchIdsResponse = await axios.get(matchIdsApiUrl, { headers: { "X-Riot-Token": RIOT_API_KEY } });

            if (!matchIdsResponse.data || matchIdsResponse.data.length === 0) {
                return notificationChannel.send(`Keine Spiele für ${apiGameName}#${apiTagLine} gefunden.`).catch(console.error);
            }

            await notificationChannel.send(`--- Initiale Analyse für ${apiGameName}#${apiTagLine} ---`).catch(console.error);
            let analyzedGameCount = 0;
            let latestAnalyzedMatchIdForPollingInit = null;
            const initialGamesForStreak = [];

            for (const matchId of matchIdsResponse.data) { // Neueste zuerst
                await new Promise(resolve => setTimeout(resolve, 1500));
                const gameAnalysisResult = await analyzeAndPostMatch(matchId, puuid, notificationChannel, playerInfo, true, false);
                if (gameAnalysisResult) {
                    analyzedGameCount++;
                    if (!latestAnalyzedMatchIdForPollingInit) latestAnalyzedMatchIdForPollingInit = matchId;
                    initialGamesForStreak.unshift(gameAnalysisResult); // Ältestes zuerst in der Streak-Liste
                }
            }

            if (focusData[guildId]?.focusedPlayer) {
                focusData[guildId].focusedPlayer.recentGames = initialGamesForStreak.slice(0, MAX_RECENT_GAMES);
                if (latestAnalyzedMatchIdForPollingInit) {
                    focusData[guildId].focusedPlayer.lastAnnouncedGameIdInPolling = latestAnalyzedMatchIdForPollingInit;
                }
                // Prüfe Streaks nach initialer Analyse
                await checkAndAnnounceStreaks(focusData[guildId].focusedPlayer.recentGames, notificationChannel, focusData[guildId].focusedPlayer, guildId);
            }
            saveFocusData(focusData);
            await notificationChannel.send(`--- Initiale Analyse (${analyzedGameCount} Spiele) für ${apiGameName}#${apiTagLine} abgeschlossen ---`).catch(console.error);

        } catch (error) {
            console.error(`[focus] Fehler für ${gameNameInput}#${tagLineInput}:`, error.response ? JSON.stringify(error.response.data) : error.message);
            // Fehlerbehandlung wie zuvor
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