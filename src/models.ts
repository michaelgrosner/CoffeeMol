'use strict';

import {
  RGB,
  AtomInfo,
  AtomInfoUpdate,
  DrawMethod,
  ColorMethod,
  SecondaryStructureType,
  ATOM_SIZE,
  nuc_acids,
  atom_radii,
  selector_delimiter,
} from './types';
import {
  deepCopy,
  hexToRGBArray,
  genIFSLink,
} from './utils';

export function sortBondsByZ(b1: Bond, b2: Bond): number {
  return b1.zCenter() - b2.zCenter();
}
export function sortByZ(a1: Atom, a2: Atom): number {
  return a1.z - a2.z;
}
export function atomAtomDistance(a1: Atom, a2: Atom): number {
  return Math.sqrt(
    (a1.x - a2.x) ** 2 + (a1.y - a2.y) ** 2 + (a1.z - a2.z) ** 2
  );
}

// ===== Selector =====

export class Selector {
  str: string;
  array: number[];

  constructor(s: string | number[] | null = null) {
    if (!s) {
      this.str = '0';
      this.array = [0];
    } else if (Array.isArray(s)) {
      this.str = s.join(selector_delimiter);
      this.array = s;
    } else {
      this.str = s;
      this.array = s.split(selector_delimiter).map(Number);
    }
  }

  right(): Selector {
    const a = this.array.slice();
    a[a.length - 1]++;
    return new Selector(a);
  }
  left(): Selector {
    const a = this.array.slice();
    a[a.length - 1]--;
    return new Selector(a);
  }

  down(): Selector {
    const a = this.array.slice();
    a.push(0);
    return new Selector(a);
  }

  up(): Selector | null {
    if (this.array.length <= 1) return null;
    const a = this.array.slice(0, -1);
    return new Selector(a);
  }
}

// ===== Bond =====

export class Bond {
  a1: Atom;
  a2: Atom;
  length: number;

  constructor(a1: Atom, a2: Atom) {
    this.a1 = a1;
    this.a2 = a2;
    this.length = atomAtomDistance(a1, a2);
  }

  toString(): string {
    return `<Bond of Length: ${this.length.toFixed(3)} between ${this.a1} and ${this.a2}>`;
  }
  computeLength(): number {
    return this.length;
  }
  zCenter(): number {
    return (this.a1.z + this.a2.z) / 2.0;
  }
}

// ===== MolElement (base class) =====

export abstract class MolElement {
  parent: MolElement | null;
  name: string;
  children: MolElement[];
  info: AtomInfo;
  selector: Selector | null;
  cc: any; // CanvasContext (circular dependency handled by 'any' or interface)
  atoms: Atom[];
  bonds: Bond[];
  isHighlighted: boolean = false;

  constructor(parent: MolElement | null, name: string, cc: any = null) {
    this.parent = parent;
    this.name = name;
    this.children = [];
    this.info = { drawMethod: 'both' };
    this.selector = null;
    this.atoms = [];
    this.bonds = [];
    this.cc = cc != null ? cc : this.parent!.cc;
  }

  abstract toString(): string;

  constructorName(): string {
    return this.constructor.name;
  }

  setHighlighted(val: boolean): void {
    this.isHighlighted = val;
    for (const c of this.children) c.setHighlighted(val);
  }

  /**
   * Lifecycle hook called when this element is added to a parent.
   */
  onAddedToParent(): void {}

