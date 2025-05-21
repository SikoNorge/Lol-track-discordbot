// src/events/ready.js
const mongoose = require('mongoose');
const config = require('../config'); // Stellt sicher, dass der Pfad korrekt ist
const pollingService = require('../services/pollingService'); // Stellt sicher, dass der Pfad korrekt ist

// Diese Funktion wird jetzt hier definiert und aufgerufen
async function initializeDBAndPolling(client) {
    try {
        if (!config.MONGODB_URI) {
            console.error('MONGODB_URI nicht in der .env-Datei gefunden! Bot kann nicht ohne Datenbankverbindung starten.');
            // process.exit(1); // Im ready-Event ist ein harter Exit vielleicht nicht ideal, besser loggen und Bot läuft weiter ohne DB-Funktionen
            return; // Beende die Funktion, wenn keine URI vorhanden ist
        }
        await mongoose.connect(config.MONGODB_URI);
        console.log('Erfolgreich mit MongoDB verbunden!');

        // Polling starten, erst nachdem die DB-Verbindung steht
        if (config.RIOT_API_KEY) {
            console.log("Starte Polling-Service...");
            // Stelle sicher, dass checkFocusedPlayerForNewGames nicht sofort beim Setzen des Intervalls ausgeführt wird,
            // sondern erst nach dem ersten Intervall oder durch den initialen setTimeout.
            setInterval(() => {
                // Zusätzlicher Check, ob der Client noch bereit ist, bevor gepollt wird
                if (client.isReady()) { // client.isReady() ist eine Methode, kein Property
                    pollingService.checkFocusedPlayerForNewGames(client);
                }
            }, config.POLLING_INTERVAL_MS);

            // Ein initialer Check kurz nach dem Start
            setTimeout(() => {
                if (client.isReady()) {
                    pollingService.checkFocusedPlayerForNewGames(client);
                }
            }, 10000); // z.B. nach 10 Sek.

        } else {
            console.warn('RIOT_API_KEY fehlt, Polling wird nicht gestartet.');
        }

    } catch (error) {
        console.error('Fehler beim Verbinden mit MongoDB oder Starten des Pollings:', error);
        // Hier könntest du entscheiden, ob der Bot weiterlaufen soll oder nicht
    }
}

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) { // Die execute-Funktion ist oft schon async durch den Event-Loader
        console.log(`Bot ist eingeloggt als ${client.user.tag}!`);
        client.user.setActivity('LoL Matches', { type: 'WATCHING' }); // Optional: Bot-Status setzen

        // Datenbankverbindung herstellen und Polling starten
        await initializeDBAndPolling(client);
    },
};
