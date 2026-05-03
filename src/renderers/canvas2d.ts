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
    this.drawSurface(el, options);
    this.drawPoints(el, options);
  }

  // Cheap 2D approximation of a molecular surface: each atom paints a large
  // soft radial-gradient blob. Where blobs overlap they sum to a continuous
  // colored region, giving a fuzzy surface read without the cost of marching
  // cubes. The 3D renderer ships the real Gaussian surface; this is the best
  // we can do in a single 2D pass.
  private drawSurface(el: Structure, options: RenderOptions): void {
    const ctx = this.context;
    let any = false;
    // Re-use drawPoints' Z-sort so far atoms paint first and near atoms cover them.
    const sorted = el.atoms.slice().sort(sortByZ);
    for (const a of sorted) {
      if (a.info.drawMethod !== 'surface') continue;
      any = true;

      const elem = a.element || a.name;
      // SAS-ish radius: vdW (in carbon-relative units × ~1.7Å carbon vdW) + probe.
      const r = ((atom_radii[elem] ?? 1.0) * 1.7 + 1.4);

      // Pull a depth-shaded base color, then build matching transparent stop so
      // the gradient fades to true zero alpha at the blob edge — without this
      // the edges show as hard circles and the "surface" reads as a sticker.
      const baseRGBA = this.depthShadedColorString(a, options, 'cpk', 0, 1);
      const m = baseRGBA.match(/rgba?\((\d+),(\d+),(\d+)/);
      if (!m) continue;
      const cr = m[1], cg = m[2], cb = m[3];

      const grad = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, r);
      grad.addColorStop(0,    `rgba(${cr},${cg},${cb},0.95)`);
      grad.addColorStop(0.55, `rgba(${cr},${cg},${cb},0.75)`);
      grad.addColorStop(1,    `rgba(${cr},${cg},${cb},0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(a.x, a.y, r, 0, 2 * Math.PI, false);
      ctx.fill();
    }
    if (!any) return;
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
      // Ribbon and cartoon are both drawn in drawRibbons as continuous bands.
      // Skipping their CA-CA bonds here avoids a thick-line layer underneath the
      // ribbon (which is wider and would just hide it).
      if (b.a1.info.drawMethod === 'ribbon' || b.a2.info.drawMethod === 'ribbon') continue;
      if (b.a1.info.drawMethod === 'cartoon' || b.a2.info.drawMethod === 'cartoon') continue;
      if (b.a1.info.drawMethod === 'surface' || b.a2.info.drawMethod === 'surface') continue;

      const midX = (b.a1.x + b.a2.x) / 2;
      const midY = (b.a1.y + b.a2.y) / 2;

      const isTube = b.a1.info.drawMethod === 'tube' || b.a2.info.drawMethod === 'tube';
      const isBoth = b.a1.info.drawMethod === 'both' || b.a2.info.drawMethod === 'both';
      const colorType = isTube ? 'chain' : 'cpk';
      const opacity = isBoth ? 0.4 : 1.0;

      // Scale line width by 1/zoom so it stays a constant ~2.5 px on screen,
      // visibly thinner than the ~6 px atom point diameter. Without this, lines
      // grow with zoom and overwhelm point spheres in 'both' mode.
      let lw = (isBoth ? 1.5 : 2.5) / options.zoom;
      if (isTube) {
        lw = b.a1.parent.ss === 'helix' ? 0.8 : b.a1.parent.ss === 'sheet' ? 0.6 : 0.4;
      }

      const color1 = this.depthShadedColorString(b.a1, options, colorType, 0, opacity);
      const color2 = this.depthShadedColorString(b.a2, options, colorType, 0, opacity);

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

      const shadow1 = this.depthShadedColorString(b.a1, options, colorType, -0.4, opacity);

      // First half: a1 → midpoint (inlined to avoid per-bond array allocation)
      ctx.strokeStyle = shadow1; ctx.lineWidth = lw * 1.3;
      ctx.beginPath(); ctx.moveTo(b.a1.x, b.a1.y); ctx.lineTo(midX, midY); ctx.stroke();
      ctx.strokeStyle = color1; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(b.a1.x, b.a1.y); ctx.lineTo(midX, midY); ctx.stroke();
      
      if (!isBoth) {
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = lw * 0.7;
        ctx.beginPath(); ctx.moveTo(b.a1.x, b.a1.y); ctx.lineTo(midX, midY); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = lw * 0.3;
        ctx.beginPath(); ctx.moveTo(b.a1.x, b.a1.y); ctx.lineTo(midX, midY); ctx.stroke();
      }

      const isHighlighted = el.isHighlighted || b.a1.isHighlighted || b.a1.parent.isHighlighted || b.a2.isHighlighted || b.a2.parent.isHighlighted;
      if (isHighlighted) {
        ctx.strokeStyle = isBoth ? 'rgba(255, 255, 0, 0.4)' : 'rgba(255, 255, 0, 0.7)';
        ctx.lineWidth = lw * 1.5;
        ctx.beginPath();
        ctx.moveTo(b.a1.x, b.a1.y);
        ctx.lineTo(b.a2.x, b.a2.y);
        ctx.stroke();
      }

      const shadow2 = this.depthShadedColorString(b.a2, options, colorType, -0.4, opacity);

      // Second half: a2 → midpoint
      ctx.strokeStyle = shadow2; ctx.lineWidth = lw * 1.3;
      ctx.beginPath(); ctx.moveTo(b.a2.x, b.a2.y); ctx.lineTo(midX, midY); ctx.stroke();
      ctx.strokeStyle = color2; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(b.a2.x, b.a2.y); ctx.lineTo(midX, midY); ctx.stroke();

      if (!isBoth) {
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = lw * 0.7;
        ctx.beginPath(); ctx.moveTo(b.a2.x, b.a2.y); ctx.lineTo(midX, midY); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = lw * 0.3;
        ctx.beginPath(); ctx.moveTo(b.a2.x, b.a2.y); ctx.lineTo(midX, midY); ctx.stroke();
      }
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
      const m = a.info.drawMethod;
      if (elHighlighted || a.isHighlighted || a.parent.isHighlighted || m === 'ribbon' || m === 'cartoon') {
        buf.push(a);
      }
    }
    if (buf.length === 0) return;
    buf.sort(sortByZ);

    const ctx = this.context;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';

    const fast = options.isInteracting;
    const outlineWeight = options.colorScheme?.outline_weight ?? 1.1;
    const ribbonColorMethod = options.colorScheme?.ribbon_color_method ?? 'chain';

    // Edge stroke is a constant ~1 px on screen — without dividing by zoom, the
    // ribbon edge would balloon at high zoom and re-create the sausage feel.
    const edgePx = 1.0 / options.zoom;

    for (const a1 of buf) {
      const prevA = atomPrev.get(a1);
      const nextA = atomNext.get(a1);
      if (!prevA && !nextA) continue;

      const isCartoon = a1.info.drawMethod === 'cartoon';
      const color = this.depthShadedColorString(a1, options, ribbonColorMethod);
      const edgeColor = this.depthShadedColorString(a1, options, ribbonColorMethod, isCartoon ? -0.95 : -0.45);

      // Half-width of the ribbon band, in world units. Helix / sheet are wide
      // tapes; loop is a narrow strand. Cartoon mode is bumped up further so
      // the heavy outline reads as comic-style.
      let halfW: number;
      if (a1.parent.ss === 'helix') halfW = isCartoon ? 1.6 : 1.1;
      else if (a1.parent.ss === 'sheet') halfW = isCartoon ? 1.4 : 0.95;
      else halfW = isCartoon ? 0.45 : 0.32;

      const isLastOfSheet = a1.parent.ss === 'sheet' && (!nextA || nextA.parent.ss !== 'sheet');

      // Endpoints of the band along the chain (midpoints with neighbors).
      let sx: number, sy: number, ex: number, ey: number;
      if (!prevA) {
        if (atomAtomDistance(a1, nextA!) > 10) continue;
        sx = a1.x; sy = a1.y;
        ex = (a1.x + nextA!.x) / 2; ey = (a1.y + nextA!.y) / 2;
      } else if (!nextA) {
        if (atomAtomDistance(prevA, a1) > 10) continue;
        sx = (prevA.x + a1.x) / 2; sy = (prevA.y + a1.y) / 2;
        ex = a1.x; ey = a1.y;
      } else {
        if (atomAtomDistance(prevA, a1) > 10 || atomAtomDistance(a1, nextA!) > 10) continue;
        sx = (prevA.x + a1.x) / 2; sy = (prevA.y + a1.y) / 2;
        ex = (a1.x + nextA!.x) / 2; ey = (a1.y + nextA!.y) / 2;
      }

      // Tangent direction at start (prev→a1) and end (a1→next) — used to
      // orient the ribbon edges so the band's normal smoothly changes per
      // joint, instead of looking like rounded caps stacked end to end.
      const startDx = (prevA ? a1.x - prevA.x : nextA!.x - a1.x);
      const startDy = (prevA ? a1.y - prevA.y : nextA!.y - a1.y);
      const endDx   = (nextA ? nextA.x - a1.x : a1.x - prevA!.x);
      const endDy   = (nextA ? nextA.y - a1.y : a1.y - prevA!.y);

      const sLen = Math.hypot(startDx, startDy) || 1;
      const eLen = Math.hypot(endDx, endDy) || 1;
      // Perpendicular (left) vector at each end, in screen-space.
      const sNx = -startDy / sLen, sNy = startDx / sLen;
      const eNx = -endDy   / eLen, eNy = endDx   / eLen;

      // Sheet arrowhead: replaces the band on the last residue with a triangle.
      if (isLastOfSheet) {
        const headW = halfW * 2.0;
        const baseLx = sx + sNx * halfW, baseLy = sy + sNy * halfW;
        const baseRx = sx - sNx * halfW, baseRy = sy - sNy * halfW;
        const tipX = a1.x + (endDx / eLen) * Math.hypot(ex - sx, ey - sy) * 0.9;
        const tipY = a1.y + (endDy / eLen) * Math.hypot(ex - sx, ey - sy) * 0.9;
        const flareLx = a1.x + sNx * headW, flareLy = a1.y + sNy * headW;
        const flareRx = a1.x - sNx * headW, flareRy = a1.y - sNy * headW;

        ctx.beginPath();
        ctx.moveTo(baseLx, baseLy);
        ctx.lineTo(flareLx, flareLy);
        ctx.lineTo(tipX, tipY);
        ctx.lineTo(flareRx, flareRy);
        ctx.lineTo(baseRx, baseRy);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        if (!fast) {
          ctx.strokeStyle = edgeColor;
          ctx.lineWidth = (isCartoon ? edgePx * 2.2 : edgePx) * outlineWeight;
          ctx.stroke();
        }
        continue;
      }

      // Quad (two parallel curves through a1, joining the start/end midpoints).
      // The fill gives the flat-tape look; the stroke on the two long edges
      // sells the ribbon shape without the per-segment cap bulges.
      const sLx = sx + sNx * halfW, sLy = sy + sNy * halfW;
      const sRx = sx - sNx * halfW, sRy = sy - sNy * halfW;
      const eLx = ex + eNx * halfW, eLy = ey + eNy * halfW;
      const eRx = ex - eNx * halfW, eRy = ey - eNy * halfW;

      // Control points at a1 use the average normal so the curve passes
      // through the midline at a1 with a continuous tangent.
      const mNx = (sNx + eNx) * 0.5, mNy = (sNy + eNy) * 0.5;
      const cLx = a1.x + mNx * halfW, cLy = a1.y + mNy * halfW;
      const cRx = a1.x - mNx * halfW, cRy = a1.y - mNy * halfW;

      ctx.beginPath();
      ctx.moveTo(sLx, sLy);
      ctx.quadraticCurveTo(cLx, cLy, eLx, eLy);
      ctx.lineTo(eRx, eRy);
      ctx.quadraticCurveTo(cRx, cRy, sRx, sRy);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      if (fast) continue;

      // Highlight pass — yellow tint on hovered residue/structure.
      if (elHighlighted || a1.isHighlighted || a1.parent.isHighlighted) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 0, 0.35)';
        ctx.fill();
        ctx.restore();
      }

      // Edge strokes — render only the two long edges so we don't add round
      // joints between consecutive segments.
      ctx.strokeStyle = edgeColor;
      ctx.lineWidth = (isCartoon ? edgePx * 2.2 : edgePx) * outlineWeight;
      ctx.beginPath();
      ctx.moveTo(sLx, sLy);
      ctx.quadraticCurveTo(cLx, cLy, eLx, eLy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sRx, sRy);
      ctx.quadraticCurveTo(cRx, cRy, eRx, eRy);
      ctx.stroke();

      // Subtle interior highlight along the centerline gives the band a
      // satin-finish feel without re-introducing the sausage outline.
      if (!isCartoon) {
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = edgePx * 0.7;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(a1.x, a1.y, ex, ey);
        ctx.stroke();
      }
    }
  }

  private drawPoints(el: Structure, options: RenderOptions): void {
    // el.atoms is the cached flat atom list — avoid per-frame getOfType walk.
    // The sort buffer is reused across frames to avoid the .slice() allocation.
    const atoms = el.atoms;
    const sorted = atoms.slice(0).sort(sortByZ);
    for (const a of sorted) {
      if (!(['lines', 'cartoon', 'ribbon', 'tube', 'surface'] as DrawMethod[]).includes(a.info.drawMethod)) {
        this.drawAtomPoint(a, options);
      }
      if (a === options.highlightedAtom) {
        this.drawAtomHighlight(a, options);
      }
    }
  }

  private drawAtomPoint(a: Atom, options: RenderOptions): void {
    const relR = atom_radii[a.element] ?? atom_radii[a.name] ?? 1.0;
    const zz = (ATOM_SIZE * relR) / options.zoom;
    const ctx = this.context;

    const opacity = a.occupancy;
    const fill = this.depthShadedColorString(a, options, 'cpk', 0, opacity);

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
      ctx.strokeStyle = `rgba(0,0,0,${0.4 * opacity})`;
      ctx.lineWidth = (0.8 * outlineWeight) / options.zoom;
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.strokeStyle = `rgba(0,0,0,${0.4 * opacity})`;
      ctx.lineWidth = (0.5 * outlineWeight) / options.zoom;
      ctx.stroke();
    }

    ctx.fillStyle = fill;
    ctx.fill();

    if (opacity > 0.5) {
      ctx.fillStyle = `rgba(255,255,255,${0.45 * opacity})`;
      ctx.beginPath();
      ctx.arc(a.x - zz * 0.35, a.y - zz * 0.35, zz * 0.3, 0, 2 * Math.PI, false);
      ctx.fill();
    }
  }

  private drawAtomHighlight(a: Atom, options: RenderOptions): void {
    const ctx = this.context;
    const relR = atom_radii[a.element] ?? atom_radii[a.name] ?? 1.0;
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

  private depthShadedColorString(a: Atom, options: RenderOptions, colorType: ColorMethod = 'cpk', brightnessOffset: number = 0, opacity: number = 1): string {
    const method = a.info.colorMethod || colorType;
    let base: number[];
    switch (method) {
      case 'ss': base = a.ssColor(); break;
      case 'chain': base = a.chainColor(); break;
      case 'b-factor': base = a.bFactorColor(); break;
      case 'hydrophobicity': base = a.hydrophobicityColor(); break;
      case 'formal-charge': base = a.formalChargeColor(); break;
      case 'cpk':
      default: base = a.cpkColor(); break;
    }

    const extent = this.z_extent > 0 ? this.z_extent : 1;
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
    return `rgba(${r},${g},${b},${opacity})`;
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
