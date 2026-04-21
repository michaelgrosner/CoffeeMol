'use strict';

import {
  RGB,
  AtomInfo,
  DrawMethod,
  ColorMethod,
  SecondaryStructureType,
  ATOM_SIZE,
  nuc_acids,
  atom_colors,
  atom_radii,
  selector_delimiter,
} from './types';

const ss_colors: Record<SecondaryStructureType, RGB> = {
  helix: [255, 0, 255], // Magenta
  sheet: [255, 255, 0], // Yellow
  loop: [140, 140, 140], // Gray
};

const chain_colors: RGB[] = [
  [64, 64, 255], // Blue
  [64, 255, 64], // Green
  [255, 64, 64], // Red
  [255, 255, 64], // Yellow
  [255, 64, 255], // Magenta
  [64, 255, 255], // Cyan
  [255, 128, 64], // Orange
  [128, 64, 255], // Purple
];
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
  abstract drawHighlight(): void;

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

  propogateInfo(info: AtomInfo): void {
    this.info = deepCopy(info);
    if (this.info.colorMethod) {
      this.info.colorMethod = this.info.colorMethod.toLowerCase() as ColorMethod;
    }
    this.info.drawColor =
      this.info.drawColor != null
        ? hexToRGBArray(this.info.drawColor as RGB | string)
        : null;
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

  draw(): void {
    this.drawLines();
    this.drawRibbons();
    this.drawPoints();
  }

  drawLines(): void {
    this.bonds.sort(sortBondsByZ);
    const ctx = this.cc.context;
    ctx.lineCap = 'round';

    for (const b of this.bonds) {
      if (
        b.a1.info.drawMethod === 'points' &&
        b.a2.info.drawMethod === 'points'
      )
        continue;
      if (
        b.a1.info.drawMethod === 'ribbon' ||
        b.a2.info.drawMethod === 'ribbon'
      )
        continue;

      const midX = (b.a1.x + b.a2.x) / 2;
      const midY = (b.a1.y + b.a2.y) / 2;

      const isTube =
        b.a1.info.drawMethod === 'tube' || b.a2.info.drawMethod === 'tube';
      const isCartoon =
        b.a1.info.drawMethod === 'cartoon' ||
        b.a2.info.drawMethod === 'cartoon';
      const colorType = isTube || isCartoon ? 'chain' : 'cpk';

      let width = 2;
      if (isTube) {
        width =
          b.a1.parent.ss === 'helix' ? 12 : b.a1.parent.ss === 'sheet' ? 8 : 5;
      }
      const lw = width / this.cc.zoom;

      // Segment 1: a1 to mid
      const color1 = b.a1.depthShadedColorString(colorType);
      const shadow1 = b.a1.depthShadedColorString(colorType, -0.4);

      // Volumetric multi-pass shading for 3D feel
      const passes = [
        { width: 1.3, opacity: 1.0, color: shadow1 }, // Shadow/Outline
        { width: 1.0, opacity: 1.0, color: color1 }, // Main Body
        { width: 0.7, opacity: 0.2, color: 'rgba(255,255,255,0.4)' }, // Soft Highlight
        { width: 0.3, opacity: 0.5, color: 'rgba(255,255,255,0.6)' }, // Sharp Shine
      ];

      for (const pass of passes) {
        ctx.strokeStyle = pass.color;
        ctx.lineWidth = lw * pass.width;
        ctx.beginPath();
        ctx.moveTo(b.a1.x, b.a1.y);
        ctx.lineTo(midX, midY);
        ctx.stroke();
      }

      // Segment 2: a2 to mid
      const color2 = b.a2.depthShadedColorString(colorType);
      const shadow2 = b.a2.depthShadedColorString(colorType, -0.4);

      const passes2 = [
        { width: 1.3, opacity: 1.0, color: shadow2 },
        { width: 1.0, opacity: 1.0, color: color2 },
        { width: 0.7, opacity: 0.2, color: 'rgba(255,255,255,0.4)' },
        { width: 0.3, opacity: 0.5, color: 'rgba(255,255,255,0.6)' },
      ];

      // Highlight pass for entire chain or residue
      if (
        this.isHighlighted ||
        b.a1.isHighlighted ||
        b.a1.parent.isHighlighted ||
        b.a2.isHighlighted ||
        b.a2.parent.isHighlighted
      ) {
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.7)';
        ctx.lineWidth = lw * 1.5;
        ctx.beginPath();
        ctx.moveTo(b.a1.x, b.a1.y);
        ctx.lineTo(b.a2.x, b.a2.y);
        ctx.stroke();
      }

      for (const pass of passes2) {
        ctx.strokeStyle = pass.color;
        ctx.lineWidth = lw * pass.width;
        ctx.beginPath();
        ctx.moveTo(b.a2.x, b.a2.y);
        ctx.lineTo(midX, midY);
        ctx.stroke();
      }
    }
  }

  drawRibbons(): void {
    const ribbonAtoms = this.atoms.filter(
      (a) =>
        (this.isHighlighted ||
          a.isHighlighted ||
          a.parent.isHighlighted ||
          a.info.drawMethod === 'ribbon') &&
        ((a.parent.isProtein() && a.original_atom_name === 'CA') ||
          (a.parent.isDNA() && a.original_atom_name === 'P'))
    );
    if (ribbonAtoms.length === 0) return;

    const chains: Map<Chain, Atom[]> = new Map();
    for (const a of this.atoms) {
      if (
        (a.parent.isProtein() && a.original_atom_name === 'CA') ||
        (a.parent.isDNA() && a.original_atom_name === 'P')
      ) {
        const c = a.parent.parent;
        if (!chains.has(c)) chains.set(c, []);
        chains.get(c)!.push(a);
      }
    }

    const atomPrev: Map<Atom, Atom> = new Map();
    const atomNext: Map<Atom, Atom> = new Map();
    for (const [_chain, chainAtoms] of chains) {
      for (let i = 0; i < chainAtoms.length; i++) {
        if (i > 0) atomPrev.set(chainAtoms[i], chainAtoms[i - 1]);
        if (i < chainAtoms.length - 1)
          atomNext.set(chainAtoms[i], chainAtoms[i + 1]);
      }
    }

    const ctx = this.cc.context;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const sortedRibbonAtoms = ribbonAtoms.slice().sort(sortByZ);

    for (const a1 of sortedRibbonAtoms) {
      const prevA = atomPrev.get(a1);
      const nextA = atomNext.get(a1);

      const color = a1.depthShadedColorString('chain');
      const shadow = a1.depthShadedColorString('chain', -0.3);

      let width = 6;
      if (a1.parent.ss === 'helix') width = 20;
      else if (a1.parent.ss === 'sheet') width = 16;

      const lw = width / this.cc.zoom;

      if (!prevA && !nextA) continue;

      const isLastOfSheet =
        a1.parent.ss === 'sheet' && (!nextA || nextA.parent.ss !== 'sheet');

      const drawPath = (w: number, c: string) => {
        ctx.lineWidth = w;
        ctx.strokeStyle = c;
        ctx.fillStyle = c;
        ctx.beginPath();
        if (isLastOfSheet && prevA) {
          const dx = a1.x - prevA.x;
          const dy = a1.y - prevA.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const ux = dx / dist;
          const uy = dy / dist;
          const px = -uy;
          const py = ux;
          const startX = (prevA.x + a1.x) / 2;
          const startY = (prevA.y + a1.y) / 2;
          const headW = w * 1.5;

          ctx.moveTo(startX - (px * w) / 2, startY - (py * w) / 2);
          ctx.lineTo(startX + (px * w) / 2, startY + (py * w) / 2);
          ctx.lineTo(a1.x + px * headW, a1.y + py * headW);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(a1.x - px * headW, a1.y - py * headW);
          ctx.lineTo(a1.x + px * headW, a1.y + py * headW);
          ctx.lineTo(a1.x + ux * headW * 1.5, a1.y + uy * headW * 1.5);
          ctx.closePath();
          ctx.fill();
        } else {
          let startX, startY, endX, endY;
          if (!prevA) {
            if (atomAtomDistance(a1, nextA!) > 10) return;
            startX = a1.x;
            startY = a1.y;
            endX = (a1.x + nextA!.x) / 2;
            endY = (a1.y + nextA!.y) / 2;
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
          } else if (!nextA) {
            if (atomAtomDistance(prevA, a1) > 10) return;
            startX = (prevA.x + a1.x) / 2;
            startY = (prevA.y + a1.y) / 2;
            endX = a1.x;
            endY = a1.y;
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
          } else {
            if (
              atomAtomDistance(prevA, a1) > 10 ||
              atomAtomDistance(a1, nextA!) > 10
            )
              return;
            startX = (prevA.x + a1.x) / 2;
            startY = (prevA.y + a1.y) / 2;
            endX = (a1.x + nextA!.x) / 2;
            endY = (a1.y + nextA!.y) / 2;
            ctx.moveTo(startX, startY);
            ctx.quadraticCurveTo(a1.x, a1.y, endX, endY);
          }
          ctx.stroke();
        }
      };

      // Multi-pass volumetric shading
      if (this.isHighlighted || a1.isHighlighted || a1.parent.isHighlighted) {
        drawPath(lw * 1.5, 'rgba(255, 255, 0, 0.7)'); // Segment highlight
      }
      drawPath(lw * 1.3, shadow); // Shadow
      drawPath(lw * 1.0, color); // Body
      drawPath(lw * 0.6, 'rgba(255,255,255,0.25)'); // Soft glow
      drawPath(lw * 0.2, 'rgba(255,255,255,0.5)'); // Sharp highlight
    }
  }

  drawPoints(): void {
    const sorted = this.atoms.slice().sort(sortByZ);
    for (const a of sorted) {
      if (
        !(['lines', 'cartoon', 'ribbon', 'tube'] as DrawMethod[]).includes(
          a.info.drawMethod
        )
      )
        a.drawPoint();
    }
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

  drawHighlight(): void {
    for (const c of this.children) c.drawHighlight();
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
    this.color = chain_colors[idx % chain_colors.length];
  }

  toString(): string {
    return `<Chain ${this.name} with ${this.children.length} residues>`;
  }

  drawHighlight(): void {
    // For entire chain highlight, we set isHighlighted then draw
    // This allows drawRibbons and drawLines to draw highlights
    this.isHighlighted = true;
    this.drawRibbons();
    this.drawLines();
    this.isHighlighted = false;
  }
}

