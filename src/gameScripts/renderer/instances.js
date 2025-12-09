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

    // ranges for splitting instance buffer draws
    this.cubeCount = 0;            // number of board square instances (drawn with cube geometry)
    this.firstCheckerIndex = 0;    // start index for checker piece instances
    this.checkerCount = 0;         // number of checker piece instances
    this.firstCrownIndex = 0;      // start index for crown instances (within remaining region)
    this.crownCount = 0;           // number of crown instances
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

    // record cubeCount (board) so renderer knows how many cube instances to draw
    this.cubeCount = this.instances.length;

    // --- pieces (first pass) -> create contiguous checker instances only ---
    let piecesAdded = 0;
    // record where checker instance block will start
    this.firstCheckerIndex = this.instances.length;

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
        // If a checker GLB primitive has been supplied in the renderer buffers, prefer using
        // that model; otherwise fall back to the cube instance so pieces still render.
        const checkerMeta = this.instanceBufRef.checker;
        let model;
        if (checkerMeta && checkerMeta.bounds) {
          // Use bounding-box heuristics to scale and orient the GLB so it sits flat on the board
          // and roughly matches the cube footprint. Handles disk-like models and tall models.
          const sizes = checkerMeta.bounds.size;
          const maxSize = Math.max(sizes[0], sizes[1], sizes[2]);
          const minSize = Math.min(sizes[0], sizes[1], sizes[2]);
          const maxAxis = sizes.indexOf(maxSize);
          const minAxis = sizes.indexOf(minSize);

          // choose target axis (the axis that will become world Y after rotation)
          let targetAxis;
          if (minSize < maxSize * 0.5) targetAxis = minAxis; else targetAxis = maxAxis;

          // rotation to map targetAxis -> world Y
          let rotX = 0, rotY = 0, rotZ = 0;
          if (targetAxis === 0) rotZ = Math.PI / 2; // X -> Y
          if (targetAxis === 2) rotX = -Math.PI / 2; // Z -> Y

          const modelHeight = sizes[targetAxis];

          if (modelHeight > 1e-6) {
            let uniformScale;
            if (minSize < maxSize * 0.5) {
              // disk-like: scale so largest axis approximates footprint (0.75)
              const desiredFootprint = 0.75;
              uniformScale = desiredFootprint / maxSize;
            } else {
              // tall model: scale so height fits the desired piece height h
              uniformScale = h / modelHeight;
            }

            // translate Y so the model's minimum sits on BOARD_Y (after scaling)
            const ty = BOARD_Y - checkerMeta.bounds.min[targetAxis] * uniformScale + 0.02;

            // compose matrix: translate -> rotate -> scale
            const m = mat4.create();
            mat4.translate(m, m, [px, ty, pz]);
            if (rotX) mat4.rotateX(m, m, rotX);
            if (rotY) mat4.rotateY(m, m, rotY);
            if (rotZ) mat4.rotateZ(m, m, rotZ);
            mat4.scale(m, m, [uniformScale, uniformScale, uniformScale]);

            model = m;

            if (!this._loggedCheckerPlacement) {
              console.debug('Checker placement strategy:', { sizes, minSize, maxSize, minAxis, maxAxis, targetAxis, rotX, rotY, rotZ, uniformScale, ty });
              this._loggedCheckerPlacement = true;
            }
          } else {
            model = this.createModelMatrix(px, BOARD_Y + h / 2 + 0.06, pz, 0.75, h, 0.75);
          }
        } else {
          model = this.createModelMatrix(px, BOARD_Y + h / 2 + 0.06, pz, 0.75, h, 0.75);
        }
        this.pushInstance(model, color);
        piecesAdded++;

        // crowns and must-attack markers are added in the second pass so they
        // are part of the remaining-instance region (drawn after checkers)
      }
    }
    this.checkerCount = piecesAdded;

    // --- second pass: add crowns, must-attack markers and other extras so they are drawn in the remaining instances ---
    // record start of crowns so we can draw them separately (cylinders)
    this.firstCrownIndex = this.instances.length;
    this.crownCount = 0;
    // iterate pieces again to add crowns and must-attack markers in the remaining instance region
    for (let y2 = 0; y2 < 8; y2++) {
      for (let x2 = 0; x2 < 8; x2++) {
        const piece2 = gameState.getPiece(x2, y2);
        if (piece2 === 0) continue;
        const isRed2 = gameState.isRed(piece2);
        const isKing2 = gameState.isKing(piece2);

        const h2 = 0.4;
        const px2 = (x2 - 3.5) * 1.0;
        const pz2 = (y2 - 3.5) * 1.0;

        if (isKing2) {
          // place crown slightly above the piece surface so it is visible but low-profile
          // h2 is the approximate piece height, so sit the crown on top with a small offset
          const crownModel = this.createModelMatrix(px2, BOARD_Y + h2 + 0.02, pz2, 0.5, 0.08, 0.5);
          this.pushInstance(crownModel, COLORS.KING_CROWN);
          // debug log to help track crown insertion and ranges
          try { console.debug('InstanceManager: crown pushed', { x: x2, y: y2, firstCrownIndex: this.firstCrownIndex, crownCount: this.crownCount }); } catch (e) {}
          this.crownCount++;
        }

        if (anyCapture) {
          const isCurrentPlayerPiece2 = (isRed2 && gameState.currentTurn === PIECE_TYPES.RED) ||
                                        (!isRed2 && gameState.currentTurn === PIECE_TYPES.BLACK);
          if (isCurrentPlayerPiece2 && gameState._hasCaptureMoves(x2, y2)) {
            // thin overlay field-sized marker
            const mustModel = this.createModelMatrix(px2, BOARD_Y + 0.02, pz2, 0.98, 0.02, 0.98);
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

    // Debug: report instance ranges and counts (one-line log helps trace render offsets)
    try {
      console.debug('buildInstances: counts', { cubeCount: this.cubeCount, firstCheckerIndex: this.firstCheckerIndex, checkerCount: this.checkerCount, totalInstances: this.instances.length });
    } catch (e) {}

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