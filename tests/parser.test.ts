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
    expect(atom.x).toBe(24.364);
    expect(atom.tempFactor).toBe(24.11);
  });

  it('should parse PDB secondary structure', () => {
    const pdbData = `
TITLE    TEST
HELIX    1   1 ALA A   1  ALA A  10  1                                  10
SHEET    1   A 2 ALA A  11  ALA A  20  0
ATOM      1  N   ALA A   1      24.364  26.685  14.285  1.00 20.00           N
`;
    const parsed = parsePDB(pdbData);
    expect(parsed.secondary_structure!.length).toBe(2);
    expect(parsed.secondary_structure![0]).toEqual({
      type: 'helix',
      chain_id: 'A',
      start_resi_id: 1,
      end_resi_id: 10,
    });
    expect(parsed.secondary_structure![1]).toEqual({
      type: 'sheet',
      chain_id: 'A',
      start_resi_id: 11,
      end_resi_id: 20,
    });
  });

  it('should parse mmCIF files', () => {
    const cifData = fs.readFileSync(
      path.join(__dirname, 'data/test.cif'),
      'utf-8'
    );
    const parsed = parseMmCIF(cifData);
    expect(parsed.title).toBe('TEST STRUCTURE');
    expect(parsed.atoms.length).toBe(1);
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

  it('should handle quoted multi-line titles in mmCIF', () => {
    const cifData = `
_struct.title 'QUOTED
MULTI-LINE
TITLE'
loop_
_atom_site.id
1
`;
    const parsed = parseMmCIF(cifData);
    expect(parsed.title.trim()).toBe('QUOTED MULTI-LINE TITLE');
  });

  it('should parse mmCIF secondary structure', () => {
    const cifData = `
loop_
_struct_conf.conf_type_id
_struct_conf.beg_auth_asym_id
_struct_conf.beg_auth_seq_id
_struct_conf.end_auth_seq_id
HELX_P A 1 10
loop_
_struct_sheet_range.beg_auth_asym_id
_struct_sheet_range.beg_auth_seq_id
_struct_sheet_range.end_auth_seq_id
A 11 20
`;
    const parsed = parseMmCIF(cifData);
    expect(parsed.secondary_structure!.length).toBe(2);
    expect(parsed.secondary_structure![0].type).toBe('helix');
    expect(parsed.secondary_structure![1].type).toBe('sheet');
  });

  it('should parse mmCIF B-factor', () => {
    const cifData = `
loop_
_atom_site.auth_atom_id
_atom_site.auth_comp_id
_atom_site.auth_asym_id
_atom_site.auth_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.B_iso_or_equiv
N ALA A 1 24.364 26.685 14.285 24.11
`;
    const parsed = parseMmCIF(cifData);
    expect(parsed.atoms[0].tempFactor).toBe(24.11);
  });
});
