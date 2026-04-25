import { Structure, Atom, Bond, sortByZ, sortBondsByZ, atomAtomDistance, Chain } from '../models';
import { Renderer, RenderOptions } from './renderer';
import { atom_radii, ATOM_SIZE, DrawMethod, ColorMethod } from '../types';
import { hexToRGBArray, arrayToRGB } from '../utils';

interface RibbonCache {
  chains: Map<Chain, Atom[]>;
  atomPrev: Map<Atom, Atom>;
  atomNext: Map<Atom, Atom>;
  caAtoms: Atom[];
}

export class Canvas2DRenderer implements Renderer {
  private canvas!: HTMLCanvasElement;
  private context!: CanvasRenderingContext2D;
  private grid: Map<number, Atom> = new Map();
  private z_extent: number = 1;
  // Ribbon prev/next/chain mappings depend only on residue ordering and atom
  // names, not on per-frame state — cache them per Structure to avoid
  // rebuilding the maps every frame.
  private _ribbonCache: WeakMap<Structure, RibbonCache> = new WeakMap();
  // Reusable buffer for ribbon Z-sort to avoid per-frame allocation.
  private _ribbonSortBuffer: Atom[] = [];

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
    // Structure.bonds contains all bonds (intra-residue, inter-residue, inter-chain).
    // Using it directly avoids recursive collection that would triple-count intra-residue
    // bonds (once at Structure, Chain, and Residue levels).
    if (el.bonds.length === 0) return;
    const allBonds = el.bonds.slice().sort(sortBondsByZ);
    const ctx = this.context;
    ctx.lineCap = 'round';
    const fast = options.isInteracting;

    for (const b of allBonds) {
      if (b.a1.info.drawMethod === 'points' && b.a2.info.drawMethod === 'points') continue;
      if (b.a1.info.drawMethod === 'ribbon' || b.a2.info.drawMethod === 'ribbon') continue;

      const midX = (b.a1.x + b.a2.x) / 2;
      const midY = (b.a1.y + b.a2.y) / 2;

      const isTube = b.a1.info.drawMethod === 'tube' || b.a2.info.drawMethod === 'tube';
      const isCartoon = b.a1.info.drawMethod === 'cartoon' || b.a2.info.drawMethod === 'cartoon';
      const colorType = isTube || isCartoon ? 'chain' : 'cpk';

      let lw = 0.15;
      if (isTube) {
        lw = b.a1.parent.ss === 'helix' ? 0.8 : b.a1.parent.ss === 'sheet' ? 0.6 : 0.4;
      }

      const color1 = this.depthShadedColorString(b.a1, options, colorType);
      const color2 = this.depthShadedColorString(b.a2, options, colorType);

      // Fast path during interaction: 1 stroke per half-bond (color only).
      // Drops 8 strokes/bond to 2, no depth-shaded shadow, no white highlights.
      if (fast) {
        ctx.lineWidth = lw;
        ctx.strokeStyle = color1;
        ctx.beginPath(); ctx.moveTo(b.a1.x, b.a1.y); ctx.lineTo(midX, midY); ctx.stroke();
        ctx.strokeStyle = color2;
        ctx.beginPath(); ctx.moveTo(b.a2.x, b.a2.y); ctx.lineTo(midX, midY); ctx.stroke();
        continue;
      }

      const shadow1 = this.depthShadedColorString(b.a1, options, colorType, -0.4);

      // First half: a1 → midpoint (inlined to avoid per-bond array allocation)
      ctx.strokeStyle = shadow1; ctx.lineWidth = lw * 1.3;
      ctx.beginPath(); ctx.moveTo(b.a1.x, b.a1.y); ctx.lineTo(midX, midY); ctx.stroke();
      ctx.strokeStyle = color1; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(b.a1.x, b.a1.y); ctx.lineTo(midX, midY); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = lw * 0.7;
      ctx.beginPath(); ctx.moveTo(b.a1.x, b.a1.y); ctx.lineTo(midX, midY); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = lw * 0.3;
      ctx.beginPath(); ctx.moveTo(b.a1.x, b.a1.y); ctx.lineTo(midX, midY); ctx.stroke();

      const isHighlighted = el.isHighlighted || b.a1.isHighlighted || b.a1.parent.isHighlighted || b.a2.isHighlighted || b.a2.parent.isHighlighted;
      if (isHighlighted) {
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.7)';
        ctx.lineWidth = lw * 1.5;
        ctx.beginPath();
        ctx.moveTo(b.a1.x, b.a1.y);
        ctx.lineTo(b.a2.x, b.a2.y);
        ctx.stroke();
      }

      const shadow2 = this.depthShadedColorString(b.a2, options, colorType, -0.4);

