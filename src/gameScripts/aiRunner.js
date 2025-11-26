import { chooseAIMove } from './ai.js';

// Create an AI runner that performs and schedules AI moves for a given gameState.
// Accepts callback hooks so the AI runner remains UI-agnostic.
export default function createAiRunner({
  gameState,
  aiColor,
  applyMove,      // function(sx,sy,tx,ty,move)
  buildInstances, // function()
  updateUI,       // function()
  checkGameOver,  // function()
  initialAiMode = false
}) {
  let aiMode = initialAiMode;
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

  function chooseMove() {
    return chooseAIMove(gameState, aiColor);
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

  return { setAiMode, maybeAIMove, performAIMove, cancel, chooseMove };
}
