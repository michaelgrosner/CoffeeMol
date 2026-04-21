'use strict';

export type RGB = [number, number, number];
export type DrawMethod = 'both' | 'lines' | 'points' | 'cartoon';

export interface AtomInfo {
    drawMethod: DrawMethod;
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
}

export interface StructureLoadInfo {
    drawMethod?: DrawMethod;
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
}

export interface ParsedStructure {
    title: string;
    atoms: ParsedAtom[];
}

export const ATOM_SIZE = 3;
export const DEBUG = true;

export const nuc_acids: string[] = ["A", "C", "G", "T", "DA", "DC", "DG", "DT", "RA", "RC", "RG", "RT"];
export const supported_draw_methods: DrawMethod[] = ["both", "lines", "points", "cartoon"];
export const selector_delimiter = "/";

// Jmol CPK colors — http://jmol.sourceforge.net/jscolors/
export const atom_colors: Record<string, RGB> = {
    'H': [255, 255, 255],
    'C': [144, 144, 144],
    'N': [ 48,  80, 248],
    'O': [255,  13,  13],
    'F': [144, 224,  80],
    'P': [255, 128,   0],
    'S': [255, 200,  50],
    'K': [143,  64, 212],
    'I': [148,   0, 148],
    'V': [166,   0, 255],
    '_': [180, 180, 180],
};

// Van der Waals radii relative to C = 1.0
export const atom_radii: Record<string, number> = {
    'H': 0.65,
    'C': 1.00,
    'N': 0.93,
    'O': 0.91,
    'F': 0.88,
    'P': 1.12,
    'S': 1.12,
    'I': 1.35,
};
