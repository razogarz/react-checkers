import { BOARD_SIZE, PIECE_TYPES } from './constants.js';

export default class GameState {
  constructor(startRows = 3) {
    this.startRows = startRows; // number of rows per side (2 or 3)
    this.board = Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(0));
    this.currentTurn = PIECE_TYPES.RED;
    this.selected = null;
    this.reset();
  }

  reset(rowsOverride) {
    const rows = (typeof rowsOverride === 'number') ? rowsOverride : this.startRows;

    // Clear board
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        this.board[y][x] = PIECE_TYPES.EMPTY;
      }
    }

    // Place black pieces (top)
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if ((x + y) % 2 === 1) {
          this.board[y][x] = PIECE_TYPES.BLACK;
        }
      }
    }

    // Place red pieces (bottom)
    for (let y = BOARD_SIZE - rows; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if ((x + y) % 2 === 1) {
          this.board[y][x] = PIECE_TYPES.RED;
        }
      }
    }

    this.currentTurn = PIECE_TYPES.RED;
    this.selected = null;
  }

  getPiece(x, y) {
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return null;
    return this.board[y][x];
  }

  setPiece(x, y, piece) {
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return;
    this.board[y][x] = piece;
  }

  isRed(piece) {
    return piece === PIECE_TYPES.RED || piece === PIECE_TYPES.RED_KING;
  }

  isBlack(piece) {
    return piece === PIECE_TYPES.BLACK || piece === PIECE_TYPES.BLACK_KING;
  }

  isKing(piece) {
    return piece === PIECE_TYPES.RED_KING || piece === PIECE_TYPES.BLACK_KING;
  }

   getLegalMoves(x, y) {
    const piece = this.getPiece(x, y);
    if (!piece) return [];

    const isRed = this.isRed(piece);
    const isKing = this.isKing(piece);
    const moves = [];

    // Helpers for bounds
    const inBounds = (xx, yy) => xx >= 0 && xx < BOARD_SIZE && yy >= 0 && yy < BOARD_SIZE;

    // Directions: four diagonals
    const dirs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

    if (isKing) {
      // Flying king: can move along diagonal any distance; captures: jump over first enemy and land any empty square beyond it
      for (const [dx, dy] of dirs) {
        let step = 1;
        let sawEnemy = false;
        let enemyX = -1, enemyY = -1;

        while (true) {
          const nx = x + dx * step;
          const ny = y + dy * step;
          if (!inBounds(nx, ny)) break;

          const target = this.getPiece(nx, ny);

          if (!sawEnemy) {
            if (target === PIECE_TYPES.EMPTY) {
              // simple move (only if there is no capture in that direction yet)
              moves.push({ x: nx, y: ny, jump: false });
              step++;
              continue;
            } else if ((isRed && this.isBlack(target)) || (!isRed && this.isRed(target))) {
              // first enemy encountered — candidate for capture
              sawEnemy = true;
              enemyX = nx;
              enemyY = ny;
              step++;
              continue;
            } else {
              // own piece blocks path
              break;
            }
          } else {
            // we've seen an enemy earlier in this diagonal:
            if (target === PIECE_TYPES.EMPTY) {
              // any empty square beyond the enemy is a valid landing after a jump
              moves.push({ x: nx, y: ny, jump: true, captureX: enemyX, captureY: enemyY });
              step++;
              continue;
            } else {
              // blocked by any piece after the enemy — can't land further in this dir
              break;
            }
          }
        }
      }
    } else {
      // Regular man: adjacent simple moves and single jumps (as before)
      const dyForward = isRed ? -1 : 1;
      const manDirs = this.isKing(piece) ? dirs : [[-1, dyForward], [1, dyForward]];

      for (const [dx, dy] of manDirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(nx, ny)) continue;

        const target = this.getPiece(nx, ny);

        if (target === PIECE_TYPES.EMPTY) {
          moves.push({ x: nx, y: ny, jump: false });
        } else if ((isRed && this.isBlack(target)) || (!isRed && this.isRed(target))) {
          // potential jump
          const jx = nx + dx;
          const jy = ny + dy;
          if (inBounds(jx, jy) && this.getPiece(jx, jy) === PIECE_TYPES.EMPTY) {
            moves.push({ x: jx, y: jy, jump: true, captureX: nx, captureY: ny });
          }
        }
      }
    }

    return moves;
  }

  applyMove(sx, sy, tx, ty, move) {
    let piece = this.getPiece(sx, sy);
    this.setPiece(sx, sy, PIECE_TYPES.EMPTY);

    // Handle capture (works for man and flying king: move.captureX/Y identifies captured piece)
    if (move && move.jump) {
      if (typeof move.captureX === 'number' && typeof move.captureY === 'number') {
        this.setPiece(move.captureX, move.captureY, PIECE_TYPES.EMPTY);
      } else {
        // safety: no capture coords provided; no-op
      }
    }

    // Promote to king (if a man reaches far rank)
    if (piece === PIECE_TYPES.RED && ty === 0) {
      piece = PIECE_TYPES.RED_KING;
    } else if (piece === PIECE_TYPES.BLACK && ty === BOARD_SIZE - 1) {
      piece = PIECE_TYPES.BLACK_KING;
    }

    this.setPiece(tx, ty, piece);

    // If this was a jump, check for further captures from landing square
    if (move && move.jump) {
      const hasMore = this._hasCaptureMoves(tx, ty);
      if (hasMore) {
        // keep the turn and keep the selection on the landing square
        this.selected = { x: tx, y: ty };
        return false; // turn NOT switched
      }
    }

    // No further captures: clear selection and switch turn
    this.selected = null;
    this.currentTurn = this.currentTurn === PIECE_TYPES.RED ? PIECE_TYPES.BLACK : PIECE_TYPES.RED;
    return true; // turn switched
  }

  // helper: returns true if piece at (x,y) has any capture (jump) available
   _hasCaptureMoves(x, y) {
    const piece = this.getPiece(x, y);
    if (!piece) return false;

    const isRed = this.isRed(piece);
    const isKing = this.isKing(piece);
    const inBounds = (xx, yy) => xx >= 0 && xx < BOARD_SIZE && yy >= 0 && yy < BOARD_SIZE;
    const dirs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];

    if (isKing) {
      // flying king: look along diagonals for an enemy followed by at least one empty square
      for (const [dx, dy] of dirs) {
        let step = 1;
        let sawEnemy = false;

        while (true) {
          const nx = x + dx * step;
          const ny = y + dy * step;
          if (!inBounds(nx, ny)) break;

          const target = this.getPiece(nx, ny);

          if (!sawEnemy) {
            if (target === PIECE_TYPES.EMPTY) {
              step++;
              continue;
            } else if ((isRed && this.isBlack(target)) || (!isRed && this.isRed(target))) {
              sawEnemy = true;
              step++;
              continue;
            } else {
              break; // own piece blocks
            }
          } else {
            // after enemy: if at least one empty square exists, capture possible
            if (target === PIECE_TYPES.EMPTY) return true;
            else break;
          }
        }
      }
      return false;
    } else {
      // man capture: adjacent enemy with empty square beyond
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const nx = x + dx;
        const ny = y + dy;
        const jx = nx + dx;
        const jy = ny + dy;
        if (!inBounds(nx, ny) || !inBounds(jx, jy)) continue;
        const target = this.getPiece(nx, ny);
        if ((isRed && this.isBlack(target)) || (!isRed && this.isRed(target))) {
          if (this.getPiece(jx, jy) === PIECE_TYPES.EMPTY) return true;
        }
      }
      return false;
    }
  }

  // Returns true if the given color has at least one capture move available.
  // If `color` is omitted, defaults to the current player's color (`this.currentTurn`).
  hasAnyCaptureMoves(color = this.currentTurn) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const piece = this.getPiece(x, y);
        if (!piece || piece === PIECE_TYPES.EMPTY) continue;

        // only consider pieces belonging to the requested color
        if (color === PIECE_TYPES.RED && !this.isRed(piece)) continue;
        if (color === PIECE_TYPES.BLACK && !this.isBlack(piece)) continue;

        if (this._hasCaptureMoves(x, y)) return true;
      }
    }
    return false;
  }

  // updated handleClick: respect applyMove's decision about continuing captures
  handleClick(x, y) {
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return false;

    const piece = this.getPiece(x, y);
    const anyCapture = this.hasAnyCaptureMoves();

    if (this.selected) {
      // when a piece is selected, only consider allowed moves:
      // if any capture exists globally, only allow jump moves
      const moves = this.getLegalMoves(this.selected.x, this.selected.y);
      const allowedMoves = anyCapture ? moves.filter(m => m.jump) : moves;
      const move = allowedMoves.find(m => m.x === x && m.y === y);

      if (move) {
        // actually apply the move — applyMove will handle captures, promotion,
        // continuing jumps (keeps selection) and turn switching
        this.applyMove(this.selected.x, this.selected.y, x, y, move);
        // applyMove already changed board/selection/turn as needed
        return true;
      } else if (piece &&
                 ((this.isRed(piece) && this.currentTurn === PIECE_TYPES.RED) ||
                  (this.isBlack(piece) && this.currentTurn === PIECE_TYPES.BLACK))) {
        // selecting another piece — only allow selecting a capturing piece if any capture exists
        if (anyCapture && !this._hasCaptureMoves(x, y)) {
          // cannot select this piece because there is at least one capture elsewhere
          return false;
        }
        this.selected = { x, y };
        return true;
      } else {
        this.selected = null;
        return true;
      }
    } else {
      // no piece currently selected: allow selecting only your piece
      if (piece && ((this.isRed(piece) && this.currentTurn === PIECE_TYPES.RED) ||
                    (this.isBlack(piece) && this.currentTurn === PIECE_TYPES.BLACK))) {
        if (anyCapture && !this._hasCaptureMoves(x, y)) {
          // there is a capture somewhere else — cannot select this non-capturing piece
          return false;
        }
        this.selected = { x, y };
        return true;
      }
    }

    return false;
  }
}
