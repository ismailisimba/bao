let socket;

export function connectToServer(token, onGameStateUpdate) {
    socket = io({ auth: { token } });

    socket.on('connect', () => console.log('Successfully connected!', socket.id));
    socket.on('disconnect', () => console.log('Disconnected.'));
    
    // When the server sends a state update, call the provided callback
    socket.on('game_state_update', (gameState) => {
        onGameStateUpdate(gameState); // This will trigger the 3D render
    });
    
    socket.on('error', (error) => {
        console.error('Server error:', error.message);
        alert(`Error: ${error.message}`);
    });
}

export function joinGame(gameId) {
    if (!socket) return console.error('Socket not connected.');
    socket.emit('join_game', { gameId });
}

export function sendMove(gameId, move) {
    if (!socket) return console.error('Socket not connected.');
    socket.emit('make_move', { gameId, move });
}
