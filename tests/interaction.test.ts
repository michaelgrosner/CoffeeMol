import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CanvasContext } from '../src/coffeemol';
import { Structure, Chain, Residue, Atom } from '../src/models';

describe('Interaction Picking', () => {
  let mockCanvas: any;
  let mockContext: any;

  beforeEach(() => {
    mockContext = {
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      setTransform: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      setLineDash: vi.fn(),
      createRadialGradient: vi.fn(() => ({
        addColorStop: vi.fn(),
      })),
      fillRect: vi.fn(),
    };

    mockCanvas = {
      getContext: vi.fn(() => mockContext),
      addEventListener: vi.fn(),
      toDataURL: vi.fn(() => 'data:image/png;base64,test'),
      style: {},
      width: 800,
      height: 600,
      clientWidth: 800,
      clientHeight: 600,
      // Mock getBoundingClientRect for offset
      getBoundingClientRect: vi.fn(() => ({
        left: 100,
        top: 100,
        width: 800,
        height: 600,
      })),
    };

    vi.stubGlobal('document', {
      querySelector: vi.fn(() => mockCanvas),
      getElementById: vi.fn(),
      addEventListener: vi.fn(),
    });
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      matchMedia: vi.fn(() => ({ matches: false })),
    });
  });

  it('should pick atom correctly even when canvas is offset', () => {
    const cc = new CanvasContext('#target');
    const s = new Structure('test', cc);
    const c = new Chain(s, 'A');
    s.addChild(c);
    const r = new Residue(c, 'ALA', 1);
    c.addChild(r);

    // Atom at (0,0,0) in molecular coordinates
    const a = new Atom(r, 'CA', 0, 0, 0, 'CA');
    r.addChild(a);
    cc.addElement(s);

    s.init(); // Crucial: populates s.atoms from hierarchy

    cc.zoom = 1.0;
    cc.x_origin = 400; // Center of 800
    cc.y_origin = 300; // Center of 600
    cc.drawAll();

    // The atom should be at viewport (100 + 400, 100 + 300) = (500, 400)
    // because canvas left=100, top=100 and x_origin=400, y_origin=300

    // Currently, getAtomAt uses raw clientX/Y
    // So if I pass (500, 400), it should find it if it accounts for offset.
    const picked = cc.getAtomAt(500, 400);
    expect(picked).toBe(a);
  });
});
