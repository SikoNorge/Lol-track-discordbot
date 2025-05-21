// src/commands/setFocusChannel.js
const focusService = require('../services/focusDataService');
const { PermissionsBitField } = require('discord.js'); // Erforderlich für die Berechtigungsprüfung
// const config = require('../config'); // Falls der Rollenname in config.js definiert werden soll

module.exports = {
    name: 'setfocuschannel',
    description: 'Legt den Kanal für Match-Benachrichtigungen fest.',
    aliases: ['setchannel'],
    usage: 'setfocuschannel #kanalname', // Optionaler Alias
    // category: 'admin', // Optionale Kategorie für den Hilfe-Befehl
    async execute(message, args) { // args hinzugefügt, obwohl hier nicht direkt verwendet, aber Standard für execute
        // --- Berechtigungsprüfung (Logik aus index_backup.js) ---
        const requiredRoleName = "Eule"; // Passe diesen Namen an eure Rolle an!
        // Alternativ: config.REQUIRED_ADMIN_ROLE_NAME oder ähnlich
        const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator); //
        const hasRequiredRole = message.member.roles.cache.some(role => role.name.toLowerCase() === requiredRoleName.toLowerCase()); //

        if (!isAdmin && !hasRequiredRole) {
            return message.reply(`Du benötigst Administrator-Rechte oder die Rolle "${requiredRoleName}", um diesen Befehl auszuführen.`).catch(console.error); //
        }
        // --- Ende Berechtigungsprüfung ---

        // Erwarte eine Kanalerwähnung, wie in index_backup.js
        const mentionedChannel = message.mentions.channels.first(); //

        if (!mentionedChannel) {
            return message.reply("Bitte erwähne den Kanal, der für Benachrichtigungen verwendet werden soll. Beispiel: `!setfocuschannel #match-updates`").catch(console.error); //
        }

        const guildId = message.guild.id;
        const guildData = focusService.getGuildData(guildId); // Ruft vorhandene Daten ab oder initialisiert sie

        guildData.notificationChannelId = mentionedChannel.id; // ID des erwähnten Kanals speichern
        focusService.setGuildData(guildId, guildData); // Aktualisierte Daten speichern

        await message.reply(`Der Kanal ${mentionedChannel} wurde erfolgreich als Benachrichtigungskanal für Spielanalysen festgelegt!`).catch(console.error);
    }
};