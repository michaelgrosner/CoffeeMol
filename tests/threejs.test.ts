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
  const cameraMocks = {
    positionSet: vi.fn(),
    lookAt: vi.fn(),
    updateProjectionMatrix: vi.fn(),
  };
  return { webglRenderer, makePosition, cameraMocks };
});

vi.mock('three', () => {
  const { webglRenderer, makePosition, cameraMocks } = mocks;

  class Scene { add = vi.fn(); background: any = null; }
  class Group { add = vi.fn(); clear = vi.fn(); }
  class OrthographicCamera {
    position = { 
      set: cameraMocks.positionSet,
      x: 0, y: 0, z: 0 
    };
    zoom = 1; left = 0; right = 0; top = 0; bottom = 0;
    updateProjectionMatrix = cameraMocks.updateProjectionMatrix;
    lookAt = cameraMocks.lookAt;
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
  class MeshBasicMaterial { constructor(_p?: any) {} }
  class PlaneGeometry    { constructor(..._a: any[]) {} }
  class Mesh             { frustumCulled = true; constructor(..._a: any[]) {} }
  class Raycaster        { params = { Points: { threshold: 0 } }; }
  class DataTexture      { needsUpdate = false; constructor(..._a: any[]) {} }
  class Color            { setRGB = vi.fn().mockReturnThis(); constructor(..._a: any[]) {} }
  const NearestFilter = 1006;
  const RedFormat = 1028;
  const BackSide = 1;

  return {
    Scene, Group, OrthographicCamera, WebGLRenderer,
    AmbientLight, DirectionalLight,
    ShaderMaterial, MeshBasicMaterial, PlaneGeometry, Mesh,
    Raycaster, DataTexture, Color,
    NearestFilter, RedFormat, BackSide,
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

  it('updates camera position when panning (x_origin/y_origin change)', async () => {
    const { ThreeRenderer } = await import('../src/renderers/threejs');
    const renderer = new ThreeRenderer();
    const canvas = makeMockCanvas();
    renderer.init(canvas);

    // Initial center (400, 300) for a 800x600 canvas -> camera at (0, 0)
    const options = makeOptions(true);
    options.x_origin = 400;
    options.y_origin = 300;

    renderer.render([], [], options);

    // Center state: camera at (0, 0, 1000)
    let posArgs = mocks.cameraMocks.positionSet.mock.calls[0];
    expect(posArgs[0]).toBeCloseTo(0);
    expect(posArgs[1]).toBeCloseTo(0);
    expect(posArgs[2]).toBe(1000);

    let lookAtArgs = mocks.cameraMocks.lookAt.mock.calls[0];
    expect(lookAtArgs[0]).toBeCloseTo(0);
    expect(lookAtArgs[1]).toBeCloseTo(0);
    expect(lookAtArgs[2]).toBe(0);

    // Pan right by 50 pixels (x_origin = 450)
    // Pan down by 20 pixels (y_origin = 320)
    options.x_origin = 450;
    options.y_origin = 320;
    renderer.render([], [], options);

    // dx = 450 - 400 = 50
    // dy = 320 - 300 = 20
    // Camera should move to (-50, 20, 1000)
    posArgs = mocks.cameraMocks.positionSet.mock.calls[1];
    expect(posArgs[0]).toBeCloseTo(-50);
    expect(posArgs[1]).toBeCloseTo(20);
    expect(posArgs[2]).toBe(1000);

    lookAtArgs = mocks.cameraMocks.lookAt.mock.calls[1];
    expect(lookAtArgs[0]).toBeCloseTo(-50);
    expect(lookAtArgs[1]).toBeCloseTo(20);
    expect(lookAtArgs[2]).toBe(0);

    // Test panning with Zoom > 1
    options.zoom = 2.0;
    options.x_origin = 450;
    options.y_origin = 320;
    renderer.render([], [], options);

    // dx = (450 - 400) / 2.0 = 25
    // dy = (320 - 300) / 2.0 = 10
    // Camera should move to (-25, 10, 1000)
    posArgs = mocks.cameraMocks.positionSet.mock.calls[2];
    expect(posArgs[0]).toBeCloseTo(-25);
    expect(posArgs[1]).toBeCloseTo(10);
  });
});
