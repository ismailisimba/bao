const mongoose = require('mongoose');

const gameResultSchema = new mongoose.Schema({
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true, unique: true },
    winnerProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', required: true },
    loserProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', required: true },
    isVsAi: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('GameResult', gameResultSchema);
