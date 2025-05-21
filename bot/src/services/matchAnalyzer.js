// src/services/matchAnalyzer.js
const { EmbedBuilder } = require('discord.js');
const { calculateUtilityScore } = require('../utils/utilityCalculator'); // Pfad anpassen, falls utils nicht im src-Ordner ist
const config = require('../config');

/**
 * Analysiert Match-Daten für einen Spieler und erstellt ein detailliertes Embed sowie strukturierte Spieldaten.
 * @param {object} matchData Das vollständige Match-Detail-Objekt von der Riot API.
 * @param {string} puuid Die PUUID des fokussierten Spielers.
 * @param {string} playerRiotId Die Riot ID (Name#TAG) des Spielers für den Footer.
 * @param {boolean} fromPolling Gibt an, ob die Analyse durch das Polling ausgelöst wurde (für den Embed-Titel).
 * @param {boolean} isInitialFocusAnalysis Gibt an, ob es sich um die initiale Analyse nach einem !focus handelt.
 * @returns {object|null} Ein Objekt mit { embed, gameStats } oder null bei Fehlern.
 * gameStats: { matchId, win, kdaRatio, gameEndTimestamp, utilityScore, championName, gameMode }
 */
function analyzeMatchAndBuildEmbed(matchData, puuid, playerRiotId, fromPolling = false, isInitialFocusAnalysis = false) {
    if (!matchData || !matchData.info || !matchData.info.gameEndTimestamp) {
        console.log(`[matchAnalyzer] Match ${matchData?.metadata?.matchId} unvollständig oder ohne End-Timestamp. Überspringe.`);
        return null;
    }

    const playerStats = matchData.info.participants.find(p => p.puuid === puuid);
    if (!playerStats) {
        console.log(`[matchAnalyzer] Spielerdaten für PUUID ${puuid} nicht im Match ${matchData.metadata.matchId} gefunden.`);
        return null;
    }

    const {
        win,
        kills,
        deaths,
        assists,
        championName,
        totalDamageDealtToChampions,
        goldEarned,
        visionScore,
        damageDealtToObjectives,
        challenges // Für KDA und andere Challenge-basierte Metriken
    } = playerStats;

    const gameDuration = matchData.info.gameDuration;
    const gameMode = matchData.info.gameMode;
    const matchId = matchData.metadata.matchId;

    // KDA-Berechnung (aus index_backup.js übernommen, ggf. an utilityCalculator anpassen/abgleichen)
    // In utilityCalculator.js wird KDA auch berechnet, hier entscheiden, welche Logik Vorrang hat oder ob sie identisch ist.
    // Die KDA-Logik in utilityCalculator ist abhängig von playerStats.challenges.kda.
    // Hier die direkte Berechnung für das Embed, utilityScore nutzt dann die komplexere Variante.
    let kdaRatio = deaths === 0 ? (kills + assists) * 1.2 : (kills + assists) / deaths;
    if (deaths === 0 && (kills > 0 || assists > 0) && kdaRatio === 0) kdaRatio = (kills + assists) * 1.2;


    // Utility Score berechnen
    const utilityScore = calculateUtilityScore(playerStats, matchData.info.participants, gameDuration); //

    // Durchschnittswerte berechnen
    const totalGameDamageAllPlayers = matchData.info.participants.reduce((sum, p) => sum + p.totalDamageDealtToChampions, 0);
    const averageGameDamage = matchData.info.participants.length > 0 ? Math.round(totalGameDamageAllPlayers / matchData.info.participants.length) : 0;
    const totalGameGoldAllPlayers = matchData.info.participants.reduce((sum, p) => sum + p.goldEarned, 0);
    const averageGameGold = matchData.info.participants.length > 0 ? Math.round(totalGameGoldAllPlayers / matchData.info.participants.length) : 0;

    // Spezifische Nachrichten und Titel-Präfix
    const isGoodKDA = kdaRatio > 3;
    let specialKdaMessage = isGoodKDA ? "**WAS EINE KD VON ÜBER 3 ?!?!?!** 🔥\n" : "";
    let gameResponseMessage = isGoodKDA ? "🎉 Super Runde! 🎉" : "Da war der Kopf wohl nicht auf Hochtouren!";
    if (deaths === 0 && (kills > 0 || assists > 0)) gameResponseMessage = "✨ PERFEKTE KDA! ✨";

    const embedTitlePrefix = fromPolling ? "Neues Spiel entdeckt: " : (isInitialFocusAnalysis ? "Analyse Spiel: " : "");

    const winStatusText = win ? "Sieg" : "Niederlage"; //

    const embed = new EmbedBuilder()
        .setTitle(`${embedTitlePrefix}${championName} - ${gameMode}`)
        .setColor(utilityScore >= 7.5 ? '#34A853' : (utilityScore >= 4.5 ? '#FBBC05' : '#EA4335')) // Grün >=7.5, Gelb >=4.5, sonst Rot
        .setDescription(`${specialKdaMessage}${winStatusText} (${Math.floor(gameDuration / 60)}m ${gameDuration % 60}s)\n*${gameResponseMessage}*`)
        .setThumbnail(`http://ddragon.leagueoflegends.com/cdn/${config.LOL_DDRAGON_VERSION}/img/champion/${championName}.png`) //
        .addFields(
            { name: 'K/D/A', value: `${kills}/${deaths}/${assists} (${kdaRatio.toFixed(2)})`, inline: true },
            { name: 'Nützlichkeit', value: `**${utilityScore} / 10**`, inline: true }, //
            { name: 'Schaden an Champs', value: `${totalDamageDealtToChampions.toLocaleString('de-DE')} (Avg: ${averageGameDamage.toLocaleString('de-DE')})`, inline: false }, //
            { name: 'Gold', value: `${goldEarned.toLocaleString('de-DE')} (Avg: ${averageGameGold.toLocaleString('de-DE')})`, inline: true }, //
            { name: 'Vision Score', value: visionScore.toString(), inline: true }, //
            { name: 'Objective Dmg', value: (damageDealtToObjectives || 0).toLocaleString('de-DE'), inline: true } //
        )
        .setTimestamp(new Date(matchData.info.gameEndTimestamp))
        .setFooter({ text: `Match ID: ${matchId} | Für ${playerRiotId}` }); //

    const gameStats = {
        matchId: matchId,
        win: win,
        kdaRatio: parseFloat(kdaRatio.toFixed(2)),
        gameEndTimestamp: matchData.info.gameEndTimestamp,
        utilityScore: utilityScore,
        championName: championName,
        gameMode: gameMode
    };

    return { embed, gameStats };
}

module.exports = { analyzeMatchAndBuildEmbed };