// src/services/pollingService.js
const focusService = require('./focusDataService');
const riotService = require('./riotService');
const { checkAndAnnounceStreaks } = require('./streakService');
const { analyzeMatchAndBuildEmbed } = require('./matchAnalyzer');
const config = require('../config');

async function checkFocusedPlayerForNewGames(client) {
    console.log(`[${new Date().toLocaleString()}] [FocusTrackerPolling] Starte Prüfung auf neue Spiele...`);

    const allGuildConfigs = await focusService.getAllGuildData();

    if (!allGuildConfigs || allGuildConfigs.length === 0) {
        console.log(`[${new Date().toLocaleString()}] [FocusTrackerPolling] Keine Guilds zu prüfen. Prüfung abgeschlossen.`);
        return;
    }

    for (const guildData of allGuildConfigs) {
        const guildId = guildData.guildId;

        if (!guildData.notificationChannelId || !guildData.focusedPlayers || !Array.isArray(guildData.focusedPlayers) || guildData.focusedPlayers.length === 0) {
            continue;
        }

        const notificationChannel = await client.channels.fetch(guildData.notificationChannelId).catch(err => {
            console.error(`[FocusTrackerPolling] Kanal ${guildData.notificationChannelId} für Guild ${guildId} nicht gefunden:`, err);
            return null;
        });

        if (!notificationChannel) {
            console.warn(`[FocusTrackerPolling] Benachrichtigungskanal für Guild ${guildId} nicht erreichbar.`);
            continue;
        }

        let guildDataWasModified = false;

        for (const player of guildData.focusedPlayers) {
            const { puuid, riotId, apiRoutingValue } = player;

            if (!puuid || !riotId || !apiRoutingValue) {
                console.warn(`[FocusTrackerPolling] Guild ${guildId}, Spieler ${riotId || 'Unbekannt'}: Unvollständige Spielerdaten.`);
                continue;
            }

            if (!player.lastMatchIds) player.lastMatchIds = [];
            if (!player.recentGames) player.recentGames = [];

            const effectiveApiRoutingValue = player.apiRoutingValue;

            try {
                const currentMatchIdsFromApi = await riotService.getMatchIds(puuid, config.MATCHES_TO_CHECK_PER_POLL, effectiveApiRoutingValue);

                if (!currentMatchIdsFromApi || currentMatchIdsFromApi.length === 0) {
                    continue;
                }

                const newMatchesToProcess = currentMatchIdsFromApi
                    .filter(id => !player.lastMatchIds.includes(id))
                    .reverse();

                if (newMatchesToProcess.length === 0) {
                    const newLastMatchIdsSlice = [...currentMatchIdsFromApi].slice(0, config.MATCHES_TO_CHECK_PER_POLL);
                    if (JSON.stringify(player.lastMatchIds) !== JSON.stringify(newLastMatchIdsSlice)) {
                        player.lastMatchIds = newLastMatchIdsSlice;
                        guildDataWasModified = true;
                    }
                    continue;
                }

                console.log(`[FocusTrackerPolling] ${newMatchesToProcess.length} neue(s) Spiel(e) für ${riotId} gefunden.`);


                for (const matchId of newMatchesToProcess) {
                    let matchDetails;
                    try {
                        // console.log(`[FocusTrackerPolling] Versuche Details für Match ${matchId} für Spieler ${riotId} zu holen.`);
                        matchDetails = await riotService.getMatchDetails(matchId, effectiveApiRoutingValue);
                    } catch (error) {
                        if (error.response && error.response.status === 403) {
                            console.warn(`[FocusTrackerPolling] Match ${matchId} für ${riotId} gab 403 Forbidden. Überspringe dieses Match.`);
                            // Das Match wird übersprungen. player.lastMatchIds wird am Ende des Spieler-Loops aktualisiert
                            // und enthält dann auch diese ID (wenn sie Teil von currentMatchIdsFromApi war),
                            // sodass sie beim nächsten Mal nicht als "neu" gilt.
                            // Wir markieren guildDataWasModified nicht unbedingt hier, da das Setzen von lastMatchIds unten das übernimmt.
                            await new Promise(resolve => setTimeout(resolve, 500)); // Kurze Pause nach einem Fehler
                            continue; // Zum nächsten Match in newMatchesToProcess
                        } else {
                            // Andere Fehler (z.B. 404, 429, 5xx) werden hier geworfen und vom äußeren catch behandelt.
                            console.error(`[FocusTrackerPolling] Nicht-403 Fehler beim Holen von Details für Match ${matchId} (Spieler ${riotId}):`, error.message);
                            // Optional: Dieses Match auch überspringen oder den Fehler anders behandeln
                            await new Promise(resolve => setTimeout(resolve, 500)); // Kurze Pause
                            continue; // Zum nächsten Match
                        }
                    }

                    guildDataWasModified = true; // Ein Spiel wird verarbeitet oder wurde zumindest versucht zu verarbeiten (und lastMatchIds wird aktualisiert)


                    if (matchDetails) { // Nur wenn matchDetails erfolgreich geholt wurden (kein 403 oder anderer Fehler oben)
                        const analysisResult = analyzeMatchAndBuildEmbed(matchDetails, player.puuid, player.riotId, true, false);

                        if (analysisResult && analysisResult.embed && analysisResult.gameStats) {
                            try {
                                await notificationChannel.send({ embeds: [analysisResult.embed] });
                                console.log(`[FocusTrackerPolling] Spiel ${matchId} für ${player.riotId} gepostet.`);

                                player.recentGames.unshift(analysisResult.gameStats);
                                if (player.recentGames.length > config.MAX_RECENT_GAMES) {
                                    player.recentGames.pop();
                                }
                                await checkAndAnnounceStreaks(player.recentGames, notificationChannel, player);
                            } catch (sendError) {
                                console.error(`[FocusTrackerPolling] Fehler beim Senden für Match ${matchId} (Spieler ${player.riotId}):`, sendError);
                            }
                        }
                    }
                    await new Promise(resolve => setTimeout(resolve, 2500)); // Pause nach Verarbeitung eines Matches
                } // Ende der Schleife über newMatchesToProcess

                // Aktualisiere lastMatchIds des Spielers mit der Liste, die dieses Mal von der API kam.
                // Das stellt sicher, dass auch übersprungene (403) Spiele aus diesem Batch als "gesehen" gelten.
                player.lastMatchIds = [...currentMatchIdsFromApi].slice(0, config.MATCHES_TO_CHECK_PER_POLL);
                guildDataWasModified = true; // Sicherstellen, dass gespeichert wird, da lastMatchIds aktualisiert wurde.

            } catch (error) { // Fängt Fehler vom getMatchIds oder andere unerwartete Fehler im Spieler-Loop
                console.error(`[FocusTrackerPolling] Schwerer Fehler im Polling-Loop für Spieler ${player.riotId || 'Unbekannt'}:`,
                    error.response ? {status: error.response.status, data: error.response.data } : error.message);
                if (error.response?.status === 429) { // Rate Limit beim Holen der Match-Liste
                    try {
                        await notificationChannel.send(`API Limit für Riot API erreicht beim Prüfen von **${player.riotId || 'Fokusspieler'}**.`).catch(console.error);
                    } catch (e) { console.error("[FocusTrackerPolling] Fehler Rate-Limit-Warnung:", e); }
                }
            }
            await new Promise(resolve => setTimeout(resolve, 1000)); // Pause zwischen Spielern
        } // Ende der Schleife über guildData.focusedPlayers

        if (guildDataWasModified) {
            try {
                await guildData.save();
                console.log(`[FocusTrackerPolling] Daten für Guild ${guildId} gespeichert.`);
            } catch (saveError) {
                console.error(`[FocusTrackerPolling] Fehler beim Speichern der Daten für Guild ${guildId}:`, saveError);
            }
        }
        await new Promise(resolve => setTimeout(resolve, 5000)); // Pause vor der nächsten Gilde
    }
    console.log(`[${new Date().toLocaleString()}] [FocusTrackerPolling] Prüfung abgeschlossen.`);
}

module.exports = { checkFocusedPlayerForNewGames };
