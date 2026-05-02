import { describe, it, expect } from 'vitest';
import { Canvas2DRenderer } from '../src/renderers/canvas2d';
import { Atom } from '../src/models';
import { makeDummyCC, makeCanvasMock, makeStructure, makeBaseRenderOptions } from './helpers';

describe('Canvas2DRenderer', () => {
  describe('depth shading', () => {
    it('produces valid color strings when all atoms share the same Z (z_extent = 0)', () => {
      // When every atom sits at z=0, computeZExtent() sets z_extent to 0.
      // depthShadedColorString then computes t = 0/0 = NaN, yielding
      // rgba(NaN,NaN,NaN,1) — an invalid CSS value that silently makes atoms invisible.
      const renderer = new Canvas2DRenderer();
      const { canvas } = makeCanvasMock();
      renderer.init(canvas);

      // Force z_extent to 0 (simulates all-atoms-at-z=0 after computeZExtent)
      (renderer as any).z_extent = 0;

      const cc = makeDummyCC();
      const { r } = makeStructure(cc);
      const a = new Atom(r, 'C', 0, 0, 0, 'CA');
      r.addChild(a);
      a.cc = cc;

      const result = (renderer as any).depthShadedColorString(a, makeBaseRenderOptions(), 'cpk', 0, 1);
      expect(result).not.toContain('NaN');
    });

    it('produces valid color strings with isDarkBackground=false when z_extent = 0', () => {
      const renderer = new Canvas2DRenderer();
      const { canvas } = makeCanvasMock();
      renderer.init(canvas);
      (renderer as any).z_extent = 0;

      const cc = makeDummyCC();
      const { r } = makeStructure(cc);
      const a = new Atom(r, 'N', 0, 0, 0, 'N');
      r.addChild(a);
      a.cc = cc;

      const result = (renderer as any).depthShadedColorString(
        a, makeBaseRenderOptions({ isDarkBackground: false }), 'cpk', 0, 1
      );
      expect(result).not.toContain('NaN');
    });
  });

  describe('getAtomAt', () => {
    it('returns atom when query is within one grid cell (~5px) of the atom', () => {
      // The grid uses 5px cells and searches a 3×3 neighbourhood. An atom at (0,0)
      // is only discoverable from queries whose quantised cell is within ±1 of (0,0),
      // i.e. queries at roughly [-7.4, +7.4] px — NOT up to 25 px.
      // The sqDist > 625 check is a secondary filter for false positives from bond
      // sampling, not the primary distance limit.
      const renderer = new Canvas2DRenderer();
      const { canvas } = makeCanvasMock();
      renderer.init(canvas);

      const cc = makeDummyCC();
      const { s, atoms } = makeStructure(cc, [{ name: 'C', x: 0, y: 0, z: 0, originalName: 'CA' }]);
      s.init();

      (renderer as any).determinePointGrid([s], makeBaseRenderOptions());

      // Query at (5, 0): gx = Math.round(5/5) = 1. Cell 1 is within ±1 of cell 0.
      // sqDist = 25 < 625 → atom returned.
      expect(renderer.getAtomAt(5, 0, 1, 0, 0)).toBe(atoms[0]);
    });

    it('returns null when query is more than ~7.5px from the atom (outside grid window)', () => {
      const renderer = new Canvas2DRenderer();
      const { canvas } = makeCanvasMock();
      renderer.init(canvas);

      const cc = makeDummyCC();
      const { s } = makeStructure(cc, [{ name: 'C', x: 0, y: 0, z: 0, originalName: 'CA' }]);
      s.init();

      (renderer as any).determinePointGrid([s], makeBaseRenderOptions());

      // Query at (25, 0): gx = 5. Cell 5 is 5 cells from cell 0 → outside 3×3 window.
      expect(renderer.getAtomAt(25, 0, 1, 0, 0)).toBeNull();
    });

    it('sqDist > 625 filter catches false positives from bond mid-point sampling', () => {
      // Bond mid-point sampling places atom references in cells far from the atom's
      // actual position. The sqDist > 625 guard catches and rejects those stale hits.
      const renderer = new Canvas2DRenderer();
      const { canvas } = makeCanvasMock();
      renderer.init(canvas);

      const cc = makeDummyCC();
      const { s, r } = makeStructure(cc);
      const a1 = new Atom(r, 'N', 0, 0, 0, 'N');
      const a2 = new Atom(r, 'C', 1.4, 0, 0, 'CA'); // bonded (< 1.85 Å)
      r.addChild(a1);
      r.addChild(a2);
      s.init();

      // Move a2 far away AFTER init so the bond object still exists but atom is distant.
      a2.x = 100;

      (renderer as any).determinePointGrid([s], makeBaseRenderOptions());

      // Bond sampling may have placed a2 near (50, 0); a2's actual screen position is
      // (100, 0) → sqDist = 50² = 2500 > 625 → should not be returned.
      const result = renderer.getAtomAt(50, 0, 1, 0, 0);
      expect(result).not.toBe(a2);
    });
  });

  describe('grid Z-ordering', () => {
    it('stores the atom with higher Z when two atoms hash to the same grid bucket', () => {
      const renderer = new Canvas2DRenderer();
      const { canvas } = makeCanvasMock();
      renderer.init(canvas);

      const cc = makeDummyCC();
      const { s, r } = makeStructure(cc);
      const aBack  = new Atom(r, 'N', 0, 0, -10, 'N');  // lower z (further back)
      const aFront = new Atom(r, 'C', 0, 0,  10, 'CA'); // higher z (in front)
      r.addChild(aBack);
      r.addChild(aFront);
      s.init();

      (renderer as any).determinePointGrid([s], makeBaseRenderOptions());

      expect(renderer.getAtomAt(0, 0, 1, 0, 0)).toBe(aFront);
    });
  });
});