// ===== Residue =====

export class Residue extends MolElement {
  resid: number;
  ss: SecondaryStructureType = 'loop';
  declare parent: Chain;

  constructor(parent: Chain, name: string, id: number) {
    super(parent, name);
    this.resid = id;
  }

  toString(): string {
    return `<Residue ${this.name} with ${this.children.length} atoms>`;
  }

  drawHighlight(): void {
    for (const c of this.children) c.drawHighlight();
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
}

// Kyte-Doolittle hydrophobicity scale
const hydrophobicity_scale: Record<string, number> = {
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
};

// ===== Atom =====

export class Atom extends MolElement {
  x: number;
  y: number;
  z: number;
  tempFactor: number;
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
    tempFactor: number = 0
  ) {
    super(parent, name);
    this.x = x;
    this.y = y;
    this.z = z;
    this.tempFactor = tempFactor;
    this.original_atom_name = original_atom_name;
    this.original_position = [x, y, z];
  }

  toString(): string {
    return `<Atom: ${this.name} [${this.x.toFixed(2)}, ${this.y.toFixed(2)}, ${this.z.toFixed(2)}]>`;
  }
  cpkColor(): RGB {
    return this.info.drawColor ?? atom_colors[this.name] ?? atom_colors['_'];
  }
  ssColor(): RGB {
    return ss_colors[this.parent.ss];
  }
  chainColor(): RGB {
    return this.parent.parent.color;
  }

