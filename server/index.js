require('dotenv').config();
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const db = require('./db');
const { makeMove } = require('./bao-engine');
const authenticateSocket = require('./middleware/socket-auth');

// --- Import Routes ---
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/games');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:8080",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 8080;

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// --- API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);

// --- Health Check and Catch-all ---
app.get('/api/health', async (req, res) => {
  try {
    const dbResult = await db.query('SELECT NOW()');
    res.json({ status: 'ok', message: 'Server is running', dbTime: dbResult.rows[0].now });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ status: 'error', message: 'Database connection failed' });
  }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});


// --- Socket.IO Real-time Logic ---

io.use(authenticateSocket);

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.displayName} (ID: ${socket.id})`);

    socket.on('join_game', async ({ gameId }) => {
        try {
            console.log(`${socket.user.displayName} is joining game ${gameId}`);
            socket.join(gameId);

            const gameRes = await db.query('SELECT * FROM games WHERE id = $1', [gameId]);
            if (gameRes.rows.length === 0) {
                socket.emit('error', { message: 'Game not found.' });
                return;
            }
            // Add player names to game state
            const game = gameRes.rows[0];
            const state = game.game_state;
            const [p1, p2] = await Promise.all([
                db.query('SELECT display_name FROM bao_profiles WHERE id = $1', [game.player1_id]),
                game.player2_id ? db.query('SELECT display_name FROM bao_profiles WHERE id = $1', [game.player2_id]) : Promise.resolve({ rows: [] })
            ]);
            state.player1_id = game.player1_id;
            state.player2_id = game.player2_id;
            state.player1_name = p1.rows[0]?.display_name || 'Player 1';
            state.player2_name = p2.rows[0]?.display_name || 'Player 2';
            // On join, we only send the state, not an animation sequence
            socket.emit('game_state_update', state);

        } catch (error) {
            console.error('Join game error:', error);
            socket.emit('error', { message: 'Failed to join game.' });
        }
    });

    socket.on('make_move', async ({ gameId, move }) => {
        try {
            const gameRes = await db.query('SELECT * FROM games WHERE id = $1', [gameId]);
            if (gameRes.rows.length === 0) return;

            const game = gameRes.rows[0];
            let gameState = game.game_state;

            const playerNumber = game.player1_id === socket.user.baoProfileId ? 1 : 2;
            if (gameState.currentPlayer !== playerNumber) {
                socket.emit('error', { message: "It's not your turn." });
                return;
            }

            // --- MODIFIED LOGIC ---
            // 3. Process the move, getting back the final state and the animation sequence
            const { finalState, moveSequence } = makeMove(gameState, move);

            // Add player names to finalState
            const [p1, p2] = await Promise.all([
                db.query('SELECT display_name FROM bao_profiles WHERE id = $1', [game.player1_id]),
                game.player2_id ? db.query('SELECT display_name FROM bao_profiles WHERE id = $1', [game.player2_id]) : Promise.resolve({ rows: [] })
            ]);
            finalState.player1_id = game.player1_id;
            finalState.player2_id = game.player2_id;
            finalState.player1_name = p1.rows[0]?.display_name || 'Player 1';
            finalState.player2_name = p2.rows[0]?.display_name || 'Player 2';

            // 4. Save the new final state to the database
            await db.query('UPDATE games SET game_state = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
                JSON.stringify(finalState),
                gameId
            ]);

            // 5. Broadcast the final state AND the sequence to EVERYONE in the room
            io.to(gameId).emit('game_state_update', { finalState, moveSequence });

            // Log game result if game is over
            if (finalState.gameOver && finalState.winner) {
                // Mark game as finished
                await db.query('UPDATE games SET status = $1 WHERE id = $2', ['finished', gameId]);
                // Insert result if not already logged
                const existing = await db.query('SELECT id FROM game_results WHERE game_id = $1', [gameId]);
                if (existing.rows.length === 0) {
                    const winnerId = finalState.winner === 1 ? game.player1_id : game.player2_id;
                    const loserId = finalState.winner === 1 ? game.player2_id : game.player1_id;
                    await db.query('INSERT INTO game_results (game_id, winner_profile_id, loser_profile_id) VALUES ($1, $2, $3)', [gameId, winnerId, loserId]);
                }
            }

        } catch (error) {
            console.error(`Error on make_move for game ${gameId}:`, error);
            socket.emit('error', { message: 'An error occurred while making your move.' });
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.user.displayName} (ID: ${socket.id})`);
    });
});

// --- Start the server ---
server.listen(PORT, () => {
    console.log(`Server is listening on http://localhost:${PORT}`);
});
