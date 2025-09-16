// A self-contained module for the Bao game logic.
// It doesn't know about Express, databases, or the web.

// --- Constants and Board Layout ---

// The board is represented as a flat array of 32 pits.
// Player 1 owns pits 0-15. Player 2 owns pits 16-31.
//
// Player 2's side (top rows from P1's perspective)
// 31 30 29 28 27 26 25 24  <-- Outer row (P2)
// 16 17 18 19 20 21 22 23  <-- Inner row (P2)
// ---------------------------
//  8  9 10 11 12 13 14 15  <-- Inner row (P1)
//  0  1  2  3  4  5  6  7   <-- Outer row (P1)
// Player 1's side (bottom rows)

const P1_INNER_ROW_START = 8;
const P1_INNER_ROW_END = 15;
const P2_INNER_ROW_START = 16;
const P2_INNER_ROW_END = 23;

// --- Initial Game State Setup ---

/**
 * Creates the initial state for a new Bao game.
 * @param {('kiswahili'|'kujifunza')} gameType - The version of Bao to play.
 * @returns {object} The initial game state.
 */
function createGame(gameType = 'kiswahili') {
    const board = Array(32).fill(0);
    const state = {
        board,
        player1: { seedsInHand: 0 },
        player2: { seedsInHand: 0 },
        currentPlayer: 1,
        phase: 'namua', // 'namua' or 'mtaji'
        sowingDirection: null, // 'clockwise' or 'counterclockwise'
        gameOver: false,
        winner: null,
        message: 'Game starts. Player 1 to move.'
    };

    if (gameType === 'kujifunza') {
        // 2 seeds in every pit, no seeds in hand
        for (let i = 0; i < 32; i++) {
            board[i] = 2;
        }
        state.phase = 'mtaji';
    } else { // Default to kiswahili
        // 6 seeds in nyumba, 2 in pits to the right
        const p1_nyumba = 11; // 4th from right in inner row
        const p2_nyumba = 19; // 4th from right in inner row
        
        board[p1_nyumba] = 6;
        board[p1_nyumba + 1] = 2;
        board[p1_nyumba + 2] = 2;
        
        board[p2_nyumba] = 6;
        board[p2_nyumba + 1] = 2;
        board[p2_nyumba + 2] = 2;

        state.player1.seedsInHand = 22;
        state.player2.seedsInHand = 22;
        state.phase = 'namua';
    }

    return state;
}

// --- Core Move Logic ---

/**
 * Processes a player's move and returns the new game state.
 * This is the main function of the engine.
 * @param {object} gameState - The current state of the game.
 * @param {object} move - The move to be made, e.g., { pitIndex: 10 }.
 * @returns {object} The new game state after the move.
 */
function makeMove(gameState, move) {
    console.log("INDEX makeMove called with:", gameState, move);
    // Note: This is a simplified implementation of the core sowing/capturing loop.
    // Full validation (e.g., "must capture if possible") would be added here.
    
    // For now, we'll implement a basic takata turn from the mtaji phase.
    // This provides the fundamental "sow and relay" mechanic.
    
    const { pitIndex } = move;
    const player = gameState.currentPlayer;

    // 1. Basic validation
    if (gameState.gameOver) return gameState;
    if (!isPlayersPit(pitIndex, player)) {
        return { ...gameState, message: "Invalid move: Not your pit." };
    }
    if (gameState.board[pitIndex] < 2 && gameState.phase === 'mtaji') {
        return { ...gameState, message: "Invalid move: Pit must have at least 2 seeds." };
    }

    // --- Sowing Logic ---
    let newBoard = [...gameState.board];
    let seedsToSow = newBoard[pitIndex];
    newBoard[pitIndex] = 0;
    let currentPit = pitIndex;

    console.log(`Player ${player} is sowing ${seedsToSow} seeds from pit ${pitIndex}.`);

    // Loop while we have seeds to sow
    while (seedsToSow > 0) {
        // Move to the next pit in a circular fashion around the player's two rows
        currentPit = getNextPit(currentPit, player);
        newBoard[currentPit]++;
        seedsToSow--;

        // If this was the last seed...
        if (seedsToSow === 0) {
            // Check for relay sowing (multilap)
            if (newBoard[currentPit] > 1) {
                seedsToSow = newBoard[currentPit];
                newBoard[currentPit] = 0;
            }
            // Check for capture (simplified for now)
            else if (isCapture(newBoard, currentPit, player)) {
                // This is where the complex capture logic would go.
                // It involves taking opponent's seeds and starting a new sow from a 'kichwa'.
                // For Phase 3, we'll just acknowledge it happened.
                const opponentPit = getOpponentPit(currentPit);
                const capturedSeeds = newBoard[opponentPit];
                newBoard[opponentPit] = 0;
                
                console.log(`Player ${player} captured ${capturedSeeds} seeds from pit ${opponentPit}!`);
                // In a full implementation, `seedsToSow` would be set to `capturedSeeds`
                // and `currentPit` would be moved to the correct `kichwa`.
            }
        }
    }

    console.log(`Board after move: ${newBoard}`);
    
    // --- End of Turn ---
    const nextPlayer = player === 1 ? 2 : 1;
    
    // Check for win condition
    const { gameOver, winner } = checkWinCondition(newBoard, nextPlayer);

    return {
        ...gameState,
        board: newBoard,
        currentPlayer: gameOver ? player : nextPlayer,
        gameOver,
        winner,
        message: gameOver ? `Player ${winner} wins!` : `Player ${nextPlayer}'s turn.`
    };
}


