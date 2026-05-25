const express = require('express');
const router = express.Router();
const { createGame: createInitialState } = require('./../bao-engine');
const authenticateToken = require('../middleware/auth');
const User = require('../models/User');
const Game = require('../models/Game');
const Profile = require('../models/Profile');
const GameResult = require('../models/GameResult');

// --- Helpers ---
function randomInviteCode() {
    return Math.random().toString(36).substring(2, 9).toUpperCase(); // 7-char e.g. "A3BK9ZX"
}

// Apply auth to all routes below except leaderboard
router.get('/leaderboard', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = 20;
        const skip = (page - 1) * limit;
        const [profiles, total] = await Promise.all([
            Profile.find({ isBot: { $ne: true } })
                .sort({ wins: -1, losses: 1 })
                .skip(skip).limit(limit)
                .populate('userId', 'username'),
            Profile.countDocuments({ isBot: { $ne: true } }),
        ]);
        res.json({
            profiles: profiles.map((p, i) => ({
                rank: skip + i + 1,
                username: p.userId?.username || p.displayName,
                displayName: p.displayName,
                wins: p.wins || 0,
                losses: p.losses || 0,
                gamesPlayed: p.gamesPlayed || 0,
                winRate: (p.gamesPlayed || 0) > 0
                    ? Math.round(((p.wins || 0) / p.gamesPlayed) * 100)
                    : 0,
            })),
            total, page, totalPages: Math.ceil(total / limit),
        });
    } catch (err) {
        console.error('Leaderboard error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Auth required for everything else
router.use(authenticateToken);

// GET /api/games — list open public games (not created by me)
router.get('/', async (req, res) => {
    const { baoProfileId } = req.user;
    try {
        const games = await Game.find({
            status: 'waiting',
            vsAi: false,
            $or: [
                { isPrivate: false },
                { isPrivate: true, inviteeId: baoProfileId },
            ],
            player1Id: { $ne: baoProfileId },
        }).populate('player1Id', 'displayName').sort({ createdAt: -1 }).limit(50);

        res.json(games.map(g => ({
            id: g._id,
            player1_name: g.player1Id?.displayName || 'Unknown',
            is_private: g.isPrivate,
        })));
    } catch (err) {
        console.error('Fetch games error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// GET /api/games/active — get current active games for this user
router.get('/active', async (req, res) => {
    const { baoProfileId } = req.user;
    try {
        const games = await Game.find({
            status: { $in: ['active', 'waiting'] },
            $or: [{ player1Id: baoProfileId }, { player2Id: baoProfileId }],
        }).populate('player1Id', 'displayName').populate('player2Id', 'displayName').sort({ createdAt: -1 });
        
        res.json(games.map(g => {
            const isPlayer1 = g.player1Id && g.player1Id._id.toString() === baoProfileId;
            const opponentName = isPlayer1 ? (g.player2Id?.displayName || 'Waiting for opponent...') : (g.player1Id?.displayName || 'Unknown');
            
            return {
                id: g._id, 
                status: g.status, 
                vsAi: g.vsAi,
                opponentName
            };
        }));
    } catch (err) {
        console.error('Active game error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// GET /api/games/results — recent results
router.get('/results', async (req, res) => {
    try {
        const results = await GameResult.find()
            .sort({ createdAt: -1 }).limit(10)
            .populate('winnerProfileId', 'displayName')
            .populate('loserProfileId', 'displayName');
        res.json(results.map(r => ({
            id: r._id,
            winner_name: r.winnerProfileId?.displayName || '?',
            loser_name: r.loserProfileId?.displayName || '?',
            created_at: r.createdAt,
            is_vs_ai: r.isVsAi,
        })));
    } catch (err) {
        console.error('Results error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// GET /api/games/invite/:code — look up a private game by invite code
router.get('/invite/:code', async (req, res) => {
    try {
        const game = await Game.findOne({
            inviteCode: req.params.code.toUpperCase(),
            status: 'waiting',
        }).populate('player1Id', 'displayName');
        if (!game) return res.status(404).json({ message: 'Invite not found or game already started.' });
        res.json({
            id: game._id,
            player1_name: game.player1Id?.displayName || 'Unknown',
            inviteCode: game.inviteCode,
        });
    } catch (err) {
        console.error('Invite lookup error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// POST /api/games — create a game
router.post('/', async (req, res) => {
    const { baoProfileId } = req.user;
    const { isPrivate, vsAi, inviteeUsername } = req.body;

    try {
        // Cancel any existing waiting game this player created
        await Game.deleteMany({ player1Id: baoProfileId, status: 'waiting' });

        const initialState = createInitialState('kujifunza');
        let inviteeId = null;
        let inviteCode = null;

        if (isPrivate) {
            inviteCode = randomInviteCode();
            if (inviteeUsername) {
                const inviteeUser = await User.findOne({ username: inviteeUsername.toLowerCase().trim() });
                if (inviteeUser) {
                    const inviteeProfile = await Profile.findOne({ userId: inviteeUser._id });
                    if (inviteeProfile) inviteeId = inviteeProfile._id;
                }
            }
        }

        let botProfileId = null;
        if (vsAi) {
            let botProfile = await Profile.findOne({ isBot: true });
            if (!botProfile) {
                botProfile = await Profile.create({ userId: baoProfileId, displayName: 'Computer 🤖', isBot: true });
            }
            botProfileId = botProfile._id;
        }

        const game = await Game.create({
            player1Id: baoProfileId,
            player2Id: vsAi ? botProfileId : null,
            gameState: initialState,
            status: vsAi ? 'active' : 'waiting',
            vsAi: !!vsAi,
            isPrivate: !!isPrivate || !!vsAi,
            inviteeId,
            inviteCode,
        });

        res.status(201).json({
            id: game._id,
            status: game.status,
            vsAi: game.vsAi,
            isPrivate: game.isPrivate,
            inviteCode: game.inviteCode,
        });
    } catch (err) {
        console.error('Create game error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// POST /api/games/:gameId/join
router.post('/:gameId/join', async (req, res) => {
    const { baoProfileId } = req.user;
    const { gameId } = req.params;
    try {
        const game = await Game.findById(gameId);
        if (!game) return res.status(404).json({ message: 'Game not found.' });
        if (game.status !== 'waiting') return res.status(400).json({ message: 'Game already started.' });
        if (game.player1Id.toString() === baoProfileId) {
            return res.status(400).json({ message: 'You cannot join your own game.' });
        }
        if (game.isPrivate && game.inviteeId && game.inviteeId.toString() !== baoProfileId) {
            return res.status(403).json({ message: 'You are not invited to this game.' });
        }

        game.player2Id = baoProfileId;
        game.status = 'active';
        await game.save();

        res.json({ id: game._id, status: game.status });
    } catch (err) {
        console.error('Join game error:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
