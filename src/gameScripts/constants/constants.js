import { vec3 } from 'gl-matrix';

export const BOARD_SIZE = 8;
export const PIECE_TYPES = {
  EMPTY: 0,
  RED: 1,
  BLACK: 2,
  RED_KING: 3,
  BLACK_KING: 4
};

export const COLORS = {
  DARK_SQUARE: [0.3, 0.2, 0.1],
  LIGHT_SQUARE: [0.85, 0.75, 0.65],
  RED_PIECE: [0.9, 0.18, 0.18],
  BLACK_PIECE: [0.15, 0.15, 0.15],
  KING_CROWN: [1.0, 0.9, 0.2],
  SELECTED_GLOW: [0.3, 1.0, 0.3],
  VALID_MOVE: [0.2, 0.8, 0.3],
  MUST_ATTACK: [1.0, 0.55, 0.0] // new — orange-ish highlight for pieces that must capture
};


export const BOARD_Y = -0.5;
export const INSTANCE_SIZE = 21 * 4; // 20 floats * 4 bytes

export const CENTER = vec3.fromValues(0, 0, 0);
export const UP = vec3.fromValues(0, 1, 0);