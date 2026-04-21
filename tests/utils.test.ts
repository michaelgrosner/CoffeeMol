import { describe, it, expect } from 'vitest';
import {
  summation,
  encodeHTML,
  hexToRGBArray,
  arrayToRGB,
  degToRad,
  radToDeg,
  rotateVecX,
  rotateVecY,
  rotateVecZ,
  deepCopy,
} from '../src/utils';

describe('Utils', () => {
  it('should sum an array of numbers', () => {
    expect(summation([1, 2, 3])).toBe(6);
    expect(summation([])).toBe(0);
    expect(summation([-1, 1])).toBe(0);
  });

  it('should encode HTML entities', () => {
    expect(encodeHTML('<div>')).toBe('&lt;div&gt;');
    expect(encodeHTML('no tags')).toBe('no tags');
  });

  it('should convert hex to RGB array', () => {
    expect(hexToRGBArray('FF0000')).toEqual([255, 0, 0]);
    expect(hexToRGBArray('0x00FF00')).toEqual([0, 255, 0]);
    expect(hexToRGBArray('#0000FF')).toEqual([0, 0, 255]);
    expect(hexToRGBArray([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('should convert array to RGB string', () => {
    expect(arrayToRGB([255, 0, 0])).toBe('rgb(255,0,0)');
    expect(arrayToRGB('#FF0000')).toBe('#FF0000');
    expect(arrayToRGB(null)).toMatch(/rgb\(\d+,\d+,\d+\)/);
    // Test clamping
    expect(arrayToRGB([300, -10, 100])).toBe('rgb(255,0,100)');
  });

  it('should convert degrees to radians and back', () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI);
    expect(radToDeg(Math.PI)).toBeCloseTo(180);
  });

  it('should rotate vectors', () => {
    const v: [number, number, number] = [1, 0, 0];
    const sin = Math.sin(Math.PI / 2);
    const cos = Math.cos(Math.PI / 2);

    // Rotate [1,0,0] 90 deg about Z should be [0,1,0]
    const vz = rotateVecZ(v, sin, cos);
    expect(vz[0]).toBeCloseTo(0);
    expect(vz[1]).toBeCloseTo(1);
    expect(vz[2]).toBe(0);

    // Rotate [1,0,0] 90 deg about Y should be [0,0,-1]
    const vy = rotateVecY(v, sin, cos);
    expect(vy[0]).toBeCloseTo(0);
    expect(vy[1]).toBe(0);
    expect(vy[2]).toBeCloseTo(-1);

    const v2: [number, number, number] = [0, 1, 0];
    // Rotate [0,1,0] 90 deg about X should be [0,0,1]
    const vx = rotateVecX(v2, sin, cos);
    expect(vx[0]).toBe(0);
    expect(vx[1]).toBeCloseTo(0);
    expect(vx[2]).toBeCloseTo(1);
  });

  it('should deep copy objects', () => {
    const obj = { a: 1, b: { c: 2 } };
    const copy = deepCopy(obj);
    expect(copy).toEqual(obj);
    expect(copy).not.toBe(obj);
    expect(copy.b).not.toBe(obj.b);
  });
});
