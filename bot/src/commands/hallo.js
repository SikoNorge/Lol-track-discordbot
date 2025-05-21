module.exports = {
    name: 'hallo',
    description: 'Begrüßt den Benutzer',
    aliases: ['hi', 'hey'],
    usage: '!hallo',
    execute(message) {
        message.reply(`Hallo, ${message.author.username}! 👋`);
    }
};