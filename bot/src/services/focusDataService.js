// src/services/focusDataService.js
const fsService = require('fs');
const configService = require('../config');
const GuildConfig = require('../models/GuildConfig');

let focusData = {};

/**
 * Ruft die Konfigurationsdaten für eine Gilde ab.
 * Erstellt einen neuen Eintrag, falls keiner existiert.
 * @param {string} guildId Die ID der Gilde.
 * @returns {Promise<object>} Das Mongoose-Dokument für die Gilde.
 */

async function getGuildData(guildId) {
    try {
        let guildConfig = await GuildConfig.findOne({ guildId: guildId });
        if (!guildConfig) {
            // Wenn keine Konfiguration für diese Gilde existiert, erstelle eine neue.
            guildConfig = new GuildConfig({
                guildId: guildId,
                notificationChannelId: null,
                focusedPlayers: []
            });
        }
        return guildConfig;
    } catch (error) {
        console.error(`Fehler beim Abrufen/Erstellen der GuildData für ${guildId}:`, error);
        // Hier könntest du ein Standardobjekt zurückgeben oder den Fehler weiterwerfen,
        // je nachdem, wie der aufrufende Code damit umgehen soll.
        // Für den Moment geben wir ein neues, nicht gespeichertes Objekt zurück, falls ein Fehler auftritt.
        return new GuildConfig({ guildId: guildId, notificationChannelId: null, focusedPlayers: [] });
    }
}

/**
 * Speichert/Aktualisiert die Konfigurationsdaten für eine Gilde.
 * @param {string} guildId Die ID der Gilde. (Technisch nicht mehr nötig, wenn man das Mongoose-Objekt hat)
 * @param {object} guildConfigObject Das Mongoose-Dokumentenobjekt, das gespeichert werden soll.
 */
async function setGuildData(guildId, guildConfigObject) { // guildId ist hier redundant, wenn guildConfigObject ein Mongoose-Dokument ist
    try {
        // Wenn guildConfigObject ein Mongoose-Dokument ist, hat es eine .save()-Methode
        if (guildConfigObject && typeof guildConfigObject.save === 'function') {
            await guildConfigObject.save();
        } else {
            // Fallback oder Fehler, falls kein gültiges Mongoose-Objekt übergeben wurde.
            // Dies könnte eine Aktualisierung basierend auf der guildId sein, wenn nur ein einfaches Objekt kommt.
            // Besser ist es, wenn die aufrufenden Funktionen das Mongoose-Objekt von getGuildData direkt modifizieren.
            // Beispiel: await GuildConfig.findOneAndUpdate({ guildId: guildId }, guildConfigObject, { upsert: true, new: true });
            // Für Konsistenz: getGuildData gibt ein Mongoose-Objekt zurück, dieses wird modifiziert und dann hier gespeichert.
            console.warn(`[FocusDataService] setGuildData erhielt kein Mongoose-Dokument für Guild ${guildId}. Speichern wird übersprungen oder erfordert andere Logik.`);
            // Um es sicher zu machen, falls ein einfaches Objekt kommt:
            await GuildConfig.findOneAndUpdate({ guildId: guildId }, guildConfigObject, { upsert: true, new: true });

        }
    } catch (error) {
        console.error(`Fehler beim Speichern der GuildData für ${guildId}:`, error);
    }
}

/**
 * Ruft alle Guild-Konfigurationen aus der Datenbank ab.
 * Nützlich für den pollingService.
 * @returns {Promise<Array<object>>} Ein Array aller GuildConfig-Dokumente.
 */
async function getAllGuildData() {
    try {
        return await GuildConfig.find({});
    } catch (error) {
        console.error('Fehler beim Abrufen aller Guild-Daten:', error);
        return [];
    }
}
module.exports = {
    getGuildData,
    setGuildData,
    getAllGuildData
};