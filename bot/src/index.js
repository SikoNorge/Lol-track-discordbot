// src/index.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config');
const mongoose = require('mongoose');
const pollingService = require('./services/pollingService');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel, Partials.Message],
});

// Command-Handler
client.commands = new Collection();
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.name, command);
}

// Event-Handler
const eventFiles = fs.readdirSync(path.join(__dirname, 'events')).filter(f => f.endsWith('.js'));
for (const file of eventFiles) {
    const event = require(`./events/${file}`);
    if (event.once) client.once(event.name, (...args) => event.execute(...args, client));
    else client.on(event.name, (...args) => event.execute(...args, client));
}

async function connectToDB() {
    try {
        if (!config.MONGODB_URI) {
            console.error('MONGODB_URI nicht in der .env-Datei gefunden! Bot kann nicht ohne Datenbankverbindung starten.');
            process.exit(1);
        }
        await mongoose.connect(config.MONGODB_URI, {
            // Optionen sind ab Mongoose 6 meist nicht mehr nötig, da sie gute Defaults haben.
            // useNewUrlParser: true, // Veraltet
            // useUnifiedTopology: true, // Veraltet
            // useCreateIndex: true, // Veraltet
            // useFindAndModify: false, // Veraltet
        });
        console.log('Erfolgreich mit MongoDB verbunden!');

        // Fokus-Daten laden (jetzt aus der DB, Funktion in focusDataService muss angepasst werden)
        // Das focusService.load() wird wahrscheinlich anders, es initialisiert vielleicht Modelle
        // oder führt eine erste Prüfung durch. Für den Moment kommentieren wir es aus, bis focusDataService überarbeitet ist.
        // await focusService.load(); // Muss angepasst werden für Mongoose

        // Polling starten, erst nachdem die DB-Verbindung steht und ggf. initiale Daten geladen sind
        if (config.RIOT_API_KEY) {
            console.log("Starte Polling-Service...");
            setInterval(() => pollingService.checkFocusedPlayerForNewGames(client), config.POLLING_INTERVAL_MS);
            // Ein initialer Check kurz nach dem Start kann sinnvoll sein
            setTimeout(() => pollingService.checkFocusedPlayerForNewGames(client), 10000); // z.B. nach 10 Sek.
        } else {
            console.warn('RIOT_API_KEY fehlt, Polling wird nicht gestartet.');
        }

    } catch (error) {
        console.error('Fehler beim Verbinden mit MongoDB:', error);
        process.exit(1); // Bot beenden, wenn DB-Verbindung fehlschlägt
    }
}

client.login(config.DISCORD_TOKEN);