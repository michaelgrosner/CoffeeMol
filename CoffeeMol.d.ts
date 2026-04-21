declare module "src/types" {
    export type RGB = [number, number, number];
    export type DrawMethod = 'both' | 'lines' | 'points' | 'cartoon' | 'ribbon' | 'tube';
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
    }
    export const ATOM_SIZE = 3;
    export const DEBUG = true;
    export const nuc_acids: string[];
    export const supported_draw_methods: DrawMethod[];
    export const selector_delimiter = "/";
    export const atom_colors: Record<string, RGB>;
    export const atom_radii: Record<string, number>;
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
    import { RGB, AtomInfo, SecondaryStructureType } from "src/types";
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
        constructor(parent: MolElement | null, name: string, cc?: any);
        abstract toString(): string;
        constructorName(): string;
        /**
         * Lifecycle hook called when this element is added to a parent.
         */
        onAddedToParent(): void;
        writeContextInfo(): string;
        init(): void;
        addChild(child: MolElement): void;
        propogateInfo(info: AtomInfo): void;
        stashInfo(): void;
        retrieveStashedInfo(): void;
        getOfType<T extends MolElement>(type: new (...args: any[]) => T): T[];
        draw(): void;
        drawLines(): void;
        drawRibbons(): void;
        drawPoints(): void;
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
        parent: Chain;
        constructor(parent: Chain, name: string, id: number);
        toString(): string;
        isDNA(): boolean;
        isProtein(): boolean;
        typeName(): string;
    }
    export class Atom extends MolElement {
        x: number;
        y: number;
        z: number;
        original_atom_name: string;
        original_position: [number, number, number];
        parent: Residue;
        constructor(parent: Residue, name: string, x: number, y: number, z: number, original_atom_name: string);
        toString(): string;
        cpkColor(): RGB;
        ssColor(): RGB;
        chainColor(): RGB;
        depthShadedColorString(colorType?: 'cpk' | 'ss' | 'chain', brightnessOffset?: number): string;
        drawPoint(): void;
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
declare module "src/coffeemol" {
    import { AtomInfo, StructureLoadInfo, ParsedStructure, DrawMethod } from "src/types";
    import { Structure, Atom, Bond, Selector } from "src/models";
    export class CanvasContext {
        canvas_target: string | HTMLCanvasElement;
        background_color: string;
        elements: Structure[];
        bonds: Bond[];
        grid: Record<number, Record<number, Atom | null>>;
        canvas: HTMLCanvasElement;
        context: CanvasRenderingContext2D;
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
        constructor(canvas_target: string | HTMLCanvasElement, background_color?: string);
        init(): void;
        addElement(el: Structure): void;
        loadNewStructure(filepath: string, info?: StructureLoadInfo | AtomInfo | null): void;
        buildStructure(parsed: ParsedStructure, filepath: string, info?: StructureLoadInfo | AtomInfo | null): void;
        loadFromData(data: string, filename: string, info?: StructureLoadInfo | AtomInfo | null): void;
        addNewStructure(filepath: string, info?: StructureLoadInfo | AtomInfo | null): void;
        loadFromDict(structuresToLoad: Record<string, StructureLoadInfo>): void;
        drawAll(): void;
        findBestZoom(): void;
        drawGridLines(): void;
        changeAllDrawMethods(method: DrawMethod): void;
        resize(width?: number, height?: number): void;
        /**
         * Opt-in to automatic resizing based on the window size.
         */
        autoResize(): CanvasContext;
        clearCanvas(): void;
        private checkIsDark;
        clear(): void;
        setBackgroundColor(color: string): void;
        getAtomAt(x: number, y: number): Atom | null;
        handleContextMenu(e: MouseEvent): void;
        handleClick(e: MouseEvent): void;
        drawMeasureLine(): void;
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
        determinePointGrid(): void;
        showAtomInfo(e: MouseEvent): void;
        assignSelectors(): void;
        handleSelectorArg(s: string | Selector): Selector;
        childFromSelector(selector: string | Selector): any;
        changeInfoFromSelectors(selectors: string | Selector | Array<string | Selector>, info_key: keyof AtomInfo, info_value: string): void;
        writeContextInfo(): void;
        /**
         * Factory method to initialize a new visualizer on a canvas.
         */
        static create(canvas_target: string | HTMLCanvasElement, background_color?: string): CanvasContext;
    }
}
declare module "tests/models.test" { }
declare module "tests/parser.test" { }
