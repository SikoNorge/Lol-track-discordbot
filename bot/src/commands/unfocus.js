// src/commands/unfocus.js
const focusService = require('../services/focusDataService');
const config = require('../config'); // Für das Prefix in der Hilfenachricht

module.exports = {
    name: 'unfocus',
    description: 'Hebt die Überwachung für einen oder alle Spieler auf. Nutzung: !unfocus <SpielerName#TAG> | !unfocus all',
    usage: 'unfocus <SpielerName#TAG> | unfocus all',
    aliases: ['stopfocus', 'removefocus'],
    async execute(message, args) {
        const guildId = message.guild.id;
        const guildData = await focusService.getGuildData(guildId);

        if (!guildData.focusedPlayers || !Array.isArray(guildData.focusedPlayers) || guildData.focusedPlayers.length === 0) {
            return message.channel.send('Es werden derzeit keine Spieler überwacht, die entfokussiert werden könnten.').catch(console.error);
        }

        if (args.length === 0) {
            return message.reply(`Bitte gib an, welcher Spieler entfokussiert werden soll (Name#TAG) oder verwende \`${config.PREFIX}unfocus all\`, um alle Spieler zu entfernen.`).catch(console.error);
        }

        const argument = args.join(" ").toLowerCase(); // Erlaube Namen mit Leerzeichen und mache es case-insensitive

        if (argument === 'all') {
            const playerCount = guildData.focusedPlayers.length;
            guildData.focusedPlayers = []; // Leere das Array
            await focusService.setGuildData(message.guild.id, guildData);
            return message.channel.send(`Alle ${playerCount} Spieler wurden erfolgreich entfokussiert.`).catch(console.error);
        } else {
            // Versuche, einen bestimmten Spieler zu entfernen
            // Annahme: argument ist "SpielerName#TAG"
            const riotIdToRemove = args.join(" "); // Behalte die ursprüngliche Schreibweise für die Nachricht bei, vergleiche case-insensitive

            const initialPlayerCount = guildData.focusedPlayers.length;
            // Filtere den Spieler heraus, dessen riotId (case-insensitive) mit dem Argument übereinstimmt
            guildData.focusedPlayers = guildData.focusedPlayers.filter(
                player => player.riotId.toLowerCase() !== riotIdToRemove.toLowerCase()
            );

            if (guildData.focusedPlayers.length < initialPlayerCount) {
                await focusService.setGuildData(message.guild.id, guildData);
                return message.channel.send(`Spieler **${riotIdToRemove}** wurde erfolgreich entfokussiert.`).catch(console.error);
            } else {
                return message.channel.send(`Spieler **${riotIdToRemove}** wurde nicht in der Fokusliste gefunden.`).catch(console.error);
            }
        }
    }
};