import { useRef, useState, useCallback } from 'react';
import GameState from '../gameScripts/gameState';
import Camera from '../gameScripts/camera';
import Renderer from '../gameScripts/renderer';
import { PIECE_TYPES, BOARD_SIZE } from '../gameScripts/constants/constants';
import createAiRunner from '../gameScripts/ai/aiRunner';

/**
 * UseCheckersGame — React hook that sets up the game state, renderer and AI.
 * Manages WebGPU initialization, UI callbacks and the AI runner integration.
 * Returns handlers and refs used by the `CheckersGame` component.
 */
export default function UseCheckersGame() {
    const canvasRef = useRef(null);
  const gameStateRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const deviceRef = useRef(null);
  const contextRef = useRef(null);
  const animationFrameRef = useRef(null);
  
  const [currentTurn, setCurrentTurn] = useState('Czerwoni');
  const [isInitialized, setIsInitialized] = useState(false);
  // aiDifficulty: 'off' | 'easy' | 'medium' | 'hard'
  const [aiDifficulty, setAiDifficulty] = useState('off');
  const aiDifficultyRef = useRef('off');
  const aiRunnerRef = useRef(null);
  const aiColorRef = useRef(PIECE_TYPES.BLACK);

  // Important callbacks used by initialization and AI runner
  /**
   * updatePlayerTurnText — update the UI text describing whose turn it is.
   * Reads gameState.currentTurn and updates a React state string used by UI.
   * Kept as a stable callback to avoid unnecessary re-renders.
   */
  const updatePlayerTurnText = useCallback(() => {
    const turnText = gameStateRef.current.currentTurn === PIECE_TYPES.RED ? 'Czerwoni' : 'Czarni';
    setCurrentTurn(turnText);
  }, []);

  /**
   * handleReset — reset the game and refresh rendering state/UI.
   * Also cancels any pending AI actions and optionally starts AI if enabled.
   * Kept wrapped in useCallback to preserve stable identity across renders.
   */
  const handleReset = useCallback(() => {
    gameStateRef.current.reset();
    rendererRef.current.buildInstances(gameStateRef.current);
    updatePlayerTurnText();
    if (aiRunnerRef.current) aiRunnerRef.current.cancel();
    if (aiDifficultyRef.current !== 'off' && aiRunnerRef.current) aiRunnerRef.current.maybeAIMove();
  }, [updatePlayerTurnText]);

  /**
   * checkGameOver — inspect the board and determine winner/possible moves.
   * Triggers an alert when one side has no pieces or no legal moves left.
   * Calls handleReset to restart the game after announcing winner.
   */
  const checkGameOver = useCallback(() => {
    let redPieces = 0, blackPieces = 0, redCanMove = false, blackCanMove = false;
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const piece = gameStateRef.current.getPiece(x, y);
        if (gameStateRef.current.isRed(piece)) {
          redPieces++;
          if (gameStateRef.current.getLegalMoves(x, y).length > 0) redCanMove = true;
        } else if (gameStateRef.current.isBlack(piece)) {
          blackPieces++;
          if (gameStateRef.current.getLegalMoves(x, y).length > 0) blackCanMove = true;
        }
      }
    }
    if (redPieces === 0 || !redCanMove) {
      setTimeout(() => { alert('Czarni wygrywają!'); handleReset(); }, 100);
    } else if (blackPieces === 0 || !blackCanMove) {
      setTimeout(() => { alert('Czerwoni wygrywają!'); handleReset(); }, 100);
    }
  }, [handleReset]);

  /**
   * initWebGPU — initialize WebGPU, create device/renderer and build scene.
   * Also creates an AI runner and starts the render loop for frames.
   * Returned cleanup function cancels animation and pending AI operations.
   */
  const initWebGPU = useCallback(async () =>{
    let mounted = true;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice();
    const context = canvas.getContext('webgpu');

    // Configure canvas
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);

    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device,
      format,
      alphaMode: 'opaque'
    });

    if (!mounted) return;

    deviceRef.current = device;
    contextRef.current = context;

    gameStateRef.current = new GameState();
    cameraRef.current = new Camera(canvas);
    rendererRef.current = new Renderer(device, context, canvas, format);
    
    await rendererRef.current.initialize();

    // Build initial instances
    rendererRef.current.buildInstances(gameStateRef.current);

    // Update UI
    updatePlayerTurnText();
    setIsInitialized(true);
    // Create AI runner (UI-agnostic) and wire in callbacks
    aiRunnerRef.current = createAiRunner({
      gameState: gameStateRef.current,
      aiColor: aiColorRef.current,
      applyMove: (sx, sy, tx, ty, move) => gameStateRef.current.applyMove(sx, sy, tx, ty, move),
      buildInstances: () => rendererRef.current.buildInstances(gameStateRef.current),
      updateUI: updatePlayerTurnText,
      checkGameOver: checkGameOver,
      initialAiMode: aiDifficultyRef.current !== 'off',
      initialDifficulty: aiDifficultyRef.current
    });
    if (aiDifficultyRef.current !== 'off' && aiRunnerRef.current) aiRunnerRef.current.maybeAIMove();

    // Start render loop
    function renderLoop() {
      if (!mounted) return;
      
      const { vpMatrix, eye } = cameraRef.current.getViewProjectionMatrix();
      rendererRef.current.render(vpMatrix, eye);
      animationFrameRef.current = requestAnimationFrame(renderLoop);
    }
    renderLoop();

    // Cleanup
    return () => {
      mounted = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (aiRunnerRef.current) aiRunnerRef.current.cancel();
    };

    }, [updatePlayerTurnText, checkGameOver])

  /**
   * handleCanvasClick — handle clicks on the canvas and apply game logic.
   * Converts screen coords to board coords then calls handleClick and rebuilds.
   * Also triggers AI moves and game-over checks as needed.
   */
  const handleCanvasClick = (e) => {
    const coords = cameraRef.current.getBoardCoordinates(e.clientX, e.clientY);
    if(!coords) return;
    const changed = gameStateRef.current.handleClick(coords.x, coords.y);
    if(!changed) return;
    rendererRef.current.buildInstances(gameStateRef.current);
    updatePlayerTurnText();
    checkGameOver();
    if (aiDifficultyRef.current !== 'off' && aiRunnerRef.current) aiRunnerRef.current.maybeAIMove();
  };

  /**
  * setDifficulty — change the AI difficulty (off, easy, medium, hard).
   * Resets the game state when changing difficulty and updates runner/UI.
   * Ensures AI runner is started, stopped, or updated appropriately.
   */
  const setDifficulty = (newDifficulty) => {
    // newDifficulty: 'off' | 'easy' | 'medium' | 'hard'
    setAiDifficulty(newDifficulty);
    aiDifficultyRef.current = newDifficulty;
    const enabled = newDifficulty !== 'off';
    if (aiRunnerRef.current) {
      aiRunnerRef.current.setAiMode(enabled);
      if (enabled && aiRunnerRef.current.setDifficulty) aiRunnerRef.current.setDifficulty(newDifficulty);
    }
    if (!gameStateRef.current || !rendererRef.current) return;
    gameStateRef.current.reset();
    rendererRef.current.buildInstances(gameStateRef.current);
    updatePlayerTurnText();
    if (aiRunnerRef.current) { aiRunnerRef.current.cancel(); }
    if (enabled && aiRunnerRef.current) aiRunnerRef.current.maybeAIMove();
  };

  return {
    canvasRef, 
    initWebGPU, 
    animationFrameRef, 
    currentTurn, 
    handleReset, 
    isInitialized, 
    aiDifficulty,
    setDifficulty,
    handleCanvasClick,
  }
}