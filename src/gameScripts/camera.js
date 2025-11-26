import { mat4, vec3 } from 'gl-matrix';
import { BOARD_Y, BOARD_SIZE } from './constants.js';

export default class Camera {
  constructor(canvas) {
    this.canvas = canvas;
    this.distance = 12.0;
    this.yaw = Math.PI / 4;
    this.pitch = -0.35;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;

    this.setupControls();
  }

  setupControls() {
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.dragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.dragging = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (this.dragging) {
        const dx = (e.clientX - this.lastX) / 400;
        const dy = (e.clientY - this.lastY) / 400;
        this.yaw -= dx;
        this.pitch = Math.max(-1.3, Math.min(1.0, this.pitch - dy));
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });

    this.canvas.addEventListener('wheel', (e) => {
      this.distance = Math.max(4, Math.min(30, this.distance + e.deltaY * 0.01));
      e.preventDefault();
    }, { passive: false });
  }

  getViewProjectionMatrix() {
    const eye = vec3.fromValues(
      this.distance * Math.cos(this.yaw) * Math.cos(this.pitch),
      this.distance * Math.sin(this.pitch),
      this.distance * Math.sin(this.yaw) * Math.cos(this.pitch)
    );
    const center = vec3.fromValues(0, 0, 0);
    const up = vec3.fromValues(0, 1, 0);

    const view = mat4.create();
    mat4.lookAt(view, eye, center, up);

    const aspect = this.canvas.width / this.canvas.height;
    const proj = mat4.create();
    mat4.perspective(proj, 45 * Math.PI / 180, aspect, 0.1, 100);

    const vp = mat4.create();
    mat4.multiply(vp, proj, view);

    return vp;
  }

  unproject(ndcX, ndcY, ndcZ) {
    const vpMatrix = this.getViewProjectionMatrix();
    const invVP = mat4.create();
    mat4.invert(invVP, vpMatrix);

    const ndc = vec3.fromValues(ndcX, ndcY, ndcZ);
    const world = vec3.create();
    vec3.transformMat4(world, ndc, invVP);

    return world;
  }

  screenToWorld(screenX, screenY) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = (screenX - rect.left) / rect.width * 2 - 1;
    const sy = -((screenY - rect.top) / rect.height * 2 - 1);

    const near = this.unproject(sx, sy, -1);
    const far = this.unproject(sx, sy, 1);
    
    const dir = vec3.create();
    vec3.subtract(dir, far, near);
    vec3.normalize(dir, dir);

    return { origin: near, direction: dir };
  }

  rayBoardIntersect(origin, direction) {
    const t = (BOARD_Y - origin[1]) / direction[1];
    if (!isFinite(t) || t < 0) return null;

    const px = origin[0] + direction[0] * t;
    const pz = origin[2] + direction[2] * t;

    return vec3.fromValues(px, BOARD_Y, pz);
  }

  getBoardCoordinates(screenX, screenY) {
    const ray = this.screenToWorld(screenX, screenY);
    const hit = this.rayBoardIntersect(ray.origin, ray.direction);

    if (!hit) return null;

    const ix = Math.floor(hit[0] + 3.5 + 0.5);
    const iy = Math.floor(hit[2] + 3.5 + 0.5);

    if (ix >= 0 && ix < BOARD_SIZE && iy >= 0 && iy < BOARD_SIZE) {
      return { x: ix, y: iy };
    }

    return null;
  }
}