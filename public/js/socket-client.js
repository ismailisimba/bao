let socket;

export function connectToServer(token, onGameStateUpdate, onLobbyUpdate) {
    if (socket) { socket.disconnect(); }
    socket = io({ auth: { token } });

    socket.on('connect', () => console.log('Socket connected:', socket.id));
    socket.on('disconnect', () => console.log('Socket disconnected.'));

    socket.on('game_state_update', (data) => {
        onGameStateUpdate(data);
    });

    socket.on('lobby_update', () => {
        if (onLobbyUpdate) onLobbyUpdate();
    });

    socket.on('connect_error', (err) => {
        console.error('Socket connect error:', err.message);
    });

    socket.on('error', (error) => {
        console.error('Server error:', error.message);
        // Show a non-blocking toast instead of blocking alert
        showSocketError(error.message);
    });
}

export function joinGame(gameId) {
    if (!socket) return console.error('Socket not connected.');
    socket.emit('join_game', { gameId });
}

export function leaveGame(gameId) {
    if (!socket || !gameId) return;
    socket.emit('leave_game', { gameId });
}

export function sendMove(gameId, move) {
    if (!socket) return console.error('Socket not connected.');
    socket.emit('make_move', { gameId, move });
}

function showSocketError(msg) {
    // Create ephemeral toast
    const toast = document.createElement('div');
    toast.style.cssText = `
        position:fixed; bottom:100px; left:50%; transform:translateX(-50%);
        background:rgba(224,108,117,0.9); color:#fff; padding:10px 20px;
        border-radius:8px; font-family:'Outfit',sans-serif; font-size:0.9rem;
        z-index:9999; pointer-events:none;
    `;
    toast.textContent = `⚠ ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}