// --- Helper Functions ---

function isPlayersPit(pitIndex, player) {
    return player === 1 ? pitIndex >= 0 && pitIndex <= 15 : pitIndex >= 16 && pitIndex <= 31;
}

function getNextPit(currentPit, player) {
    if (player === 1) {
        if (currentPit === 15) return 0; // Wrap around from inner to outer row
        if (currentPit === 7) return 15; // Special jump from outer to inner
        if (currentPit > 7) return currentPit + 1; // Move right on inner row
        return currentPit + 1; // Move right on outer row (simplified for now)
    } else { // Player 2
        if (currentPit === 31) return 16; // Wrap around
        if (currentPit === 23) return 31; // Special jump
        if (currentPit > 23) return currentPit + 1;
        return currentPit + 1; // Simplified
    }
    // A proper implementation would handle clockwise/counter-clockwise sowing.
    // For now, we'll use a simple forward progression.
    // Player 1: 8->15, then 0->7
    // Player 2: 16->23, then 24->31
    if (player === 1) {
        if (currentPit === 15) return 0;
        return currentPit + 1;
    } else { // Player 2
        if (currentPit === 31) return 16;
        return currentPit + 1;
    }
}


function isCapture(board, pitIndex, player) {
    const isPlayerInnerRow = player === 1 ? 
        (pitIndex >= P1_INNER_ROW_START && pitIndex <= P1_INNER_ROW_END) :
        (pitIndex >= P2_INNER_ROW_START && pitIndex <= P2_INNER_ROW_END);

    if (!isPlayerInnerRow || board[pitIndex] !== 1) {
        return false; // Capture only happens on last seed drop in an empty pit (now 1 seed) in inner row
    }

    const opponentPit = getOpponentPit(pitIndex);
    return board[opponentPit] > 0;
}

function getOpponentPit(pitIndex) {
    if (pitIndex >= P1_INNER_ROW_START && pitIndex <= P1_INNER_ROW_END) {
        return P2_INNER_ROW_START + (P1_INNER_ROW_END - pitIndex);
    }
    if (pitIndex >= P2_INNER_ROW_START && pitIndex <= P2_INNER_ROW_END) {
        return P1_INNER_ROW_START + (P2_INNER_ROW_END - pitIndex);
    }
    return -1; // Not an inner row pit
}

function checkWinCondition(board, nextPlayer) {
    const innerRowStart = nextPlayer === 1 ? P1_INNER_ROW_START : P2_INNER_ROW_START;
    const innerRowEnd = nextPlayer === 1 ? P1_INNER_ROW_END : P2_INNER_ROW_END;

    let hasSeedsInInnerRow = false;
    for (let i = innerRowStart; i <= innerRowEnd; i++) {
        if (board[i] > 0) {
            hasSeedsInInnerRow = true;
            break;
        }
    }

    if (!hasSeedsInInnerRow) {
        return { gameOver: true, winner: nextPlayer === 1 ? 2 : 1 };
    }
    // A full implementation would also check if the player has any valid moves left.
    return { gameOver: false, winner: null };
}

// Export the functions for use in our server
module.exports = { createGame, makeMove };
