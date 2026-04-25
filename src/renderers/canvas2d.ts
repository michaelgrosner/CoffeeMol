import { Structure, Atom, Bond, sortByZ, sortBondsByZ, atomAtomDistance, Chain } from '../models';
import { Renderer, RenderOptions } from './renderer';
import { atom_radii, ATOM_SIZE, DrawMethod, ColorMethod } from '../types';
import { hexToRGBArray, arrayToRGB } from '../utils';

export class Canvas2DRenderer implements Renderer {
  private canvas!: HTMLCanvasElement;
  private context!: CanvasRenderingContext2D;
  private grid: Record<number, Record<number, Atom | null>> = {};
  private z_extent: number = 1;

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.context = canvas.getContext('2d')!;
  }

  render(elements: Structure[], bonds: Bond[], options: RenderOptions): void {
    this.clearCanvas(options);
    const ctx = this.context;
    ctx.save();
    ctx.translate(options.x_origin, options.y_origin);
    ctx.scale(options.zoom, options.zoom);

    this.computeZExtent(elements);
    this.drawGridLines(options);

    // Render structures
    for (const el of elements) {
      this.drawStructure(el, options);
    }

    this.drawMeasureLine(options);
    ctx.restore();

    this.drawVignette(options);
    
    // Update grid for interaction (this could be optimized to only run after movement)
    this.determinePointGrid(elements, options);
  }

  private clearCanvas(options: RenderOptions): void {
    const ctx = this.context;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    const gradient = ctx.createRadialGradient(
      w / 2,
      h / 2,
      0,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.8
    );

    if (options.isDarkBackground) {
      gradient.addColorStop(0, '#1a1a1a');
      gradient.addColorStop(1, '#050505');
    } else {
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(1, '#f0f0f0');
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  private drawGridLines(options: RenderOptions): void {
    const ctx = this.context;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const isNeon = (options.colorScheme.glow_intensity ?? 0) > 10;
    const isIllustrator = (options.colorScheme.outline_weight ?? 1) > 1.3;

    if (isNeon) {
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      const spacing = 40;
      for (let x = options.x_origin % spacing; x < w; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = options.y_origin % spacing; y < h; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    } else if (isIllustrator) {
      ctx.strokeStyle = options.isDarkBackground
        ? 'rgba(255, 255, 255, 0.03)'
        : 'rgba(0, 0, 0, 0.03)';
      ctx.lineWidth = 0.5;
      const spacing = 20;
      for (let x = options.x_origin % spacing; x < w; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = options.y_origin % spacing; y < h; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawVignette(options: RenderOptions): void {
    if (options.isDarkBackground) {
      const ctx = this.context;
      const w = this.canvas.width;
      const h = this.canvas.height;
      const vGradient = ctx.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.2,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.9
      );
      vGradient.addColorStop(0, 'rgba(0,0,0,0)');
      vGradient.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = vGradient;
      ctx.fillRect(0, 0, w, h);
    }
  }

  private drawStructure(el: Structure, options: RenderOptions): void {
    this.drawLines(el, options);
    this.drawRibbons(el, options);
    this.drawPoints(el, options);
  }

  private drawLines(el: Structure, options: RenderOptions): void {
    // Need to collect ALL bonds in the structure
    const allBonds: Bond[] = [];
    const collect = (m: any) => {
      if (m.bonds) allBonds.push(...m.bonds);
      if (m.children) {
        for (const c of m.children) collect(c);
      }
    };
    collect(el);

    allBonds.sort(sortBondsByZ);
    const ctx = this.context;
    ctx.lineCap = 'round';

    for (const b of allBonds) {
      if (b.a1.info.drawMethod === 'points' && b.a2.info.drawMethod === 'points') continue;
      if (b.a1.info.drawMethod === 'ribbon' || b.a2.info.drawMethod === 'ribbon') continue;

      const midX = (b.a1.x + b.a2.x) / 2;
      const midY = (b.a1.y + b.a2.y) / 2;

      const isTube = b.a1.info.drawMethod === 'tube' || b.a2.info.drawMethod === 'tube';
      const isCartoon = b.a1.info.drawMethod === 'cartoon' || b.a2.info.drawMethod === 'cartoon';
      const colorType = isTube || isCartoon ? 'chain' : 'cpk';

      let width = 0.15;
      if (isTube) {
        width = b.a1.parent.ss === 'helix' ? 0.8 : b.a1.parent.ss === 'sheet' ? 0.6 : 0.4;
      }
      const lw = width;

      const color1 = this.depthShadedColorString(b.a1, options, colorType);
      const shadow1 = this.depthShadedColorString(b.a1, options, colorType, -0.4);

      const passes = [
        { width: 1.3, opacity: 1.0, color: shadow1 },
        { width: 1.0, opacity: 1.0, color: color1 },
        { width: 0.7, opacity: 0.2, color: 'rgba(255,255,255,0.4)' },
        { width: 0.3, opacity: 0.5, color: 'rgba(255,255,255,0.6)' },
      ];

      for (const pass of passes) {
        ctx.strokeStyle = pass.color;
        ctx.lineWidth = lw * pass.width;
        ctx.beginPath();
        ctx.moveTo(b.a1.x, b.a1.y);
        ctx.lineTo(midX, midY);
        ctx.stroke();
      }

      const color2 = this.depthShadedColorString(b.a2, options, colorType);
      const shadow2 = this.depthShadedColorString(b.a2, options, colorType, -0.4);

      const passes2 = [
        { width: 1.3, opacity: 1.0, color: shadow2 },
        { width: 1.0, opacity: 1.0, color: color2 },
        { width: 0.7, opacity: 0.2, color: 'rgba(255,255,255,0.4)' },
        { width: 0.3, opacity: 0.5, color: 'rgba(255,255,255,0.6)' },
      ];

      const isHighlighted = el.isHighlighted || b.a1.isHighlighted || b.a1.parent.isHighlighted || b.a2.isHighlighted || b.a2.parent.isHighlighted;
      if (isHighlighted) {
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

  private drawRibbons(el: Structure, options: RenderOptions): void {
    const atoms = el.getOfType(Atom);
    const ribbonAtoms = atoms.filter(
      (a) =>
        (el.isHighlighted || a.isHighlighted || a.parent.isHighlighted || a.info.drawMethod === 'ribbon') &&
        ((a.parent.isProtein() && a.original_atom_name === 'CA') ||
          (a.parent.isDNA() && a.original_atom_name === 'P'))
    );
    if (ribbonAtoms.length === 0) return;

    const chains: Map<Chain, Atom[]> = new Map();
    for (const a of atoms) {
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
        if (i < chainAtoms.length - 1) atomNext.set(chainAtoms[i], chainAtoms[i + 1]);
      }
    }

    const ctx = this.context;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const sortedRibbonAtoms = ribbonAtoms.slice().sort(sortByZ);

    for (const a1 of sortedRibbonAtoms) {
      const prevA = atomPrev.get(a1);
      const nextA = atomNext.get(a1);

      const color = this.depthShadedColorString(a1, options, 'chain');
      const shadow = this.depthShadedColorString(a1, options, 'chain', -0.3);

      let width = 0.6;
      if (a1.parent.ss === 'helix') width = 1.5;
      else if (a1.parent.ss === 'sheet') width = 1.2;

      const lw = width;

      if (!prevA && !nextA) continue;

      const isLastOfSheet = a1.parent.ss === 'sheet' && (!nextA || nextA.parent.ss !== 'sheet');

      const drawPath = (w: number, c: string) => {
        ctx.lineWidth = w;
        ctx.strokeStyle = c;
        ctx.fillStyle = c;
        ctx.beginPath();
        if (isLastOfSheet && prevA) {
          const dx = a1.x - prevA.x;
          const dy = a1.y - prevA.y;
          const dz = a1.z - prevA.z;
          const dist3d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist3d < 0.1) return;

          const ux = dx / dist3d;
          const uy = dy / dist3d;
          const px = -uy;
          const py = ux;

          const startX = (prevA.x + a1.x) / 2;
          const startY = (prevA.y + a1.y) / 2;

          const headW = w * 1.6;
          const headL = headW * 1.4;

          ctx.moveTo(startX, startY);
          ctx.lineTo(a1.x, a1.y);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(a1.x - px * headW, a1.y - py * headW);
          ctx.lineTo(a1.x + px * headW, a1.y + py * headW);
          ctx.lineTo(a1.x + ux * headL, a1.y + uy * headL);
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
            if (atomAtomDistance(prevA, a1) > 10 || atomAtomDistance(a1, nextA!) > 10) return;
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

      const outlineWeight = options.colorScheme?.outline_weight ?? 1.1;
      const glow = options.colorScheme?.glow_intensity ?? 0;

      if (el.isHighlighted || a1.isHighlighted || a1.parent.isHighlighted) {
        drawPath(lw * 1.4 * outlineWeight, 'rgba(255, 255, 0, 0.7)');
      }

      if (glow > 0) {
        ctx.save();
        ctx.shadowBlur = glow / options.zoom;
        ctx.shadowColor = color;
        drawPath(lw * outlineWeight, shadow);
        ctx.restore();
      } else {
        drawPath(lw * outlineWeight, shadow);
      }

      drawPath(lw * 1.0, color);
      drawPath(lw * 0.4, 'rgba(255,255,255,0.15)');
    }
  }

  private drawPoints(el: Structure, options: RenderOptions): void {
    const atoms = el.getOfType(Atom);
    const sorted = atoms.slice().sort(sortByZ);
    for (const a of sorted) {
      if (!(['lines', 'cartoon', 'ribbon', 'tube'] as DrawMethod[]).includes(a.info.drawMethod)) {
        this.drawAtomPoint(a, options);
      }
      if (a === options.highlightedAtom) {
        this.drawAtomHighlight(a, options);
      }
    }
  }

  private drawAtomPoint(a: Atom, options: RenderOptions): void {
    const relR = atom_radii[a.name] ?? 1.0;
    const zz = (ATOM_SIZE * relR) / options.zoom;
    const ctx = this.context;

    const fill = this.depthShadedColorString(a, options, 'cpk');

    ctx.beginPath();
    ctx.arc(a.x, a.y, zz, 0, 2 * Math.PI, false);

    const outlineWeight = options.colorScheme?.outline_weight ?? 1.1;
    const glow = options.colorScheme?.glow_intensity ?? 0;

    if (glow > 0) {
      ctx.save();
      ctx.shadowBlur = glow / options.zoom;
      ctx.shadowColor = fill;
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = (0.8 * outlineWeight) / options.zoom;
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = (0.5 * outlineWeight) / options.zoom;
      ctx.stroke();
    }

    ctx.fillStyle = fill;
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(a.x - zz * 0.35, a.y - zz * 0.35, zz * 0.3, 0, 2 * Math.PI, false);
    ctx.fill();
  }

  private drawAtomHighlight(a: Atom, options: RenderOptions): void {
    const ctx = this.context;
    const relR = atom_radii[a.name] ?? 1.0;
    const zz = (ATOM_SIZE * relR * 1.5) / options.zoom;

    ctx.beginPath();
    ctx.arc(a.x, a.y, zz, 0, 2 * Math.PI, false);
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
    ctx.lineWidth = 3 / options.zoom;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(a.x, a.y, zz + 2 / options.zoom, 0, 2 * Math.PI, false);
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
    ctx.lineWidth = 1 / options.zoom;
    ctx.stroke();
  }

  private depthShadedColorString(a: Atom, options: RenderOptions, colorType: ColorMethod = 'cpk', brightnessOffset: number = 0): string {
    const method = a.info.colorMethod || colorType;
    let base: number[];
    switch (method) {
      case 'ss': base = a.ssColor(); break;
      case 'chain': base = a.chainColor(); break;
      case 'b-factor': base = a.bFactorColor(); break;
      case 'hydrophobicity': base = a.hydrophobicityColor(); break;
      case 'cpk':
      default: base = a.cpkColor(); break;
    }

    const extent = this.z_extent ?? 1;
    const t = Math.max(0, Math.min(1, (a.z + extent) / (2 * extent)));

    let factor: number;
    if (options.isDarkBackground) {
      factor = Math.max(0, Math.min(2, 0.1 + 1.0 * t + brightnessOffset));
    } else {
      factor = Math.max(0, Math.min(2, 1.8 - 0.8 * t + brightnessOffset));
    }

    const r = Math.round(base[0] * factor);
    const g = Math.round(base[1] * factor);
    const b = Math.round(base[2] * factor);
    return `rgb(${r},${g},${b})`;
  }

  private drawMeasureLine(options: RenderOptions): void {
    if (!options.measureStartAtom) return;

    const endAtom = options.measureEndAtom || options.highlightedAtom;
    const targetX = endAtom ? endAtom.x : options.mouseX;
    const targetY = endAtom ? endAtom.y : options.mouseY;

    if (endAtom === options.measureStartAtom) return;

    const ctx = this.context;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([5 / options.zoom, 5 / options.zoom]);
    ctx.moveTo(options.measureStartAtom.x, options.measureStartAtom.y);
    ctx.lineTo(targetX, targetY);
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 2 / options.zoom;
    ctx.stroke();
    ctx.setLineDash([]);

    if (endAtom) {
      const dist = atomAtomDistance(options.measureStartAtom, endAtom);
      const midX = (options.measureStartAtom.x + targetX) / 2;
      const midY = (options.measureStartAtom.y + targetY) / 2;

      ctx.fillStyle = '#ff3333';
      ctx.font = `bold ${14 / options.zoom}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.strokeStyle = 'white';
      ctx.lineWidth = 4 / options.zoom;
      ctx.strokeText(`${dist.toFixed(2)} Å`, midX, midY);
      ctx.fillText(`${dist.toFixed(2)} Å`, midX, midY);
    }

    ctx.restore();
  }

  private computeZExtent(elements: Structure[]): void {
    let min_z = Infinity, max_z = -Infinity;
    for (const el of elements) {
      for (const a of el.atoms) {
        if (a.z < min_z) min_z = a.z;
        if (a.z > max_z) max_z = a.z;
      }
    }
    this.z_extent = Math.max(Math.abs(min_z), Math.abs(max_z));
  }

  private determinePointGrid(elements: Structure[], options: RenderOptions): void {
    this.grid = {};
    const addToGrid = (a: Atom, x: number, y: number, z: number) => {
      const gx = Math.round(x / 5);
      const gy = Math.round(y / 5);
      if (this.grid[gx] == null) this.grid[gx] = {};
      const existing = this.grid[gx][gy];
      if (existing == null || z > existing.z) this.grid[gx][gy] = a;
    };

    for (const el of elements) {
      for (const a of el.atoms) {
        const ax = a.x * options.zoom + options.x_origin;
        const ay = a.y * options.zoom + options.y_origin;
        addToGrid(a, ax, ay, a.z);
      }

      const allBonds: Bond[] = [];
      const collect = (m: any) => {
        allBonds.push(...m.bonds);
        for (const c of m.children) collect(c);
      };
      collect(el);

      for (const b of allBonds) {
        const x1 = b.a1.x * options.zoom + options.x_origin;
        const y1 = b.a1.y * options.zoom + options.y_origin;
        const x2 = b.a2.x * options.zoom + options.x_origin;
        const y2 = b.a2.y * options.zoom + options.y_origin;

        const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const steps = Math.ceil(dist / 2);
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          const px = x1 + (x2 - x1) * t;
          const py = y1 + (y2 - y1) * t;
          const pz = b.a1.z + (b.a2.z - b.a1.z) * t;
          const atom = t < 0.5 ? b.a1 : b.a2;
          addToGrid(atom, px, py, pz);

          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len > 0) {
            const nx = -dy / len;
            const ny = dx / len;
            for (const offset of [-10, -5, 5, 10]) {
              addToGrid(atom, px + nx * offset, py + ny * offset, pz);
            }
          }
        }
      }
    }
  }

  getAtomAt(x: number, y: number, zoom: number, x_origin: number, y_origin: number): Atom | null {
    const gx = Math.round(x / 5);
    const gy = Math.round(y / 5);

    let closestAtom: Atom | null = null;
    let minSqDist = Infinity;

    for (let ix = gx - 1; ix <= gx + 1; ix++) {
      for (let iy = gy - 1; iy <= gy + 1; iy++) {
        const a = this.grid[ix]?.[iy];
        if (a) {
          const ax = a.x * zoom + x_origin;
          const ay = a.y * zoom + y_origin;
          const sqDist = (x - ax) ** 2 + (y - ay) ** 2;
          if (sqDist < minSqDist) {
            minSqDist = sqDist;
            closestAtom = a;
          }
        }
      }
    }

    if (minSqDist > 625) return null;
    return closestAtom;
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  setBackgroundColor(color: string): void {
    this.canvas.style.backgroundColor = color;
  }

  clear(): void {
    this.grid = {};
  }

  dispose(): void {}
}
