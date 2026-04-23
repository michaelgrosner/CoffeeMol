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
  background?: string;
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
    [64, 64, 255], [64, 255, 64], [255, 64, 64], [255, 255, 64],
    [255, 64, 255], [64, 255, 255], [255, 128, 64], [128, 64, 255],
  ],
  hydrophobicity_scale: {
    ILE: 4.5, VAL: 4.2, LEU: 3.8, PHE: 2.8, CYS: 2.5, MET: 1.9, ALA: 1.8,
    GLY: -0.4, THR: -0.7, SER: -0.8, TRP: -0.9, TYR: -1.3, PRO: -1.6,
    HIS: -3.2, GLU: -3.5, GLN: -3.5, ASP: -3.5, ASN: -3.5, LYS: -3.9, ARG: -4.5,
  },
};

export const highContrastScheme: ColorScheme = {
  ...defaultColorScheme,
  atom_colors: {
    ...atom_colors,
    C: [255, 255, 255],
    N: [255, 255, 0],
    O: [255, 0, 0],
    H: [0, 255, 255],
  },
  ss_colors: {
    helix: [255, 0, 0],
    sheet: [0, 255, 0],
    loop: [255, 255, 255],
  },
  background: '#000000',
};

export const oceanScheme: ColorScheme = {
  ...defaultColorScheme,
  atom_colors: {
    ...atom_colors,
    C: [43, 101, 236],
    N: [100, 149, 237],
    O: [176, 224, 230],
  },
  ss_colors: {
    helix: [0, 0, 128],
    sheet: [0, 128, 128],
    loop: [173, 216, 230],
  },
  chain_colors: [[0, 105, 148], [30, 144, 255], [72, 209, 204], [0, 206, 209]],
  background: '#000814',
};

export const forestScheme: ColorScheme = {
  ...defaultColorScheme,
  atom_colors: {
    ...atom_colors,
    C: [34, 139, 34],
    N: [144, 238, 144],
    O: [210, 180, 140],
  },
  ss_colors: {
    helix: [0, 100, 0],
    sheet: [107, 142, 35],
    loop: [245, 245, 220],
  },
  chain_colors: [[46, 139, 87], [60, 179, 113], [154, 205, 50], [85, 107, 47]],
  background: '#0d1a0d',
};

export const monochromeScheme: ColorScheme = {
  ...defaultColorScheme,
  atom_colors: {
    C: [100, 100, 100], N: [150, 150, 150], O: [200, 200, 200],
    H: [230, 230, 230], S: [80, 80, 80], P: [120, 120, 120], _: [100, 100, 100]
  },
  ss_colors: {
    helix: [60, 60, 60],
    sheet: [120, 120, 120],
    loop: [200, 200, 200],
  },
  chain_colors: [[50, 50, 50], [100, 100, 100], [150, 150, 150], [200, 200, 200]],
};

export const neonScheme: ColorScheme = {
  ...defaultColorScheme,
  atom_colors: {
    C: [57, 255, 20],   // Neon Green
    N: [255, 0, 255],   // Neon Magenta
    O: [0, 255, 255],   // Neon Cyan
    H: [255, 255, 255],
    P: [255, 110, 199], // Neon Pink
    S: [255, 211, 0],   // Neon Yellow
    _: [150, 150, 150]
  },
  ss_colors: {
    helix: [255, 0, 255],
    sheet: [57, 255, 20],
    loop: [0, 255, 255],
  },
  chain_colors: [[255, 0, 255], [57, 255, 20], [0, 255, 255], [255, 110, 199]],
  background: '#000000',
};

export const molokaiScheme: ColorScheme = {
  ...defaultColorScheme,
  atom_colors: {
    ...atom_colors,
    C: [248, 248, 242], // Foreground
    N: [102, 217, 239], // Cyan
    O: [249, 38, 114],  // Magenta
    S: [253, 151, 31],  // Orange
    P: [174, 129, 255], // Purple
    H: [230, 219, 116], // Yellow
  },
  ss_colors: {
    helix: [249, 38, 114], // Magenta
    sheet: [166, 226, 46],  // Green
    loop: [117, 113, 94],   // Gray (Comments)
  },
  chain_colors: [
    [102, 217, 239], [166, 226, 46], [253, 151, 31], [174, 129, 255],
  ],
  background: '#272822',
};

export const colorSchemes: Record<string, ColorScheme> = {
  default: defaultColorScheme,
  highContrast: highContrastScheme,
  ocean: oceanScheme,
  forest: forestScheme,
  monochrome: monochromeScheme,
  neon: neonScheme,
  molokai: molokaiScheme,
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
