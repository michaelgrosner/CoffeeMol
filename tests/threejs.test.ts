// Regression tests for ThreeRenderer vignette compositing.
//
// History: the vignette pass was accidentally dropped at least once when render()
// was edited. These tests catch two failure modes:
//   1. The second renderer.render() call (vignetteScene) is removed or guarded out.
//   2. renderer.autoClear is not restored to true after the vignette pass, causing
//      subsequent frames to skip the depth-clear and ghost.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RenderOptions } from '../src/renderers/renderer';
import { defaultColorScheme } from '../src/schemes';

// ── Three.js mock ─────────────────────────────────────────────────────────────
// vi.hoisted() runs before the vi.mock() factory, so we can share spy references
// across the mock boundary.
const mocks = vi.hoisted(() => {
  const makePosition = () => ({ set: vi.fn(), x: 0, y: 0, z: 0 });
  const webglRenderer = {
    render: vi.fn(),
    autoClear: true,
    clearDepth: vi.fn(),
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    dispose: vi.fn(),
  };
  return { webglRenderer, makePosition };
});

vi.mock('three', () => {
  const { webglRenderer, makePosition } = mocks;

  class Scene { add = vi.fn(); background: any = null; }
  class Group { add = vi.fn(); clear = vi.fn(); }
  class OrthographicCamera {
    position = makePosition();
    zoom = 1; left = 0; right = 0; top = 0; bottom = 0;
    updateProjectionMatrix = vi.fn();
    lookAt = vi.fn();
    constructor() {}
  }
  class WebGLRenderer {
    render       = webglRenderer.render;
    autoClear    = true;
    clearDepth   = webglRenderer.clearDepth;
    setPixelRatio = webglRenderer.setPixelRatio;
    setSize      = webglRenderer.setSize;
    dispose      = webglRenderer.dispose;
  }
  class AmbientLight     { constructor() {} }
  class DirectionalLight { position = makePosition(); constructor() {} }
  class ShaderMaterial   { constructor(_p?: any) {} }
  class PlaneGeometry    { constructor(..._a: any[]) {} }
  class Mesh             { frustumCulled = true; constructor(..._a: any[]) {} }
  class Raycaster        { params = { Points: { threshold: 0 } }; }
  class DataTexture      { needsUpdate = false; constructor(..._a: any[]) {} }
  class Color            { setRGB = vi.fn().mockReturnThis(); constructor(..._a: any[]) {} }
  const NearestFilter = 1006;
  const RedFormat = 1028;

  return {
    Scene, Group, OrthographicCamera, WebGLRenderer,
    AmbientLight, DirectionalLight,
    ShaderMaterial, PlaneGeometry, Mesh,
    Raycaster, DataTexture, Color,
    NearestFilter, RedFormat,
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockCanvas() {
  return {
    clientWidth: 800,
    clientHeight: 600,
    width: 800,
    height: 600,
    style: { backgroundColor: '' },
    getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 800, height: 600 })),
  } as any;
}

function makeOptions(isDarkBackground: boolean): RenderOptions {
  return {
    zoom: 1,
    x_origin: 0,
    y_origin: 0,
    colorScheme: defaultColorScheme,
    isDarkBackground,
    highlightedAtom: null,
    measureStartAtom: null,
    measureEndAtom: null,
    mouseX: 0,
    mouseY: 0,
    isInteracting: false,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ThreeRenderer vignette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.webglRenderer.autoClear = true;
  });

  it('composites the vignette scene on top of the main scene when isDarkBackground = true', async () => {
    // Dynamically import so the vi.mock above takes effect.
    const { ThreeRenderer } = await import('../src/renderers/threejs');
    const renderer = new ThreeRenderer();
    renderer.init(makeMockCanvas());

    renderer.render([], [], makeOptions(true));

    // render() must be called twice: once for the molecule, once for the vignette.
    expect(mocks.webglRenderer.render).toHaveBeenCalledTimes(2);
    expect(mocks.webglRenderer.clearDepth).toHaveBeenCalledTimes(1);
  });

  it('skips the vignette on light backgrounds', async () => {
    const { ThreeRenderer } = await import('../src/renderers/threejs');
    const renderer = new ThreeRenderer();
    renderer.init(makeMockCanvas());

    renderer.render([], [], makeOptions(false));

    // Only the main scene is rendered; vignette is skipped.
    expect(mocks.webglRenderer.render).toHaveBeenCalledTimes(1);
    expect(mocks.webglRenderer.clearDepth).not.toHaveBeenCalled();
  });

  it('restores autoClear = true after the vignette pass', async () => {
    const { ThreeRenderer } = await import('../src/renderers/threejs');
    const renderer = new ThreeRenderer();
    renderer.init(makeMockCanvas());

    // Capture the autoClear value at the time each render() call fires.
    const autoClearDuringCalls: boolean[] = [];
    mocks.webglRenderer.render.mockImplementation(function (this: any) {
      autoClearDuringCalls.push(mocks.webglRenderer.autoClear);
    });

    // Intercept autoClear assignments so we can track state transitions.
    let autoClearValue = true;
    Object.defineProperty(mocks.webglRenderer, 'autoClear', {
      get: () => autoClearValue,
      set: (v: boolean) => { autoClearValue = v; },
      configurable: true,
    });

    renderer.render([], [], makeOptions(true));

    // First call (main scene): autoClear should still be true.
    expect(autoClearDuringCalls[0]).toBe(true);
    // After both calls complete, autoClear must be restored.
    expect(autoClearValue).toBe(true);
  });
});
