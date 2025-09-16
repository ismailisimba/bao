const express = require('express');
const router = express.Router();
const db = require('../db');
const bao = require('./../bao-engine');
const authenticateToken = require('../middleware/auth');

// Apply the authentication middleware to all routes in this file
router.use(authenticateToken);

// GET /api/games - Get a list of open games
router.get('/', async (req, res) => {
try {
const result = await db.query("SELECT g.id, p.display_name as player1_name FROM games g JOIN bao_profiles p ON g.player1_id = p.id WHERE g.status = 'waiting'");
res.json(result.rows);
} catch (error) {
console.error('Error fetching games:', error);
res.status(500).json({ message: 'Internal server error' });
}
});

// NEW: GET /api/games/active - Get the user's current active game
router.get('/active', async (req, res) => {
const { baoProfileId } = req.user;
try {
const result = await db.query("SELECT * FROM games WHERE status = 'active' AND (player1_id = $1 OR player2_id = $1) LIMIT 1",[baoProfileId]);

    if (result.rows.length === 0) {
        return res.status(404).json({ message: 'No active game found.' });
    }
    
    res.json(result.rows[0]);
} catch (error) {
    console.error('Error fetching active game:', error);
    res.status(500).json({ message: 'Internal server error' });
}
});

// POST /api/games - Create a new game
router.post('/', async (req, res) => {
const { baoProfileId } = req.user; // Get the user's profile ID from the token

try {
    console.log("Creating game for profile ID:", bao);
    const initialState = bao.createGame('kujifunza'); // Or get type from req.body
    const result = await db.query(
        `INSERT INTO games (player1_id, game_state, status) 
         VALUES ($1, $2, 'waiting') 
         RETURNING id, status`,
        [baoProfileId, JSON.stringify(initialState)]
    );
    res.status(201).json(result.rows[0]);
} catch (error) {
    console.error('Error creating game:', error);
    res.status(500).json({ message: 'Internal server error' });
}
});

// POST /api/games/:gameId/join - Join an existing game
router.post('/:gameId/join', async (req, res) => {
const { gameId } = req.params;
const { baoProfileId } = req.user;

try {
    const result = await db.query(
        `UPDATE games 
         SET player2_id = $1, status = 'active', updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2 AND status = 'waiting' AND player1_id != $1 
         RETURNING id, player1_id, player2_id, status`,
        [baoProfileId, gameId]
    );
    
    if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Game not found, already started, or you tried to join your own game.' });
    }

    res.json(result.rows[0]);
} catch (error) {
    console.error('Error joining game:', error);
    res.status(500).json({ message: 'Internal server error' });
}
});

module.exports = router;

