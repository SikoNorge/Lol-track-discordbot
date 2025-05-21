// src/events/messageCreate.js
const config = require('../config');
module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message, client) {
        if (message.author.bot) return;
        if (!message.guild) return;
        if (!config.ALLOWED_CHANNEL_IDS.includes(message.channel.id)) return;
        const prefix = config.PREFIX;
        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();
        const command = client.commands.get(commandName);
        if (!command) return;
        try {
            await command.execute(message, args, client);
        } catch (error) {
            console.error(error);
            await message.reply('Es gab einen Fehler bei der Ausführung des Befehls.');
        }
    }
};