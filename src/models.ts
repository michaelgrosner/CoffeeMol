'use strict';

import { 
    RGB, AtomInfo, DrawMethod, 
    ATOM_SIZE, nuc_acids, atom_colors, atom_radii, selector_delimiter 
} from './types';
import { 
    deepCopy, hexToRGBArray, arrayToRGB, 
    rotateVecX, rotateVecY, rotateVecZ,
    genIFSLink
} from './utils';

export function sortBondsByZ(b1: Bond, b2: Bond): number { return b1.zCenter() - b2.zCenter(); }
export function sortByZ(a1: Atom, a2: Atom): number      { return a1.z - a2.z; }
export function atomAtomDistance(a1: Atom, a2: Atom): number {
    return Math.sqrt((a1.x - a2.x) ** 2 + (a1.y - a2.y) ** 2 + (a1.z - a2.z) ** 2);
}

// ===== Selector =====

export class Selector {
    str: string;
    array: number[];

    constructor(s: string | number[] | null = null) {
        if (!s) {
            this.str   = "0";
            this.array = [0];
        } else if (Array.isArray(s)) {
            this.str   = s.join(selector_delimiter);
            this.array = s;
        } else {
            this.str   = s;
            this.array = s.split(selector_delimiter).map(Number);
        }
    }

    right(): Selector { const a = this.array.slice(); a[a.length - 1]++; return new Selector(a); }
    left():  Selector { const a = this.array.slice(); a[a.length - 1]--; return new Selector(a); }

    down(): Selector {
        const a = this.array.slice();
        a.push(0);
        return new Selector(a);
    }

    up(): Selector | null {
        const a = this.array.slice(0, -1);
        const n = new Selector(a);
        return n.str === this.str ? null : n;
    }
}

// ===== Bond =====

export class Bond {
    a1: Atom;
    a2: Atom;
    length: number;

    constructor(a1: Atom, a2: Atom) {
        this.a1     = a1;
        this.a2     = a2;
        this.length = atomAtomDistance(a1, a2);
    }

    toString(): string { return `<Bond of Length: ${this.length.toFixed(3)} between ${this.a1} and ${this.a2}>`; }
    computeLength(): number { return this.length; }
    zCenter(): number { return (this.a1.z + this.a2.z) / 2.0; }
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

    constructor(parent: MolElement | null, name: string, cc: any = null) {
        this.parent   = parent;
        this.name     = name;
        this.children = [];
        this.info     = { drawMethod: 'both' };
        this.selector = null;
        this.atoms    = [];
        this.bonds    = [];
        if (this.parent != null) this.parent.addChild(this);
        this.cc = cc != null ? cc : this.parent!.cc;
    }

    abstract toString(): string;
    constructorName(): string { return this.constructor.name; }

    writeContextInfo(): string {
        if (this.constructorName() === "Atom") return '';
        const shortenName   = (n: string) => n.length > 20 ? n.substring(0, 17) + "..." : n;
        const plural        = this.children.length === 1 ? '' : 's';
        const pointsLink    = genIFSLink(this.selector!.str, "drawMethod", "points",  "Points");
        const linesLink     = genIFSLink(this.selector!.str, "drawMethod", "lines",   "Lines");
        const bothLink      = genIFSLink(this.selector!.str, "drawMethod", "both",    "Points + lines");
        const cartoonLink   = genIFSLink(this.selector!.str, "drawMethod", "cartoon", "Cartoon");
        const child_type    = this.children[0].constructorName();
        const dropdown      = `<span class='fake-button open-dropdown'>Draw</span><span class='dropdown ${this.selector!.str}'>${pointsLink} ${linesLink} ${bothLink} ${cartoonLink}</span>`;
        const ctx_info      = `<span class='element-desc ${this.constructorName()} fake-button'>${this.constructorName()}: ${shortenName(this.name)} with ${this.children.length} ${child_type}${plural}</span> ${dropdown}`;
        const children_info = this.children.map(c => c.writeContextInfo());
        return `<div class='element-controller ${this.constructorName()}'>${ctx_info}${children_info.join("")}</div>`;
    }

    init(): void               { this.atoms = this.getOfType(Atom); }
    addChild(child: MolElement): void { this.children.push(child); }

    propogateInfo(info: AtomInfo): void {
        this.info = deepCopy(info);
        this.info.drawColor = this.info.drawColor != null ? hexToRGBArray(this.info.drawColor as RGB | string) : null;
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
        this.drawPoints();
    }

    drawLines(): void {
        this.bonds.sort(sortBondsByZ);
        for (const b of this.bonds) {
            if (b.a1.info.drawMethod === 'points') continue;
            this.cc.context.beginPath();
            this.cc.context.moveTo(b.a1.x, b.a1.y);
            this.cc.context.lineTo(b.a2.x, b.a2.y);
            this.cc.context.strokeStyle = arrayToRGB(b.a1.depthShadedColor());
            this.cc.context.lineWidth   = 2 / this.cc.zoom;
            this.cc.context.closePath();
            this.cc.context.stroke();
        }
    }

    drawPoints(): void {
        const sorted = this.atoms.slice().sort(sortByZ);
        for (const a of sorted) {
            if (!(['lines', 'cartoon'] as DrawMethod[]).includes(a.info.drawMethod)) a.drawPoint();
        }
    }

    rotateAboutZ(theta: number): void { const cos = Math.cos(theta), sin = Math.sin(theta); for (const a of this.atoms) a.applyRotationZ(sin, cos); }
    rotateAboutY(theta: number): void { const cos = Math.cos(theta), sin = Math.sin(theta); for (const a of this.atoms) a.applyRotationY(sin, cos); }
    rotateAboutX(theta: number): void { const cos = Math.cos(theta), sin = Math.sin(theta); for (const a of this.atoms) a.applyRotationX(sin, cos); }
    restoreToOriginal(): void { for (const a of this.atoms) a.restoreToOriginal(); }