  bFactorColor(): RGB {
    // Blue-to-Red color ramp for B-factor
    // Typical B-factors range from 0 to 100
    const t = Math.max(0, Math.min(100, this.tempFactor)) / 100;
    const r = Math.round(255 * t);
    const g = 0;
    const b = Math.round(255 * (1 - t));
    return [r, g, b];
  }

  hydrophobicityColor(): RGB {
    // Hydrophobicity color ramp: Red (hydrophobic) to Blue (hydrophilic)
    const val = hydrophobicity_scale[this.parent.name] || 0;
    // Normalize Kyte-Doolittle (-4.5 to 4.5) to 0 to 1
    const t = (val + 4.5) / 9.0;
    const r = Math.round(255 * t);
    const g = Math.round(255 * (1 - t) * 0.5); // some green for contrast
    const b = Math.round(255 * (1 - t));
    return [r, g, b];
  }

  depthShadedColorString(
    colorType: ColorMethod = 'cpk',
    brightnessOffset: number = 0
  ): string {
    const method = this.info.colorMethod || colorType;
    let base: RGB;
    switch (method) {
      case 'ss':
        base = this.ssColor();
        break;
      case 'chain':
        base = this.chainColor();
        break;
      case 'b-factor':
        base = this.bFactorColor();
        break;
      case 'hydrophobicity':
        base = this.hydrophobicityColor();
        break;
      case 'cpk':
      default:
        base = this.cpkColor();
        break;
    }

    const extent = this.cc.z_extent ?? 1;
    const t = Math.max(0, Math.min(1, (this.z + extent) / (2 * extent)));

    // On dark background (isDarkBackground = true):
    //   t=1 (front) -> factor ~1.1
    //   t=0 (back)  -> factor ~0.1
    // On light background (isDarkBackground = false):
    //   t=1 (front) -> factor ~1.0
    //   t=0 (back)  -> factor ~1.8 (wash out to white)

    let factor: number;
    if (this.cc.isDarkBackground) {
      factor = Math.max(0, Math.min(2, 0.1 + 1.0 * t + brightnessOffset));
    } else {
      factor = Math.max(0, Math.min(2, 1.8 - 0.8 * t + brightnessOffset));
    }

    const r = Math.round(base[0] * factor);
    const g = Math.round(base[1] * factor);
    const b = Math.round(base[2] * factor);
    return `rgb(${r},${g},${b})`;
  }

