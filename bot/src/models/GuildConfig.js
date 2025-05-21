// src/models/GuildConfig.js
const mongoose = require('mongoose');

const recentGameSchema = new mongoose.Schema({
    matchId: { type: String, required: true },
    win: { type: Boolean, required: true },
    kdaRatio: { type: Number, required: true },
    gameEndTimestamp: { type: Number, required: true },
    utilityScore: { type: Number, required: true },
    championName: String,
    gameMode: String
}, { _id: false }); // _id für Subdokumente ist oft nicht nötig, es sei denn man braucht es explizit

const playerSchema = new mongoose.Schema({
    puuid: { type: String, required: true, index: true }, // Index für schnellere Suche nach puuid
    riotId: { type: String, required: true },
    gameName: String,
    tagLine: String,
    region: String,
    apiRoutingValue: String,
    lastMatchIds: [String],
    recentGames: [recentGameSchema],
    winStreakNotified: { type: Boolean, default: false },
    lossStreakNotified: { type: Boolean, default: false },
    onBadKdaStreak: { type: Boolean, default: false },
    onBadKdaStreakNotified: { type: Boolean, default: false }
}, { _id: false }); // Wenn du Spieler nicht über eine eigene ID identifizieren musst innerhalb des Arrays

const guildSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true, index: true },
    notificationChannelId: { type: String, default: null },
    focusedPlayers: [playerSchema] // Array von Spieler-Subdokumenten
}, { timestamps: true }); // Fügt createdAt und updatedAt Timestamps hinzu

module.exports = mongoose.model('GuildConfig', guildSchema);