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
//  15  14 13 12 11 10 9 8  <-- Inner row (P1)
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
function createGame(gameType = 'kujifunza') {
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
        const p1_nyumba = 11;
        const p2_nyumba = 19;
        
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
 * Processes a player's move and returns the new game state AND a sequence of events.
 * @param {object} gameState - The current state of the game.
 * @param {object} move - The move to be made, e.g., { pitIndex: 10 }.
 * @returns {{finalState: object, moveSequence: Array<object>}} The new game state and the sequence of actions for animation.
 */
function makeMove(gameState, move) {
    console.log("makeMove called with:", gameState, move);
    let moveSequence = []; // <-- This will log our animation steps
    let tempGameState = JSON.parse(JSON.stringify(gameState)); // Deep copy

    const { pitIndex } = move;
    const player = tempGameState.currentPlayer;

    // 1. Basic validation
    if (tempGameState.gameOver) return { finalState: tempGameState, moveSequence };
    if (!isPlayersPit(pitIndex, player)) {
        tempGameState.message = "Invalid move: Not your pit.";
        return { finalState: tempGameState, moveSequence };
    }
    if (tempGameState.board[pitIndex] < 2 && tempGameState.phase === 'mtaji') {
        tempGameState.message = "Invalid move: Pit must have at least 2 seeds.";
        return { finalState: tempGameState, moveSequence };
    }
    if (tempGameState.board[pitIndex] >= 10 && tempGameState.phase === 'mtaji' && pitIndex >= P2_INNER_ROW_START && pitIndex <= P2_INNER_ROW_END) {
        tempGameState.message = "Invalid move: Pit with more than 10 seeds cannot be moved or captured.";
        return { finalState: tempGameState, moveSequence };
    }
     if (tempGameState.board[pitIndex] >= 10 && tempGameState.phase === 'mtaji' && pitIndex>= P1_INNER_ROW_START && pitIndex <= P1_INNER_ROW_END ) {
        tempGameState.message = "Invalid move: Pit with more than 10 seeds cannot be moved or captured.";
        return { finalState: tempGameState, moveSequence };
    }

    // --- Sowing Logic ---
    let newBoard = [...tempGameState.board];
    let seedsToSow = newBoard[pitIndex];
    newBoard[pitIndex] = 0;
    let currentPit = pitIndex;

    // Log the initial action
    moveSequence.push({ action: 'lift', fromPit: pitIndex, count: seedsToSow });

    while (seedsToSow > 0) {
        currentPit = getNextPit(currentPit, player);
        newBoard[currentPit]++;
        seedsToSow--;
        
        // Log each sow
        moveSequence.push({ action: 'sow', toPit: currentPit, seedsLeft: seedsToSow });

        if (seedsToSow === 0) {
            if (newBoard[currentPit] > 1 && newBoard[currentPit] < 10) {

                      seedsToSow = newBoard[currentPit];
                newBoard[currentPit] = 0;
                moveSequence.push({ action: 'relay', fromPit: currentPit, count: seedsToSow });
               
            }else if(newBoard[currentPit]>10&&!isCapture(newBoard, currentPit, player)){
                 if(currentPit>= P1_INNER_ROW_START && currentPit <= P1_INNER_ROW_END){
               

                }else if(currentPit>= P2_INNER_ROW_START && currentPit <= P2_INNER_ROW_END){

                }else{
                    seedsToSow = newBoard[currentPit];
                newBoard[currentPit] = 0;
                moveSequence.push({ action: 'relay', fromPit: currentPit, count: seedsToSow });
                }

            }
            else if (isCapture(newBoard, currentPit, player)) {
                const opponentPit = getOpponentPit(currentPit);
                const secondOpponentPit = getOpponentPitBehind(opponentPit);
                newBoard[secondOpponentPit] = newBoard[secondOpponentPit] > 0 && newBoard[secondOpponentPit] < 10 ? newBoard[secondOpponentPit] : 0 ;
                const capturedSeeds = newBoard[opponentPit] + newBoard[secondOpponentPit];
                if (capturedSeeds > 0) {
                    newBoard[opponentPit] = 0;
                 
                    seedsToSow = capturedSeeds;
                    moveSequence.push({ action: 'capture', fromPit: opponentPit, toPit: currentPit, count: capturedSeeds });

                    if(newBoard[secondOpponentPit]>0){
                        newBoard[secondOpponentPit] = 0;
                         moveSequence.push({ action: 'capture', fromPit: secondOpponentPit, toPit: currentPit, count: capturedSeeds });
                    }else{                        
                        
                    }
                   
                    
                    // In a full game, sowing would continue from a 'kichwa'
                }
            }
        }
    }

    // --- End of Turn ---
    const nextPlayer = player === 1 ? 2 : 1;
    const { gameOver, winner } = checkWinCondition(newBoard, nextPlayer);

    const finalState = {
        ...tempGameState,
        board: newBoard,
        currentPlayer: gameOver ? player : nextPlayer,
        gameOver,
        winner,
        message: gameOver ? `Player ${winner} wins!` : `Player ${nextPlayer}'s turn.`
    };
    
    return { finalState, moveSequence };
}


// --- Helper Functions (no changes below this line) ---

function isPlayersPit(pitIndex, player) {
    return player === 1 ? pitIndex >= 0 && pitIndex <= 15 : pitIndex >= 16 && pitIndex <= 31;
}

function getNextPit(currentPit, player) {
    // This simplified logic moves forward across both rows.
    if (player === 1) {
        if (currentPit >= 0 && currentPit < 7) return currentPit + 1; // Outer row right
        if (currentPit === 7) return 8; // Jump to inner row
        if (currentPit >= 8 && currentPit < 15) return currentPit + 1; // Inner row left
        if (currentPit === 15) return 0; // Jump back to outer row start
        return 0; // Default case
    } else { // Player 2
        if (currentPit >= 16 && currentPit < 23) return currentPit + 1; // Inner row right
        if (currentPit === 23) return 24; // Jump to outer row
        if (currentPit >= 24 && currentPit < 31) return currentPit + 1; // Outer row left
        if (currentPit === 31) return 16; // Jump back to inner row start
        return 16; // Default case
    }
}

function isCapture(board, pitIndex, player) {
    const isPlayerInnerRow = player === 1 ?
        (pitIndex >= P1_INNER_ROW_START && pitIndex <= P1_INNER_ROW_END) :
        (pitIndex >= P2_INNER_ROW_START && pitIndex <= P2_INNER_ROW_END);

    if (!isPlayerInnerRow ) {
        return false;
    }

    if (board[pitIndex] > 1&&board[pitIndex] < 10||board[pitIndex]===0) {
        return false;
    }

    const opponentPit = getOpponentPit(pitIndex);
    if(board[opponentPit]>0&&board[opponentPit]<10){
        return true;
    }else{
        return false;
    }
    
}

function getOpponentPit(pitIndex) {
    if (pitIndex >= P1_INNER_ROW_START && pitIndex <= P1_INNER_ROW_END) {
        return P2_INNER_ROW_START + (P1_INNER_ROW_END - pitIndex);
    }
    if (pitIndex >= P2_INNER_ROW_START && pitIndex <= P2_INNER_ROW_END) {
        return P1_INNER_ROW_START + (P2_INNER_ROW_END - pitIndex);
    }
    return -1;
}

function getOpponentPitBehind(pitIndex) {
    if (pitIndex >= P1_INNER_ROW_START && pitIndex <= P1_INNER_ROW_END) {
        switch (pitIndex) {
            case 8: return 7;
            case 9: return 6;
            case 10: return 5;
            case 11: return 4;
            case 12: return 3;
            case 13: return 2;
            case 14: return 1;
            case 15: return 0;
            default: return 0;
        }
    }
    if (pitIndex >= P2_INNER_ROW_START && pitIndex <= P2_INNER_ROW_END) {
          switch (pitIndex) {
            case 16: return 31;
            case 17: return 30;
            case 18: return 29;
            case 19: return 28;
            case 20: return 27;
            case 21: return 26;
            case 22: return 25;
            case 23: return 24;
            default: return 0;
        }
    }
    return -1;
}

function checkWinCondition(board, nextPlayer) {
    const innerRowStart = nextPlayer === 1 ? P1_INNER_ROW_START : P2_INNER_ROW_START;
    const innerRowEnd = nextPlayer === 1 ? P1_INNER_ROW_END : P2_INNER_ROW_END;
    const outerRowStart = nextPlayer === 1 ? 0 : 24;
    const outerRowEnd = nextPlayer === 1 ? 7 : 31;

    let hasValidMoves = false;
    for (let i = innerRowStart; i <= innerRowEnd; i++) {
        if (board[i] > 0) {
            hasValidMoves = true;
            break;
        }
    }

    for (let i = outerRowStart; i <= outerRowEnd; i++) {
        if (board[i] > 1 && board[i] < 10) {
            hasValidMoves = true;
            break;
        }
    }

    if (!hasValidMoves) {
        return { gameOver: true, winner: nextPlayer === 1 ? 2 : 1 };
    }
    return { gameOver: false, winner: null };
}

module.exports = { createGame, makeMove };
