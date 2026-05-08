const { makeMove } = require('./bao-engine');

const P1_START = 0, P1_END = 15, P1_INNER_START = 8, P1_INNER_END = 15;
const P2_START = 16, P2_END = 31, P2_INNER_START = 16, P2_INNER_END = 23;

/**
 * Returns all valid pit indices for a given player in the current state.
 */
function getValidMoves(gameState, player) {
    const start = player === 1 ? P1_START : P2_START;
    const end   = player === 1 ? P1_END   : P2_END;
    const innerStart = player === 1 ? P1_INNER_START : P2_INNER_START;
    const innerEnd   = player === 1 ? P1_INNER_END   : P2_INNER_END;
    const valid = [];

    for (let i = start; i <= end; i++) {
        const seeds = gameState.board[i];
        if (seeds < 2) continue;
        // In mtaji phase, inner-row pits with >= 10 seeds are locked
        if (gameState.phase === 'mtaji' && i >= innerStart && i <= innerEnd && seeds >= 10) continue;
        valid.push(i);
    }
    return valid;
}

/**
 * Picks the best move for the AI (player 2 by default).
 * Strategy:
 *   1. Prefer any move that triggers a capture.
 *   2. Otherwise pick the pit with the most seeds (greedy).
 *   3. Fallback: random valid move.
 */
function getAiMove(gameState, player = 2) {
    const validPits = getValidMoves(gameState, player);

    if (validPits.length === 0) {
        // No valid moves — game should be over, return dummy
        return { pitIndex: player === 1 ? P1_START : P2_START };
    }

    // 1. Find capture moves by simulating each
    const capturePits = validPits.filter(pit => {
        try {
            const { moveSequence } = makeMove(gameState, { pitIndex: pit });
            return moveSequence.some(step => step.action === 'capture');
        } catch { return false; }
    });

    if (capturePits.length > 0) {
        // Among captures, prefer the one with most seeds to sow
        capturePits.sort((a, b) => gameState.board[b] - gameState.board[a]);
        return { pitIndex: capturePits[0] };
    }

    // 2. Greedy — most seeds
    const bestPit = validPits.reduce(
        (best, pit) => gameState.board[pit] > gameState.board[best] ? pit : best,
        validPits[0]
    );
    return { pitIndex: bestPit };
}

module.exports = { getAiMove };
