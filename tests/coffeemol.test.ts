import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CanvasContext } from '../src/coffeemol';
import { Structure, Chain, Residue, Atom } from '../src/models';

describe('CanvasContext', () => {
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
    };

    const mockInfoEl = { style: {}, textContent: '', innerHTML: '' };
    vi.stubGlobal('document', {
      querySelector: vi.fn(() => mockCanvas),
      getElementById: vi.fn((id) => (id === 'mol-info-display' ? mockInfoEl : null)),
      addEventListener: vi.fn(),
    });

    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      matchMedia: vi.fn(() => ({ matches: false })),
      innerWidth: 1024,
      innerHeight: 768,
    });

    vi.stubGlobal('alert', vi.fn());
  });

  it('should initialize correctly', () => {
    const cc = new CanvasContext('#target');
    expect(cc.canvas).toBe(mockCanvas);
    expect(cc.renderer).toBeDefined();
    expect(cc.x_origin).toBe(400); // 800 / 2
    expect(cc.y_origin).toBe(300); // 600 / 2
  });

  it('should add elements', () => {
    const cc = new CanvasContext('#target');
    const s = new Structure('test', cc);
    cc.addElement(s);
    expect(cc.elements).toContain(s);
  });

  it('should change background color', () => {
    const cc = new CanvasContext('#target', '#ffffff');
    cc.setBackgroundColor('#000000');
    expect(cc.background_color).toBe('#000000');
    expect(cc.isDarkBackground).toBe(true);
    expect(mockCanvas.style.backgroundColor).toBe('#000000');
  });

  it('should handle zoom', () => {
    const cc = new CanvasContext('#target');
    cc.zoom = 1.0;
    const mockEvent = {
      preventDefault: vi.fn(),
      deltaY: 100, // Zoom out (0.9 factor)
    } as any;
    cc.changeZoom(mockEvent);
    expect(cc.zoom).toBeCloseTo(0.9);
    expect(mockEvent.preventDefault).toHaveBeenCalled();
  });

  it('should show atom info on hover', () => {
    const cc = new CanvasContext('#target');
    const s = new Structure('test', cc);
    s.attachTitle('Test Structure');
    const c = new Chain(s, 'A');
    s.addChild(c);
    const r = new Residue(c, 'ALA', 1);
    r.ss = 'helix';
    c.addChild(r);
    const a = new Atom(r, 'CA', 0, 0, 0, 'CA');
    a.info.drawMethod = 'ribbon'; // Explicitly set ribbon mode
    r.addChild(a);
    cc.addElement(s);
    s.init();
    cc.x_origin = 0;
    cc.y_origin = 0;
    cc.zoom = 1;
    cc.drawAll();

    // Mock getBoundingClientRect for getAtomAt
    mockCanvas.getBoundingClientRect = vi.fn(() => ({ left: 0, top: 0 }));

    const mockEvent = { clientX: 0, clientY: 0 } as any;
    cc.showAtomInfo(mockEvent);

    const infoEl = document.getElementById('mol-info-display') as any;
    expect(infoEl.innerHTML).not.toContain('Test Structure');
    expect(infoEl.innerHTML).toContain('Chain A: ALA 1 (helix)');
    expect(infoEl.innerHTML).not.toContain('Atom: CA');
    expect(infoEl.style.transform).toBe('translate(15px, 15px)');
  });

  it('should pick atom with slight offset', () => {
    const cc = new CanvasContext('#target');
    const s = new Structure('test', cc);
    const c = new Chain(s, 'A');
    s.addChild(c);
    const r = new Residue(c, 'ALA', 1);
    c.addChild(r);
    const a = new Atom(r, 'CA', 0, 0, 0, 'CA');
    r.addChild(a);
    cc.addElement(s);
    s.init();
    cc.x_origin = 0;
    cc.y_origin = 0;
    cc.zoom = 1;
    cc.drawAll();

    mockCanvas.getBoundingClientRect = vi.fn(() => ({ left: 0, top: 0 }));

    // Offset by 4 pixels (should still pick it because of 3x3 search and radius check)
    expect(cc.getAtomAt(4, 4)).toBe(a);
    // Offset by 20 pixels (should NOT pick it)
    expect(cc.getAtomAt(20, 20)).toBeNull();
  });

  it('should initialize atoms and bonds recursively', () => {
    const cc = new CanvasContext('#target');
    const s = new Structure('test', cc);
    const c = new Chain(s, 'A');
    s.addChild(c);
    const r = new Residue(c, 'ALA', 1);
    c.addChild(r);
    const a1 = new Atom(r, 'N', 0, 0, 0, 'N');
    const a2 = new Atom(r, 'CA', 1, 1, 1, 'CA');
    r.addChild(a1);
    r.addChild(a2);
    cc.addElement(s);

    s.init();

    expect(s.atoms.length).toBe(2);
    expect(c.atoms.length).toBe(2);
    expect(r.atoms.length).toBe(2);

    expect(s.bonds.length).toBe(1);
    expect(c.bonds.length).toBe(1);
    expect(r.bonds.length).toBe(1);
  });

  it('should pick atom when hovering over a bond', () => {
    const cc = new CanvasContext('#target');
    const s = new Structure('test', cc);
    const c = new Chain(s, 'A');
    s.addChild(c);
    const r = new Residue(c, 'ALA', 1);
    c.addChild(r);
    // Atoms 10 pixels apart
    const a1 = new Atom(r, 'CA', 0, 0, 0, 'CA');
    const a2 = new Atom(r, 'CA', 10, 0, 0, 'CA');
    r.addChild(a1);
    r.addChild(a2);
    cc.addElement(s);
    s.init();
    cc.x_origin = 0;
    cc.y_origin = 0;
    cc.zoom = 1;
    cc.drawAll();

    mockCanvas.getBoundingClientRect = vi.fn(() => ({ left: 0, top: 0 }));

    // Hover at (5, 0) - exactly between atoms
    expect(cc.getAtomAt(5, 0)).not.toBeNull();
  });

  it('should export and load scene state', () => {
    const cc = new CanvasContext('#target');
    const s = new Structure('test', cc);
    const c = new Chain(s, 'A');
    s.addChild(c);
    const r = new Residue(c, 'ALA', 1);
    c.addChild(r);
    const a = new Atom(r, 'CA', 1, 2, 3, 'CA');
    r.addChild(a);
    cc.addElement(s);
    s.init();

    cc.zoom = 5.0;
    cc.x_origin = 100;
    cc.y_origin = 200;
    s.info.colorMethod = 'b-factor';

    const stateStr = cc.getState();
    const state = JSON.parse(stateStr);

    expect(state.zoom).toBe(5.0);
    expect(state.x_origin).toBe(100);
    expect(state.structures[0].info.colorMethod).toBe('b-factor');
    expect(state.structures[0].atomPositions[0]).toEqual([1, 2, 3]);

    // Change something and load back
    cc.zoom = 1.0;
    a.x = 0;
    cc.loadState(stateStr);

    expect(cc.zoom).toBe(5.0);
    expect(a.x).toBe(1);
    expect(s.info.colorMethod).toBe('b-factor');
  });

  it('should export high-resolution image', () => {
    const cc = new CanvasContext('#target');
    const dataURL = cc.exportImage(2);
    expect(dataURL).toBe('data:image/png;base64,test');
    expect(mockCanvas.toDataURL).toHaveBeenCalled();
  });

  it('should apply color scheme', () => {
    const cc = new CanvasContext('#target');
    const customScheme = {
      atom_colors: { C: [255, 0, 0] } as any,
    };
    cc.setScheme(customScheme);
    expect(cc.colorScheme.atom_colors.C).toEqual([255, 0, 0]);
    // redrawing check
    expect(mockContext.clearRect).toHaveBeenCalled();
  });
});
