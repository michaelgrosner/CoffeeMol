'use strict';

import {
  AtomInfo,
  StructureLoadInfo,
  ParsedStructure,
  DrawMethod,
  ColorScheme,
} from './types';
import { defaultColorScheme, colorSchemes } from './schemes';
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
import { Renderer, RenderOptions } from './renderers/renderer';
import { Canvas2DRenderer } from './renderers/canvas2d';
import { ThreeRenderer } from './renderers/threejs';

export type RendererType = '2d' | '3d';

export class CanvasContext {
  static colorSchemes = colorSchemes;
  canvas_target: string | HTMLCanvasElement;
  background_color: string;
  elements: Structure[];
  bonds: Bond[];
  canvas!: HTMLCanvasElement;
  renderer!: Renderer;
  rendererType: RendererType;
  
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
  colorScheme: ColorScheme;
  isInteracting: boolean = false;
  private _pendingRaf: number | null = null;
  private _interactionTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    canvas_target: string | HTMLCanvasElement,
    background_color: string = '#ffffff',
    rendererType: RendererType = '2d'
  ) {
    this.canvas_target = canvas_target;
    this.background_color = background_color;
    this.rendererType = rendererType;
    this.isDarkBackground = this.checkIsDark(background_color);
    this.colorScheme = { ...defaultColorScheme };
    this.elements = [];
    this.bonds = [];
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
      this.attachListeners();
      this.setRenderer(rendererType);
    } catch (error) {
      alert(`Failed to initialize CoffeeMol: ${error}`);
      throw error;
    }

    // Initial origins
    this.x_origin = this.canvas.width / 2;
    this.y_origin = this.canvas.height / 2;
  }

  private attachListeners(): void {
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
  }

  setRenderer(type: RendererType): void {
    if (this.renderer) {
      this.renderer.dispose();
      
      // A canvas can only have one type of context (2d or webgl) for its lifetime.
      // We must replace the canvas element to switch context types.
      const newCanvas = document.createElement('canvas');
      
      // Copy attributes and styles
      if (this.canvas.id) newCanvas.id = this.canvas.id;
      if (this.canvas.className) newCanvas.className = this.canvas.className;
      newCanvas.style.cssText = this.canvas.style.cssText;
      
      const clientWidth = this.canvas.clientWidth;
      const clientHeight = this.canvas.clientHeight;
      newCanvas.width = clientWidth;
      newCanvas.height = clientHeight;
      
      this.x_origin = clientWidth / 2;
      this.y_origin = clientHeight / 2;
      
      if (this.canvas.parentNode) {
        this.canvas.parentNode.replaceChild(newCanvas, this.canvas);
      }
      
      this.canvas = newCanvas;
      this.attachListeners();
    }

    this.rendererType = type;
    this.renderer = type === '3d' ? new ThreeRenderer() : new Canvas2DRenderer();
    this.renderer.init(this.canvas);
    this.renderer.setBackgroundColor(this.background_color);
  }

  // ---- Loading ----

  init(): void {
    for (const el of this.elements) el.init();
    this.findBonds();
    this.assignSelectors();
    this.restoreToOriginal();
    this.computeZExtent();
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
      if (d.isHetatm) {
        r.isHetatm = true;
      }
      r.addChild(
        new Atom(
          r,
          d.atom_name,
          d.x,
          d.y,
          d.z,
          d.original_atom_name,
          d.tempFactor,
          d.isHetatm
        )
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

    // Default HETATM residues to 'both' (points+lines) mode
    for (const res of residues) {
      if (res.isHetatm) {
        res.propogateInfo({ drawMethod: 'both' });
      }
    }
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
    if (this._pendingRaf !== null) return;
    // Sentinel prevents re-entry; works correctly even when RAF fires synchronously
    // (e.g. in Node test environments where requestAnimationFrame is not available).
    this._pendingRaf = -1;

    const schedule = typeof requestAnimationFrame !== 'undefined'
      ? requestAnimationFrame
      : (cb: (ts: number) => void) => { cb(0); return 0; };

    schedule(() => {
      this._pendingRaf = null;
      this._doRender();
    });
  }

  /**
   * Mark an interaction (drag/zoom/touch) as in progress. Renderers will drop
   * expensive effects until 200ms after the last call, at which point a final
   * full-quality redraw is scheduled.
   */
  private noteInteraction(): void {
    this.isInteracting = true;
    if (this._interactionTimer !== null) clearTimeout(this._interactionTimer);
    this._interactionTimer = setTimeout(() => {
      this.isInteracting = false;
      this._interactionTimer = null;
      this.drawAll();
    }, 200);
  }

  private _doRender(): void {
    const options: RenderOptions = {
      zoom: this.zoom,
      x_origin: this.x_origin,
      y_origin: this.y_origin,
      colorScheme: this.colorScheme,
      isDarkBackground: this.isDarkBackground,
      highlightedAtom: this.a_prev,
      measureStartAtom: this.measureStartAtom,
      measureEndAtom: this.measureEndAtom,
      mouseX: this.mouseX,
      mouseY: this.mouseY,
      isInteracting: this.isInteracting,
    };

    for (const el of this.elements) {
      const clear = (m: any) => {
        m.isHighlighted = false;
        for (const c of m.children) clear(c);
      };
      clear(el);
    }

    if (this.a_prev) {
      const isPointsMode = ['points', 'both'].includes(this.a_prev.info.drawMethod);
      if (isPointsMode) {
        this.a_prev.isHighlighted = true;
      } else {
        this.a_prev.parent.isHighlighted = true;
      }
    }

    this.renderer.render(this.elements, this.bonds, options);
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

  changeAllDrawMethods(method: DrawMethod): void {
    for (const el of this.elements) el.propogateInfo({ drawMethod: method });
    this.renderer.clear();
    if (method !== 'points') this.findBonds();
    this.drawAll();
  }

  resize(width?: number, height?: number): void {
    const clientWidth = width || (this.canvas.clientWidth > 300 ? this.canvas.clientWidth : window.innerWidth);
    const clientHeight = height || (this.canvas.clientHeight > 150 ? this.canvas.clientHeight : window.innerHeight);

    this.canvas.width = clientWidth;
    this.canvas.height = clientHeight;

    this.x_origin = clientWidth / 2;
    this.y_origin = clientHeight / 2;

    this.renderer.resize(clientWidth, clientHeight);
    
    if (this.elements.length > 0) {
      this.drawAll();
    }
  }

  autoResize(): CanvasContext {
    window.addEventListener('resize', () => this.resize());
    return this;
  }

  clearCanvas(): void {
    this.renderer.clear();
  }

  private checkIsDark(color: string): boolean {
    const rgb = hexToRGBArray(color);
    return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 < 128;
  }

  clear(): void {
    this.elements = [];
    this.bonds = [];
    this.renderer.clear();
  }

  setBackgroundColor(color: string): void {
    this.background_color = color;
    this.isDarkBackground = this.checkIsDark(color);
    this.canvas.style.backgroundColor = arrayToRGB(this.background_color);
    this.renderer.setBackgroundColor(this.background_color);
    this.drawAll();
  }

  // ---- Interaction ----

  getAtomAt(clientX: number, clientY: number): Atom | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    return this.renderer.getAtomAt(x, y, this.zoom, this.x_origin, this.y_origin);
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

  mousedown(e: MouseEvent): void {
    this.noteInteraction();
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
      this.noteInteraction();
      this.drawAll();
    };
    const upHandler = () => {
      document.removeEventListener('mousemove', moveHandler);
      document.removeEventListener('mouseup', upHandler);
    };
    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
  }

  touchstart(e: TouchEvent): void {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    this.noteInteraction();
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
      this.noteInteraction();
      this.drawAll();
    };
    const endHandler = () => {
      document.removeEventListener('touchmove', moveHandler);
      document.removeEventListener('touchend', endHandler);
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
    this.noteInteraction();
    const startZoom = this.zoom;
    const moveHandler = (ee: any) => {
      this.zoom = startZoom * ee.scale;
      this.noteInteraction();
      this.drawAll();
    };
    const endHandler = () => {
      this.canvas.removeEventListener('gesturechange', moveHandler);
      this.canvas.removeEventListener('gestureend', endHandler);
    };
    this.canvas.addEventListener('gesturechange', moveHandler);
    this.canvas.addEventListener('gestureend', endHandler);
  }

  changeZoom(e: WheelEvent): void {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this.zoom *= delta;
    this.noteInteraction();
    this.drawAll();
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
    }
  }

  showAtomInfo(e: MouseEvent): void {
    if (this.isInteracting) return;

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
    this.renderer.clear();
    if (last_c && last_c.info.drawMethod !== 'points') this.findBonds();
    this.drawAll();
  }

  writeContextInfo(): void {
    const el = document.getElementById('ctx-info');
    if (el)
      el.innerHTML = this.elements.map((e) => e.writeContextInfo()).join('');
  }

  getState(): string {
    const state = {
      zoom: this.zoom,
      x_origin: this.x_origin,
      y_origin: this.y_origin,
      background_color: this.background_color,
      colorScheme: this.colorScheme,
      structures: this.elements.map((s) => ({
        name: s.name,
        info: s.info,
        atomPositions: s.atoms.map((a) => [a.x, a.y, a.z]),
      })),
    };
    return JSON.stringify(state);
  }

  loadState(state: string | any): void {
    const s = typeof state === 'string' ? JSON.parse(state) : state;
    if (s.zoom) this.zoom = s.zoom;
    if (s.x_origin) this.x_origin = s.x_origin;
    if (s.y_origin) this.y_origin = s.y_origin;
    if (s.background_color) this.setBackgroundColor(s.background_color);
    if (s.colorScheme) this.colorScheme = { ...s.colorScheme };

    if (s.structures) {
      for (let i = 0; i < s.structures.length; i++) {
        if (this.elements[i]) {
          const structState = s.structures[i];
          if (structState.info) {
            this.elements[i].propogateInfo(structState.info);
          }
          if (structState.atomPositions) {
            for (let j = 0; j < structState.atomPositions.length; j++) {
              if (this.elements[i].atoms[j]) {
                const pos = structState.atomPositions[j];
                this.elements[i].atoms[j].x = pos[0];
                this.elements[i].atoms[j].y = pos[1];
                this.elements[i].atoms[j].z = pos[2];
              }
            }
          }
        }
      }
    }
    this.drawAll();
    this.writeContextInfo();
  }

  exportImage(scale: number = 2): string {
    const originalCanvas = this.canvas;
    
    // For now, let's just use the current canvas for exportImage as a limitation.
    // High-res export requires re-rendering at larger scale which is renderer-dependent.
    return originalCanvas.toDataURL('image/png');
  }

  setScheme(scheme: Partial<ColorScheme>): void {
    this.colorScheme = { ...this.colorScheme, ...scheme };
    if (this.colorScheme.background) {
      this.setBackgroundColor(this.colorScheme.background);
    }
    for (const s of this.elements) {
      for (const c of s.children) {
        if (c instanceof Chain) {
          c.onAddedToParent();
        }
      }
    }
    this.drawAll();
  }

  static create(
    canvas_target: string | HTMLCanvasElement,
    background_color?: string,
    rendererType: RendererType = '2d'
  ): CanvasContext {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const defaultBg = isDark ? '#111111' : '#ffffff';
    const cc = new CanvasContext(canvas_target, background_color || defaultBg, rendererType);
    return cc;
  }
}

if (typeof window !== 'undefined') {
  (window as any).CoffeeMol = CanvasContext;
}
