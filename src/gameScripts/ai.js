import { PIECE_TYPES, BOARD_SIZE } from './constants.js';

// Choose a valid AI move. Prefers jumps when available.
export function chooseAIMove(gameState, aiColor) {
  const moves = [];
  // restrict capture checks to the AI's color only
  const anyCapture = gameState.hasAnyCaptureMoves(aiColor);

  // If a capture chain is in progress (selection exists) and it's an AI piece,
  // consider only moves for that piece so AI continues the chain.
  if (gameState.selected) {
    const sx = gameState.selected.x;
    const sy = gameState.selected.y;
    const piece = gameState.getPiece(sx, sy);
    if (piece && ((aiColor === PIECE_TYPES.BLACK && gameState.isBlack(piece)) ||
                  (aiColor === PIECE_TYPES.RED && gameState.isRed(piece)))) {
      const legal = gameState.getLegalMoves(sx, sy);
      for (const m of legal) {
        if (!anyCapture || m.jump) moves.push({ sx, sy, tx: m.x, ty: m.y, move: m });
      }
    }
  }

  // Otherwise collect moves for all AI pieces
  if (moves.length === 0) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const piece = gameState.getPiece(x, y);
        if (piece === 0 || piece === null) continue;
        if ((aiColor === PIECE_TYPES.BLACK && gameState.isBlack(piece)) ||
            (aiColor === PIECE_TYPES.RED && gameState.isRed(piece))) {
          const legal = gameState.getLegalMoves(x, y);
          for (const m of legal) {
            if (!anyCapture || m.jump) moves.push({ sx: x, sy: y, tx: m.x, ty: m.y, move: m });
          }
        }
      }
    }
  }

  if (moves.length === 0) return null;

  // prefer jumps when available
  const jumps = moves.filter(m => m.move && m.move.jump);
  const pool = jumps.length ? jumps : moves;
  return pool[Math.floor(Math.random() * pool.length)];
}
