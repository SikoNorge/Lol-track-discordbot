// src/commands/help.js
const { EmbedBuilder } = require('discord.js');
const config = require('../config'); // Für config.PREFIX

module.exports = {
    name: 'help',
    aliases: ['hilfe', 'commands', 'cmd'], // Hinzufügen von Aliasen
    description: 'Zeigt eine Liste aller Befehle oder detaillierte Infos zu einem spezifischen Befehl.',
    usage: 'help [Befehlsname]', // Die Syntax des Hilfe-Befehls selbst
    execute(message, args, client) {
        const prefix = config.PREFIX;

        if (!args.length) {
            // ----- Allgemeine Hilfe: Liste aller Befehle -----
            const helpEmbed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('📜 Bot Befehlsübersicht')
                .setDescription(`Hier ist eine Liste aller verfügbaren Befehle. Für mehr Details zu einem bestimmten Befehl, tippe \`${prefix}help [Befehlsname]\`.\n\n`)
                .setTimestamp()
                .setFooter({ text: `${client.user.username} | Gesamtzahl Befehle: ${client.commands.size}` });

            // Iteriere über die Befehle und füge sie zum Embed hinzu
            // Wir verwenden addFields mit einem Array von Feldobjekten
            const commandFields = client.commands.map(command => {
                let usageHint = '';
                if (command.usage) {
                    // Entferne den Befehlsnamen selbst aus der usage-Angabe, falls vorhanden, für die Übersicht
                    const cmdNamePattern = new RegExp(`^${command.name}\\s*`, 'i');
                    usageHint = command.usage.replace(cmdNamePattern, '').trim();
                }
                return {
                    name: `\`${prefix}${command.name}${usageHint ? ` ${usageHint}` : ''}\``,
                    value: command.description || 'Keine Beschreibung vorhanden.',
                    inline: false // Setze auf false für bessere Lesbarkeit pro Befehl
                };
            });

            helpEmbed.addFields(commandFields);

            return message.channel.send({ embeds: [helpEmbed] }).catch(console.error);

        } else {
            // ----- Spezifische Hilfe für einen Befehl -----
            const commandName = args[0].toLowerCase();
            const command = client.commands.get(commandName) ||
                client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

            if (!command) {
                return message.reply(`Der Befehl \`${prefix}${commandName}\` existiert nicht. Gib \`${prefix}help\` ein, um eine Liste aller Befehle zu sehen.`).catch(console.error);
            }

            const specificHelpEmbed = new EmbedBuilder()
                .setColor('#34A853') // Andere Farbe für spezifische Hilfe
                .setTitle(`ℹ️ Hilfe für: \`${prefix}${command.name}\``)
                .setTimestamp()
                .setFooter({ text: `${client.user.username} | Befehlsdetails` });

            if (command.description) {
                specificHelpEmbed.addFields({ name: 'Beschreibung', value: command.description });
            }

            // Nutzung / Syntax
            let usageString = `${prefix}${command.name}`;
            if (command.usage) {
                // Entferne den Befehlsnamen selbst aus der usage-Angabe, da er schon im Prefix steht
                const cmdNamePattern = new RegExp(`^${command.name}\\s*`, 'i');
                const usageArgs = command.usage.replace(cmdNamePattern, '').trim();
                if (usageArgs) {
                    usageString += ` ${usageArgs}`;
                }
            }
            specificHelpEmbed.addFields({ name: 'Nutzung', value: `\`${usageString}\`` });


            if (command.aliases && command.aliases.length > 0) {
                specificHelpEmbed.addFields({ name: 'Aliase', value: command.aliases.map(a => `\`${prefix}${a}\``).join(', ') });
            }

            // Hier könntest du später noch Informationen zu Cooldowns oder benötigten Berechtigungen hinzufügen,
            // falls deine Befehle solche Eigenschaften haben.

            return message.channel.send({ embeds: [specificHelpEmbed] }).catch(console.error);
        }
    }
};