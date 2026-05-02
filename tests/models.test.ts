import { describe, it, expect } from 'vitest';
import {
  Atom,
  Residue,
  atomAtomDistance,
  Selector,
} from '../src/models';
import { defaultColorScheme } from '../src/schemes';
import { makeDummyCC, makeStructure } from './helpers';

describe('Models', () => {
  it('should calculate distance between atoms', () => {
    const { r } = makeStructure(makeDummyCC());
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
    const { s, c } = makeStructure(makeDummyCC());
    expect(s.children).toContain(c);
    expect(c.parent).toBe(s);
    expect(c.color).toBeDefined(); // Chain color should be set on added to parent
  });

  it('should merge info in propogateInfo', () => {
    const { r } = makeStructure(makeDummyCC());

    // Initial state
    r.propogateInfo({ drawMethod: 'ribbon', colorMethod: 'cpk' });
    expect(r.info.drawMethod).toBe('ribbon');
    expect(r.info.colorMethod).toBe('cpk');

    // Partial update: only colorMethod
    r.propogateInfo({ colorMethod: 'chain' });
    expect(r.info.drawMethod).toBe('ribbon'); // Should be preserved
    expect(r.info.colorMethod).toBe('chain');

    // Partial update: only drawColor
    r.propogateInfo({ drawColor: '#FF0000' });
    expect(r.info.drawMethod).toBe('ribbon'); // Should be preserved
    expect(r.info.colorMethod).toBe('chain'); // Should be preserved
    expect(r.info.drawColor).toEqual([255, 0, 0]);
  });

  it('should find bonds', () => {
    const { r } = makeStructure(makeDummyCC());

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
    const { r } = makeStructure(makeDummyCC());

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

  it('avgCenter returns NaN for each axis when the structure has no atoms', () => {
    // atoms list is empty → division by 0 → [NaN, NaN, NaN].
    // translateTo then corrupts every atom's position if called on such a structure.
    const { s } = makeStructure(makeDummyCC());
    s.atoms = []; // explicitly empty
    const center = s.avgCenter();
    expect(isNaN(center[0])).toBe(true);
    expect(isNaN(center[1])).toBe(true);
    expect(isNaN(center[2])).toBe(true);
  });

  it('stashInfo only stores one slot — a second stash silently overwrites the first', () => {
    // stashInfo writes to `(this as any).old_info`; calling it twice before
    // retrieveStashedInfo means the first stash is gone.
    const { r } = makeStructure(makeDummyCC());

    r.propogateInfo({ drawMethod: 'points' });
    r.stashInfo(); // stashes 'points'

    r.propogateInfo({ drawMethod: 'ribbon' });
    r.stashInfo(); // overwrites stash with 'ribbon'

    r.propogateInfo({ drawMethod: 'lines' });
    r.retrieveStashedInfo(); // retrieves 'ribbon', NOT 'points'

    // Documents the current (lossy) behavior: restores to the second stash.
    expect(r.info.drawMethod).toBe('ribbon');
  });

  it('bond window misses atoms more than 80 positions apart (documents the limit)', () => {
    // findBonds uses a window of 80: jEnd = Math.min(i + 80, atoms.length - 1).
    // An atom at index i+81 is never compared against atom at i, even if in range.
    const { s, c } = makeStructure(makeDummyCC());

    // Build a single residue with 82 atoms. Place atoms 0 and 81 at bonding distance.
    const r = new Residue(c, 'GLY', 2);
    c.addChild(r);

    const first = new Atom(r, 'N', 0, 0, 0, 'N');
    r.addChild(first);

    for (let i = 1; i <= 80; i++) {
      r.addChild(new Atom(r, 'C', 100, i * 10, 0, 'C'));
    }

    // Atom 81: bonding distance from atom 0 (1.5 Å), but i+81 is outside the window
    const last = new Atom(r, 'O', 1.5, 0, 0, 'O');
    r.addChild(last);

    s.init();

    const bond = s.bonds.find(b =>
      (b.a1 === first && b.a2 === last) || (b.a1 === last && b.a2 === first)
    );
    // Documents the bug: bond is NOT found because last is at index 81 from first.
    expect(bond).toBeUndefined();
  });

  it('finds cross-residue disulfide bridges (S-S < 2.2 Å)', () => {
    const { s, c } = makeStructure(makeDummyCC());

    const r2 = new Residue(c, 'CYS', 5);
    c.addChild(r2);

    // Change first residue name to CYS to match the disulfide scenario
    const r1 = c.children[0] as Residue;
    (r1 as any).name = 'CYS';

    const sg1 = new Atom(r1, 'S', 0, 0, 0, 'SG');
    const sg2 = new Atom(r2, 'S', 2.0, 0, 0, 'SG'); // 2.0 Å — within 2.2 Å threshold
    r1.addChild(sg1);
    r2.addChild(sg2);

    s.init();

    const disulfide = s.bonds.find(b =>
      (b.a1 === sg1 && b.a2 === sg2) || (b.a1 === sg2 && b.a2 === sg1)
    );
    expect(disulfide).toBeDefined();
    expect(disulfide!.length).toBeCloseTo(2.0);
  });

  it('does not bond two atoms that are the same point (distance < 0.4 Å)', () => {
    const { s, r } = makeStructure(makeDummyCC());
    const a1 = new Atom(r, 'C', 0, 0, 0, 'CA');
    const a2 = new Atom(r, 'N', 0.1, 0, 0, 'N'); // 0.1 Å — below 0.4 Å guard
    r.addChild(a1);
    r.addChild(a2);
    s.init();
    expect(s.bonds.length).toBe(0);
  });

  it('should calculate B-factor and hydrophobicity colors', () => {
    const cc = makeDummyCC();
    const { r } = makeStructure(cc);

    const a = new Atom(r, 'CA', 0, 0, 0, 'CA', 50);
    r.addChild(a);
    a.cc = cc;

    const bColor = a.bFactorColor();
    // 50/100 -> t=0.5 -> r=128, b=128
    expect(bColor[0]).toBe(128);
    expect(bColor[2]).toBe(128);

    const hColor = a.hydrophobicityColor();
    // ALA hydrophobicity = 1.8. Normalize (-4.5 to 4.5) -> (1.8+4.5)/9 = 0.7
    // Default ramp: low [0, 0, 255], high [255, 0, 0]
    // r = 0 + (255-0)*0.7 = 179
    // g = 0 + (0-0)*0.7 = 0
    // b = 255 + (0-255)*0.7 = 77
    expect(hColor[0]).toBe(179);
    expect(hColor[1]).toBe(0);
    expect(hColor[2]).toBe(77);
  });

  it('clamps B-factor extremes: tempFactor > 100 maps to pure high-ramp color', () => {
    const cc = makeDummyCC();
    const { r } = makeStructure(cc);
    const a = new Atom(r, 'CA', 0, 0, 0, 'CA', 150);
    r.addChild(a);
    a.cc = cc;

    // t clamped to 1.0 → full high-ramp (red in default scheme)
    expect(a.bFactorColor()).toEqual(defaultColorScheme.ramp_high);
  });

  it('clamps B-factor extremes: tempFactor < 0 maps to pure low-ramp color', () => {
    const cc = makeDummyCC();
    const { r } = makeStructure(cc);
    const a = new Atom(r, 'CA', 0, 0, 0, 'CA', -50);
    r.addChild(a);
    a.cc = cc;

    // t clamped to 0.0 → full low-ramp (blue in default scheme)
    expect(a.bFactorColor()).toEqual(defaultColorScheme.ramp_low);
  });

  it('hydrophobicityColor falls back to 0 for unrecognised residue names', () => {
    // scale['UNK'] is undefined → `|| 0` gives 0 → t = (0+4.5)/9 = 0.5 (neutral midpoint)
    const cc = makeDummyCC();
    const { c } = makeStructure(cc);
    const r = new Residue(c, 'UNK', 2);
    c.addChild(r);
    const a = new Atom(r, 'CA', 0, 0, 0, 'CA');
    r.addChild(a);
    a.cc = cc;

    const color = a.hydrophobicityColor();
    // t=0.5, ramp_low=[0,0,255], ramp_high=[255,0,0] → r=128, g=0, b=128
    expect(color[0]).toBe(128);
    expect(color[1]).toBe(0);
    expect(color[2]).toBe(128);
  });
});
