'use strict';

import {
  AtomInfo,
  StructureLoadInfo,
  ParsedStructure,
  DrawMethod,
  DEBUG,
} from './types';
import {
  arrayToRGB,
  defaultInfo,
  hexToRGBArray,
} from './utils';
import {
  Structure,
  Chain,
  Residue,
  Atom,
  Bond,
  Selector,
  atomAtomDistance,
} from './models';
import { parsePDB, parseMmCIF } from './parser';

export class CanvasContext {
  canvas_target: string | HTMLCanvasElement;
  background_color: string;
  elements: Structure[];
  bonds: Bond[];
  grid: Record<number, Record<number, Atom | null>>;
  canvas!: HTMLCanvasElement;
  context!: CanvasRenderingContext2D;
  zoom: number;
  zoom_prev: number;
  x_origin: number;
  y_origin: number;
  z_extent: number;
  mouse_x_prev: number;
  mouse_y_prev: number;
  delayID: ReturnType<typeof setInterval> | null;
  a_prev: Atom | null;
  mouseX: number;
  mouseY: number;
  structures_left_to_load: number | null;
  x_axis: [number, number, number];
  y_axis: [number, number, number];
  z_axis: [number, number, number];

  isMeasuring: boolean;
  measureStartAtom: Atom | null;
  measureEndAtom: Atom | null;
  isDarkBackground: boolean;

  constructor(
    canvas_target: string | HTMLCanvasElement,
    background_color: string = '#ffffff'
  ) {
    this.canvas_target = canvas_target;
    this.background_color = background_color;
    this.isDarkBackground = this.checkIsDark(background_color);
    this.elements = [];
    this.bonds = [];
    this.grid = {};
    this.zoom = 1;
    this.zoom_prev = 1;
    this.x_origin = 0;
    this.y_origin = 0;
    this.z_extent = 1;
    this.mouse_x_prev = 0;
    this.mouse_y_prev = 0;
    this.delayID = null;
    this.a_prev = null;
    this.mouseX = 0;
    this.mouseY = 0;
    this.structures_left_to_load = null;
    this.x_axis = [1, 0, 0];
    this.y_axis = [0, 1, 0];
    this.z_axis = [0, 0, 1];

    this.isMeasuring = false;
    this.measureStartAtom = null;
    this.measureEndAtom = null;

    for (const method of [
      'init',
      'loadNewStructure',
      'writeContextInfo',
      'addNewStructure',
      'loadFromDict',
      'drawAll',
      'findBestZoom',
      'drawGridLines',
      'changeAllDrawMethods',
      'resize',
      'clear',
      'touchstart',
      'mousedown',
      'mouseup',
      'touchend',
      'touchmove',
      'mousemove',
      'iOSChangeZoom',
      'changeZoom',
      'restoreToOriginal',
      'computeZExtent',
      'findBonds',
      'translateOrigin',
      'avgCenterOfAllElements',
      'timedRotation',
      'stopRotation',
      'determinePointGrid',
      'showAtomInfo',
      'assignSelectors',
      'handleSelectorArg',
      'childFromSelector',
      'changeInfoFromSelectors',
      'handleContextMenu',
      'handleClick',
    ]) {
      (this as any)[method] = (this as any)[method].bind(this);
    }

    try {
      if (typeof this.canvas_target === 'string') {
        this.canvas = document.querySelector(
          this.canvas_target
        ) as HTMLCanvasElement;
      } else {
        this.canvas = this.canvas_target;
      }
      this.context = this.canvas.getContext('2d')!;
    } catch (error) {
      alert(`Failed to initialize CoffeeMol: ${error}`);
      throw error;
    }

    this.canvas.style.userSelect = 'none';
    (this.canvas.style as any).MozUserSelect = 'none';
    (this.canvas.style as any).webkitUserSelect = 'none';
    this.canvas.style.backgroundColor = arrayToRGB(this.background_color);

    this.canvas.addEventListener('mousedown', this.mousedown);
    this.canvas.addEventListener('touchstart', this.touchstart, {
      passive: false,
    });
    this.canvas.addEventListener('wheel', this.changeZoom, { passive: false });
    this.canvas.addEventListener(
      'gesturestart',
      this.iOSChangeZoom as EventListener
    );
    this.canvas.addEventListener('dblclick', this.translateOrigin);
    this.canvas.addEventListener('mousemove', this.showAtomInfo);
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);
    this.canvas.addEventListener('click', this.handleClick);

