import { useEffect } from 'react';
import UseCheckersGame from './useCheckersGame';

/**
 * CheckersGame — top-level React component that mounts the canvas and UI.
 * Uses UseCheckersGame hook to initialize WebGPU, handle input and display state.
 * Provides controls for reset and toggling AI mode while rendering the canvas.
 */
export default function CheckersGame() {
  const { 
    canvasRef, 
    initWebGPU, 
    animationFrameRef, 
    currentTurn, 
    handleReset, 
    isInitialized, 
    aiDifficulty,
    setDifficulty,
    handleCanvasClick
  } = UseCheckersGame();
  
  useEffect(() => {
    async function setup() {
      const cleanup = await initWebGPU();
      return cleanup;
    }
    setup();

    return () => {
      if (animationFrameRef.current) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [ initWebGPU, animationFrameRef]);

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
        <div style={{ display: 'inline-flex', gap: '8px', marginLeft: '8px', marginBottom: '8px' }}>
          {['off', 'easy', 'medium', 'hard'].map(mode => (
            <button
              key={mode}
              onClick={() => setDifficulty(mode)}
              disabled={!isInitialized}
              style={{
                padding: '6px 12px',
                cursor: isInitialized ? 'pointer' : 'not-allowed',
                opacity: isInitialized ? 1 : 0.5,
                background: aiDifficulty === mode ? '#2a7f8f' : undefined,
                color: aiDifficulty === mode ? '#fff' : undefined,
                borderRadius: 6
              }}
            >
              {mode === 'off' ? 'AI: Off' : mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
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