  writeContextInfo(): string {
    if (this.constructorName() === 'Atom') return '';
    const shortenName = (n: string) =>
      n.length > 20 ? n.substring(0, 17) + '...' : n;
    const plural = this.children.length === 1 ? '' : 's';
    const pointsLink = genIFSLink(
      this.selector!.str,
      'drawMethod',
      'points',
      'Points'
    );
    const linesLink = genIFSLink(
      this.selector!.str,
      'drawMethod',
      'lines',
      'Lines'
    );
    const bothLink = genIFSLink(
      this.selector!.str,
      'drawMethod',
      'both',
      'Points + lines'
    );
    const cartoonLink = genIFSLink(
      this.selector!.str,
      'drawMethod',
      'cartoon',
      'Cartoon'
    );
    const ribbonLink = genIFSLink(
      this.selector!.str,
      'drawMethod',
      'ribbon',
      'Ribbon'
    );
    const tubeLink = genIFSLink(
      this.selector!.str,
      'drawMethod',
      'tube',
      'Tube'
    );
    const child_type = this.children[0].constructorName();
    const dropdown = `<span class='fake-button open-dropdown'>Draw</span><span class='dropdown ${this.selector!.str}'>${pointsLink} ${linesLink} ${bothLink} ${cartoonLink} ${ribbonLink} ${tubeLink}</span>`;
    const ctx_info = `<span class='element-desc ${this.constructorName()} fake-button'>${this.constructorName()}: ${shortenName(this.name)} with ${this.children.length} ${child_type}${plural}</span> ${dropdown}`;
    const children_info = this.children.map((c) => c.writeContextInfo());
    return `<div class='element-controller ${this.constructorName()}'>${ctx_info}${children_info.join('')}</div>`;
  }

  init(): void {
    this.atoms = this.getOfType(Atom);
    this.findBonds();
    for (const c of this.children) c.init();
  }

  addChild(child: MolElement): void {
    this.children.push(child);
    child.onAddedToParent();
  }

  propogateInfo(info: AtomInfoUpdate): void {
    const update = deepCopy(info);
    if (update.colorMethod) {
      update.colorMethod = (update.colorMethod as string).toLowerCase() as ColorMethod;
    }
    if (update.drawColor !== undefined && update.drawColor !== null) {
      update.drawColor = hexToRGBArray(update.drawColor as RGB | string);
    }
    
    this.info = { ...this.info, ...(update as AtomInfo) };
    for (const c of this.children) c.propogateInfo(info);
  }

  stashInfo(): void {
    (this as any).old_info = deepCopy(this.info);
    for (const c of this.children) c.stashInfo();
  }

  retrieveStashedInfo(): void {
    this.info = deepCopy((this as any).old_info);
    for (const c of this.children) c.retrieveStashedInfo();
  }

  getOfType<T extends MolElement>(type: new (...args: any[]) => T): T[] {
    const ret: T[] = [];
    const recursor = (children: MolElement[]) => {
      for (const c of children) {
        if (c instanceof type) ret.push(c);
        else recursor(c.children);
      }
    };
    recursor(this.children);
    return ret;
  }

  rotateAboutZ(theta: number): void {
    const cos = Math.cos(theta),
      sin = Math.sin(theta);
    for (const a of this.atoms) a.applyRotationZ(sin, cos);
  }
  rotateAboutY(theta: number): void {
    const cos = Math.cos(theta),
      sin = Math.sin(theta);
    for (const a of this.atoms) a.applyRotationY(sin, cos);
  }
  rotateAboutX(theta: number): void {
    const cos = Math.cos(theta),
      sin = Math.sin(theta);
    for (const a of this.atoms) a.applyRotationX(sin, cos);
  }
  restoreToOriginal(): void {
    for (const a of this.atoms) a.restoreToOriginal();
  }

  avgCenter(): [number, number, number] {
    const avgs: [number, number, number] = [0.0, 0.0, 0.0];
    for (const a of this.atoms) {
      avgs[0] += a.x;
      avgs[1] += a.y;
      avgs[2] += a.z;
    }
    return avgs.map((v) => v / this.atoms.length) as [number, number, number];
  }

  translateTo(center: [number, number, number]): void {
    for (const a of this.atoms) {
      a.x -= center[0];
      a.y -= center[1];
      a.z -= center[2];
    }
  }

