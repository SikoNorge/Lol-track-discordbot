// src/commands/focus.js
const focusService = require('../services/focusDataService');
const riotService = require('../services/riotService');
const { analyzeMatchAndBuildEmbed } = require('../services/matchAnalyzer');
const { checkAndAnnounceStreaks } = require('../services/streakService');
const config = require('../config');
const MAX_FOCUS_PLAYERS = 5; // Maximale Anzahl fokussierbarer Spieler

module.exports = {
    name: 'focus',
    description: `Fokussiert bis zu ${MAX_FOCUS_PLAYERS} Spieler und analysiert ihre letzten Spiele. Region Argument ist optional.`,
    usage: 'focus Spieler1#TAG1[:Region] [Spieler2#TAG2[:Region] ...]',
    aliases: ['f'],
    async execute(message, args, client) {
        if (args.length === 0) {
            return message.reply(`Bitte gib mindestens einen Spieler an. Nutzung: \`${config.PREFIX}focus SpielerName#TAG[:Region]\``).catch(console.error);
        }
        if (args.length > MAX_FOCUS_PLAYERS) {
            return message.reply(`Du kannst maximal ${MAX_FOCUS_PLAYERS} Spieler gleichzeitig fokussieren.`).catch(console.error);
        }

        if (!config.RIOT_API_KEY) {
            return message.reply('Der Riot API Key ist nicht konfiguriert. Bitte kontaktiere einen Bot-Administrator.').catch(console.error);
        }

        const guildData = await focusService.getGuildData(message.guild.id);
        if (!guildData.notificationChannelId) {
            return message.reply("Der Analyse-Kanal wurde für diesen Server noch nicht festgelegt. Bitte verwende zuerst `!setfocuschannel`.").catch(console.error);
        }

        const notificationChannel = await client.channels.fetch(guildData.notificationChannelId).catch(() => null);
        if (!notificationChannel) {
            return message.reply("Der festgelegte Analyse-Kanal konnte nicht gefunden werden. Bitte neu setzen mit `!setfocuschannel`.").catch(console.error);
        }

        // Initialisiere focusedPlayers als Array, falls es nicht existiert oder null ist
        if (!guildData.focusedPlayers || !Array.isArray(guildData.focusedPlayers)) {
            guildData.focusedPlayers = [];
        }

        let newPlayersFocusedCount = 0;
        let alreadyFocusedCount = 0;
        let errorCount = 0;
        const successfullyFocusedDetails = [];

        for (const playerArg of args) {
            if (guildData.focusedPlayers.length >= MAX_FOCUS_PLAYERS && !guildData.focusedPlayers.some(p => p.riotId.toLowerCase().startsWith(playerArg.split(':')[0].toLowerCase()))) { // Prüfen, ob bereits voll und der Spieler nicht schon gefokust ist (für Update-Szenario)
                await message.channel.send(`Maximale Anzahl von ${MAX_FOCUS_PLAYERS} fokussierten Spielern bereits erreicht. ${playerArg} wird nicht hinzugefügt.`).catch(console.error);
                continue;
            }

            let gameNameInput, tagLineInput, regionInput = 'euw1'; // Standardregion
            const parts = playerArg.split(':'); // Trennt Name#Tag von Region
            const riotIdPart = parts[0];
            if (parts.length > 1 && parts[1].trim() !== '') {
                regionInput = parts[1].trim().toLowerCase();
            }

            const riotIdParts = riotIdPart.split('#');
            if (riotIdParts.length !== 2 || !riotIdParts[0].trim() || !riotIdParts[1].trim()) {
                await message.channel.send(`Ungültiges Format für Spieler: \`${playerArg}\`. Bitte nutze \`SpielerName#TAG[:Region]\`.`).catch(console.error);
                errorCount++;
                continue;
            }
            gameNameInput = riotIdParts[0].trim();
            tagLineInput = riotIdParts[1].trim();

            // Prüfen, ob dieser Spieler (basierend auf Name#Tag, case-insensitive) bereits fokussiert ist
            const existingPlayerIndex = guildData.focusedPlayers.findIndex(p => p.riotId.toLowerCase() === `${gameNameInput}#${tagLineInput}`.toLowerCase());
            if (existingPlayerIndex !== -1) {
                // Spieler ist bereits fokussiert, vielleicht nur Region aktualisieren oder einfach überspringen?
                // Fürs Erste: Überspringen und informieren, wenn sich die Region nicht ändert. Wenn doch, aktualisieren.
                if (guildData.focusedPlayers[existingPlayerIndex].region.toLowerCase() === regionInput.toLowerCase()) {
                    // await message.channel.send(`ℹ️ **${gameNameInput}#${tagLineInput}** wird bereits mit derselben Region überwacht.`).catch(console.error);
                    alreadyFocusedCount++;
                    successfullyFocusedDetails.push(`**${gameNameInput}#${tagLineInput}** (Region: ${regionInput}) - bereits überwacht`);
                    continue;
                } else {
                    await message.channel.send(`Aktualisiere Region für **${gameNameInput}#${tagLineInput}** auf **${regionInput}**...`).catch(console.error);
                }
            } else if (guildData.focusedPlayers.length >= MAX_FOCUS_PLAYERS) {
                await message.channel.send(`Maximale Anzahl von ${MAX_FOCUS_PLAYERS} fokussierten Spielern erreicht. **${gameNameInput}#${tagLineInput}** kann nicht hinzugefügt werden.`).catch(console.error);
                errorCount++;
                continue;
            }


            try {
                if (existingPlayerIndex === -1) { // Nur senden, wenn Spieler neu hinzugefügt wird
                    await message.channel.send(`Suche Account für **${gameNameInput}#${tagLineInput}** (Region: **${regionInput}**)...`).catch(console.error);
                }

                const accountData = await riotService.getAccountByRiotID(gameNameInput, tagLineInput, regionInput);
                if (!accountData || !accountData.puuid) {
                    await message.channel.send(`❌ Konnte keinen Account für **${gameNameInput}#${tagLineInput}** (Region: ${regionInput}) finden.`).catch(console.error);
                    errorCount++;
                    continue;
                }

                const { puuid, gameName: apiGameName, tagLine: apiTagLine } = accountData;
                const playerRiotId = `${apiGameName}#${apiTagLine}`;
                const apiRoutingValue = riotService.getPlatformRouting(regionInput);

                const playerObject = {
                    puuid: puuid,
                    riotId: playerRiotId,
                    gameName: apiGameName,
                    tagLine: apiTagLine,
                    region: regionInput,
                    apiRoutingValue: apiRoutingValue,
                    lastMatchIds: [],
                    recentGames: [],
                    winStreakNotified: false,
                    lossStreakNotified: false,
                    onBadKdaStreak: false,
                    onBadKdaStreakNotified: false
                };

                // Initiale Analyse
                const initialMatchCount = 5;
                const initialMatchIds = await riotService.getMatchIds(puuid, initialMatchCount, apiRoutingValue);

                if (initialMatchIds && initialMatchIds.length > 0) {
                    await notificationChannel.send(`--- Initiale Analyse für **${playerRiotId}** (${initialMatchIds.length} Spiele) ---`).catch(console.error);
                    const analyzedGamesForStreak = [];
                    for (const matchId of [...initialMatchIds].reverse()) {
                        await new Promise(resolve => setTimeout(resolve, 1500)); // Kurze Pause
                        try { // <--- HIER den try-Block hinzufügen
                            const matchDetails = await riotService.getMatchDetails(matchId, apiRoutingValue);
                            if (matchDetails) {
                                const analysisResult = analyzeMatchAndBuildEmbed(matchDetails, puuid, playerRiotId, false, true);
                                if (analysisResult && analysisResult.embed && analysisResult.gameStats) {
                                    await notificationChannel.send({ embeds: [analysisResult.embed] }).catch(console.error);
                                    analyzedGamesForStreak.push(analysisResult.gameStats);
                                }
                            }
                        } catch (matchDetailError) { // <--- HIER den catch-Block hinzufügen
                            if (matchDetailError.response && matchDetailError.response.status === 403) {
                                console.warn(`[Focus-Befehl] Initiale Analyse: Match ${matchId} für ${playerRiotId} gab 403 Forbidden. Überspringe dieses Match in der Initialanalyse.`);
                                // Optional: Eine stille Nachricht im Kanal, dass ein spezifisches Spiel nicht analysiert werden konnte.
                                // await notificationChannel.send(`Hinweis: Ein Spiel (${matchId}) für ${playerRiotId} konnte für die initiale Analyse nicht geladen werden (Zugriff verweigert).`).catch(console.error);
                            } else {
                                console.error(`[Focus-Befehl] Initiale Analyse: Unerwarteter Fehler beim Holen von Details für Match ${matchId} (Spieler ${playerRiotId}):`, matchDetailError.message);
                            }
                            // WICHTIG: Mit 'continue' wird zum nächsten MatchId in der initialMatchIds-Schleife gesprungen.
                            continue;
                        }
                    }
                    playerObject.recentGames = analyzedGamesForStreak.reverse().slice(0, config.MAX_RECENT_GAMES);
                    playerObject.lastMatchIds = [...initialMatchIds].slice(0, config.MATCHES_TO_CHECK_PER_POLL); // Nimmt die ersten paar IDs aus dem ursprünglichen API-Aufruf
                    if (playerObject.recentGames.length >= 3) { // Nur Streaks prüfen, wenn genügend Spiele analysiert wurden
                        await checkAndAnnounceStreaks(playerObject.recentGames, notificationChannel, playerObject);
                    }
                } else {
                    await notificationChannel.send(`Keine aktuellen Spiele für **${playerRiotId}** gefunden für die initiale Analyse. Tracking ist aktiv.`).catch(console.error);
                }

                if (existingPlayerIndex !== -1) { // Spieler aktualisieren
                    guildData.focusedPlayers[existingPlayerIndex] = playerObject;
                    successfullyFocusedDetails.push(`**${playerRiotId}** (Region: ${regionInput}) - aktualisiert`);
                } else { // Neuen Spieler hinzufügen
                    guildData.focusedPlayers.push(playerObject);
                    newPlayersFocusedCount++;
                    successfullyFocusedDetails.push(`**${playerRiotId}** (Region: ${regionInput}) - hinzugefügt`);
                }


            } catch (error) {
                console.error(`[Focus-Befehl] Fehler bei Spieler ${gameNameInput}#${tagLineInput}:`, error.response ? error.response.data : error.message);
                let replyMessage = `Fehler beim Fokussieren von **${gameNameInput}#${tagLineInput}**.`;
                if (error.response) {
                    if (error.response.status === 403) replyMessage += ' API Key ungültig/abgelaufen.';
                    else if (error.response.status === 404) replyMessage += ` Spieler nicht gefunden.`;
                    else if (error.response.status === 429) replyMessage += ' API Rate Limit erreicht.';
                    else replyMessage += ` API Fehler (${error.response.status}).`;
                }
                await message.channel.send(replyMessage).catch(console.error);
                errorCount++;
            }
        } // Ende der for-Schleife über playerArgs

        // Speichere die Änderungen an guildData (insbesondere focusedPlayers Array und dessen Inhalte)
        if (newPlayersFocusedCount > 0 || successfullyFocusedDetails.some(d => d.includes("aktualisiert"))) {
            await guildData.save(message.guild.id, guildData);
        }

        // Zusammenfassende Nachricht
        let finalMessage = "";
        if (successfullyFocusedDetails.length > 0) {
            finalMessage += `**Erfolgreich verarbeitet:**\n${successfullyFocusedDetails.map(s => `✅ ${s}`).join('\n')}\n\n`;
        }
        if (alreadyFocusedCount > 0 && !successfullyFocusedDetails.some(d => d.includes("bereits überwacht"))) { // Nur wenn nicht schon in successfullyFocusedDetails enthalten
            // Diese Logik ist etwas redundant, da "bereits überwacht" jetzt in successfullyFocusedDetails ist
        }
        if (errorCount > 0) {
            finalMessage += `❌ Es gab bei ${errorCount} Spieler(n) Probleme.`;
        }

        if (finalMessage) {
            await message.channel.send(finalMessage).catch(console.error);
        } else if (args.length > 0 && alreadyFocusedCount === args.length) { // Alle waren bereits gefokust und wurden nicht geändert
            await message.channel.send("Alle angegebenen Spieler werden bereits mit den jeweiligen Regionen überwacht.").catch(console.error);
        } else if (args.length === 0 && errorCount === 0 && newPlayersFocusedCount === 0 && alreadyFocusedCount === 0) {
            // Sollte nicht passieren, da wir am Anfang auf args.length === 0 prüfen
        }


    }
};