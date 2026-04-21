import { describe, it, expect } from 'vitest';
import {
  Atom,
  Residue,
  Chain,
  Structure,
  atomAtomDistance,
  Selector,
} from '../src/models';

describe('Models', () => {
  it('should calculate distance between atoms', () => {
    const dummyCC = {
      addElement: () => {},
      canvas: { style: {} },
      context: {},
    } as any;

    const s = new Structure('test', dummyCC);
    const c = new Chain(s, 'A');
    s.addChild(c);
    const r = new Residue(c, 'ALA', 1);
    c.addChild(r);

    const a1 = new Atom(r, 'N', 0, 0, 0, 'N');
    const a2 = new Atom(r, 'CA', 3, 4, 0, 'CA');
    r.addChild(a1);
    r.addChild(a2);

    expect(atomAtomDistance(a1, a2)).toBe(5);
  });

  describe('Selector', () => {
    it('should initialize correctly from string', () => {
      const sel = new Selector('1/2/3');
      expect(sel.array).toEqual([1, 2, 3]);
      expect(sel.str).toBe('1/2/3');
    });

    it('should initialize correctly from array', () => {
      const sel = new Selector([1, 2, 3]);
      expect(sel.array).toEqual([1, 2, 3]);
      expect(sel.str).toBe('1/2/3');
    });

    it('should handle navigation', () => {
      const sel = new Selector('1/2/3');
      expect(sel.right().str).toBe('1/2/4');
      expect(sel.left().str).toBe('1/2/2');
      expect(sel.down().str).toBe('1/2/3/0');
      expect(sel.up()?.str).toBe('1/2');
      expect(new Selector('1').up()).toBeNull();
    });
  });

  it('should handle hierarchy and child adding', () => {
    const dummyCC = { addElement: () => {} } as any;
    const s = new Structure('test', dummyCC);
    const c = new Chain(s, 'A');
    s.addChild(c);
    expect(s.children).toContain(c);
    expect(c.parent).toBe(s);
    expect(c.color).toBeDefined(); // Chain color should be set on added to parent
  });

  it('should find bonds', () => {
    const dummyCC = { addElement: () => {} } as any;
    const s = new Structure('test', dummyCC);
    const c = new Chain(s, 'A');
    s.addChild(c);
    const r = new Residue(c, 'ALA', 1);
    c.addChild(r);

    const a1 = new Atom(r, 'N', 0, 0, 0, 'N');
    const a2 = new Atom(r, 'CA', 1.45, 0, 0, 'CA'); // Distance < 1.85
    const a3 = new Atom(r, 'C', 5, 5, 5, 'C'); // Too far
    r.addChild(a1);
    r.addChild(a2);
    r.addChild(a3);

    r.init(); // This gathers atoms
    r.findBonds();
    expect(r.bonds.length).toBe(1);
    expect(r.bonds[0].a1).toBe(a1);
    expect(r.bonds[0].a2).toBe(a2);
  });

  it('should be symmetric in isBonded', () => {
    const dummyCC = { addElement: () => {} } as any;
    const s = new Structure('test', dummyCC);
    const c = new Chain(s, 'A');
    s.addChild(c);
    const r = new Residue(c, 'ALA', 1);
    c.addChild(r);

    const a1 = new Atom(r, 'CA', 0, 0, 0, 'CA');
    const a2 = new Atom(r, 'CA', 3.8, 0, 0, 'CA'); // Distance < 4.0
    r.addChild(a1);
    r.addChild(a2);

    // If a1 is tube, it uses backbone logic (dist < 4.0 for CA-CA)
    a1.info.drawMethod = 'tube';
    a2.info.drawMethod = 'points';
    r.init();
    r.findBonds();
    const count1 = r.bonds.length;

    // If a1 is points and a2 is tube, it should be the same
    a1.info.drawMethod = 'points';
    a2.info.drawMethod = 'tube';
    r.findBonds();
    const count2 = r.bonds.length;

    expect(count1).toBe(count2);
  });
});
