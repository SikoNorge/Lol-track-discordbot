// src/services/riotService.js
const axios = require('axios');
const configRiot = require('../config'); // Stellt sicher, dass dies auf dein src/config.js verweist

// Die Zuordnung von Regionen zu Riot-Plattform-Routing-Values
const PLATFORM_ROUTING = {
    euw1: 'europe',
    eun1: 'europe',
    tr1: 'europe', // Türkische Region
    ru: 'europe',   // Russische Region
    na1: 'americas',
    br1: 'americas',
    la1: 'americas', // LAN
    la2: 'americas', // LAS
    oc1: 'sea',    // Ozeanien (jetzt SEA routing value)
    jp1: 'asia',
    kr: 'asia',
    ph2: 'sea',    // Philippinen
    sg2: 'sea',    // Singapur
    th2: 'sea',    // Thailand
    tw2: 'sea',    // Taiwan
    vn2: 'sea',    // Vietnam
    // Standard-Fallback, falls keine spezifische Region passt
    default: 'europe' // Oder 'americas', je nachdem, was sinnvoller ist
};

/**
 * Gibt den allgemeinen Riot-Plattform-Routing-Value für eine spezifische Region zurück.
 * @param {string} region Die spezifische Serverregion (z.B. 'euw1', 'na1').
 * @returns {string} Der Plattform-Routing-Value (z.B. 'europe', 'americas').
 */
function getPlatformRouting(region) {
    return PLATFORM_ROUTING[region.toLowerCase()] || PLATFORM_ROUTING['default'];
}

/**
 * Ruft Account-Daten (insbesondere PUUID) anhand der Riot ID (gameName#tagLine) ab.
 * Verwendet den riot/account/v1 Endpunkt.
 * @param {string} gameName Der Spielname des Accounts.
 * @param {string} tagLine Der TagLine des Accounts (ohne '#').
 * @param {string} [region='euw1'] Die primäre Region des Spielers, um den korrekten Routing Value zu bestimmen.
 * Für Account-v1 ist der Routing Value globaler (americas, asia, europe, sea).
 * @returns {Promise<object>} Ein Promise, das die Account-Daten (inkl. puuid, gameName, tagLine) liefert.
 */
async function getAccountByRiotID(gameName, tagLine, region = 'euw1') {
    // Für Account-v1 wird der Routing-Value basierend auf der Region bestimmt.
    // Die Riot-ID selbst ist global, aber der API-Aufruf muss an einen regionalen Cluster gehen.
    const accountApiRoutingValue = getPlatformRouting(region); // z.B. 'europe', 'americas', 'asia', 'sea'

    const url = `https://${accountApiRoutingValue}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    // Logik aus index_backup.js für den Account API URL

    try {
        const response = await axios.get(url, {
            headers: { 'X-Riot-Token': configRiot.RIOT_API_KEY }
        });
        return response.data; // Sollte { puuid, gameName, tagLine } enthalten
    } catch (error) {
        console.error(`[RiotService] Fehler beim Abrufen des Accounts für ${gameName}#${tagLine} über Region ${region} (Routing: ${accountApiRoutingValue}):`,
            error.response ? { status: error.response.status, data: error.response.data } : error.message);
        throw error; // Wirft den Fehler weiter, damit er im aufrufenden Code (z.B. !focus Befehl) behandelt werden kann
    }
}

/**
 * Ruft eine Liste von Match-IDs für eine gegebene PUUID ab.
 * @param {string} puuid Die PUUID des Spielers.
 * @param {number} [count=configRiot.MATCHES_TO_CHECK_PER_POLL] Die Anzahl der abzurufenden Match-IDs.
 * @param {string} [matchApiRoutingValue='europe'] Der Match-API-Routing-Value (z.B. 'europe', 'americas').
 * @returns {Promise<Array<string>>} Ein Promise, das ein Array von Match-IDs liefert.
 */
async function getMatchIds(puuid, count = configRiot.MATCHES_TO_CHECK_PER_POLL, matchApiRoutingValue = 'europe') {
    // Der Routing Value hier ist spezifisch für die Match-v5 API und sollte korrekt übergeben werden.
    const url = `https://${matchApiRoutingValue}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`;
    // Filter für type=normal, type=ranked, type=tourney hinzugefügt, wie in index_backup.js

    try {
        const response = await axios.get(url, {
            headers: { 'X-Riot-Token': configRiot.RIOT_API_KEY }
        });
        return response.data;
    } catch (error) {
        console.error(`[RiotService] Fehler beim Abrufen der Match-IDs für PUUID ${puuid} (Routing: ${matchApiRoutingValue}):`,
            error.response ? { status: error.response.status, data: error.response.data } : error.message);
        throw error;
    }
}

/**
 * Ruft detaillierte Informationen für eine gegebene Match-ID ab.
 * @param {string} matchId Die ID des Matches.
 * @param {string} [matchApiRoutingValue='europe'] Der Match-API-Routing-Value.
 * @returns {Promise<object>} Ein Promise, das die Match-Detail-Daten liefert.
 */
async function getMatchDetails(matchId, matchApiRoutingValue = 'europe') {
    const url = `https://${matchApiRoutingValue}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
    try {
        const response = await axios.get(url, {
            headers: { 'X-Riot-Token': configRiot.RIOT_API_KEY }
        });
        return response.data;
    } catch (error) {
        console.error(`[RiotService] Fehler beim Abrufen der Match-Details für MatchID ${matchId} (Routing: ${matchApiRoutingValue}):`,
            error.response ? { status: error.response.status, data: error.response.data } : error.message);
        throw error;
    }
}

module.exports = {
    getAccountByRiotID,
    getMatchIds,
    getMatchDetails,
    getPlatformRouting // Exportiere auch diese Hilfsfunktion, falls sie extern benötigt wird
};