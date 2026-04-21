'use strict';

import { RGB, DEBUG, DrawMethod, supported_draw_methods, AtomInfo } from './types';

export function summation(v: number[]): number {
    let r = 0;
    for (const x of v) r += x;
    return r;
}

export function randomDrawMethod(): DrawMethod { return supported_draw_methods[randomInt(supported_draw_methods.length)]; }
export function defaultInfo(): AtomInfo { return { drawMethod: randomDrawMethod() }; }

export function genIFSLink(selector_str: string, key: string, val: string, pretty: string): string {
    const link = `javascript:window.coffeemol.changeInfoFromSelectors('${selector_str}', '${key}', '${val}');`;
    return `<div class='dropdown-option'><a href="${link}">${pretty}</a></div>`;
}

export function encodeHTML(s: string): string {
    return s.replace("<", "&lt;").replace(">", "&gt;");
}

export function hexToRGBArray(h: RGB | string): RGB {
    if (Array.isArray(h)) return h as RGB;
    if (h.startsWith("0x")) h = h.substring(2);
    return [0, 2, 4].map(i => parseInt(h.substring(i, i + 2), 16)) as RGB;
}

export function randomInt(maxInt: number): number { return Math.floor(Math.random() * maxInt); }
export function randomRGB(): RGB { return [randomInt(255), randomInt(255), randomInt(255)]; }

export function arrayToRGB(a: RGB | string | null): string {
    if (typeof a === 'string') {
        if (a.startsWith("#")) return a;
        alert("Improperly formatted string -> color. Must be of the form #XXXXXX");
    }
    if (a == null) {
        a = randomRGB();
        if (DEBUG) console.warn(`No color defined for ${(a as RGB).toString()}. Using a random color`);
    }
    if ((a as RGB).length !== 3) alert(`Array To RGB must be of length 3, it is length ${(a as RGB).length}: ${a}`);
    const fixer = (c: number) => Math.round(c > 255 ? 255 : c < 0 ? 0 : c);
    const rgb = (a as RGB).map(fixer) as RGB;
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

export function degToRad(deg: number): number { return deg * 0.0174532925; }
export function radToDeg(rad: number): number { return rad * 57.2957795; }
export function delay(ms: number, f: () => void): ReturnType<typeof setInterval> { return setInterval(f, ms); }

export function deepCopy<T>(o: T): T { return structuredClone(o); }

export function rotateVecX(v: [number, number, number], sin: number, cos: number): [number, number, number] {
    return [v[0], v[1] * cos - v[2] * sin, v[1] * sin + v[2] * cos];
}
export function rotateVecY(v: [number, number, number], sin: number, cos: number): [number, number, number] {
    return [v[0] * cos + v[2] * sin, v[1], -v[0] * sin + v[2] * cos];
}
export function rotateVecZ(v: [number, number, number], sin: number, cos: number): [number, number, number] {
    return [v[0] * cos - v[1] * sin, v[0] * sin + v[1] * cos, v[2]];
}

export function mousePosition(e: MouseEvent): { x: number; y: number } { return { x: e.offsetX, y: e.offsetY }; }