    avgCenter(): [number, number, number] {
        const avgs: [number, number, number] = [0.0, 0.0, 0.0];
        for (const a of this.atoms) { avgs[0] += a.x; avgs[1] += a.y; avgs[2] += a.z; }
        return avgs.map(v => v / this.atoms.length) as [number, number, number];
    }

    translateTo(center: [number, number, number]): void {
        for (const a of this.atoms) { a.x -= center[0]; a.y -= center[1]; a.z -= center[2]; }
    }

    findBonds(): void {
        this.bonds = [];
        if (this.atoms.length < 2) return;
        for (let i = 0; i <= this.atoms.length - 2; i++) {
            const a1     = this.atoms[i];
            const j_step = a1.info.drawMethod === 'cartoon' ? 30 : 10;
            const jEnd   = Math.min(i + j_step, this.atoms.length - 1);
            for (let j = i + 1; j <= jEnd; j++) {
                if (isBonded(a1, this.atoms[j])) this.bonds.push(new Bond(a1, this.atoms[j]));
            }
        }
    }
}

// ===== Structure =====

export class Structure extends MolElement {
    title: string | null = null;
    declare parent: null;

    constructor(parent: null, name: string, cc: any) {
        if (name.includes("/"))    name = name.split("/").slice(-1)[0];
        if (name.endsWith(".pdb") || name.endsWith(".cif") || name.endsWith(".mmcif")) name = name.split(".")[0];
        super(parent, name, cc);
        cc.addElement(this);
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
    constructor(parent: Structure, name: string) { super(parent, name); }
    toString(): string { return `<Chain ${this.name} with ${this.children.length} residues>`; }
}

// ===== Residue =====

export class Residue extends MolElement {
    resid: number;
    declare parent: Chain;

    constructor(parent: Chain, name: string, id: number) {
        super(parent, name);
        this.resid = id;
    }

    toString(): string   { return `<Residue ${this.name} with ${this.children.length} atoms>`; }
    isDNA(): boolean     { return nuc_acids.includes(this.name); }
    isProtein(): boolean { return !this.isDNA(); }
    typeName(): string   { return this.isDNA() ? "DNA" : "protein"; }
}

// ===== Atom =====

export class Atom extends MolElement {
    x: number;
    y: number;
    z: number;
    original_atom_name: string;
    original_position: [number, number, number];
    declare parent: Residue;

    constructor(parent: Residue, name: string, x: number, y: number, z: number, original_atom_name: string) {
        super(parent, name);
        this.x = x; this.y = y; this.z = z;
        this.original_atom_name = original_atom_name;
        this.original_position  = [x, y, z];
    }

    toString(): string  { return `<Atom: ${this.name} [${this.x.toFixed(2)}, ${this.y.toFixed(2)}, ${this.z.toFixed(2)}]>`; }
    cpkColor(): RGB     { return this.info.drawColor ?? atom_colors[this.name] ?? atom_colors['_']; }

    depthShadedColor(): RGB {
        const base   = this.cpkColor();
        const extent = this.cc.z_extent ?? 1;
        const t      = Math.max(0, Math.min(1, (this.z + extent) / (2 * extent)));
        return base.map(c => Math.round(c * (0.3 + 0.7 * t))) as RGB;
    }

    drawPoint(): void {
        const base   = this.cpkColor();
        const relR   = atom_radii[this.name] ?? 1.0;
        const zz     = ATOM_SIZE * relR / this.cc.zoom;
        const extent = this.cc.z_extent ?? 1;
        const t      = Math.max(0, Math.min(1, (this.z + extent) / (2 * extent)));
        const factor = 0.3 + 0.7 * t;

        const shaded    = base.map(c => Math.round(c * factor)) as RGB;
        const highlight = base.map(c => Math.min(255, Math.round(c * 0.4 + 160))) as RGB;

        const grad = this.cc.context.createRadialGradient(
            this.x - zz * 0.35, this.y - zz * 0.35, 0,
            this.x,              this.y,              zz);
        grad.addColorStop(0, arrayToRGB(highlight));
        grad.addColorStop(1, arrayToRGB(shaded));

        this.cc.context.beginPath();
        this.cc.context.arc(this.x, this.y, zz, 0, 2 * Math.PI, false);
        this.cc.context.fillStyle = grad;
        this.cc.context.fill();
    }

    applyRotationY(sin: number, cos: number): void { const ox = this.x; this.x =  ox * cos + this.z * sin; this.z = -ox * sin + this.z * cos; }
    applyRotationX(sin: number, cos: number): void { const oy = this.y; this.y =  oy * cos - this.z * sin; this.z =  oy * sin + this.z * cos; }
    applyRotationZ(sin: number, cos: number): void { const ox = this.x; this.x =  ox * cos - this.y * sin; this.y =  ox * sin + this.y * cos; }

    restoreToOriginal(): void { [this.x, this.y, this.z] = this.original_position; }
    asArray(): [number, number, number] { return [this.x, this.y, this.z]; }
}

function isBonded(a1: Atom, a2: Atom): boolean {
    if (a1.parent.typeName() !== a2.parent.typeName()) return false;
    const aad = atomAtomDistance(a1, a2);
    if (a1.info.drawMethod === 'cartoon') {
        if (aad < 4  && a1.parent.isProtein() && a1.original_atom_name === "CA" && a2.original_atom_name === "CA") return true;
        if (aad < 10 && a1.parent.isDNA()     && a1.original_atom_name === "P"  && a2.original_atom_name === "P")  return true;
        return false;
    }
    return aad < 2;
}
