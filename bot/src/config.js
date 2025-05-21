// src/config.js
require('dotenv').config();
const path = require('path');
module.exports = {
    DISCORD_TOKEN: process.env.DISCORD_TOKEN,
    RIOT_API_KEY: process.env.RIOT_API_KEY,
    MONGODB_URI: process.env.MONGODB_URI,
    PREFIX: '!',
    ALLOWED_CHANNEL_IDS: ['1374125421460852916'],
    LOL_DDRAGON_VERSION: '15.10.1',
    POLLING_INTERVAL_MS: 30 * 1000,
    MATCHES_TO_CHECK_PER_POLL: 5,
    MAX_RECENT_GAMES: 10,
};