      // Second half: a2 → midpoint
      ctx.strokeStyle = shadow2; ctx.lineWidth = lw * 1.3;
      ctx.beginPath(); ctx.moveTo(b.a2.x, b.a2.y); ctx.lineTo(midX, midY); ctx.stroke();
      ctx.strokeStyle = color2; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(b.a2.x, b.a2.y); ctx.lineTo(midX, midY); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = lw * 0.7;
      ctx.beginPath(); ctx.moveTo(b.a2.x, b.a2.y); ctx.lineTo(midX, midY); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = lw * 0.3;
      ctx.beginPath(); ctx.moveTo(b.a2.x, b.a2.y); ctx.lineTo(midX, midY); ctx.stroke();
    }
  }

  private getRibbonCache(el: Structure): RibbonCache {
    let cache = this._ribbonCache.get(el);
    if (cache) return cache;

    const chains: Map<Chain, Atom[]> = new Map();
    const caAtoms: Atom[] = [];
    // Use el.atoms (cached during init()) instead of getOfType(Atom)
    for (const a of el.atoms) {
      if (
        (a.parent.isProtein() && a.original_atom_name === 'CA') ||
        (a.parent.isDNA() && a.original_atom_name === 'P')
      ) {
        const c = a.parent.parent;
        let chainAtoms = chains.get(c);
        if (!chainAtoms) { chainAtoms = []; chains.set(c, chainAtoms); }
        chainAtoms.push(a);
        caAtoms.push(a);
      }
    }

    const atomPrev: Map<Atom, Atom> = new Map();
    const atomNext: Map<Atom, Atom> = new Map();
    for (const chainAtoms of chains.values()) {
      for (let i = 0; i < chainAtoms.length; i++) {
        if (i > 0) atomPrev.set(chainAtoms[i], chainAtoms[i - 1]);
        if (i < chainAtoms.length - 1) atomNext.set(chainAtoms[i], chainAtoms[i + 1]);
      }
    }

    cache = { chains, atomPrev, atomNext, caAtoms };
    this._ribbonCache.set(el, cache);
    return cache;
  }

  private drawRibbons(el: Structure, options: RenderOptions): void {
    const { atomPrev, atomNext, caAtoms } = this.getRibbonCache(el);
    if (caAtoms.length === 0) return;

    // Fill the reusable sort buffer in-place with this frame's eligible atoms
    // (those whose draw method or highlight state means they should render).
    const buf = this._ribbonSortBuffer;
    buf.length = 0;
    const elHighlighted = el.isHighlighted;
    for (const a of caAtoms) {
      if (elHighlighted || a.isHighlighted || a.parent.isHighlighted || a.info.drawMethod === 'ribbon') {
        buf.push(a);
      }
    }
    if (buf.length === 0) return;
    buf.sort(sortByZ);

    const ctx = this.context;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const fast = options.isInteracting;
    const outlineWeight = options.colorScheme?.outline_weight ?? 1.1;
    const glow = options.colorScheme?.glow_intensity ?? 0;

    for (const a1 of buf) {
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

      // Fast path during drag/zoom: a single solid stroke per atom. Skips the
      // shadowBlur outline pass (which dominates GPU time when glow > 0) and
      // the white shine pass. Full quality returns 200ms after interaction
      // ends via `noteInteraction()`'s debounced re-render.
      if (fast) {
        drawPath(lw, color);
        continue;
      }

      if (elHighlighted || a1.isHighlighted || a1.parent.isHighlighted) {
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
    // el.atoms is the cached flat atom list — avoid per-frame getOfType walk.
    // The sort buffer is reused across frames to avoid the .slice() allocation.
    const atoms = el.atoms;
    const sorted = atoms.slice(0).sort(sortByZ);
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

    // Fast path during interaction: just the fill, no outline, no shadowBlur,
    // no specular highlight. Cuts per-atom GPU work to roughly a third.
    if (options.isInteracting) {
      ctx.fillStyle = fill;
      ctx.fill();
      return;
    }

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
    this.grid.clear();
    const { zoom, x_origin, y_origin } = options;

    const addToGrid = (a: Atom, x: number, y: number, z: number) => {
      const key = Math.round(x / 5) * 131072 + Math.round(y / 5);
      const existing = this.grid.get(key);
      if (existing == null || z > existing.z) this.grid.set(key, a);
    };

    for (const el of elements) {
      for (const a of el.atoms) {
        addToGrid(a, a.x * zoom + x_origin, a.y * zoom + y_origin, a.z);
      }

      // Structure.bonds contains all bonds; no recursive traversal needed.
      for (const b of el.bonds) {
        const x1 = b.a1.x * zoom + x_origin;
        const y1 = b.a1.y * zoom + y_origin;
        const x2 = b.a2.x * zoom + x_origin;
        const y2 = b.a2.y * zoom + y_origin;

        // Hoist loop-invariant quantities outside the step loop.
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.ceil(dist / 2);
        if (steps < 2) continue;

        // nx/ny are the bond's screen-space normal — constant per bond.
        const nx = dist > 0 ? -dy / dist : 0;
        const ny = dist > 0 ?  dx / dist : 0;
        const zDelta = b.a2.z - b.a1.z;

        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          const px = x1 + dx * t;
          const py = y1 + dy * t;
          const pz = b.a1.z + zDelta * t;
          const atom = t < 0.5 ? b.a1 : b.a2;
          addToGrid(atom, px,           py,           pz);
          addToGrid(atom, px - nx * 10, py - ny * 10, pz);
          addToGrid(atom, px - nx * 5,  py - ny * 5,  pz);
          addToGrid(atom, px + nx * 5,  py + ny * 5,  pz);
          addToGrid(atom, px + nx * 10, py + ny * 10, pz);
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
        const a = this.grid.get(ix * 131072 + iy);
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
    this.grid.clear();
  }

  dispose(): void {}
}
