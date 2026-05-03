import { describe, it, expect } from 'vitest';
import { buildGaussianSurface, effectiveRadius, SurfaceAtom } from '../src/surface';

function atom(x: number, y: number, z: number, radius = 2.0, color: [number, number, number] = [128, 128, 128]): SurfaceAtom {
  return { x, y, z, radius, color };
}

describe('buildGaussianSurface', () => {
  it('returns null for empty input', () => {
    expect(buildGaussianSurface([])).toBeNull();
  });

  it('produces a closed mesh for a single atom (ought to be roughly a sphere)', () => {
    const mesh = buildGaussianSurface([atom(0, 0, 0, 2.5)], { resolution: 0.5 })!;
    expect(mesh).not.toBeNull();
    expect(mesh.vertexCount).toBeGreaterThan(50);
    expect(mesh.triangleCount).toBeGreaterThan(50);
    // Buffer sizes should match the reported counts.
    expect(mesh.positions.length).toBe(mesh.vertexCount * 3);
    expect(mesh.normals.length).toBe(mesh.vertexCount * 3);
    expect(mesh.colors.length).toBe(mesh.vertexCount * 3);
    expect(mesh.indices.length).toBe(mesh.triangleCount * 3);
  });

  it('emits more triangles for a larger atom set', () => {
    const small = buildGaussianSurface([atom(0, 0, 0, 2.5)], { resolution: 0.7 })!;
    const large = buildGaussianSurface(
      [atom(0, 0, 0, 2.5), atom(5, 0, 0, 2.5), atom(0, 5, 0, 2.5), atom(0, 0, 5, 2.5)],
      { resolution: 0.7 }
    )!;
    expect(large.triangleCount).toBeGreaterThan(small.triangleCount);
  });

  it('all vertex normals are unit length (or near-zero in degenerate spots)', () => {
    const mesh = buildGaussianSurface(
      [atom(0, 0, 0, 2.5), atom(3, 0, 0, 2.5)],
      { resolution: 0.5 }
    )!;
    const n = mesh.normals;
    for (let i = 0; i < mesh.vertexCount; i++) {
      const nx = n[i * 3], ny = n[i * 3 + 1], nz = n[i * 3 + 2];
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      // Either unit-length (analytic gradient normalized) or zero (degenerate).
      expect(len === 0 || Math.abs(len - 1) < 1e-3).toBe(true);
    }
  });

  it('vertex colors take values from the nearest atom', () => {
    const red:  [number, number, number] = [255, 0, 0];
    const blue: [number, number, number] = [0, 0, 255];
    const mesh = buildGaussianSurface(
      [atom(-5, 0, 0, 2.0, red), atom(5, 0, 0, 2.0, blue)],
      { resolution: 0.7 }
    )!;
    // Find a vertex on each side and check it picked up the right color.
    let foundRedSide = false;
    let foundBlueSide = false;
    for (let i = 0; i < mesh.vertexCount; i++) {
      const x = mesh.positions[i * 3];
      const r = mesh.colors[i * 3];
      const b = mesh.colors[i * 3 + 2];
      // Far on the red side: vertex x < -3
      if (x < -3 && r > 0.8 && b < 0.2) foundRedSide = true;
      // Far on the blue side: vertex x > 3
      if (x > 3 && b > 0.8 && r < 0.2) foundBlueSide = true;
    }
    expect(foundRedSide).toBe(true);
    expect(foundBlueSide).toBe(true);
  });

  it('vertices lie within a sane bounding box around the input atoms', () => {
    const mesh = buildGaussianSurface(
      [atom(0, 0, 0, 2.5), atom(10, 0, 0, 2.5)],
      { resolution: 0.7 }
    )!;
    // Surface should span roughly from −5Å to +15Å in X (atom centers ± a few Å of kernel reach).
    let minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < mesh.vertexCount; i++) {
      const x = mesh.positions[i * 3];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    expect(minX).toBeGreaterThan(-15);
    expect(maxX).toBeLessThan(25);
    expect(maxX - minX).toBeGreaterThan(8);
  });

  it('coarsens resolution to respect maxVoxels for very large structures', () => {
    // Set an absurdly small maxVoxels — ensures the safety knob actually fires
    // instead of running out of memory on a request the user didn't realize was huge.
    const atoms: SurfaceAtom[] = [];
    for (let i = 0; i < 50; i++) {
      atoms.push(atom(i * 5, 0, 0, 2.5));
    }
    // Without coarsening, a 0.3Å grid spanning ~250Å would be ~833³ ≈ 580M voxels.
    const mesh = buildGaussianSurface(atoms, { resolution: 0.3, maxVoxels: 100_000 });
    expect(mesh).not.toBeNull();
    // Still produces *some* mesh.
    expect(mesh!.vertexCount).toBeGreaterThan(0);
  });
});

describe('effectiveRadius', () => {
  it('is monotonic in vdwScale', () => {
    const r1 = effectiveRadius('C', 1.0, 1.4);
    const r2 = effectiveRadius('C', 2.0, 1.4);
    expect(r2).toBeGreaterThan(r1);
  });

  it('adds the probe radius linearly', () => {
    const r0 = effectiveRadius('C', 1.0, 0.0);
    const r1 = effectiveRadius('C', 1.0, 1.4);
    expect(r1 - r0).toBeCloseTo(1.4, 6);
  });

  it('falls back to scale 1.0 for unknown elements', () => {
    const known = effectiveRadius('C', 1.0, 1.4);
    const unknown = effectiveRadius('XQ', 1.0, 1.4);
    // Unknown element uses relative radius 1.0 (= carbon-equivalent), so it
    // should match carbon exactly here.
    expect(unknown).toBeCloseTo(known, 6);
  });
});
