// src/services/streakService.js
const { EmbedBuilder } = require('discord.js');
// Kein direkter focusService.save() Aufruf hier, da das aufrufende Modul (pollingService)
// das Speichern des modifizierten player-Objekts übernehmen sollte.

/**
 * Überprüft auf Sieges-, Niederlagen- und schlechte KDA-Strähnen und sendet Benachrichtigungen.
 * Modifiziert das übergebene player-Objekt direkt mit den neuen Streak-Status-Flags.
 *
 * @param {Array<object>} recentGames Array der letzten Spiele-Statistiken (neuestes zuerst).
 * Jedes Objekt sollte { win: boolean, kdaRatio: number }.
 * @param {import('discord.js').TextChannel} targetChannel Der Discord-Kanal für Benachrichtigungen.
 * @param {object} player Das focusedPlayer-Objekt aus focusData. Es wird direkt modifiziert.
 * Erwartet Properties wie: riotId (oder gameName),
 * winStreakNotified, lossStreakNotified, onBadKdaStreak, onBadKdaStreakNotified.
 */
async function checkAndAnnounceStreaks(recentGames, targetChannel, player) {
    if (!targetChannel || !player || recentGames.length < 3) {
        // Nicht genügend Spiele für eine Streak-Analyse oder ungültige Daten
        return;
    }

    const playerName = player.riotId || player.gameName || "Der Spieler"; // Fallback-Name
    const lastThreeGames = recentGames.slice(0, 3); // Die letzten 3 Spiele (neuestes an Index 0)

    // Win Streak
    const isWinStreak = lastThreeGames.every(g => g.win);
    if (isWinStreak) {
        if (!player.winStreakNotified) {
            const embed = new EmbedBuilder()
                .setColor('#FFD700') // Gold
                .setTitle(`🔥 ${playerName} ist auf einer Siegessträhne! 🔥`)
                .setDescription("DREI Siege in Folge! Weiter so, Champion! 🚀")
                .setTimestamp();
            await targetChannel.send({ embeds: [embed] }).catch(console.error);
            player.winStreakNotified = true;
        }
    } else {
        // Wenn keine Siegessträhne (mehr) besteht, Flag zurücksetzen,
        // damit bei einer neuen Strähne wieder benachrichtigt wird.
        player.winStreakNotified = false;
    }

    // Loss Streak
    const isLossStreak = lastThreeGames.every(g => !g.win);
    if (isLossStreak) {
        if (!player.lossStreakNotified) {
            const embed = new EmbedBuilder()
                .setColor('#708090') // Slate Gray
                .setTitle(`💀 ${playerName}, was ist da los? 💀`)
                .setDescription("Drei Niederlagen am Stück... Kleine Pause? 🍵 Oder weiterfeeden! 😉")
                .setTimestamp();
            await targetChannel.send({ embeds: [embed] }).catch(console.error);
            player.lossStreakNotified = true;
        }
    } else {
        player.lossStreakNotified = false;
    }

    // Bad KDA Streak (KDA < 1 für 3 Spiele)
    // Annahme: gameStats enthält kdaRatio
    const isBadKdaStreak = lastThreeGames.every(g => g.kdaRatio < 1);
    if (isBadKdaStreak) {
        if (!player.onBadKdaStreakNotified) { // Prüfe auf die Benachrichtigungs-Flag
            const embed = new EmbedBuilder()
                .setColor('#A52A2A') // Brown
                .setTitle(`📉 ${playerName}, KDA im Keller! 📉`)
                .setDescription("Drei Spiele hintereinander mit einer KDA unter 1. Zeit, das Ruder rumzureißen!")
                .setTimestamp();
            await targetChannel.send({ embeds: [embed] }).catch(console.error);
            player.onBadKdaStreak = true; // Die Strähne ist aktiv
            player.onBadKdaStreakNotified = true; // Benachrichtigung wurde gesendet
        }
    } else {
        // Wenn eine schlechte KDA-Strähne aktiv war und das letzte Spiel die Strähne bricht
        if (player.onBadKdaStreak && recentGames[0].kdaRatio >= 1) {
            const embed = new EmbedBuilder()
                .setColor('#34A853') // Green
                .setTitle(`✨ ${playerName} hat die KDA-Kurve gekriegt! ✨`)
                .setDescription(`Stark! Die Serie mit KDA < 1 wurde mit einer KDA von ${recentGames[0].kdaRatio.toFixed(2)} gebrochen! 💪`)
                .setTimestamp();
            await targetChannel.send({ embeds: [embed] }).catch(console.error);
        }
        // Setze beide Flags zurück, wenn keine schlechte KDA-Strähne (mehr) vorliegt
        player.onBadKdaStreak = false;
        player.onBadKdaStreakNotified = false;
    }

    // Da das player-Objekt direkt modifiziert wurde, muss der Aufrufer
    // (z.B. pollingService) dafür sorgen, dass diese Änderungen gespeichert werden,
    // z.B. durch focusService.setGuildData(guildId, guildData)
}

module.exports = { checkAndAnnounceStreaks };