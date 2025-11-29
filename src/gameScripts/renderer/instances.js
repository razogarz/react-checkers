import { mat4 } from 'gl-matrix';
import { PIECE_TYPES, COLORS, BOARD_Y } from '../constants/constants.js';

/**
 * InstanceManager — collects per-instance transform/color buffers and uploads them
 * to a single GPU instance buffer for instanced drawing.
 * Used to render board squares, pieces, crowns and markers efficiently.
 */
export default class InstanceManager {
  constructor(device, instanceBufRef, maxInstancesRefGetter) {
    this.device = device;
    this.instanceBufRef = instanceBufRef;
    this.getMaxInstances = maxInstancesRefGetter;
    this.instances = [];
    this.instanceCount = 0;
  }

  /**
   * pushInstance — append an instance with transform, color and optional pulse.
   * Accepts a 4x4 model matrix and a color vec3; pulse toggles an effect flag.
   * Instances are buffered until uploadInstances() is called.
   */
  pushInstance(modelMatrix, color, pulse = 0) {
    const arr = new Float32Array(21);
    arr.set(modelMatrix, 0);
    arr[16] = color[0];
    arr[17] = color[1];
    arr[18] = color[2];
    arr[19] = 0;
    arr[20] = pulse ? 1.0 : 0.0;
    this.instances.push(arr);
  }

  /**
   * createModelMatrix — convenience helper to build a model transform.
   * Translates then scales a fresh mat4 and returns it for pushInstance.
   * This keeps instance transforms simple and readable at call sites.
   */
  createModelMatrix(tx, ty, tz, sx, sy, sz) {
    const model = mat4.create();
    mat4.translate(model, model, [tx, ty, tz]);
    mat4.scale(model, model, [sx, sy, sz]);
    return model;
  }

  /**
   * buildInstances — populate the instance list from a given gameState.
   * Iterates board squares, pieces, selection and valid moves to emit
   * the visible instances which will be uploaded for rendering.
   */
  buildInstances(gameState) {
    this.instances = [];

    const anyCapture = gameState.hasAnyCaptureMoves();

    // board squares
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const isDark = (x + y) % 2 === 1;
        const col = isDark ? COLORS.DARK_SQUARE : COLORS.LIGHT_SQUARE;
        const h = 0.1;
        const px = (x - 3.5) * 1.0;
        const pz = (y - 3.5) * 1.0;
        const model = this.createModelMatrix(px, BOARD_Y, pz, 1.0, h, 1.0);
        this.pushInstance(model, col);
      }
    }

    // pieces
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const piece = gameState.getPiece(x, y);
        if (piece === 0) continue;
        const isRed = gameState.isRed(piece);
        const isKing = gameState.isKing(piece);
        const color = isRed ? COLORS.RED_PIECE : COLORS.BLACK_PIECE;

        const h = 0.4;
        const px = (x - 3.5) * 1.0;
        const pz = (y - 3.5) * 1.0;
        const model = this.createModelMatrix(px, BOARD_Y + h / 2 + 0.06, pz, 0.75, h, 0.75);
        this.pushInstance(model, color);

        if (isKing) {
          const crownModel = this.createModelMatrix(px, BOARD_Y + h + 0.1, pz, 0.5, 0.15, 0.5);
          this.pushInstance(crownModel, COLORS.KING_CROWN);
        }

        // MARK must-attack pieces
        if (anyCapture) {
          const isCurrentPlayerPiece = (isRed && gameState.currentTurn === PIECE_TYPES.RED) ||
                                       (!isRed && gameState.currentTurn === PIECE_TYPES.BLACK);
          if (isCurrentPlayerPiece && gameState._hasCaptureMoves(x, y)) {
            const mustModel = this.createModelMatrix(px, BOARD_Y + 0.02, pz, 0.95, 0.05, 0.95);
            this.pushInstance(mustModel, COLORS.MUST_ATTACK, 1);
          }
        }
      }
    }

    // Selected piece highlight and valid moves
    if (gameState.selected) {
      const { x, y } = gameState.selected;
      const px = (x - 3.5) * 1.0;
      const pz = (y - 3.5) * 1.0;

      const glowModel = this.createModelMatrix(px, BOARD_Y + 0.02, pz, 0.9, 0.04, 0.9);
      this.pushInstance(glowModel, COLORS.SELECTED_GLOW);

      let moves = gameState.getLegalMoves(x, y);
      if (anyCapture) moves = moves.filter(m => m.jump);

      for (const move of moves) {
        const mpx = (move.x - 3.5) * 1.0;
        const mpz = (move.y - 3.5) * 1.0;
        const markerModel = this.createModelMatrix(mpx, BOARD_Y + 0.12, mpz, 0.25, 0.08, 0.25);
        this.pushInstance(markerModel, COLORS.VALID_MOVE);
      }
    }

    // Upload instance buffer
    this.uploadInstances();
  }

  /**
   * ensureCapacity — ensure that the device instance buffer is large enough.
   * Calls recreateInstanceBuffer when the current instance count exceeds capacity.
   * This keeps instance uploads safe and avoids buffer overruns.
   */
  ensureCapacity(recreateInstanceBuffer) {
    const total = this.instances.length;
    if (total > this.getMaxInstances()) {
      const newMax = Math.max(total, this.getMaxInstances() * 2);
      recreateInstanceBuffer(newMax);
    }
  }

  /**
   * uploadInstances — flatten the collected instances and write to GPU buffer.
   * Creates a single Float32Array and uploads via device.queue.writeBuffer.
   * Updates instanceCount to reflect the uploaded instance array size.
   */
  uploadInstances() {
    const total = this.instances.length;
    if (total === 0) {
      this.instanceCount = 0;
      return;
    }
    const FL = 21;
    const flat = new Float32Array(total * FL);
    for (let i = 0; i < total; i++) flat.set(this.instances[i], i * FL);
    this.device.queue.writeBuffer(this.instanceBufRef.instanceBuf, 0, flat);
    this.instanceCount = total;
  }
}