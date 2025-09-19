
const express = require('express');
const router = express.Router();
const db = require('../db');
const bao = require('./../bao-engine');
const authenticateToken = require('../middleware/auth');

// Apply the authentication middleware to all routes in this file
router.use(authenticateToken);

// GET /api/games - Get a list of open public games and private games the user is invited to
router.get('/', async (req, res) => {
    const { baoProfileId } = req.user;
    try {
        const result = await db.query(`
            SELECT g.id, p.display_name as player1_name, g.is_private
            FROM games g 
            JOIN bao_profiles p ON g.player1_id = p.id 
            WHERE g.status = 'waiting' AND (
                g.is_private = false OR (g.is_private = true AND g.invitee_id = $1)
            )
        `, [baoProfileId]);
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

// GET /api/games/results - Get recent game results
router.get('/results', async (req, res) => {
    try {
        const results = await db.query(`
            SELECT gr.id, gr.game_id, gr.created_at,
                   p1.display_name AS winner_name,
                   p2.display_name AS loser_name
            FROM game_results gr
            JOIN bao_profiles p1 ON gr.winner_profile_id = p1.id
            JOIN bao_profiles p2 ON gr.loser_profile_id = p2.id
            ORDER BY gr.created_at DESC
            LIMIT 10
        `);
        res.json(results.rows);
    } catch (error) {
        console.error('Error fetching game results:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// POST /api/games - Create a new game (public or private)
router.post('/', async (req, res) => {
    const { baoProfileId } = req.user;
    const { isPrivate, inviteeEmail } = req.body;
    try {
        const initialState = bao.createGame('kujifunza');
        let inviteeId = null;
        if (isPrivate && inviteeEmail) {
            // Find invitee's bao profile
            const userRes = await db.query('SELECT user_id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [inviteeEmail]);
            if (userRes.rows.length > 0) {
                const profileRes = await db.query('SELECT id FROM bao_profiles WHERE user_id = $1', [userRes.rows[0].user_id]);
                if (profileRes.rows.length > 0) {
                    inviteeId = profileRes.rows[0].id;
                }
            }
        }
        const result = await db.query(
            `INSERT INTO games (player1_id, game_state, status, is_private, invitee_id) 
             VALUES ($1, $2, 'waiting', $3, $4) 
             RETURNING id, status, is_private, invitee_id`,
            [baoProfileId, JSON.stringify(initialState), !!isPrivate, inviteeId]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating game:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// POST /api/games/:gameId/join - Join an existing game (respecting private/public)
router.post('/:gameId/join', async (req, res) => {
    const { gameId } = req.params;
    const { baoProfileId } = req.user;
    try {
        // Check if game is private and if user is allowed
        const gameRes = await db.query('SELECT is_private, invitee_id, player1_id, status FROM games WHERE id = $1', [gameId]);
        if (gameRes.rows.length === 0) {
            return res.status(404).json({ message: 'Game not found.' });
        }
        const game = gameRes.rows[0];
        if (game.status !== 'waiting' || game.player1_id === baoProfileId) {
            return res.status(404).json({ message: 'Game not found, already started, or you tried to join your own game.' });
        }
        if (game.is_private && game.invitee_id !== baoProfileId) {
            return res.status(403).json({ message: 'You are not invited to this private game.' });
        }
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

