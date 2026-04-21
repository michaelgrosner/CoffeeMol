import { describe, it, expect } from 'vitest';
import { parsePDB, parseMmCIF } from '../src/parser';
import * as fs from 'fs';
import * as path from 'path';

describe('Parsers', () => {
  it('should parse PDB files', () => {
    const pdbData = fs.readFileSync(
      path.join(__dirname, 'data/test.pdb'),
      'utf-8'
    );
    const parsed = parsePDB(pdbData);
    expect(parsed.title).toBe('TEST STRUCTURE');
    expect(parsed.atoms.length).toBe(1);
    const atom = parsed.atoms[0];
    expect(atom.original_atom_name).toBe('N');
    expect(atom.atom_name).toBe('N');
    expect(atom.resi_name).toBe('ALA');
    expect(atom.chain_id).toBe('A');
    expect(atom.resi_id).toBe(1);
    expect(atom.x).toBe(24.364);
    expect(atom.y).toBe(26.685);
    expect(atom.z).toBe(14.285);
  });

  it('should parse mmCIF files', () => {
    const cifData = fs.readFileSync(
      path.join(__dirname, 'data/test.cif'),
      'utf-8'
    );
    const parsed = parseMmCIF(cifData);
    expect(parsed.title).toBe('TEST STRUCTURE');
    expect(parsed.atoms.length).toBe(1);
    const atom = parsed.atoms[0];
    expect(atom.original_atom_name).toBe('N');
    expect(atom.atom_name).toBe('N');
    expect(atom.resi_name).toBe('ALA');
    expect(atom.chain_id).toBe('A');
    expect(atom.resi_id).toBe(1);
    expect(atom.x).toBe(24.364);
    expect(atom.y).toBe(26.685);
    expect(atom.z).toBe(14.285);
  });

  it('should handle multi-line titles in mmCIF', () => {
    const cifData = `
_struct.title
;
MULTI-LINE
TITLE
;
loop_
_atom_site.id
1
`;
    const parsed = parseMmCIF(cifData);
    expect(parsed.title.trim()).toBe('MULTI-LINE TITLE');
  });
});
