import { chooseAIMove } from './ai.js';

/**
 * createAiRunner — UI-agnostic scheduler that drives AI moves for a gameState.
 * Accepts callback hooks (applyMove, buildInstances, updateUI, checkGameOver)
 * and exposes control functions to start/stop or trigger AI operation.
 */
export default function createAiRunner({
  gameState,
  aiColor,
  applyMove,      
  buildInstances, 
  updateUI,       
  checkGameOver,  
  initialAiMode = false,
  initialDifficulty = 'easy'
}) {
  let aiMode = initialAiMode;
  let difficulty = initialDifficulty; // 'easy' | 'medium' | 'hard'
  let timeout = null;

  function clearPending() {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  }

  function setAiMode(enabled) {
    aiMode = !!enabled;
    if (!aiMode) clearPending();
  }

  function setDifficulty(d) {
    difficulty = d || 'easy';
  }

  function chooseMove() {
    // Map UI difficulty values to ai engine modes
    if (difficulty === 'easy') return chooseAIMove(gameState, aiColor, { difficulty: 'easy' });
    if (difficulty === 'medium') return chooseAIMove(gameState, aiColor, { difficulty: 'medium', depth: 4 });
    if (difficulty === 'hard') return chooseAIMove(gameState, aiColor, { difficulty: 'medium', depth: 7 });
    // default
    return chooseAIMove(gameState, aiColor, { difficulty: 'easy' });
  }

  function performAIMove(delay = 250) {
    clearPending();
    timeout = setTimeout(() => {
      const chosen = chooseMove();
      if (!chosen) return;
      applyMove(chosen.sx, chosen.sy, chosen.tx, chosen.ty, chosen.move);
      buildInstances();
      updateUI();
      checkGameOver();

      if (aiMode && gameState.currentTurn === aiColor) {
        performAIMove(200);
      }
    }, delay);
  }

  function maybeAIMove() {
    if (!aiMode) return;
    if (gameState.currentTurn === aiColor) {
      performAIMove();
    }
  }

  function cancel() {
    clearPending();
  }

  return { setAiMode, setDifficulty, maybeAIMove, performAIMove, cancel, chooseMove };
}
