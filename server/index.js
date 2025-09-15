require('dotenv').config();
const express = require('express');
const path = require('path');
const http = require('http'); // <-- Import http module
const { Server } = require("socket.io"); // <-- Import Socket.IO Server
const db = require('./db');
const { makeMove } = require('./bao-engine');
const authenticateSocket = require('./middleware/socket-auth');

// --- Import Routes ---
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/games');

const app = express();
const server = http.createServer(app); // <-- Create an HTTP server from the Express app
const io = new Server(server, { // <-- Initialize Socket.IO with the server
    cors: {
        origin: "http://localhost:8080", // Allow requests from our frontend
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
    // Perform a simple query to check the connection
    const dbResult = await db.query('SELECT NOW()');
    res.json({ 
      status: 'ok', 
      message: 'Server is running',
      dbTime: dbResult.rows[0].now // Send back the current time from the DB
    });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Database connection failed'
    });
  }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});


// --- Socket.IO Real-time Logic ---

// Apply authentication middleware to all incoming connections
io.use(authenticateSocket);

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.displayName} (ID: ${socket.id})`);

    // Event for a player to join a specific game room
    socket.on('join_game', async ({ gameId }) => {
        try {
            console.log(`${socket.user.displayName} is joining game ${gameId}`);
            socket.join(gameId); // <-- The core of rooms

            // Fetch the latest game state to send to the joining player
            const gameRes = await db.query('SELECT * FROM games WHERE id = $1', [gameId]);
            if (gameRes.rows.length === 0) {
                socket.emit('error', { message: 'Game not found.' });
                return;
            }
            // Emit the current state ONLY to the user who just joined
            socket.emit('game_state_update', gameRes.rows[0].game_state);

        } catch (error) {
            console.error('Join game error:', error);
            socket.emit('error', { message: 'Failed to join game.' });
        }
    });

    // Event for a player making a move
    socket.on('make_move', async ({ gameId, move }) => {
        try {
            // 1. Get the current, trusted game state from the DB
            const gameRes = await db.query('SELECT * FROM games WHERE id = $1', [gameId]);
            if (gameRes.rows.length === 0) return; // Game doesn't exist

            const game = gameRes.rows[0];
            let gameState = game.game_state;

            // 2. Validate the move (e.g., is it this player's turn?)
            const playerNumber = game.player1_id === socket.user.baoProfileId ? 1 : 2;
            if (gameState.currentPlayer !== playerNumber) {
                socket.emit('error', { message: "It's not your turn." });
                return;
            }

            // 3. Process the move using the Bao Engine
            const newGameState = makeMove(gameState, move);

            // 4. Save the new state to the database
            await db.query('UPDATE games SET game_state = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
                JSON.stringify(newGameState),
                gameId
            ]);

            // 5. Broadcast the new state to EVERYONE in the room
            io.to(gameId).emit('game_state_update', newGameState);

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
server.listen(PORT, () => { // <-- Listen on the http server, not the app
    console.log(`Server is listening on http://localhost:${PORT}`);
});
