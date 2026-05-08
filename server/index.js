require('dotenv').config();
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { connectDB, mongoose } = require('./db');
const { makeMove } = require('./bao-engine');
const { getAiMove } = require('./ai');
const authenticateSocket = require('./middleware/socket-auth');
const Game = require('./models/Game');
const Profile = require('./models/Profile');
const GameResult = require('./models/GameResult');

const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/games');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_ORIGIN || '*',
        methods: ['GET', 'POST'],
    },
});

const PORT = process.env.PORT || 7860;

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// --- API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);

// Serve leaderboard page
app.get('/leaderboard', (_req, res) => {
    res.sendFile(path.join(__dirname, '../public/leaderboard.html'));
});

// Health check (MongoDB)
app.get('/api/health', (_req, res) => {
    const state = mongoose.connection.readyState;
    // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
    if (state === 1) {
        res.json({ status: 'ok', message: 'Server and DB are running.' });
    } else {
        res.status(500).json({ status: 'error', message: 'Database not connected.', state });
    }
});

app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// --- Helpers ---
async function buildStateWithNames(game) {
    const [p1, p2] = await Promise.all([
        Profile.findById(game.player1Id),
        game.player2Id ? Profile.findById(game.player2Id) : Promise.resolve(null),
    ]);
    const state = { ...game.gameState };
    state.player1_id = game.player1Id.toString();
    state.player2_id = game.player2Id ? game.player2Id.toString() : null;
    state.player1_name = p1?.displayName || 'Player 1';
    state.player2_name = p2?.displayName || 'Player 2';
    state.vsAi = game.vsAi || false;
    return state;
}

async function recordResult(game, finalState) {
    const existing = await GameResult.findOne({ gameId: game._id });
    if (existing) return;

    const winnerId = finalState.winner === 1 ? game.player1Id : game.player2Id;
    const loserId  = finalState.winner === 1 ? game.player2Id  : game.player1Id;
    if (!winnerId || !loserId) return;

    await GameResult.create({
        gameId: game._id,
        winnerProfileId: winnerId,
        loserProfileId: loserId,
        isVsAi: game.vsAi || false,
    });
    await game.updateOne({ status: 'finished' });

    // Update human profiles only (skip bot)
    const winnerProfile = await Profile.findById(winnerId);
    if (winnerProfile && !winnerProfile.isBot) {
        await winnerProfile.updateOne({ $inc: { wins: 1, gamesPlayed: 1 } });
    }
    const loserProfile = await Profile.findById(loserId);
    if (loserProfile && !loserProfile.isBot) {
        await loserProfile.updateOne({ $inc: { losses: 1, gamesPlayed: 1 } });
    }
}

// --- Socket.IO ---
io.use(authenticateSocket);

io.on('connection', (socket) => {
    console.log(`Connected: ${socket.user.displayName} (${socket.id})`);

    // ---- JOIN GAME ----
    socket.on('join_game', async ({ gameId }) => {
        try {
            const game = await Game.findById(gameId);
            if (!game) { socket.emit('error', { message: 'Game not found.' }); return; }

            socket.join(gameId);
            const state = await buildStateWithNames(game);
            socket.emit('game_state_update', state);
        } catch (err) {
            console.error('join_game error:', err);
            socket.emit('error', { message: 'Failed to join game.' });
        }
    });

    // ---- LEAVE GAME ----
    socket.on('leave_game', ({ gameId }) => {
        socket.leave(gameId);
    });

    // ---- MAKE MOVE ----
    socket.on('make_move', async ({ gameId, move }) => {
        try {
            const game = await Game.findById(gameId);
            if (!game || game.status === 'finished') return;

            const playerNumber = game.player1Id.toString() === socket.user.baoProfileId ? 1 : 2;
            const gameState = game.gameState;

            if (gameState.currentPlayer !== playerNumber) {
                socket.emit('error', { message: "It's not your turn." });
                return;
            }

            // Process human move
            const { finalState, moveSequence } = makeMove(gameState, move);
            const stateWithNames = await buildStateWithNames({ ...game.toObject(), gameState: finalState });

            game.gameState = finalState;
            if (finalState.gameOver) {
                game.status = 'finished';
            }
            await game.save();

            io.to(gameId).emit('game_state_update', { finalState: stateWithNames, moveSequence });

            if (finalState.gameOver && finalState.winner) {
                await recordResult(game, finalState);
                io.to(gameId).emit('lobby_update'); // refresh lobby
                return;
            }

            // ---- AI MOVE (if vs AI and it's the AI's turn) ----
            if (game.vsAi && !finalState.gameOver && finalState.currentPlayer === 2) {
                setTimeout(async () => {
                    try {
                        const freshGame = await Game.findById(gameId);
                        if (!freshGame || freshGame.status === 'finished') return;

                        const aiGameState = freshGame.gameState;
                        if (aiGameState.currentPlayer !== 2) return; // safety check

                        const aiMove = getAiMove(aiGameState, 2);
                        const { finalState: aiFinal, moveSequence: aiSeq } = makeMove(aiGameState, aiMove);
                        const aiStateWithNames = await buildStateWithNames({ ...freshGame.toObject(), gameState: aiFinal });

                        freshGame.gameState = aiFinal;
                        if (aiFinal.gameOver) freshGame.status = 'finished';
                        await freshGame.save();

                        io.to(gameId).emit('game_state_update', { finalState: aiStateWithNames, moveSequence: aiSeq });

                        if (aiFinal.gameOver && aiFinal.winner) {
                            await recordResult(freshGame, aiFinal);
                        }
                    } catch (aiErr) {
                        console.error('AI move error:', aiErr);
                    }
                }, 1200); // 1.2s delay for realism
            }

        } catch (err) {
            console.error('make_move error:', err);
            socket.emit('error', { message: 'An error occurred.' });
        }
    });

    socket.on('disconnect', () => {
        console.log(`Disconnected: ${socket.user.displayName} (${socket.id})`);
    });
});

// --- Start ---
connectDB().then(() => {
    server.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
});
