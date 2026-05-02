import { describe, it, expect, vi } from 'vitest';
import { parsePDB, parseMmCIF } from '../src/parser';
import { CanvasContext } from '../src/coffeemol';

describe('HETATM Detection', () => {
  it('should detect HETATM in PDB', () => {
    const pdbData = `
ATOM      1  N   ALA A   1      24.364  26.685  14.285  1.00 20.00           N
HETATM    2  O   HOH A   2      25.000  27.000  15.000  1.00 20.00           O
`;
    const parsed = parsePDB(pdbData);
    expect(parsed.atoms.length).toBe(2);
    expect(parsed.atoms[0].isHetatm).toBe(false);
    expect(parsed.atoms[1].isHetatm).toBe(true);
  });

  it('should detect HETATM in mmCIF', () => {
    const cifData = `
loop_
_atom_site.group_PDB
_atom_site.auth_atom_id
_atom_site.auth_comp_id
_atom_site.auth_seq_id
_atom_site.auth_asym_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
ATOM  N ALA 1 A 24.364 26.685 14.285
HETATM O HOH 2 A 25.000 27.000 15.000
`;
    const parsed = parseMmCIF(cifData);
    expect(parsed.atoms.length).toBe(2);
    expect(parsed.atoms[0].isHetatm).toBe(false);
    expect(parsed.atoms[1].isHetatm).toBe(true);
  });

  it('should default HETATM residues to both drawMethod', () => {
    const pdbData = `
ATOM      1  N   ALA A   1      24.364  26.685  14.285  1.00 20.00           N
HETATM    2  O   HOH A   2      25.000  27.000  15.000  1.00 20.00           O
`;
    const parsed = parsePDB(pdbData);
    
    // Mocking CanvasContext and its dependencies is complex, 
    // but we can check if buildStructure sets the properties correctly.
    // We need a dummy canvas for CanvasContext
    const ctxMock = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      setLineDash: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      setTransform: vi.fn(),
      createRadialGradient: vi.fn(() => ({
        addColorStop: vi.fn(),
      })),
      fillRect: vi.fn(),
    };

    const canvas = {
      getContext: () => ctxMock,
      addEventListener: vi.fn(),
      clientWidth: 800,
      clientHeight: 600,
      width: 800,
      height: 600,
      style: {},
    } as any;
    
    const cc = new CanvasContext(canvas);
    // Mock document for tests
    (global as any).document = {
      getElementById: vi.fn().mockReturnValue(null),
    };
    
    cc.buildStructure(parsed, 'test.pdb');
    
    const structure = cc.elements[0];
    const chainA = structure.children[0] as any; // Cast to access children as Residue
    const res1 = chainA.children[0] as any; // ALA 1
    const res2 = chainA.children[1] as any; // HOH 2
    
    expect(res1.name).toBe('ALA');
    expect(res1.isHetatm).toBe(false);
    expect(res1.info.drawMethod).toBe('ribbon'); // default for structure
    
    expect(res2.name).toBe('HOH');
    expect(res2.isHetatm).toBe(true);
    expect(res2.info.drawMethod).toBe('both');
  });

  it('should protect HETATMs during changeAllDrawMethods', () => {
    const pdbData = `
ATOM      1  N   ALA A   1      24.364  26.685  14.285  1.00 20.00           N
HETATM    2  O   HOH A   2      25.000  27.000  15.000  1.00 20.00           O
`;
    const parsed = parsePDB(pdbData);
    
    const ctxMock = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      setLineDash: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      setTransform: vi.fn(),
      createRadialGradient: vi.fn(() => ({
        addColorStop: vi.fn(),
      })),
      fillRect: vi.fn(),
    };

    const canvas = {
      getContext: () => ctxMock,
      addEventListener: vi.fn(),
      clientWidth: 800,
      clientHeight: 600,
      width: 800,
      height: 600,
      style: {},
    } as any;
    
    const cc = new CanvasContext(canvas);
    cc.buildStructure(parsed, 'test.pdb');
    
    // Change to ribbon
    cc.changeAllDrawMethods('ribbon');
    
    const structure = cc.elements[0];
    const chainA = structure.children[0] as any;
    const res1 = chainA.children[0] as any; // ALA 1
    const res2 = chainA.children[1] as any; // HOH 2
    
    expect(res1.name).toBe('ALA');
    expect(res1.info.drawMethod).toBe('ribbon');
    
    expect(res2.name).toBe('HOH');
    expect(res2.info.drawMethod).toBe('both'); // Should be protected
  });
});