  findBonds(): void {
    this.bonds = [];
    if (this.atoms.length < 2) return;
    for (let i = 0; i <= this.atoms.length - 2; i++) {
      const a1 = this.atoms[i];
      // Increase window to 80 to catch bonds between residues with many atoms
      const jEnd = Math.min(i + 80, this.atoms.length - 1);
      for (let j = i + 1; j <= jEnd; j++) {
        if (isBonded(a1, this.atoms[j]))
          this.bonds.push(new Bond(a1, this.atoms[j]));
      }
    }
  }
}

// ===== Structure =====

export class Structure extends MolElement {
  title: string | null = null;
  declare parent: null;

  constructor(name: string, cc: any) {
    if (name.includes('/')) name = name.split('/').slice(-1)[0];
    if (
      name.endsWith('.pdb') ||
      name.endsWith('.cif') ||
      name.endsWith('.mmcif')
    )
      name = name.split('.')[0];
    super(null, name, cc);
  }

  toString(): string {
    const n = this.title != null ? this.title : this.name;
    return `<Structure ${n} with ${this.children.length} chains>`;
  }


  attachTitle(title: string): void {
    this.title = title;
  }
}

// ===== Chain =====

export class Chain extends MolElement {
  declare parent: Structure;
  color: RGB = [128, 128, 128];

  constructor(parent: Structure, name: string) {
    super(parent, name);
  }

  onAddedToParent(): void {
    const idx = this.parent.children.indexOf(this);
    const colors = this.cc.colorScheme?.chain_colors || [];
    if (colors.length > 0) {
      this.color = colors[idx % colors.length];
    }
  }

  toString(): string {
    return `<Chain ${this.name} with ${this.children.length} residues>`;
  }

}

// ===== Residue =====

export class Residue extends MolElement {
  resid: number;
  ss: SecondaryStructureType = 'loop';
  isHetatm: boolean = false;
  declare parent: Chain;

  constructor(parent: Chain, name: string, id: number) {
    super(parent, name);
    this.resid = id;
  }

  toString(): string {
    return `<Residue ${this.name} with ${this.children.length} atoms>`;
  }

  isDNA(): boolean {
    return nuc_acids.includes(this.name);
  }
  isProtein(): boolean {
    return !this.isDNA();
  }
  typeName(): string {
    return this.isDNA() ? 'DNA' : 'protein';
  }

  propogateInfo(info: AtomInfoUpdate): void {
    let targetInfo = info;
    if (this.isHetatm && info.drawMethod && ['ribbon', 'cartoon', 'tube', 'lines'].includes(info.drawMethod)) {
      targetInfo = { ...info, drawMethod: 'both' };
    }
    super.propogateInfo(targetInfo);
  }
}

// ===== Atom =====

export class Atom extends MolElement {
  x: number;
  y: number;
  z: number;
  tempFactor: number;
  isHetatm: boolean;
  original_atom_name: string;
  original_position: [number, number, number];
  declare parent: Residue;

  constructor(
    parent: Residue,
    name: string,
    x: number,
    y: number,
    z: number,
    original_atom_name: string,
    tempFactor: number = 0,
    isHetatm: boolean = false
  ) {
    super(parent, name);
    this.x = x;
    this.y = y;
    this.z = z;
    this.tempFactor = tempFactor;
    this.isHetatm = isHetatm;
    this.original_atom_name = original_atom_name;
    this.original_position = [x, y, z];
  }

  toString(): string {
    return `<Atom: ${this.name} [${this.x.toFixed(2)}, ${this.y.toFixed(2)}, ${this.z.toFixed(2)}]>`;
  }

  propogateInfo(info: AtomInfoUpdate): void {
    let targetInfo = info;
    if (this.isHetatm && info.drawMethod && ['ribbon', 'cartoon', 'tube', 'lines'].includes(info.drawMethod)) {
      targetInfo = { ...info, drawMethod: 'both' };
    }
    super.propogateInfo(targetInfo);
  }
  cpkColor(): RGB {
    const colors = this.cc.colorScheme?.atom_colors || {};
    return this.info.drawColor ?? colors[this.name] ?? colors['_'];
  }
  ssColor(): RGB {
    const colors = this.cc.colorScheme?.ss_colors || {};
    return colors[this.parent.ss];
  }
  chainColor(): RGB {
    return this.parent.parent.color;
  }