  drawPoint(): void {
    const relR = atom_radii[this.name] ?? 1.0;
    const zz = (ATOM_SIZE * relR) / this.cc.zoom;
    const ctx = this.cc.context;

    // Base color with enhanced depth contrast
    const fill = this.depthShadedColorString('cpk');

    // Draw the point
    ctx.beginPath();
    ctx.arc(this.x, this.y, zz, 0, 2 * Math.PI, false);

    // Subtle dark rim for better edge definition
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 0.5 / this.cc.zoom;
    ctx.stroke();

    ctx.fillStyle = fill;
    ctx.fill();

    // 3D highlight
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(
      this.x - zz * 0.3,
      this.y - zz * 0.3,
      zz * 0.3,
      0,
      2 * Math.PI,
      false
    );
    ctx.fill();
  }

  drawHighlight(): void {
    const ctx = this.cc.context;
    const relR = atom_radii[this.name] ?? 1.0;
    const zz = (ATOM_SIZE * relR * 1.5) / this.cc.zoom;

    ctx.beginPath();
    ctx.arc(this.x, this.y, zz, 0, 2 * Math.PI, false);
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
    ctx.lineWidth = 3 / this.cc.zoom;
    ctx.stroke();

    // Outer faint glow
    ctx.beginPath();
    ctx.arc(this.x, this.y, zz + 2 / this.cc.zoom, 0, 2 * Math.PI, false);
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
    ctx.lineWidth = 1 / this.cc.zoom;
    ctx.stroke();
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
