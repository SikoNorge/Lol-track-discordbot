// utils/utilityCalculator.js

/**
 * Berechnet einen Nützlichkeits-Score für einen Spieler basierend auf seinen Statistiken.
 * @param {object} playerStats Das ParticipantDto des Spielers aus den Match-Details.
 * @param {Array<object>} allParticipantsStats Array aller ParticipantDtos im Match.
 * @param {number} gameDurationSeconds Dauer des Spiels in Sekunden.
 * @returns {number} Ein Score zwischen 1 und 10.
 */
function calculateUtilityScore(playerStats, allParticipantsStats, gameDurationSeconds) {
    let score = 0;
    const gameDurationMinutes = gameDurationSeconds > 0 ? gameDurationSeconds / 60 : 1;

    // Default-Werte für Challenges, falls nicht vorhanden
    const challenges = playerStats.challenges || {};

    // 1. KDA und Kill Participation (max 3.0 Punkte)
    //    KDA: challenges.kda oder manuell berechnet
    //    KP: challenges.killParticipation
    let kda = challenges.kda !== undefined ? challenges.kda : (playerStats.deaths === 0 ? (playerStats.kills + playerStats.assists) * 1.2 : (playerStats.kills + playerStats.assists) / playerStats.deaths);
    if (playerStats.deaths === 0 && (playerStats.kills > 0 || playerStats.assists > 0) && kda === 0) kda = (playerStats.kills + playerStats.assists) * 1.2;


    if (kda >= 7) score += 1.5;
    else if (kda >= 4) score += 1.0;
    else if (kda >= 2) score += 0.5;

    const killParticipation = challenges.killParticipation || 0;
    if (killParticipation >= 0.65) score += 1.5; // Sehr hohe KP
    else if (killParticipation >= 0.50) score += 1.0; // Gute KP
    else if (killParticipation >= 0.35) score += 0.5; // Akzeptable KP

    // 2. Schaden an Champions (max 2.5 Punkte)
    //    Verwendet teamDamagePercentage, wenn vorhanden, sonst rohen Schaden im Vgl. zum Avg.
    const teamDamagePercentage = challenges.teamDamagePercentage || 0;
    if (teamDamagePercentage > 0) { // Wenn Challenge-Daten da sind
        if (teamDamagePercentage >= 0.33) score += 2.5; // Top-Tier Schaden
        else if (teamDamagePercentage >= 0.28) score += 2.0;
        else if (teamDamagePercentage >= 0.22) score += 1.5;
        else if (teamDamagePercentage >= 0.17) score += 1.0;
        else if (teamDamagePercentage >= 0.12) score += 0.5;
    } else { // Fallback auf rohen Schaden
        const totalDamageAllPlayers = allParticipantsStats.reduce((sum, p) => sum + p.totalDamageDealtToChampions, 0);
        const averageDamage = allParticipantsStats.length > 0 ? totalDamageAllPlayers / allParticipantsStats.length : 1;
        if (averageDamage > 0) {
            const damageRatio = playerStats.totalDamageDealtToChampions / averageDamage;
            if (damageRatio >= 1.6) score += 2.0; // Fallback hat etwas weniger max. Punkte als Team%
            else if (damageRatio >= 1.3) score += 1.5;
            else if (damageRatio >= 1.0) score += 1.0;
            else if (damageRatio >= 0.7) score += 0.5;
        }
    }

    // 3. Ökonomie (Gold & CS) (max 2.0 Punkte)
    //    challenges.goldPerMinute, challenges.laneMinionsFirst10Minutes
    const goldPerMinute = challenges.goldPerMinute || (gameDurationMinutes > 0 ? playerStats.goldEarned / gameDurationMinutes : 0);
    // Gute GPM Werte: >400 ist gut, >500 sehr gut, >600 exzellent (sehr spielabhängig)
    if (goldPerMinute >= 550) score += 1.0;
    else if (goldPerMinute >= 450) score += 0.75;
    else if (goldPerMinute >= 350) score += 0.5;

    const csPerMinute = gameDurationMinutes > 0 ? (playerStats.totalMinionsKilled + playerStats.neutralMinionsKilled) / gameDurationMinutes : 0;
    if (csPerMinute >= 9) score += 1.0;
    else if (csPerMinute >= 7) score += 0.75;
    else if (csPerMinute >= 5) score += 0.5;

    // 4. Vision (max 1.5 Punkte)
    //    challenges.visionScorePerMinute, challenges.controlWardsPurchased
    const visionScorePerMinute = challenges.visionScorePerMinute || (gameDurationMinutes > 0 ? playerStats.visionScore / gameDurationMinutes : 0);
    const controlWards = challenges.controlWardsPurchased || 0; // Oder playerStats.visionWardsBoughtInGame

    if (visionScorePerMinute >= 1.8 || (visionScorePerMinute >= 1.2 && controlWards >= 3)) score += 1.5; // Exzellent
    else if (visionScorePerMinute >= 1.2 || (visionScorePerMinute >= 0.8 && controlWards >= 2)) score += 1.0; // Gut
    else if (visionScorePerMinute >= 0.7) score += 0.5; // Akzeptabel

    // 5. Objectives & Teamplay (max 2.0 Punkte)
    //    damageDealtToObjectives, turretTakedowns, challenges.objectiveDamagePerMinute
    //    challenges.epicMonsterKills (wenn solo oder duo)
    //    totalTimeCCDealt
    const objectiveDamage = playerStats.damageDealtToObjectives || 0;
    const turretTakedowns = playerStats.turretTakedowns || 0;
    const totalTimeCCDealt = playerStats.totalTimeCCDealt || 0;

    if (objectiveDamage > 10000 || turretTakedowns >= 7) score += 1.0; // Starker Objective Fokus
    else if (objectiveDamage > 5000 || turretTakedowns >= 4) score += 0.5;

    // CC Score (Zeit in Sekunden)
    if (totalTimeCCDealt >= 60) score += 1.0; // Sehr viel CC
    else if (totalTimeCCDealt >= 30) score += 0.5; // Guter CC Beitrag

    // Bonus für Sieg (optional, kann aber Nützlichkeit im Teamkontext widerspiegeln)
    if (playerStats.win) {
        score = Math.min(10, score + 0.5);
    }

    // Endgültige Skalierung und Begrenzung auf 1-10
    // Aktueller theoretischer Max-Score: 3 (KDA/KP) + 2.5 (Dmg) + 2 (Econ) + 1.5 (Vision) + 2 (Obj/CC) + 0.5 (Win) = 11.5
    let finalScore = Math.max(1, Math.min(10, score));

    return parseFloat(finalScore.toFixed(1));
}

module.exports = {
    calculateUtilityScore
};