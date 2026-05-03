declare module "src/types" {
    export type RGB = [number, number, number];
    export type DrawMethod = 'both' | 'lines' | 'points' | 'cartoon' | 'ribbon' | 'tube' | 'surface';
    export type ColorMethod = 'cpk' | 'ss' | 'chain' | 'b-factor' | 'hydrophobicity' | 'formal-charge';
    export interface AtomInfo {
        drawMethod: DrawMethod;
        colorMethod?: ColorMethod;
        drawColor?: RGB | null;
    }
    export type AtomInfoUpdate = Omit<Partial<AtomInfo>, 'drawColor'> & {
        drawColor?: RGB | string | null;
    };
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
        serial: number;
        original_atom_name: string;
        atom_name: string;
        resi_name: string;
        chain_id: string;
        resi_id: number;
        x: number;
        y: number;
        z: number;
        tempFactor: number;
        isHetatm: boolean;
        occupancy?: number;
        element?: string;
        formalCharge?: number;
        model_id?: number;
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
        explicit_bonds?: [number, number][];
    }
    export interface ColorScheme {
        atom_colors: Record<string, RGB>;
        ss_colors: Record<SecondaryStructureType, RGB>;
        chain_colors: RGB[];
        hydrophobicity_scale: Record<string, number>;
        ramp_low?: RGB;
        ramp_high?: RGB;
        outline_weight?: number;
        glow_intensity?: number;
        background?: string;
        ribbon_color_method?: 'chain' | 'ss';
    }
    export const ATOM_SIZE = 3;
    export const DEBUG = true;
    export const nuc_acids: string[];
    export const supported_draw_methods: DrawMethod[];
    export const selector_delimiter = "/";
    export const atom_colors: Record<string, RGB>;
    export const atom_radii: Record<string, number>;
}
declare module "src/schemes" {
    import { ColorScheme } from "src/types";
    export const defaultColorScheme: ColorScheme;
    export const highContrastScheme: ColorScheme;
    export const nordScheme: ColorScheme;
    export const solarizedDarkScheme: ColorScheme;
    export const draculaScheme: ColorScheme;
    export const synthwave84Scheme: ColorScheme;
    export const gruvboxDarkScheme: ColorScheme;
    export const tokyoNightScheme: ColorScheme;
    export const oneDarkScheme: ColorScheme;
    export const coffeeScheme: ColorScheme;
    export const monochromeScheme: ColorScheme;
    export const neonScheme: ColorScheme;
    export const molokaiScheme: ColorScheme;
    export const modernScheme: ColorScheme;
    export const colorSchemes: Record<string, ColorScheme>;
}
declare module "src/utils" {
    import { RGB, DrawMethod, AtomInfo } from "src/types";
    export function summation(v: number[]): number;
    export function randomDrawMethod(): DrawMethod;
    export function defaultInfo(): AtomInfo;
    export function genIFSLink(selector_str: string, key: string, val: string, pretty: string): string;
    export function encodeHTML(s: string): string;
    export function hexToRGBArray(h: RGB | string): RGB;
    export function randomInt(maxInt: number): number;
    export function randomRGB(): RGB;
    export function arrayToRGB(a: RGB | string | null): string;
    export function degToRad(deg: number): number;
    export function radToDeg(rad: number): number;
    export function delay(ms: number, f: () => void): ReturnType<typeof setInterval>;
    export function deepCopy<T>(o: T): T;
    export function rotateVecX(v: [number, number, number], sin: number, cos: number): [number, number, number];
    export function rotateVecY(v: [number, number, number], sin: number, cos: number): [number, number, number];
    export function rotateVecZ(v: [number, number, number], sin: number, cos: number): [number, number, number];
    export function mousePosition(e: MouseEvent): {
        x: number;
        y: number;
    };
}
declare module "src/models" {
    import { RGB, AtomInfo, AtomInfoUpdate, SecondaryStructureType } from "src/types";
    export function sortBondsByZ(b1: Bond, b2: Bond): number;
    export function sortByZ(a1: Atom, a2: Atom): number;
    export function atomAtomDistance(a1: Atom, a2: Atom): number;
    export class Selector {
        str: string;
        array: number[];
        constructor(s?: string | number[] | null);
        right(): Selector;
        left(): Selector;
        down(): Selector;
        up(): Selector | null;
    }
    export class Bond {
        a1: Atom;
        a2: Atom;
        length: number;
        constructor(a1: Atom, a2: Atom);
        toString(): string;
        computeLength(): number;
        zCenter(): number;
    }
    export abstract class MolElement {
        parent: MolElement | null;
        name: string;
        children: MolElement[];
        info: AtomInfo;
        selector: Selector | null;
        cc: any;
        atoms: Atom[];
        bonds: Bond[];
        isHighlighted: boolean;
        explicit_bonds: [number, number][];
        constructor(parent: MolElement | null, name: string, cc?: any);
        abstract toString(): string;
        constructorName(): string;
        setHighlighted(val: boolean): void;
        /**
         * Lifecycle hook called when this element is added to a parent.
         */
        onAddedToParent(): void;
        writeContextInfo(): string;
        init(): void;
        addChild(child: MolElement): void;
        propogateInfo(info: AtomInfoUpdate): void;
        stashInfo(): void;
        retrieveStashedInfo(): void;
        getOfType<T extends MolElement>(type: new (...args: any[]) => T): T[];
        rotateAboutZ(theta: number): void;
        rotateAboutY(theta: number): void;
        rotateAboutX(theta: number): void;
        restoreToOriginal(): void;
        avgCenter(): [number, number, number];
        translateTo(center: [number, number, number]): void;
        findBonds(): void;
    }
    export class Structure extends MolElement {
        title: string | null;
        parent: null;
        constructor(name: string, cc: any);
        toString(): string;
        attachTitle(title: string): void;
    }
    export class Chain extends MolElement {
        parent: Structure;
        color: RGB;
        constructor(parent: Structure, name: string);
        onAddedToParent(): void;
        toString(): string;
    }
    export class Residue extends MolElement {
        resid: number;
        ss: SecondaryStructureType;
        isHetatm: boolean;
        parent: Chain;
        constructor(parent: Chain, name: string, id: number);
        toString(): string;
        isDNA(): boolean;
        isProtein(): boolean;
        typeName(): string;
        propogateInfo(info: AtomInfoUpdate): void;
    }
    export class Atom extends MolElement {
        x: number;
        y: number;
        z: number;
        tempFactor: number;
        isHetatm: boolean;
        original_atom_name: string;
        original_position: [number, number, number];
        parent: Residue;
        occupancy: number;
        element: string;
        formalCharge: number;
        model_id: number;
        serial: number;
        constructor(parent: Residue, name: string, x: number, y: number, z: number, original_atom_name: string, tempFactor?: number, isHetatm?: boolean, occupancy?: number, element?: string, formalCharge?: number, model_id?: number, serial?: number);
        toString(): string;
        propogateInfo(info: AtomInfoUpdate): void;
        cpkColor(): RGB;
        ssColor(): RGB;
        chainColor(): RGB;
        formalChargeColor(): RGB;
        bFactorColor(): RGB;
        hydrophobicityColor(): RGB;
        applyRotationY(sin: number, cos: number): void;
        applyRotationX(sin: number, cos: number): void;
        applyRotationZ(sin: number, cos: number): void;
        restoreToOriginal(): void;
        asArray(): [number, number, number];
    }
}
declare module "src/parser" {
    import { ParsedStructure } from "src/types";
    export function parsePDB(data: string): ParsedStructure;
    export function parseMmCIF(data: string): ParsedStructure;
}
declare module "src/renderers/renderer" {
    import { Structure, Atom, Bond } from "src/models";
    import { ColorScheme } from "src/types";
    export interface Renderer {
        init(canvas: HTMLCanvasElement): void;
        render(elements: Structure[], bonds: Bond[], options: RenderOptions): void;
        resize(width: number, height: number): void;
        setBackgroundColor(color: string): void;
        getAtomAt(x: number, y: number, zoom: number, x_origin: number, y_origin: number): Atom | null;
        clear(): void;
        dispose(): void;
    }
    export interface RenderOptions {
        zoom: number;
        x_origin: number;
        y_origin: number;
        colorScheme: ColorScheme;
        isDarkBackground: boolean;
        highlightedAtom: Atom | null;
        measureStartAtom: Atom | null;
        measureEndAtom: Atom | null;
        mouseX: number;
        mouseY: number;
        isInteracting: boolean;
    }
}
declare module "src/renderers/canvas2d" {
    import { Structure, Atom, Bond } from "src/models";
    import { Renderer, RenderOptions } from "src/renderers/renderer";
    export class Canvas2DRenderer implements Renderer {
        private canvas;
        private context;
        private grid;
        private z_extent;
        private _ribbonCache;
        private _ribbonSortBuffer;
        init(canvas: HTMLCanvasElement): void;
        render(elements: Structure[], bonds: Bond[], options: RenderOptions): void;
        private clearCanvas;
        private drawGridLines;
        private drawVignette;
        private drawStructure;
        private drawSurface;
        private drawLines;
        private getRibbonCache;
        private drawRibbons;
        private drawPoints;
        private drawAtomPoint;
        private drawAtomHighlight;
        private depthShadedColorString;
        private drawMeasureLine;
        private computeZExtent;
        private determinePointGrid;
        getAtomAt(x: number, y: number, zoom: number, x_origin: number, y_origin: number): Atom | null;
        resize(width: number, height: number): void;
        setBackgroundColor(color: string): void;
        clear(): void;
        dispose(): void;
    }
}
declare module "src/surface" {
    import { RGB } from "src/types";
    export interface SurfaceAtom {
        x: number;
        y: number;
        z: number;
        radius: number;
        color: RGB;
        ref?: unknown;
    }
    export interface SurfaceMesh {
        positions: Float32Array;
        normals: Float32Array;
        colors: Float32Array;
        indices: Uint32Array;
        vertexCount: number;
        triangleCount: number;
    }
    export interface SurfaceOptions {
        resolution?: number;
        isoLevel?: number;
        probeRadius?: number;
        vdwScale?: number;
        maxVoxels?: number;
    }
    /** Resolve an effective Gaussian radius for an atom. */
    export function effectiveRadius(element: string, vdwScale: number, probeRadius: number): number;
    /**
     * Build a Gaussian molecular surface mesh from a set of atoms. Returns null
     * for empty input. The mesh is expressed in the same coordinate frame as the
     * input atoms — callers are responsible for any further transform.
     */
    export function buildGaussianSurface(atoms: SurfaceAtom[], opts?: SurfaceOptions): SurfaceMesh | null;
}
declare module "src/renderers/threejs" {
    import { Structure, Atom, Bond } from "src/models";
    import { Renderer, RenderOptions } from "src/renderers/renderer";
    export class ThreeRenderer implements Renderer {
        private canvas;
        private scene;
        private camera;
        private renderer;
        private raycaster;
        private atomsGroup;
        private bondsGroup;
        private ribbonsGroup;
        private lightsGroup;
        private instancedAtomsList;
        private vignetteScene;
        private vignetteCamera;
        private vignetteMaterial;
        private toonGradient;
        private surfaceCache;
        init(canvas: HTMLCanvasElement): void;
        private setupToonGradient;
        private addCartoonOutline;
        private setupVignette;
        private setupLights;
        /**
         * Build (or reuse) the molecular surface mesh and add it to the scene.
         *
         * Heuristics for performance:
         *  - Skip the rebuild entirely while the user is dragging/zooming. Without
         *    this, even modestly-sized structures (~5k atoms) drop to single-digit
         *    fps because each frame triggers ~50ms of marching cubes. While we skip,
         *    we surface the source atoms as points so the molecule is still visible
         *    and the user has something to grab onto.
         *  - Reuse the cached mesh if a sampled position hash matches the last
         *    build — avoids rebuilding on color-only changes, hover events, or any
         *    redraw where atoms didn't move.
         */
        private renderSurface;
        render(elements: Structure[], bonds: Bond[], options: RenderOptions): void;
        private updateScene;
        private renderBonds;
        private renderInstancedBonds;
        private splitBySSType;
        private buildRibbons;
        private buildHelixRibbon;
        private buildSheetRibbon;
        resize(width: number, height: number): void;
        setBackgroundColor(color: string): void;
        getAtomAt(x: number, y: number, _zoom: number, _x_origin: number, _y_origin: number): Atom | null;
        clear(): void;
        dispose(): void;
        private disposeSurfaceCache;
    }
}
declare module "src/coffeemol" {
    import { AtomInfo, StructureLoadInfo, ParsedStructure, DrawMethod, ColorScheme } from "src/types";
    import { Structure, Atom, Bond, Selector } from "src/models";
    import { Renderer } from "src/renderers/renderer";
    export type RendererType = '2d' | '3d';
    export class CanvasContext {
        static colorSchemes: Record<string, ColorScheme>;
        canvas_target: string | HTMLCanvasElement;
        background_color: string;
        elements: Structure[];
        bonds: Bond[];
        canvas: HTMLCanvasElement;
        renderer: Renderer;
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
        isInteracting: boolean;
        private _pendingRaf;
        private _interactionTimer;
        constructor(canvas_target: string | HTMLCanvasElement, background_color?: string, rendererType?: RendererType);
        private attachListeners;
        setRenderer(type: RendererType): void;
        init(): void;
        addElement(el: Structure): void;
        loadNewStructure(filepath: string, info?: StructureLoadInfo | AtomInfo | null): void;
        buildStructure(parsed: ParsedStructure, filepath: string, info?: StructureLoadInfo | AtomInfo | null): void;
        loadFromData(data: string, filename: string, info?: StructureLoadInfo | AtomInfo | null): void;
        addNewStructure(filepath: string, info?: StructureLoadInfo | AtomInfo | null): void;
        loadFromDict(structuresToLoad: Record<string, StructureLoadInfo>): void;
        drawAll(): void;
        /**
         * Mark an interaction (drag/zoom/touch) as in progress. Renderers will drop
         * expensive effects until 200ms after the last call, at which point a final
         * full-quality redraw is scheduled.
         */
        private noteInteraction;
        private _doRender;
        findBestZoom(): void;
        changeAllDrawMethods(method: DrawMethod): void;
        resize(width?: number, height?: number): void;
        autoResize(): CanvasContext;
        clearCanvas(): void;
        private checkIsDark;
        clear(): void;
        setBackgroundColor(color: string): void;
        getAtomAt(clientX: number, clientY: number): Atom | null;
        handleContextMenu(e: MouseEvent): void;
        handleClick(e: MouseEvent): void;
        mousedown(e: MouseEvent): void;
        touchstart(e: TouchEvent): void;
        mouseup(_e: MouseEvent): void;
        touchend(_e: TouchEvent): void;
        touchmove(_e: TouchEvent): void;
        mousemove(_e: MouseEvent): void;
        iOSChangeZoom(e: any): void;
        changeZoom(e: WheelEvent): void;
        restoreToOriginal(): void;
        computeZExtent(): void;
        findBonds(): void;
        translateOrigin(e: MouseEvent): void;
        avgCenterOfAllElements(): [number, number, number];
        timedRotation(axis: string, ms: number): void;
        stopRotation(): void;
        showAtomInfo(e: MouseEvent): void;
        assignSelectors(): void;
        handleSelectorArg(s: string | Selector): Selector;
        childFromSelector(selector: string | Selector): any;
        changeInfoFromSelectors(selectors: string | Selector | Array<string | Selector>, info_key: keyof AtomInfo, info_value: string): void;
        writeContextInfo(): void;
        getState(): string;
        loadState(state: string | any): void;
        exportImage(scale?: number): string;
        setScheme(scheme: Partial<ColorScheme>): void;
        static create(canvas_target: string | HTMLCanvasElement, background_color?: string, rendererType?: RendererType): CanvasContext;
    }
}
declare module "tests/helpers" {
    import { Structure, Chain, Residue, Atom } from "src/models";
    import { RenderOptions } from "src/renderers/renderer";
    export function makeDummyCC(): any;
    export function makeCanvasMock(): {
        canvas: any;
        ctx: {
            clearRect: import("vitest").Mock<(...args: any[]) => any>;
            beginPath: import("vitest").Mock<(...args: any[]) => any>;
            moveTo: import("vitest").Mock<(...args: any[]) => any>;
            lineTo: import("vitest").Mock<(...args: any[]) => any>;
            quadraticCurveTo: import("vitest").Mock<(...args: any[]) => any>;
            stroke: import("vitest").Mock<(...args: any[]) => any>;
            fill: import("vitest").Mock<(...args: any[]) => any>;
            arc: import("vitest").Mock<(...args: any[]) => any>;
            setLineDash: import("vitest").Mock<(...args: any[]) => any>;
            save: import("vitest").Mock<(...args: any[]) => any>;
            restore: import("vitest").Mock<(...args: any[]) => any>;
            translate: import("vitest").Mock<(...args: any[]) => any>;
            scale: import("vitest").Mock<(...args: any[]) => any>;
            setTransform: import("vitest").Mock<(...args: any[]) => any>;
            createRadialGradient: import("vitest").Mock<() => {
                addColorStop: import("vitest").Mock<(...args: any[]) => any>;
            }>;
            createLinearGradient: import("vitest").Mock<() => {
                addColorStop: import("vitest").Mock<(...args: any[]) => any>;
            }>;
            fillRect: import("vitest").Mock<(...args: any[]) => any>;
            fillText: import("vitest").Mock<(...args: any[]) => any>;
            strokeText: import("vitest").Mock<(...args: any[]) => any>;
            closePath: import("vitest").Mock<(...args: any[]) => any>;
            clip: import("vitest").Mock<(...args: any[]) => any>;
            strokeStyle: string;
            fillStyle: string;
            lineWidth: number;
            lineCap: string;
            lineJoin: string;
            shadowBlur: number;
            shadowColor: string;
            shadowOffsetX: number;
            shadowOffsetY: number;
            globalAlpha: number;
            font: string;
            textAlign: string;
            textBaseline: string;
        };
        strokeStyles: string[];
        fillStyles: string[];
    };
    export function makeContextMocks(options?: {
        getBoundingClientRect?: () => object;
    }): {
        mockContext: {
            clearRect: import("vitest").Mock<(...args: any[]) => any>;
            save: import("vitest").Mock<(...args: any[]) => any>;
            restore: import("vitest").Mock<(...args: any[]) => any>;
            translate: import("vitest").Mock<(...args: any[]) => any>;
            scale: import("vitest").Mock<(...args: any[]) => any>;
            setTransform: import("vitest").Mock<(...args: any[]) => any>;
            beginPath: import("vitest").Mock<(...args: any[]) => any>;
            moveTo: import("vitest").Mock<(...args: any[]) => any>;
            lineTo: import("vitest").Mock<(...args: any[]) => any>;
            quadraticCurveTo: import("vitest").Mock<(...args: any[]) => any>;
            stroke: import("vitest").Mock<(...args: any[]) => any>;
            fill: import("vitest").Mock<(...args: any[]) => any>;
            arc: import("vitest").Mock<(...args: any[]) => any>;
            setLineDash: import("vitest").Mock<(...args: any[]) => any>;
            createRadialGradient: import("vitest").Mock<() => {
                addColorStop: import("vitest").Mock<(...args: any[]) => any>;
            }>;
            createLinearGradient: import("vitest").Mock<() => {
                addColorStop: import("vitest").Mock<(...args: any[]) => any>;
            }>;
            fillRect: import("vitest").Mock<(...args: any[]) => any>;
            fillText: import("vitest").Mock<(...args: any[]) => any>;
            strokeText: import("vitest").Mock<(...args: any[]) => any>;
            lineWidth: number;
            strokeStyle: string;
            fillStyle: string;
            lineCap: string;
            lineJoin: string;
            shadowBlur: number;
            shadowColor: string;
            font: string;
            textAlign: string;
            textBaseline: string;
            globalAlpha: number;
        };
        mockCanvas: {
            getBoundingClientRect?: import("vitest").Mock<() => object> | undefined;
            getContext: import("vitest").Mock<() => {
                clearRect: import("vitest").Mock<(...args: any[]) => any>;
                save: import("vitest").Mock<(...args: any[]) => any>;
                restore: import("vitest").Mock<(...args: any[]) => any>;
                translate: import("vitest").Mock<(...args: any[]) => any>;
                scale: import("vitest").Mock<(...args: any[]) => any>;
                setTransform: import("vitest").Mock<(...args: any[]) => any>;
                beginPath: import("vitest").Mock<(...args: any[]) => any>;
                moveTo: import("vitest").Mock<(...args: any[]) => any>;
                lineTo: import("vitest").Mock<(...args: any[]) => any>;
                quadraticCurveTo: import("vitest").Mock<(...args: any[]) => any>;
                stroke: import("vitest").Mock<(...args: any[]) => any>;
                fill: import("vitest").Mock<(...args: any[]) => any>;
                arc: import("vitest").Mock<(...args: any[]) => any>;
                setLineDash: import("vitest").Mock<(...args: any[]) => any>;
                createRadialGradient: import("vitest").Mock<() => {
                    addColorStop: import("vitest").Mock<(...args: any[]) => any>;
                }>;
                createLinearGradient: import("vitest").Mock<() => {
                    addColorStop: import("vitest").Mock<(...args: any[]) => any>;
                }>;
                fillRect: import("vitest").Mock<(...args: any[]) => any>;
                fillText: import("vitest").Mock<(...args: any[]) => any>;
                strokeText: import("vitest").Mock<(...args: any[]) => any>;
                lineWidth: number;
                strokeStyle: string;
                fillStyle: string;
                lineCap: string;
                lineJoin: string;
                shadowBlur: number;
                shadowColor: string;
                font: string;
                textAlign: string;
                textBaseline: string;
                globalAlpha: number;
            }>;
            addEventListener: import("vitest").Mock<(...args: any[]) => any>;
            toDataURL: import("vitest").Mock<() => string>;
            style: {};
            width: number;
            height: number;
            clientWidth: number;
            clientHeight: number;
        };
    };
    export function stubCanvasGlobals(mockCanvas: any): void;
    export function makeStructure(cc: any, atomDefs?: {
        name: string;
        x: number;
        y: number;
        z: number;
        originalName: string;
        tempFactor?: number;
        isHetatm?: boolean;
    }[]): {
        s: Structure;
        c: Chain;
        r: Residue;
        atoms: Atom[];
    };
    export function makeBaseRenderOptions(overrides?: Partial<RenderOptions>): RenderOptions;
}
declare module "tests/canvas2d.test" { }
declare module "tests/coffeemol.test" { }
declare module "tests/hetatm.test" { }
declare module "tests/interaction.test" { }
declare module "tests/models.test" { }
declare module "tests/parser.test" { }
declare module "tests/surface.test" { }
declare module "tests/threejs.test" { }
declare module "tests/utils.test" { }
