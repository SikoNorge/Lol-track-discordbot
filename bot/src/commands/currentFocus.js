// src/commands/currentFocus.js
const focusService = require('../services/focusDataService'); // focusServiceCmd4 umbenannt für Konsistenz
const { EmbedBuilder } = require('discord.js');
const config = require('../config'); // Für das Prefix im Beispiel

module.exports = {
    name: 'currentfocus',
    description: 'Zeigt die aktuell überwachten Spieler an.',
    usage: 'currentfocus',
    aliases: ['listfocus', 'fokusliste'], // Optionale Aliase
    async execute(message, args, client) { // client hinzugefügt für den Fall, dass man den Bot-Namen/Icon im Footer möchte
        const guildData = focusService.getGuildData(message.guild.id);

        // Überprüfen, ob focusedPlayers existiert, ein Array ist und Spieler enthält
        if (!guildData.focusedPlayers || !Array.isArray(guildData.focusedPlayers) || guildData.focusedPlayers.length === 0) {
            return message.channel.send('Es werden derzeit keine Spieler auf diesem Server überwacht.').catch(console.error);
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff') // Eine passende Farbe
            .setTitle(`Aktuell überwachte Spieler auf ${message.guild.name}`)
            .setTimestamp()
            .setFooter({ text: `Angefordert von ${message.author.username}`, iconURL: message.author.displayAvatarURL() });

        if (guildData.focusedPlayers.length > 0) {
            let description = "Hier ist die Liste der Spieler, die aktiv überwacht werden:\n\n";
            guildData.focusedPlayers.forEach((player, index) => {
                description += `**${index + 1}. ${player.riotId || 'Unbekannter Name'}**\n`;
                description += `   - Region: \`${player.region || player.apiRoutingValue || 'N/A'}\`\n`;
                // description += `   - PUUID: \`${player.puuid}\`\n`; // PUUID ist für Nutzer weniger relevant
                description += `   - Spiele im Cache: ${player.recentGames?.length || 0}\n`;
                description += `   - Letzte Match IDs (bis zu ${config.MATCHES_TO_CHECK_PER_POLL}): ${player.lastMatchIds?.slice(0,3).join(', ') || 'Keine'}${player.lastMatchIds?.length > 3 ? '...' : ''}\n\n`;
            });
            embed.setDescription(description);
        } else {
            // Dieser Fall sollte durch die Prüfung oben bereits abgedeckt sein, aber als Fallback
            embed.setDescription("Es werden derzeit keine Spieler überwacht.");
        }

        await message.channel.send({ embeds: [embed] }).catch(console.error);
    }
};