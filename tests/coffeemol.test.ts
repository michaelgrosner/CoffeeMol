import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CanvasContext } from '../src/coffeemol';
import { Structure } from '../src/models';

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
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      setLineDash: vi.fn(),
    };

    mockCanvas = {
      getContext: vi.fn(() => mockContext),
      addEventListener: vi.fn(),
      style: {},
      width: 800,
      height: 600,
      clientWidth: 800,
      clientHeight: 600,
    };

    vi.stubGlobal('document', {
      querySelector: vi.fn(() => mockCanvas),
      getElementById: vi.fn(),
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
    expect(cc.context).toBe(mockContext);
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
});