  bFactorColor(): RGB {
    // Blue-to-Red color ramp for B-factor (standard)
    // Typical B-factors range from 0 to 100
    const t = Math.max(0, Math.min(100, this.tempFactor)) / 100;
    const low = this.cc.colorScheme?.ramp_low || [0, 0, 255];
    const high = this.cc.colorScheme?.ramp_high || [255, 0, 0];

    return [
      Math.round(low[0] + (high[0] - low[0]) * t),
      Math.round(low[1] + (high[1] - low[1]) * t),
      Math.round(low[2] + (high[2] - low[2]) * t),
    ];
  }

  hydrophobicityColor(): RGB {
    // Hydrophobicity color ramp: Hydrophilic (low) to Hydrophobic (high)
    const scale = this.cc.colorScheme?.hydrophobicity_scale || {};
    const val = scale[this.parent.name] || 0;
    // Normalize Kyte-Doolittle (-4.5 to 4.5) to 0 to 1
    const t = (val + 4.5) / 9.0;
    const low = this.cc.colorScheme?.ramp_low || [0, 127, 255];
    const high = this.cc.colorScheme?.ramp_high || [255, 0, 0];

    return [
      Math.round(low[0] + (high[0] - low[0]) * t),
      Math.round(low[1] + (high[1] - low[1]) * t),
      Math.round(low[2] + (high[2] - low[2]) * t),
    ];
  }

  applyRotationY(sin: number, cos: number): void {
    const ox = this.x;
    this.x = ox * cos + this.z * sin;
    this.z = -ox * sin + this.z * cos;
  }
  applyRotationX(sin: number, cos: number): void {
    const oy = this.y;
    this.y = oy * cos - this.z * sin;
    this.z = oy * sin + this.z * cos;
  }
  applyRotationZ(sin: number, cos: number): void {
    const ox = this.x;
    this.x = ox * cos - this.y * sin;
    this.y = ox * sin + this.y * cos;
  }

  restoreToOriginal(): void {
    [this.x, this.y, this.z] = this.original_position;
  }
  asArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }
}

function isBonded(a1: Atom, a2: Atom): boolean {
  if (a1.parent.typeName() !== a2.parent.typeName()) return false;
  const aad = atomAtomDistance(a1, a2);

  const isBackbone1 = ['cartoon', 'ribbon', 'tube'].includes(
    a1.info.drawMethod
  );
  const isBackbone2 = ['cartoon', 'ribbon', 'tube'].includes(
    a2.info.drawMethod
  );

  // If either is in backbone mode, use backbone logic
  if (isBackbone1 || isBackbone2) {
    if (a1.parent.isProtein() && a2.parent.isProtein()) {
      if (a1.original_atom_name === 'CA' && a2.original_atom_name === 'CA')
        return aad < 4.0;
    } else if (a1.parent.isDNA() && a2.parent.isDNA()) {
      if (a1.original_atom_name === 'P' && a2.original_atom_name === 'P')
        return aad < 10.0;
    }
    // If one is backbone and other isn't, or different atoms, no bond in backbone mode
    return false;
  }

  // Standard covalent bonds
  if (aad < 0.4) return false; // same atom

  // Sulfur-Sulfur bonds (e.g., disulfide bridges) are longer
  if (
    a1.original_atom_name.startsWith('S') &&
    a2.original_atom_name.startsWith('S')
  ) {
    return aad < 2.2;
  }

  // Most covalent bonds (C-C, C-N, C-O, O-P, etc.) are under 1.85A
  return aad < 1.85;
}
