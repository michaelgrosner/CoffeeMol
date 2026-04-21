'use strict';

export type RGB = [number, number, number];
export type DrawMethod =
  | 'both'
  | 'lines'
  | 'points'
  | 'cartoon'
  | 'ribbon'
  | 'tube';

export type ColorMethod =
  | 'cpk'
  | 'ss'
  | 'chain'
  | 'b-factor'
  | 'hydrophobicity';

export interface AtomInfo {
  drawMethod: DrawMethod;
  colorMethod?: ColorMethod;
  drawColor?: RGB | null;
  borderColor?: RGB | null;
  prevDrawColor?: RGB | null;
  prevBorderColor?: RGB | null;
}

export interface PDBAtomData {
  original_atom_name: string;
  atom_name: string;
  resi_name: string;
  chain_id: string;
  resi_id: number;
  x: number;
  y: number;
  z: number;
  tempFactor: number;
}

export interface StructureLoadInfo {
  drawMethod?: DrawMethod;
  colorMethod?: ColorMethod;
  drawColor?: RGB | number[] | string | null;
}

export interface ParsedAtom {
  original_atom_name: string;
  atom_name: string;
  resi_name: string;
  chain_id: string;
  resi_id: number;
  x: number;
  y: number;
  z: number;
  tempFactor: number;
}

export type SecondaryStructureType = 'helix' | 'sheet' | 'loop';

export interface SecondaryStructureRange {
  type: SecondaryStructureType;
  chain_id: string;
  start_resi_id: number;
  end_resi_id: number;
}

export interface ParsedStructure {
  title: string;
  atoms: ParsedAtom[];
  secondary_structure?: SecondaryStructureRange[];
}

export interface ColorScheme {
  atom_colors: Record<string, RGB>;
  ss_colors: Record<SecondaryStructureType, RGB>;
  chain_colors: RGB[];
  hydrophobicity_scale: Record<string, number>;
}

export const ATOM_SIZE = 3;
export const DEBUG = true;

export const nuc_acids: string[] = [
  'A',
  'C',
  'G',
  'T',
  'DA',
  'DC',
  'DG',
  'DT',
  'RA',
  'RC',
  'RG',
  'RT',
];
export const supported_draw_methods: DrawMethod[] = [
  'both',
  'lines',
  'points',
  'cartoon',
  'ribbon',
  'tube',
];
export const selector_delimiter = '/';

// Jmol CPK colors — http://jmol.sourceforge.net/jscolors/
export const atom_colors: Record<string, RGB> = {
  H: [255, 255, 255],
  C: [144, 144, 144],
  N: [48, 80, 248],
  O: [255, 13, 13],
  F: [144, 224, 80],
  P: [255, 128, 0],
  S: [255, 200, 50],
  K: [143, 64, 212],
  I: [148, 0, 148],
  V: [166, 0, 255],
  _: [180, 180, 180],
};

export const defaultColorScheme: ColorScheme = {
  atom_colors: { ...atom_colors },
  ss_colors: {
    helix: [255, 0, 255], // Magenta
    sheet: [255, 255, 0], // Yellow
    loop: [140, 140, 140], // Gray
  },
  chain_colors: [
    [64, 64, 255], // Blue
    [64, 255, 64], // Green
    [255, 64, 64], // Red
    [255, 255, 64], // Yellow
    [255, 64, 255], // Magenta
    [64, 255, 255], // Cyan
    [255, 128, 64], // Orange
    [128, 64, 255], // Purple
  ],
  hydrophobicity_scale: {
    ILE: 4.5,
    VAL: 4.2,
    LEU: 3.8,
    PHE: 2.8,
    CYS: 2.5,
    MET: 1.9,
    ALA: 1.8,
    GLY: -0.4,
    THR: -0.7,
    SER: -0.8,
    TRP: -0.9,
    TYR: -1.3,
    PRO: -1.6,
    HIS: -3.2,
    GLU: -3.5,
    GLN: -3.5,
    ASP: -3.5,
    ASN: -3.5,
    LYS: -3.9,
    ARG: -4.5,
  },
};

// Van der Waals radii relative to C = 1.0
export const atom_radii: Record<string, number> = {
  H: 0.65,
  C: 1.0,
  N: 0.93,
  O: 0.91,
  F: 0.88,
  P: 1.12,
  S: 1.12,
  I: 1.35,
};
