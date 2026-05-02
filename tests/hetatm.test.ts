import { describe, it, expect } from 'vitest';
import { parsePDB, parseMmCIF } from '../src/parser';
import { CanvasContext } from '../src/coffeemol';
import { makeContextMocks, stubCanvasGlobals } from './helpers';

function makeCC() {
  const { mockCanvas } = makeContextMocks();
  stubCanvasGlobals(mockCanvas);
  return new CanvasContext(mockCanvas as any);
}

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
    const cc = makeCC();
    cc.buildStructure(parsePDB(pdbData), 'test.pdb');

    const structure = cc.elements[0];
    const chainA = structure.children[0] as any;
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
    const cc = makeCC();
    cc.buildStructure(parsePDB(pdbData), 'test.pdb');
    cc.changeAllDrawMethods('ribbon');

    const chainA = cc.elements[0].children[0] as any;
    const res1 = chainA.children[0] as any; // ALA 1
    const res2 = chainA.children[1] as any; // HOH 2

    expect(res1.info.drawMethod).toBe('ribbon');
    expect(res2.info.drawMethod).toBe('both'); // Protected
  });
});