    // Initial origins
    this.x_origin = this.canvas.width / 2;
    this.y_origin = this.canvas.height / 2;
  }

  // ---- Loading ----

  init(): void {
    for (const el of this.elements) el.init();
    this.findBonds();
    this.assignSelectors();
    this.restoreToOriginal();
    this.computeZExtent();
    this.determinePointGrid();
    this.writeContextInfo();
  }

  addElement(el: Structure): void {
    this.elements.push(el);
  }

  loadNewStructure(
    filepath: string,
    info: StructureLoadInfo | AtomInfo | null = null
  ): void {
    this.elements = [];
    this.bonds = [];
    this.grid = {};
    this.addNewStructure(filepath, info);
  }

  buildStructure(
    parsed: ParsedStructure,
    filepath: string,
    info: StructureLoadInfo | AtomInfo | null = null
  ): void {
    const s = new Structure(filepath, this);
    this.addElement(s);
    if (parsed.title) s.attachTitle(parsed.title);

    let chain_id_prev: string | null = null;
    let resi_id_prev: number | null = null;
    let c!: Chain;
    let r!: Residue;

    const residues: Residue[] = [];

    for (const d of parsed.atoms) {
      if (chain_id_prev == null || d.chain_id !== chain_id_prev) {
        c = new Chain(s, d.chain_id);
        s.addChild(c);
      }
      if (resi_id_prev == null || d.resi_id !== resi_id_prev) {
        r = new Residue(c, d.resi_name, d.resi_id);
        c.addChild(r);
        residues.push(r);
      }
      r.addChild(
        new Atom(r, d.atom_name, d.x, d.y, d.z, d.original_atom_name)
      );
      chain_id_prev = d.chain_id;
      resi_id_prev = d.resi_id;
    }

    // Assign secondary structure
    if (parsed.secondary_structure) {
      for (const ss of parsed.secondary_structure) {
        for (const res of residues) {
          if (
            res.parent.name === ss.chain_id &&
            res.resid >= ss.start_resi_id &&
            res.resid <= ss.end_resi_id
          ) {
            res.ss = ss.type;
          }
        }
      }
    }

    let resolvedInfo: AtomInfo;
    if (info != null) {
      resolvedInfo = info as AtomInfo;
    } else {
      resolvedInfo = defaultInfo();
      resolvedInfo.drawMethod = 'ribbon';
    }
    s.propogateInfo(resolvedInfo);
    if (this.structures_left_to_load != null) {
      if (--this.structures_left_to_load === 0) this.init();
    } else {
      this.init();
    }
  }

  loadFromData(
    data: string,
    filename: string,
    info: StructureLoadInfo | AtomInfo | null = null
  ): void {
    const extension = filename.split('.').pop()?.toLowerCase();
    let parsed: ParsedStructure;
    if (extension === 'cif' || extension === 'mmcif') {
      parsed = parseMmCIF(data);
    } else {
      parsed = parsePDB(data);
    }
    this.buildStructure(parsed, filename, info);
  }

  addNewStructure(
    filepath: string,
    info: StructureLoadInfo | AtomInfo | null = null
  ): void {
    fetch(filepath)
      .then((r) => r.text())
      .then((data) => this.loadFromData(data, filepath, info))
      .catch((err) => {
        console.error(`Failed to load structure from ${filepath}:`, err);
        alert(`Failed to load structure from ${filepath}`);
      });
  }

  loadFromDict(structuresToLoad: Record<string, StructureLoadInfo>): void {
    this.structures_left_to_load = 0;
    for (const _ in structuresToLoad) this.structures_left_to_load++;
    for (const [filepath, info] of Object.entries(structuresToLoad))
      this.addNewStructure(filepath, info);
  }

  // ---- Drawing ----

  drawAll(): void {
    this.clearCanvas();
    this.context.save();
    this.context.translate(this.x_origin, this.y_origin);
    this.context.scale(this.zoom, this.zoom);

    // Clear all highlights
    for (const el of this.elements) {
      const clear = (m: any) => {
        m.isHighlighted = false;
        for (const c of m.children) clear(c);
      };
      clear(el);
    }

    // Set active highlight
    if (this.a_prev) {
      const isPointsMode = ['points', 'both'].includes(
        this.a_prev.info.drawMethod
      );
      if (isPointsMode) {
        this.a_prev.isHighlighted = true;
      } else {
        this.a_prev.parent.isHighlighted = true; // Highlight residue
      }
    }

    for (const el of this.elements) el.draw();
    this.drawMeasureLine();
    this.context.restore();

    // Draw vignette
    if (this.isDarkBackground) {
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

  findBestZoom(): void {
    const avgs = this.avgCenterOfAllElements();
    for (const el of this.elements) el.translateTo(avgs);

    let max_dist = 0;
    for (const el of this.elements) {
      for (const a of el.atoms) {
        const d = Math.sqrt(a.x ** 2 + a.y ** 2 + a.z ** 2);
        if (d > max_dist) max_dist = d;
      }
    }
    const dim = Math.min(this.canvas.width, this.canvas.height);
    this.zoom = dim / 2.0 / (max_dist * 1.1);
    this.zoom_prev = this.zoom;
  }

  drawGridLines(): void {
    /* Optional: implement if needed */
  }

  changeAllDrawMethods(method: DrawMethod): void {
    for (const el of this.elements) el.propogateInfo({ drawMethod: method });
    this.clearCanvas();
    if (method !== 'points') this.findBonds();
    this.drawAll();
  }

  resize(width?: number, height?: number): void {
    // Use provided width/height, or client size if it's been set by CSS,
    // otherwise fallback to window dimensions for full-screen behavior.
    this.canvas.width =
      width ||
      (this.canvas.clientWidth > 300
        ? this.canvas.clientWidth
        : window.innerWidth);
    this.canvas.height =
      height ||
      (this.canvas.clientHeight > 150
        ? this.canvas.clientHeight
        : window.innerHeight);

    this.x_origin = this.canvas.width / 2;
    this.y_origin = this.canvas.height / 2;

    this.clearCanvas();
    if (this.elements.length > 0) {
      this.drawAll();
    }
  }

  /**
   * Opt-in to automatic resizing based on the window size.
   */
  autoResize(): CanvasContext {
    window.addEventListener('resize', () => this.resize());
    return this;
  }

  clearCanvas(): void {
    const ctx = this.context;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Draw cinematic radial gradient background
    const gradient = ctx.createRadialGradient(
      w / 2,
      h / 2,
      0,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.8
    );

    if (this.isDarkBackground) {
      gradient.addColorStop(0, '#1a1a1a');
      gradient.addColorStop(1, '#050505');
    } else {
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(1, '#f0f0f0');
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }

  private checkIsDark(color: string): boolean {
    const rgb = hexToRGBArray(color);
    // Simple luminance check
    return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 < 128;
  }

  clear(): void {
    this.elements = [];
    this.bonds = [];
    this.grid = {};
    this.clearCanvas();
  }

  setBackgroundColor(color: string): void {
    this.background_color = color;
    this.isDarkBackground = this.checkIsDark(color);
    this.canvas.style.backgroundColor = arrayToRGB(this.background_color);
    this.drawAll();
  }

  // ---- Interaction ----

  getAtomAt(clientX: number, clientY: number): Atom | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const gx = Math.round(x / 5);
    const gy = Math.round(y / 5);

    // Search a 3x3 grid area (15x15 pixels) for the closest atom
    let closestAtom: Atom | null = null;
    let minSqDist = Infinity;

    for (let ix = gx - 1; ix <= gx + 1; ix++) {
      for (let iy = gy - 1; iy <= gy + 1; iy++) {
        const a = this.grid[ix]?.[iy];
        if (a) {
          const ax = a.x * this.zoom + this.x_origin;
          const ay = a.y * this.zoom + this.y_origin;
          const sqDist = (x - ax) ** 2 + (y - ay) ** 2;
          if (sqDist < minSqDist) {
            minSqDist = sqDist;
            closestAtom = a;
          }
        }
      }
    }

    // Limit hit distance to ~25 pixels for ribbons
    if (minSqDist > 625) return null;

    return closestAtom;
  }

  handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
    const a = this.getAtomAt(e.clientX, e.clientY);
    if (a) {
      this.isMeasuring = true;
      this.measureStartAtom = a;
      this.measureEndAtom = null;
    } else {
      this.isMeasuring = false;
      this.measureStartAtom = null;
      this.measureEndAtom = null;
    }
    this.drawAll();
  }

  handleClick(e: MouseEvent): void {
    if (!this.isMeasuring) return;
    const a = this.getAtomAt(e.clientX, e.clientY);
    if (a) {
      if (a === this.measureStartAtom) {
        this.isMeasuring = false;
        this.measureStartAtom = null;
        this.measureEndAtom = null;
      } else {
        this.measureEndAtom = a;
      }
    } else {
      this.isMeasuring = false;
      this.measureStartAtom = null;
      this.measureEndAtom = null;
    }
    this.drawAll();
  }

  drawMeasureLine(): void {
    if (!this.measureStartAtom) return;

    const endAtom = this.measureEndAtom || this.a_prev;
    const targetX = endAtom ? endAtom.x : this.mouseX;
    const targetY = endAtom ? endAtom.y : this.mouseY;

    // Don't draw if target is exactly on start atom (initial state)
    if (endAtom === this.measureStartAtom) return;

    const ctx = this.context;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([5 / this.zoom, 5 / this.zoom]);
    ctx.moveTo(this.measureStartAtom.x, this.measureStartAtom.y);
    ctx.lineTo(targetX, targetY);
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 2 / this.zoom;
    ctx.stroke();
    ctx.setLineDash([]);

    if (endAtom) {
      const dist = atomAtomDistance(this.measureStartAtom, endAtom);
      const midX = (this.measureStartAtom.x + targetX) / 2;
      const midY = (this.measureStartAtom.y + targetY) / 2;

      ctx.fillStyle = '#ff3333';
      ctx.font = `bold ${14 / this.zoom}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.strokeStyle = 'white';
      ctx.lineWidth = 4 / this.zoom;
      ctx.strokeText(`${dist.toFixed(2)} Å`, midX, midY);
      ctx.fillText(`${dist.toFixed(2)} Å`, midX, midY);
    }

    ctx.restore();
  }

  mousedown(e: MouseEvent): void {
    this.mouse_x_prev = e.clientX;
    this.mouse_y_prev = e.clientY;
    const moveHandler = (ee: MouseEvent) => {
      const dx = ee.clientX - this.mouse_x_prev;
      const dy = ee.clientY - this.mouse_y_prev;
      for (const el of this.elements) {
        el.rotateAboutY(dx * 0.01);
        el.rotateAboutX(dy * 0.01);
      }
      this.mouse_x_prev = ee.clientX;
      this.mouse_y_prev = ee.clientY;
      this.drawAll();
    };
    const upHandler = () => {
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', upHandler);
      this.determinePointGrid();
    };
    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
  }

  touchstart(e: TouchEvent): void {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    this.mouse_x_prev = e.touches[0].clientX;
    this.mouse_y_prev = e.touches[0].clientY;
    const moveHandler = (ee: TouchEvent) => {
      const dx = ee.touches[0].clientX - this.mouse_x_prev;
      const dy = ee.touches[0].clientY - this.mouse_y_prev;
      for (const el of this.elements) {
        el.rotateAboutY(dx * 0.01);
        el.rotateAboutX(dy * 0.01);
      }
      this.mouse_x_prev = ee.touches[0].clientX;
      this.mouse_y_prev = ee.touches[0].clientY;
      this.drawAll();
    };
    const endHandler = () => {
      document.removeEventListener('touchmove', moveHandler);
      document.removeEventListener('touchend', endHandler);
      this.determinePointGrid();
    };
    document.addEventListener('touchmove', moveHandler, { passive: false });
    document.addEventListener('touchend', endHandler);
  }

  mouseup(_e: MouseEvent): void {}
  touchend(_e: TouchEvent): void {}
  touchmove(_e: TouchEvent): void {}
  mousemove(_e: MouseEvent): void {}

  iOSChangeZoom(e: any): void {
    e.preventDefault();
    const startZoom = this.zoom;
    const moveHandler = (ee: any) => {
      this.zoom = startZoom * ee.scale;
      this.drawAll();
    };
    const endHandler = () => {
      this.canvas.removeEventListener('gesturechange', moveHandler);
      this.canvas.removeEventListener('gestureend', endHandler);
      this.determinePointGrid();
    };
    this.canvas.addEventListener('gesturechange', moveHandler);
    this.canvas.addEventListener('gestureend', endHandler);
  }

  changeZoom(e: WheelEvent): void {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this.zoom *= delta;
    this.drawAll();
    this.determinePointGrid();
  }

  restoreToOriginal(): void {
    for (const el of this.elements) el.restoreToOriginal();
    this.findBestZoom();
    this.x_origin = this.canvas.width / 2;
    this.y_origin = this.canvas.height / 2;
    this.drawAll();
  }

  computeZExtent(): void {
    let min_z = Infinity,
      max_z = -Infinity;
    for (const el of this.elements) {
      for (const a of el.atoms) {
        if (a.z < min_z) min_z = a.z;
        if (a.z > max_z) max_z = a.z;
      }
    }
    this.z_extent = Math.max(Math.abs(min_z), Math.abs(max_z));
  }

  findBonds(): void {
    for (const el of this.elements) el.findBonds();
  }

  translateOrigin(e: MouseEvent): void {
    this.x_origin = e.clientX;
    this.y_origin = e.clientY;
    this.drawAll();
  }

  avgCenterOfAllElements(): [number, number, number] {
    const avgs: [number, number, number] = [0.0, 0.0, 0.0];
    let total_atoms = 0;
    for (const el of this.elements) {
      for (const a of el.atoms) {
        avgs[0] += a.x;
        avgs[1] += a.y;
        avgs[2] += a.z;
        total_atoms++;
      }
    }
    return avgs.map((v) => v / total_atoms) as [number, number, number];
  }

  timedRotation(axis: string, ms: number): void {
    this.stopRotation();
    this.delayID = setInterval(() => {
      for (const el of this.elements) {
        if (axis === 'X') el.rotateAboutX(0.025);
        if (axis === 'Y') el.rotateAboutY(0.025);
        if (axis === 'Z') el.rotateAboutZ(0.025);
      }
      this.drawAll();
    }, ms);
  }

  stopRotation(): void {
    if (this.delayID) {
      clearInterval(this.delayID);
      this.delayID = null;
      this.determinePointGrid();
    }
  }

  determinePointGrid(): void {
    this.grid = {};
    const addToGrid = (a: Atom, x: number, y: number, z: number) => {
      const gx = Math.round(x / 5);
      const gy = Math.round(y / 5);
      if (this.grid[gx] == null) this.grid[gx] = {};
      const existing = this.grid[gx][gy];
      if (existing == null || z > existing.z) this.grid[gx][gy] = a;
    };

    for (const el of this.elements) {
      // Add all atoms
      for (const a of el.atoms) {
        const ax = a.x * this.zoom + this.x_origin;
        const ay = a.y * this.zoom + this.y_origin;
        addToGrid(a, ax, ay, a.z);
      }

      // Add points along bonds to fill gaps for ribbons/lines
      for (const b of el.bonds) {
        const x1 = b.a1.x * this.zoom + this.x_origin;
        const y1 = b.a1.y * this.zoom + this.y_origin;
        const x2 = b.a2.x * this.zoom + this.x_origin;
        const y2 = b.a2.y * this.zoom + this.y_origin;

        const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const steps = Math.ceil(dist / 2); // Sample every 2 pixels
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          const px = x1 + (x2 - x1) * t;
          const py = y1 + (y2 - y1) * t;
          const pz = b.a1.z + (b.a2.z - b.a1.z) * t;

          // Assign to the closer atom for better residue info
          const atom = t < 0.5 ? b.a1 : b.a2;
          addToGrid(atom, px, py, pz);

          // Add offset points perpendicular to backbone for wide ribbons
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len > 0) {
            const nx = -dy / len;
            const ny = dx / len;
            // Widths are ~20px, so sample 5px and 10px out
            for (const offset of [-10, -5, 5, 10]) {
              addToGrid(atom, px + nx * offset, py + ny * offset, pz);
            }
          }
        }
      }
    }
  }

  showAtomInfo(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;

    this.mouseX = (canvasX - this.x_origin) / this.zoom;
    this.mouseY = (canvasY - this.y_origin) / this.zoom;

    const a = this.getAtomAt(e.clientX, e.clientY);
    const infoEl = document.getElementById('mol-info-display');

    if (a && a !== this.a_prev) {
      if (infoEl) {
        const res = a.parent;
        const chain = res.parent;
        const ssInfo = res.ss !== 'loop' ? ` (${res.ss})` : '';

        // Check the draw method from the atom to determine if we should show atom info
        const isPointsMode = ['points', 'both'].includes(a.info.drawMethod);

        let html = `Chain ${chain.name}: ${res.name} ${res.resid}${ssInfo}`;
        if (isPointsMode) {
          html += `<br>Atom: ${a.original_atom_name}`;
        }
        infoEl.innerHTML = html;
        infoEl.style.left = `${e.clientX + 15}px`;
        infoEl.style.top = `${e.clientY + 15}px`;
      }
      this.a_prev = a;
      this.drawAll();
    }
 else if (a && a === this.a_prev) {
      if (infoEl) {
        infoEl.style.left = `${e.clientX + 15}px`;
        infoEl.style.top = `${e.clientY + 15}px`;
      }
    } else if (!a) {
      if (infoEl) infoEl.innerHTML = '';
      if (this.a_prev !== null) {
        this.a_prev = null;
        this.drawAll();
      }
    }
  }

  assignSelectors(): void {
    for (let ne = 0; ne < this.elements.length; ne++) {
      const el = this.elements[ne];
      el.selector = new Selector([ne]);
      for (let nc = 0; nc < el.children.length; nc++) {
        const c = el.children[nc];
        c.selector = new Selector([ne, nc]);
        for (let nr = 0; nr < c.children.length; nr++) {
          const r = c.children[nr];
          r.selector = new Selector([ne, nc, nr]);
          for (let na = 0; na < r.children.length; na++) {
            r.children[na].selector = new Selector([ne, nc, nr, na]);
          }
        }
      }
    }
  }

  handleSelectorArg(s: string | Selector): Selector {
    return typeof s === 'string' ? new Selector(s) : s;
  }

  childFromSelector(selector: string | Selector): any {
    selector = this.handleSelectorArg(selector);
    let c: any = this;
    for (const i of (selector as Selector).array)
      c = c.elements != null ? c.elements[i] : c.children[i];
    return c;
  }

  changeInfoFromSelectors(
    selectors: string | Selector | Array<string | Selector>,
    info_key: keyof AtomInfo,
    info_value: string
  ): void {
    if (selectors === 'all') {
      selectors = this.elements.map((el) => el.selector!);
    } else if (!(selectors instanceof Array) || typeof selectors === 'string') {
      selectors = [selectors as string | Selector];
    }
    let last_c: any;
    for (let selector of selectors as Array<string | Selector>) {
      selector = this.handleSelectorArg(selector);
      try {
        const c = this.childFromSelector(selector);
        (c.info as any)[info_key] = info_value.toLowerCase();
        c.propogateInfo(c.info);
        last_c = c;
      } catch {
        console.warn(
          `Child from selector ${(selector as Selector).str} does not exist`
        );
      }
    }
    this.clearCanvas();
    if (last_c && last_c.info.drawMethod !== 'points') this.findBonds();
    this.drawAll();
  }

  writeContextInfo(): void {
    const el = document.getElementById('ctx-info');
    if (el)
      el.innerHTML = this.elements.map((e) => e.writeContextInfo()).join('');
  }

  /**
   * Factory method to initialize a new visualizer on a canvas.
   */
  static create(
    canvas_target: string | HTMLCanvasElement,
    background_color?: string
  ): CanvasContext {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const defaultBg = isDark ? '#111111' : '#ffffff';
    const cc = new CanvasContext(canvas_target, background_color || defaultBg);
    return cc;
  }
}

// Export for module systems if needed
if (typeof window !== 'undefined') {
  (window as any).CoffeeMol = CanvasContext;
}
