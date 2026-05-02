import { vi } from 'vitest';
import { Structure, Chain, Residue, Atom } from '../src/models';
import { defaultColorScheme } from '../src/schemes';
import { RenderOptions } from '../src/renderers/renderer';

// ── dummyCC ───────────────────────────────────────────────────────────────────
// Minimal stand-in for CanvasContext used in model-level unit tests that don't
// need a real canvas or renderer.
export function makeDummyCC() {
  return {
    addElement: () => {},
    colorScheme: defaultColorScheme,
    canvas: { style: {} },
    context: {},
  } as any;
}

// ── Canvas mock ───────────────────────────────────────────────────────────────
// Returns a mock 2D canvas context and canvas element suitable for Canvas2DRenderer
// tests. strokeStyles / fillStyles arrays capture every assignment so tests can
// assert on the emitted colors without needing a real browser.
export function makeCanvasMock() {
  const strokeStyles: string[] = [];
  const fillStyles: string[] = [];

  const ctx = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    setLineDash: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    get strokeStyle() { return ''; },
    set strokeStyle(v: string) { strokeStyles.push(v); },
    get fillStyle() { return ''; },
    set fillStyle(v: string) { fillStyles.push(v); },
    lineWidth: 1,
    lineCap: '',
    lineJoin: '',
    shadowBlur: 0,
    shadowColor: '',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    globalAlpha: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
  };

  const canvas = {
    getContext: () => ctx,
    width: 400,
    height: 300,
    style: { backgroundColor: '' },
  } as any;

  return { canvas, ctx, strokeStyles, fillStyles };
}

// ── CanvasContext-level mock ───────────────────────────────────────────────────
// Used by tests that instantiate a full CanvasContext (coffeemol.test.ts,
// interaction.test.ts, hetatm.test.ts). The canvas has all methods the renderer
// needs, plus toDataURL for export tests.
export function makeContextMocks(options: { getBoundingClientRect?: () => object } = {}) {
  const mockContext = {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    setLineDash: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '',
    lineCap: '',
    lineJoin: '',
    shadowBlur: 0,
    shadowColor: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
  };

  const mockCanvas = {
    getContext: vi.fn(() => mockContext),
    addEventListener: vi.fn(),
    toDataURL: vi.fn(() => 'data:image/png;base64,test'),
    style: {},
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
    ...(options.getBoundingClientRect
      ? { getBoundingClientRect: vi.fn(options.getBoundingClientRect) }
      : {}),
  };

  return { mockContext, mockCanvas };
}

// ── Global stubs ──────────────────────────────────────────────────────────────
// Installs the document/window globals that CanvasContext reads during init.
// Pass the mockCanvas so document.querySelector returns it.
export function stubCanvasGlobals(mockCanvas: any) {
  const mockInfoEl = { style: {}, textContent: '', innerHTML: '' };
  vi.stubGlobal('document', {
    querySelector: vi.fn(() => mockCanvas),
    getElementById: vi.fn((id: string) =>
      id === 'mol-info-display' ? mockInfoEl : null
    ),
    addEventListener: vi.fn(),
  });
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    matchMedia: vi.fn(() => ({ matches: false })),
    innerWidth: 1024,
    innerHeight: 768,
  });
  vi.stubGlobal('alert', vi.fn());
}

// ── Molecule scaffold ─────────────────────────────────────────────────────────
// Builds a minimal Structure → Chain → Residue hierarchy and returns each level.
// Pass atomDefs to add atoms in one call.
export function makeStructure(
  cc: any,
  atomDefs: { name: string; x: number; y: number; z: number; originalName: string; tempFactor?: number; isHetatm?: boolean }[] = []
) {
  const s = new Structure('test', cc);
  const c = new Chain(s, 'A');
  s.addChild(c);
  const r = new Residue(c, 'ALA', 1);
  c.addChild(r);

  const atoms: Atom[] = atomDefs.map(d => {
    const a = new Atom(r, d.name, d.x, d.y, d.z, d.originalName, d.tempFactor ?? 0, d.isHetatm ?? false);
    r.addChild(a);
    return a;
  });

  return { s, c, r, atoms };
}

// ── Render options factory ────────────────────────────────────────────────────
export function makeBaseRenderOptions(overrides: Partial<RenderOptions> = {}): RenderOptions {
  return {
    zoom: 1,
    x_origin: 0,
    y_origin: 0,
    colorScheme: defaultColorScheme,
    isDarkBackground: true,
    highlightedAtom: null,
    measureStartAtom: null,
    measureEndAtom: null,
    mouseX: 0,
    mouseY: 0,
    isInteracting: false,
    ...overrides,
  };
}
