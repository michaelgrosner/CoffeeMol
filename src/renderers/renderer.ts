import { Structure, Atom, Bond } from '../models';
import { ColorScheme, DrawMethod } from '../types';

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
}
