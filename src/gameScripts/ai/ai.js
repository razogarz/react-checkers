import { PIECE_TYPES, BOARD_SIZE } from '../constants/constants.js';

export function chooseAIMove(gameState, aiColor, options = {}) {
  const { difficulty = 'easy', depth = 4 } = options;
  if (difficulty === 'easy') return chooseAIMoveEasy(gameState, aiColor);
  if (difficulty === 'medium') return chooseAIMoveMedium(gameState, aiColor, depth);
  return chooseAIMoveEasy(gameState, aiColor);
}

function chooseAIMoveEasy(gameState, aiColor) {
  const moves = [];
  const anyCapture = gameState.hasAnyCaptureMoves(aiColor);

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

  const jumps = moves.filter(m => m.move && m.move.jump);
  const pool = jumps.length ? jumps : moves;
  return pool[Math.floor(Math.random() * pool.length)];
}

function chooseAIMoveMedium(gameState, aiColor, maxDepth = 4) {
  const initialMoves = collectMovesForColor(gameState, aiColor);
  if (initialMoves.length === 0) return null;

  let bestScore = -Infinity;
  let bestMoves = [];

  for (const mv of initialMoves) {
    const s = gameState.clone();
    s.applyMove(mv.sx, mv.sy, mv.tx, mv.ty, mv.move);
    const score = minimax(s, maxDepth - 1, -Infinity, Infinity, aiColor);
    if (score > bestScore) {
      bestScore = score;
      bestMoves = [mv];
    } else if (score === bestScore) {
      bestMoves.push(mv);
    }
  }

  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

function collectMovesForColor(gameState, color) {
  const moves = [];
  const anyCapture = gameState.hasAnyCaptureMoves(color);

  if (gameState.selected) {
    const sx = gameState.selected.x;
    const sy = gameState.selected.y;
    const piece = gameState.getPiece(sx, sy);
    if (piece && ((color === PIECE_TYPES.BLACK && gameState.isBlack(piece)) ||
                  (color === PIECE_TYPES.RED && gameState.isRed(piece)))) {
      const legal = gameState.getLegalMoves(sx, sy);
      for (const m of legal) {
        if (!anyCapture || m.jump) moves.push({ sx, sy, tx: m.x, ty: m.y, move: m });
      }
    }
    return moves;
  }

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const piece = gameState.getPiece(x, y);
      if (piece === 0 || piece === null) continue;
      if ((color === PIECE_TYPES.BLACK && gameState.isBlack(piece)) ||
          (color === PIECE_TYPES.RED && gameState.isRed(piece))) {
        const legal = gameState.getLegalMoves(x, y);
        for (const m of legal) {
          if (!anyCapture || m.jump) moves.push({ sx: x, sy: y, tx: m.x, ty: m.y, move: m });
        }
      }
    }
  }
  return moves;
}

function evaluateState(gameState, aiColor) {
  const PIECE_VALUE = { man: 100, king: 300 };
  let score = 0;

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const p = gameState.getPiece(x, y);
      if (!p || p === PIECE_TYPES.EMPTY) continue;
      if (gameState.isRed(p)) {
        const v = (p === PIECE_TYPES.RED_KING) ? PIECE_VALUE.king : PIECE_VALUE.man;
        score += (aiColor === PIECE_TYPES.RED) ? v : -v;
      } else if (gameState.isBlack(p)) {
        const v = (p === PIECE_TYPES.BLACK_KING) ? PIECE_VALUE.king : PIECE_VALUE.man;
        score += (aiColor === PIECE_TYPES.BLACK) ? v : -v;
      }
    }
  }

  const myMoves = collectMovesForColor(gameState, aiColor).length;
  const oppColor = aiColor === PIECE_TYPES.RED ? PIECE_TYPES.BLACK : PIECE_TYPES.RED;
  const oppMoves = collectMovesForColor(gameState, oppColor).length;
  score += (myMoves - oppMoves) * 5;

  return score;
}

function minimax(state, depth, alpha, beta, aiColor) {
  const currentColor = state.currentTurn;
  const moves = collectMovesForColor(state, currentColor);
  if (moves.length === 0) {
    if (currentColor === aiColor) return -100000; 
    return 100000; 
  }

  if (depth <= 0) return evaluateState(state, aiColor);

  if (currentColor === aiColor) {
    let value = -Infinity;
    for (const mv of moves) {
      const s = state.clone();
      s.applyMove(mv.sx, mv.sy, mv.tx, mv.ty, mv.move);
      const childVal = minimax(s, depth - 1, alpha, beta, aiColor);
      value = Math.max(value, childVal);
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  } else {
    let value = Infinity;
    for (const mv of moves) {
      const s = state.clone();
      s.applyMove(mv.sx, mv.sy, mv.tx, mv.ty, mv.move);
      const childVal = minimax(s, depth - 1, alpha, beta, aiColor);
      value = Math.min(value, childVal);
      beta = Math.min(beta, value);
      if (alpha >= beta) break;
    }
    return value;
  }
}
