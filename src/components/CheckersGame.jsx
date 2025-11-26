import { useEffect, useRef, useState, useCallback } from 'react';
import GameState from '../gameScripts/gameState';
import Camera from '../gameScripts/camera';
import Renderer from '../gameScripts/renderer';
import { PIECE_TYPES, BOARD_SIZE } from '../gameScripts/constants';
import createAiRunner from '../gameScripts/aiRunner';

export default function CheckersGame() {
  const canvasRef = useRef(null);
  const gameStateRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const deviceRef = useRef(null);
  const contextRef = useRef(null);
  const animationFrameRef = useRef(null);
  
  const [currentTurn, setCurrentTurn] = useState('Czerwoni');
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const aiModeRef = useRef(false);
  const aiRunnerRef = useRef(null);
  const aiColorRef = useRef(PIECE_TYPES.BLACK);

  // Important callbacks used by initialization and AI runner
  const updateTurnDisplay = useCallback(() => {
    if (!gameStateRef.current) return;
    const turnText = gameStateRef.current.currentTurn === PIECE_TYPES.RED ? 'Czerwoni' : 'Czarni';
    setCurrentTurn(turnText);
  }, []);

  const handleReset = useCallback(() => {
    if (!gameStateRef.current || !rendererRef.current) return;
    gameStateRef.current.reset();
    rendererRef.current.buildInstances(gameStateRef.current);
    updateTurnDisplay();
    if (aiRunnerRef.current) aiRunnerRef.current.cancel();
    if (aiModeRef.current && aiRunnerRef.current) aiRunnerRef.current.maybeAIMove();
  }, [updateTurnDisplay]);

  const checkGameOver = useCallback(() => {
    if (!gameStateRef.current) return;
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

  // Runner/effect sets up WebGPU and AI runner; `checkGameOver` and other callbacks are refs/closures
  useEffect(() => {
    let mounted = true;

    async function initWebGPU() {
      try {
        if (!navigator.gpu) {
          throw new Error('WebGPU nie jest obsługiwane. Użyj Chrome/Edge 113+ z włączonym WebGPU.');
        }

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Get adapter and device
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
          throw new Error('Nie udało się uzyskać adaptera WebGPU');
        }

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

        // Store refs
        deviceRef.current = device;
        contextRef.current = context;

        // Initialize game components
        gameStateRef.current = new GameState();
        cameraRef.current = new Camera(canvas);
        rendererRef.current = new Renderer(device, context, canvas, format);
        
        // Initialize renderer (loads shaders)
        await rendererRef.current.initialize();

        // Build initial instances
        rendererRef.current.buildInstances(gameStateRef.current);

        // Update UI
        updateTurnDisplay();
        setIsInitialized(true);
          // Create AI runner (UI-agnostic) and wire in callbacks
          aiRunnerRef.current = createAiRunner({
            gameState: gameStateRef.current,
            aiColor: aiColorRef.current,
            applyMove: (sx, sy, tx, ty, move) => gameStateRef.current.applyMove(sx, sy, tx, ty, move),
            buildInstances: () => rendererRef.current.buildInstances(gameStateRef.current),
            updateUI: updateTurnDisplay,
            checkGameOver: checkGameOver,
            initialAiMode: aiModeRef.current
          });
          if (aiModeRef.current && aiRunnerRef.current) aiRunnerRef.current.maybeAIMove();

        // Setup resize handler
        const handleResize = () => {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          canvas.width = Math.floor(canvas.clientWidth * dpr);
          canvas.height = Math.floor(canvas.clientHeight * dpr);
        };
        window.addEventListener('resize', handleResize);

        // Start render loop
        function renderLoop() {
          if (!mounted) return;
          
          const vpMatrix = cameraRef.current.getViewProjectionMatrix();
          rendererRef.current.render(vpMatrix);
          animationFrameRef.current = requestAnimationFrame(renderLoop);
        }
        renderLoop();

        // Cleanup
        return () => {
          mounted = false;
          window.removeEventListener('resize', handleResize);
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
          }
          if (aiRunnerRef.current) aiRunnerRef.current.cancel();
        };
      } catch (err) {
        console.error('WebGPU initialization error:', err);
        setError(err.message);
      }
    }

    initWebGPU();

    return () => {
      mounted = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [updateTurnDisplay, checkGameOver]);

  // updateTurnDisplay already declared above — do not redeclare here

  const handleCanvasClick = (e) => {
    if (!cameraRef.current || !gameStateRef.current || !rendererRef.current) return;

    const coords = cameraRef.current.getBoardCoordinates(e.clientX, e.clientY);
    if (coords) {
      const changed = gameStateRef.current.handleClick(coords.x, coords.y);
      if (changed) {
        rendererRef.current.buildInstances(gameStateRef.current);
        updateTurnDisplay();
        checkGameOver();
            // After a human changes the board, let AI play if enabled
            if (aiModeRef.current && aiRunnerRef.current) aiRunnerRef.current.maybeAIMove();
      }
    }
  };

  // checkGameOver already declared above — do not redeclare here

  // handleReset already declared above — do not redeclare here

  // AI runner (shared) handles moves and scheduling

  if (error) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#111',
        color: '#ddd',
        fontFamily: 'system-ui',
        padding: '20px',
        textAlign: 'center'
      }}>
        <div>
          <h2>Błąd WebGPU</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute',
        left: '12px',
        top: '12px',
        background: 'rgba(0, 0, 0, 0.6)',
        padding: '12px',
        borderRadius: '8px',
        color: '#ddd',
        fontFamily: 'system-ui',
        zIndex: 10
      }}>
        <div style={{ marginBottom: '8px', fontSize: '16px', fontWeight: 'bold' }}>
          Warcaby — WebGPU 3D (plansza 8×8)
        </div>
        <div style={{ marginBottom: '8px' }}>
          Tura: <strong>{currentTurn}</strong>
        </div>
        <button 
          onClick={handleReset}
          disabled={!isInitialized}
          style={{
            padding: '6px 12px',
            marginBottom: '8px',
            cursor: isInitialized ? 'pointer' : 'not-allowed',
            opacity: isInitialized ? 1 : 0.5
          }}
        >
          Reset
        </button>
        <button
          onClick={() => { 
            // Toggle AI mode; reset board and re-render to have consistent state
            const newMode = !aiMode;
            setAiMode(newMode);
            aiModeRef.current = newMode;
            if (aiRunnerRef.current) aiRunnerRef.current.setAiMode(newMode);
            if (!gameStateRef.current || !rendererRef.current) return;
            gameStateRef.current.reset();
            rendererRef.current.buildInstances(gameStateRef.current);
            updateTurnDisplay();
            if (aiRunnerRef.current) { aiRunnerRef.current.cancel(); }
            if (newMode && aiRunnerRef.current) aiRunnerRef.current.maybeAIMove();
          }}
          disabled={!isInitialized}
          style={{
            padding: '6px 12px',
            marginLeft: '8px',
            marginBottom: '8px',
            cursor: isInitialized ? 'pointer' : 'not-allowed',
            opacity: isInitialized ? 1 : 0.5
          }}
        >
          {aiMode ? 'AI: On' : 'AI: Off'}
        </button>
        <div style={{ fontSize: '12px', color: '#aaa', marginTop: '8px' }}>
          Sterowanie: lewy przycisk — zaznacz/rusz
          <br />
          przeciąg — obrót kamery; scroll — zoom
        </div>
      </div>

      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          cursor: isInitialized ? 'pointer' : 'wait'
        }}
      />
    </div>
  );
}