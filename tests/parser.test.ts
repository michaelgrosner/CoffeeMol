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

  it('should return empty atoms and secondary structure for an empty PDB', () => {
    const parsed = parsePDB('');
    expect(parsed.atoms.length).toBe(0);
    expect(parsed.secondary_structure!.length).toBe(0);
    expect(parsed.title).toBe('');
  });

  it('should return empty atoms for a PDB with only blank lines and comments', () => {
    const parsed = parsePDB('\n\n   \n');
    expect(parsed.atoms.length).toBe(0);
  });

  it('should parse a PDB that has only HETATM records (no ATOM records)', () => {
    const pdb = `
HETATM    1  O   HOH A   1      10.000  20.000  30.000  1.00  5.00           O
HETATM    2  O   HOH A   2      11.000  21.000  31.000  1.00  5.00           O
`;
    const parsed = parsePDB(pdb);
    expect(parsed.atoms.length).toBe(2);
    expect(parsed.atoms[0].isHetatm).toBe(true);
    expect(parsed.atoms[1].isHetatm).toBe(true);
  });

  it('should handle a TITLE that spans multiple continuation lines', () => {
    const pdb = `
TITLE     FIRST LINE
TITLE     SECOND LINE
TITLE     THIRD LINE
`;
    const parsed = parsePDB(pdb);
    expect(parsed.title).toBe('FIRST LINE SECOND LINE THIRD LINE');
  });

  it('should default tempFactor to 0 when column 60-66 is missing or blank', () => {
    // Line shorter than 66 chars — substring is empty, parseFloat('') is NaN, || 0 → 0.
    const pdb = `ATOM      1  N   ALA A   1      24.364  26.685  14.285`;
    const parsed = parsePDB(pdb);
    expect(parsed.atoms[0].tempFactor).toBe(0);
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

  it('should default tempFactor to 0 when B_iso_or_equiv column is absent from mmCIF', () => {
    const cifData = `
loop_
_atom_site.auth_atom_id
_atom_site.auth_comp_id
_atom_site.auth_asym_id
_atom_site.auth_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
N ALA A 1 24.364 26.685 14.285
`;
    const parsed = parseMmCIF(cifData);
    expect(parsed.atoms.length).toBe(1);
    expect(parsed.atoms[0].tempFactor).toBe(0);
  });

  it('should correctly handle quoted tokens with spaces in mmCIF values', () => {
    // tokenizeCifLine must respect single-quote boundaries.
    const cifData = `
loop_
_atom_site.auth_atom_id
_atom_site.auth_comp_id
_atom_site.auth_asym_id
_atom_site.auth_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
'N CA' ALA A 1 1.0 2.0 3.0
`;
    const parsed = parseMmCIF(cifData);
    expect(parsed.atoms.length).toBe(1);
    // The quoted atom name preserves the space; handleAtomName takes first char.
    expect(parsed.atoms[0].original_atom_name).toBe('N CA');
  });

  it('should parse PDB multiple models', () => {
    const pdbData = `
MODEL        1
ATOM      1  N   ALA A   1      10.000  10.000  10.000  1.00 10.00           N
ENDMDL
MODEL        2
ATOM      1  N   ALA A   1      20.000  20.000  20.000  1.00 20.00           N
ENDMDL
`;
    const parsed = parsePDB(pdbData);
    expect(parsed.atoms.length).toBe(2);
    expect(parsed.atoms[0].model_id).toBe(1);
    expect(parsed.atoms[1].model_id).toBe(2);
    expect(parsed.atoms[0].x).toBe(10.0);
    expect(parsed.atoms[1].x).toBe(20.0);
  });

  it('should parse PDB connectivity (CONECT)', () => {
    const pdbData = `
ATOM      1  N   ALA A   1      10.000  10.000  10.000  1.00 10.00           N
ATOM      2  CA  ALA A   1      11.000  11.000  11.000  1.00 10.00           C
CONECT    1    2
`;
    const parsed = parsePDB(pdbData);
    expect(parsed.explicit_bonds!.length).toBe(1);
    expect(parsed.explicit_bonds![0]).toEqual([1, 2]);
  });

  it('should parse PDB occupancy, element, and formal charge', () => {
    const pdbData = `
ATOM      1  N   ALA A   1      10.000  10.000  10.000  0.50 10.00           N1+
`;
    const parsed = parsePDB(pdbData);
    expect(parsed.atoms[0].occupancy).toBe(0.5);
    expect(parsed.atoms[0].element).toBe('N');
    expect(parsed.atoms[0].formalCharge).toBe(1);
  });

  it('should parse mmCIF model, occupancy, element, and formal charge', () => {
    const cifData = `
loop_
_atom_site.id
_atom_site.auth_atom_id
_atom_site.auth_comp_id
_atom_site.auth_asym_id
_atom_site.auth_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.occupancy
_atom_site.type_symbol
_atom_site.pdbx_formal_charge
_atom_site.pdbx_PDB_model_num
1 N ALA A 1 10.0 10.0 10.0 0.8 CA 2 3
`;
    const parsed = parseMmCIF(cifData);
    const a = parsed.atoms[0];
    expect(a.occupancy).toBe(0.8);
    expect(a.element).toBe('CA');
    expect(a.formalCharge).toBe(2);
    expect(a.model_id).toBe(3);
  });
});

