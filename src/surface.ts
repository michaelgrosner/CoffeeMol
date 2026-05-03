'use strict';

// Gaussian molecular surface (a smooth approximation to the Solvent-Accessible
// Surface) extracted via Marching Cubes from a 3D density field.
//
// The density is built by splatting one Gaussian per atom into a uniform grid:
//
//   ρ(p) = Σ_atoms exp(-( |p - A|² / r² ))
//
// where r = (vdW_radius * vdwScale + probeRadius). Each atom only writes into
// voxels within a small kernel (≤ KERNEL_SIGMA × r), keeping splat cost
// proportional to atom count rather than grid volume. The isosurface is then
// extracted at a fixed density threshold using standard Marching Cubes.
//
// Vertex normals are computed analytically as the gradient of the density
// field, which is much smoother than face-normal averaging and key to making
// the surface look polished rather than faceted.
//
// Per-vertex colors come from a nearest-atom lookup via a flat uniform grid
// (the same idea as the splat grid but with a different cell size).

import { atom_radii, RGB } from './types';

export interface SurfaceAtom {
  x: number;
  y: number;
  z: number;
  // Effective radius in Å for the kernel (vdW * scale + probe).
  radius: number;
  // RGB color for the atom (already resolved by colorMethod).
  color: RGB;
  // Optional opaque payload — used by callers to map vertex → source atom.
  ref?: unknown;
}

export interface SurfaceMesh {
  positions: Float32Array;  // [x,y,z, x,y,z, ...]
  normals:   Float32Array;
  colors:    Float32Array;  // [r,g,b, ...] in [0,1]
  indices:   Uint32Array;
  vertexCount: number;
  triangleCount: number;
}

export interface SurfaceOptions {
  // Voxel size in Å. Smaller = smoother but quadratically slower.
  // If omitted, picked adaptively based on atom count and bbox.
  resolution?: number;
  // Density value at which the isosurface is extracted.
  isoLevel?: number;
  // Probe radius (Å) added to each atom's vdW radius. 1.4Å ≈ water.
  probeRadius?: number;
  // Multiplier on the base vdW radius — tunes how "blobby" the surface is.
  vdwScale?: number;
  // Cap total grid voxels to avoid OOM on huge structures. The resolution
  // gets coarsened until the grid fits.
  maxVoxels?: number;
}

const DEFAULTS = {
  resolution: 1.2,
  isoLevel: 0.5,
  probeRadius: 1.4,
  vdwScale: 1.0,
  maxVoxels: 6_000_000,
} as const;

// Atom Gaussians fall off fast — beyond ~2.6σ we contribute < 0.001 and can
// safely skip writing. This dominates splat cost so keeping it tight matters.
const KERNEL_SIGMA = 2.6;

// Neighborhood radius (in cells) for nearest-atom color lookup. Two cells is
// enough since each cell is sized to contain at least the largest atom radius.
const COLOR_LOOKUP_RADIUS = 2;

// Carbon vdW radius in Å (the unit for `atom_radii` table values).
const CARBON_VDW = 1.7;

/** Resolve an effective Gaussian radius for an atom. */
export function effectiveRadius(
  element: string,
  vdwScale: number,
  probeRadius: number
): number {
  const rel = atom_radii[element] ?? 1.0;
  return rel * CARBON_VDW * vdwScale + probeRadius;
}

/**
 * Build a Gaussian molecular surface mesh from a set of atoms. Returns null
 * for empty input. The mesh is expressed in the same coordinate frame as the
 * input atoms — callers are responsible for any further transform.
 */
export function buildGaussianSurface(
  atoms: SurfaceAtom[],
  opts: SurfaceOptions = {}
): SurfaceMesh | null {
  if (atoms.length === 0) return null;

  // Note: probeRadius and vdwScale are surfaced on SurfaceOptions for callers
  // building their own SurfaceAtom list — they're already baked into a.radius.
  const isoLevel  = opts.isoLevel ?? DEFAULTS.isoLevel;
  const maxVoxels = opts.maxVoxels ?? DEFAULTS.maxVoxels;

  // ── Bounding box (with kernel padding so atoms near the edge still close off).
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let maxR = 0;
  for (const a of atoms) {
    if (a.x < minX) minX = a.x; if (a.x > maxX) maxX = a.x;
    if (a.y < minY) minY = a.y; if (a.y > maxY) maxY = a.y;
    if (a.z < minZ) minZ = a.z; if (a.z > maxZ) maxZ = a.z;
    if (a.radius > maxR) maxR = a.radius;
  }

  const pad = maxR * KERNEL_SIGMA + 1.0;
  minX -= pad; minY -= pad; minZ -= pad;
  maxX += pad; maxY += pad; maxZ += pad;

  // ── Grid resolution: respect explicit option, else pick adaptively.
  let res = opts.resolution ?? pickResolution(atoms.length, maxX - minX, maxY - minY, maxZ - minZ);
  let nx = Math.ceil((maxX - minX) / res) + 1;
  let ny = Math.ceil((maxY - minY) / res) + 1;
  let nz = Math.ceil((maxZ - minZ) / res) + 1;

  // Coarsen until grid fits the voxel budget — last-line defense for ribosome-scale input.
  while ((nx * ny * nz) > maxVoxels) {
    res *= 1.25;
    nx = Math.ceil((maxX - minX) / res) + 1;
    ny = Math.ceil((maxY - minY) / res) + 1;
    nz = Math.ceil((maxZ - minZ) / res) + 1;
  }

  const grid = new Float32Array(nx * ny * nz);

  // ── Splat each atom's Gaussian into the local kernel.
  const invRes = 1 / res;
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    const r = a.radius;
    const r2 = r * r;
    const reach = r * KERNEL_SIGMA;

    // Voxel range that this atom touches.
    const ix0 = Math.max(0,        Math.floor((a.x - reach - minX) * invRes));
    const iy0 = Math.max(0,        Math.floor((a.y - reach - minY) * invRes));
    const iz0 = Math.max(0,        Math.floor((a.z - reach - minZ) * invRes));
    const ix1 = Math.min(nx - 1,   Math.ceil ((a.x + reach - minX) * invRes));
    const iy1 = Math.min(ny - 1,   Math.ceil ((a.y + reach - minY) * invRes));
    const iz1 = Math.min(nz - 1,   Math.ceil ((a.z + reach - minZ) * invRes));

    const rowStride   = nx;
    const sliceStride = nx * ny;

    for (let iz = iz0; iz <= iz1; iz++) {
      const pz = minZ + iz * res;
      const dz = pz - a.z;
      const dz2 = dz * dz;
      const sliceBase = iz * sliceStride;
      for (let iy = iy0; iy <= iy1; iy++) {
        const py = minY + iy * res;
        const dy = py - a.y;
        const dy2 = dy * dy;
        const rowBase = sliceBase + iy * rowStride;
        const dyz2 = dy2 + dz2;
        for (let ix = ix0; ix <= ix1; ix++) {
          const px = minX + ix * res;
          const dx = px - a.x;
          const d2 = dx * dx + dyz2;
          if (d2 > reach * reach) continue;
          // ρ = exp(-d²/r²) — Gaussian centered on atom, falling to zero with distance.
          grid[rowBase + ix] += Math.exp(-d2 / r2);
        }
      }
    }
  }

  // ── Marching Cubes: extract isosurface at `isoLevel`.
  return marchingCubes(grid, nx, ny, nz, res, minX, minY, minZ, isoLevel, atoms);
}

/** Pick voxel size in Å based on rough scale of the structure. */
function pickResolution(atomCount: number, _dx: number, _dy: number, _dz: number): number {
  // Aim for roughly the same density of voxels regardless of structure size,
  // but never too coarse (≤ 2.0Å) or too fine (≥ 0.7Å).
  if (atomCount < 2_000)   return 0.8;
  if (atomCount < 10_000)  return 1.0;
  if (atomCount < 50_000)  return 1.4;
  if (atomCount < 200_000) return 1.8;
  return 2.2;
}

// ─────────────────────────────────────────────────────────────────────────────
// Marching Cubes
// ─────────────────────────────────────────────────────────────────────────────

// Per-vertex color via a flat-array uniform-grid spatial index. Color cell size
// is sized so atoms can only land in their own cell or immediate neighbors;
// COLOR_LOOKUP_RADIUS=2 then guarantees we don't miss the closest atom.

function buildAtomColorGrid(
  atoms: SurfaceAtom[],
  cellSize: number,
  minX: number, minY: number, minZ: number,
  cnx: number, cny: number, cnz: number
): Int32Array[] {
  const cells: Int32Array[] = new Array(cnx * cny * cnz);
  // First pass: count atoms per cell
  const counts = new Uint32Array(cnx * cny * cnz);
  const inv = 1 / cellSize;
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    const cx = Math.min(cnx - 1, Math.max(0, Math.floor((a.x - minX) * inv)));
    const cy = Math.min(cny - 1, Math.max(0, Math.floor((a.y - minY) * inv)));
    const cz = Math.min(cnz - 1, Math.max(0, Math.floor((a.z - minZ) * inv)));
    counts[cz * cnx * cny + cy * cnx + cx]++;
  }
  // Allocate per-cell arrays
  for (let i = 0; i < cells.length; i++) {
    cells[i] = new Int32Array(counts[i]);
    counts[i] = 0; // reuse as write cursor
  }
  // Second pass: insert
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    const cx = Math.min(cnx - 1, Math.max(0, Math.floor((a.x - minX) * inv)));
    const cy = Math.min(cny - 1, Math.max(0, Math.floor((a.y - minY) * inv)));
    const cz = Math.min(cnz - 1, Math.max(0, Math.floor((a.z - minZ) * inv)));
    const idx = cz * cnx * cny + cy * cnx + cx;
    cells[idx][counts[idx]++] = i;
  }
  return cells;
}

function marchingCubes(
  grid: Float32Array,
  nx: number, ny: number, nz: number,
  res: number,
  minX: number, minY: number, minZ: number,
  iso: number,
  atoms: SurfaceAtom[]
): SurfaceMesh {
  // Pre-build atom color grid for vertex coloring.
  // Cell size big enough to hold the largest plausible atom radius.
  const colorCellSize = 4.0;
  const cnx = Math.max(1, Math.ceil(nx * res / colorCellSize));
  const cny = Math.max(1, Math.ceil(ny * res / colorCellSize));
  const cnz = Math.max(1, Math.ceil(nz * res / colorCellSize));
  const colorGrid = buildAtomColorGrid(atoms, colorCellSize, minX, minY, minZ, cnx, cny, cnz);

  // Estimate output size — most cells are empty; over-allocate moderately.
  const initialCap = Math.min(2_000_000, Math.max(1024, Math.floor(nx * ny * nz * 0.05)));
  let positions = new Float32Array(initialCap * 3);
  let normals   = new Float32Array(initialCap * 3);
  let colors    = new Float32Array(initialCap * 3);
  let indices   = new Uint32Array(initialCap * 3);
  let vCount = 0;
  let iCount = 0;

  const ensureVCap = (need: number) => {
    if (vCount + need <= positions.length / 3) return;
    const newCap = Math.max(positions.length * 2, (vCount + need) * 3);
    const np = new Float32Array(newCap);
    const nn = new Float32Array(newCap);
    const nc = new Float32Array(newCap);
    np.set(positions); nn.set(normals); nc.set(colors);
    positions = np; normals = nn; colors = nc;
  };
  const ensureICap = (need: number) => {
    if (iCount + need <= indices.length) return;
    const newCap = Math.max(indices.length * 2, iCount + need);
    const ni = new Uint32Array(newCap);
    ni.set(indices);
    indices = ni;
  };

  // Reusable per-cell vertex slots: 12 edge midpoints, each storing the
  // vertex index emitted for that edge or -1 if not yet emitted.
  const cellVerts = new Int32Array(12);

  // Reusable corner buffers
  const corners = new Float32Array(8);
  const cornerPos = new Float32Array(24); // 8 × xyz

  const sliceStride = nx * ny;

  // March!
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let iy = 0; iy < ny - 1; iy++) {
      for (let ix = 0; ix < nx - 1; ix++) {
        // Sample 8 corners of the cell.
        const i000 = iz * sliceStride + iy * nx + ix;
        corners[0] = grid[i000];
        corners[1] = grid[i000 + 1];
        corners[2] = grid[i000 + 1 + nx];
        corners[3] = grid[i000 + nx];
        corners[4] = grid[i000 + sliceStride];
        corners[5] = grid[i000 + sliceStride + 1];
        corners[6] = grid[i000 + sliceStride + 1 + nx];
        corners[7] = grid[i000 + sliceStride + nx];

        // Cube index — bit per corner indicating if it's "inside" (>= iso).
        let cubeIdx = 0;
        if (corners[0] >= iso) cubeIdx |= 1;
        if (corners[1] >= iso) cubeIdx |= 2;
        if (corners[2] >= iso) cubeIdx |= 4;
        if (corners[3] >= iso) cubeIdx |= 8;
        if (corners[4] >= iso) cubeIdx |= 16;
        if (corners[5] >= iso) cubeIdx |= 32;
        if (corners[6] >= iso) cubeIdx |= 64;
        if (corners[7] >= iso) cubeIdx |= 128;

        const edgeMask = MC_EDGE_TABLE[cubeIdx];
        if (edgeMask === 0) continue;

        // Corner world positions for this cell.
        const x0 = minX + ix * res;
        const y0 = minY + iy * res;
        const z0 = minZ + iz * res;
        const x1 = x0 + res, y1 = y0 + res, z1 = z0 + res;
        cornerPos[0]  = x0; cornerPos[1]  = y0; cornerPos[2]  = z0;
        cornerPos[3]  = x1; cornerPos[4]  = y0; cornerPos[5]  = z0;
        cornerPos[6]  = x1; cornerPos[7]  = y1; cornerPos[8]  = z0;
        cornerPos[9]  = x0; cornerPos[10] = y1; cornerPos[11] = z0;
        cornerPos[12] = x0; cornerPos[13] = y0; cornerPos[14] = z1;
        cornerPos[15] = x1; cornerPos[16] = y0; cornerPos[17] = z1;
        cornerPos[18] = x1; cornerPos[19] = y1; cornerPos[20] = z1;
        cornerPos[21] = x0; cornerPos[22] = y1; cornerPos[23] = z1;

        // Compute vertices on each active edge.
        for (let e = 0; e < 12; e++) {
          if ((edgeMask & (1 << e)) === 0) { cellVerts[e] = -1; continue; }

          const c1 = MC_EDGE_VERT_A[e];
          const c2 = MC_EDGE_VERT_B[e];
          const v1 = corners[c1];
          const v2 = corners[c2];
          // Linear interpolation along the edge to find the iso crossing.
          const denom = (v2 - v1);
          const t = Math.abs(denom) < 1e-12 ? 0.5 : (iso - v1) / denom;

          const px = cornerPos[c1 * 3]     + t * (cornerPos[c2 * 3]     - cornerPos[c1 * 3]);
          const py = cornerPos[c1 * 3 + 1] + t * (cornerPos[c2 * 3 + 1] - cornerPos[c1 * 3 + 1]);
          const pz = cornerPos[c1 * 3 + 2] + t * (cornerPos[c2 * 3 + 2] - cornerPos[c1 * 3 + 2]);

          ensureVCap(1);
          const vi = vCount;
          positions[vi * 3]     = px;
          positions[vi * 3 + 1] = py;
          positions[vi * 3 + 2] = pz;

          // Normal = analytic gradient of the density field at the vertex.
          // ∇ρ points from low to high density — flip so the surface normal
          // faces *outward* (low density side).
          const grad = sampleDensityGradient(atoms, px, py, pz);
          let nxg = -grad[0], nyg = -grad[1], nzg = -grad[2];
          const len = Math.sqrt(nxg*nxg + nyg*nyg + nzg*nzg);
          if (len > 1e-6) { nxg /= len; nyg /= len; nzg /= len; }
          normals[vi * 3]     = nxg;
          normals[vi * 3 + 1] = nyg;
          normals[vi * 3 + 2] = nzg;

          // Color from nearest atom.
          const col = nearestAtomColor(atoms, colorGrid, colorCellSize, minX, minY, minZ, cnx, cny, cnz, px, py, pz);
          colors[vi * 3]     = col[0] / 255;
          colors[vi * 3 + 1] = col[1] / 255;
          colors[vi * 3 + 2] = col[2] / 255;

          cellVerts[e] = vi;
          vCount++;
        }

        // Emit triangles per the cube's tri-table.
        const triRow = cubeIdx * 16;
        for (let t = 0; t < 16; t += 3) {
          const a0 = MC_TRI_TABLE[triRow + t];
          if (a0 === -1) break;
          const a1 = MC_TRI_TABLE[triRow + t + 1];
          const a2 = MC_TRI_TABLE[triRow + t + 2];

          ensureICap(3);
          // Wind opposite of standard table to face outward correctly given
          // our gradient-based normals (which already point outward).
          indices[iCount++] = cellVerts[a0];
          indices[iCount++] = cellVerts[a2];
          indices[iCount++] = cellVerts[a1];
        }
      }
    }
  }

  return {
    positions: positions.subarray(0, vCount * 3),
    normals:   normals.subarray(0, vCount * 3),
    colors:    colors.subarray(0, vCount * 3),
    indices:   indices.subarray(0, iCount),
    vertexCount: vCount,
    triangleCount: iCount / 3,
  };
}

// Density gradient at point p — analytic derivative of the Gaussian sum.
// Only nearby atoms contribute meaningfully; we just walk all atoms here
// because vertex count is small relative to atom-per-vertex cost. For very
// large structures this could become a hot spot — switch to a spatial query
// if profiling shows it.
const _gradOut: [number, number, number] = [0, 0, 0];
function sampleDensityGradient(atoms: SurfaceAtom[], px: number, py: number, pz: number): [number, number, number] {
  let gx = 0, gy = 0, gz = 0;
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    const dx = px - a.x;
    const dy = py - a.y;
    const dz = pz - a.z;
    const r2 = a.radius * a.radius;
    const d2 = dx*dx + dy*dy + dz*dz;
    if (d2 > a.radius * a.radius * KERNEL_SIGMA * KERNEL_SIGMA) continue;
    // d/dx exp(-d²/r²) = -2 dx / r² * exp(-d²/r²)
    const w = Math.exp(-d2 / r2) * (-2.0 / r2);
    gx += dx * w;
    gy += dy * w;
    gz += dz * w;
  }
  _gradOut[0] = gx; _gradOut[1] = gy; _gradOut[2] = gz;
  return _gradOut;
}

const _colorOut: RGB = [180, 180, 180];
function nearestAtomColor(
  atoms: SurfaceAtom[],
  colorGrid: Int32Array[],
  cellSize: number,
  minX: number, minY: number, minZ: number,
  cnx: number, cny: number, cnz: number,
  px: number, py: number, pz: number
): RGB {
  const inv = 1 / cellSize;
  const cx = Math.min(cnx - 1, Math.max(0, Math.floor((px - minX) * inv)));
  const cy = Math.min(cny - 1, Math.max(0, Math.floor((py - minY) * inv)));
  const cz = Math.min(cnz - 1, Math.max(0, Math.floor((pz - minZ) * inv)));

  let bestD = Infinity;
  let bestIdx = -1;
  const r = COLOR_LOOKUP_RADIUS;

  for (let dz = -r; dz <= r; dz++) {
    const zz = cz + dz;
    if (zz < 0 || zz >= cnz) continue;
    for (let dy = -r; dy <= r; dy++) {
      const yy = cy + dy;
      if (yy < 0 || yy >= cny) continue;
      for (let dx = -r; dx <= r; dx++) {
        const xx = cx + dx;
        if (xx < 0 || xx >= cnx) continue;
        const cellIdx = zz * cnx * cny + yy * cnx + xx;
        const list = colorGrid[cellIdx];
        for (let i = 0; i < list.length; i++) {
          const a = atoms[list[i]];
          const ddx = a.x - px;
          const ddy = a.y - py;
          const ddz = a.z - pz;
          const d2 = ddx*ddx + ddy*ddy + ddz*ddz;
          if (d2 < bestD) { bestD = d2; bestIdx = list[i]; }
        }
      }
    }
  }

  if (bestIdx < 0) {
    _colorOut[0] = 180; _colorOut[1] = 180; _colorOut[2] = 180;
    return _colorOut;
  }
  return atoms[bestIdx].color;
}

// ─────────────────────────────────────────────────────────────────────────────
// Marching Cubes lookup tables (Bourke). Edge layout:
//
//        4 ───── 5
//       /|      /|
//      7 ───── 6 |
//      | 0 ────|─1
//      |/      |/
//      3 ───── 2
//
// Edges 0..11 connect: (0-1, 1-2, 2-3, 3-0, 4-5, 5-6, 6-7, 7-4, 0-4, 1-5, 2-6, 3-7)
// ─────────────────────────────────────────────────────────────────────────────

// Which corners each edge connects.
const MC_EDGE_VERT_A: Int8Array = new Int8Array([0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3]);
const MC_EDGE_VERT_B: Int8Array = new Int8Array([1, 2, 3, 0, 5, 6, 7, 4, 4, 5, 6, 7]);

// 256-entry edge table: which of the 12 edges are crossed for each cube_index.
// Standard Bourke / Lorensen tables — public domain.
const MC_EDGE_TABLE: Int32Array = new Int32Array([
  0x0  , 0x109, 0x203, 0x30a, 0x406, 0x50f, 0x605, 0x70c,
  0x80c, 0x905, 0xa0f, 0xb06, 0xc0a, 0xd03, 0xe09, 0xf00,
  0x190, 0x99 , 0x393, 0x29a, 0x596, 0x49f, 0x795, 0x69c,
  0x99c, 0x895, 0xb9f, 0xa96, 0xd9a, 0xc93, 0xf99, 0xe90,
  0x230, 0x339, 0x33 , 0x13a, 0x636, 0x73f, 0x435, 0x53c,
  0xa3c, 0xb35, 0x83f, 0x936, 0xe3a, 0xf33, 0xc39, 0xd30,
  0x3a0, 0x2a9, 0x1a3, 0xaa , 0x7a6, 0x6af, 0x5a5, 0x4ac,
  0xbac, 0xaa5, 0x9af, 0x8a6, 0xfaa, 0xea3, 0xda9, 0xca0,
  0x460, 0x569, 0x663, 0x76a, 0x66 , 0x16f, 0x265, 0x36c,
  0xc6c, 0xd65, 0xe6f, 0xf66, 0x86a, 0x963, 0xa69, 0xb60,
  0x5f0, 0x4f9, 0x7f3, 0x6fa, 0x1f6, 0xff , 0x3f5, 0x2fc,
  0xdfc, 0xcf5, 0xfff, 0xef6, 0x9fa, 0x8f3, 0xbf9, 0xaf0,
  0x650, 0x759, 0x453, 0x55a, 0x256, 0x35f, 0x55 , 0x15c,
  0xe5c, 0xf55, 0xc5f, 0xd56, 0xa5a, 0xb53, 0x859, 0x950,
  0x7c0, 0x6c9, 0x5c3, 0x4ca, 0x3c6, 0x2cf, 0x1c5, 0xcc ,
  0xfcc, 0xec5, 0xdcf, 0xcc6, 0xbca, 0xac3, 0x9c9, 0x8c0,
  0x8c0, 0x9c9, 0xac3, 0xbca, 0xcc6, 0xdcf, 0xec5, 0xfcc,
  0xcc , 0x1c5, 0x2cf, 0x3c6, 0x4ca, 0x5c3, 0x6c9, 0x7c0,
  0x950, 0x859, 0xb53, 0xa5a, 0xd56, 0xc5f, 0xf55, 0xe5c,
  0x15c, 0x55 , 0x35f, 0x256, 0x55a, 0x453, 0x759, 0x650,
  0xaf0, 0xbf9, 0x8f3, 0x9fa, 0xef6, 0xfff, 0xcf5, 0xdfc,
  0x2fc, 0x3f5, 0xff , 0x1f6, 0x6fa, 0x7f3, 0x4f9, 0x5f0,
  0xb60, 0xa69, 0x963, 0x86a, 0xf66, 0xe6f, 0xd65, 0xc6c,
  0x36c, 0x265, 0x16f, 0x66 , 0x76a, 0x663, 0x569, 0x460,
  0xca0, 0xda9, 0xea3, 0xfaa, 0x8a6, 0x9af, 0xaa5, 0xbac,
  0x4ac, 0x5a5, 0x6af, 0x7a6, 0xaa , 0x1a3, 0x2a9, 0x3a0,
  0xd30, 0xc39, 0xf33, 0xe3a, 0x936, 0x83f, 0xb35, 0xa3c,
  0x53c, 0x435, 0x73f, 0x636, 0x13a, 0x33 , 0x339, 0x230,
  0xe90, 0xf99, 0xc93, 0xd9a, 0xa96, 0xb9f, 0x895, 0x99c,
  0x69c, 0x795, 0x49f, 0x596, 0x29a, 0x393, 0x99 , 0x190,
  0xf00, 0xe09, 0xd03, 0xc0a, 0xb06, 0xa0f, 0x905, 0x80c,
  0x70c, 0x605, 0x50f, 0x406, 0x30a, 0x203, 0x109, 0x0,
]);

// 256 × 16 triangle table — for each cube index, lists triangles as edge
// indices in groups of 3, terminated by -1. Public-domain Bourke table.
const MC_TRI_TABLE: Int8Array = new Int8Array([
  -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  0,8,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  0,1,9,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  1,8,3,9,8,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  1,2,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  0,8,3,1,2,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  9,2,10,0,2,9,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  2,8,3,2,10,8,10,9,8,-1,-1,-1,-1,-1,-1,-1,
  3,11,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  0,11,2,8,11,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  1,9,0,2,3,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  1,11,2,1,9,11,9,8,11,-1,-1,-1,-1,-1,-1,-1,
  3,10,1,11,10,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  0,10,1,0,8,10,8,11,10,-1,-1,-1,-1,-1,-1,-1,
  3,9,0,3,11,9,11,10,9,-1,-1,-1,-1,-1,-1,-1,
  9,8,10,10,8,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  4,7,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  4,3,0,7,3,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  0,1,9,8,4,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  4,1,9,4,7,1,7,3,1,-1,-1,-1,-1,-1,-1,-1,
  1,2,10,8,4,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  3,4,7,3,0,4,1,2,10,-1,-1,-1,-1,-1,-1,-1,
  9,2,10,9,0,2,8,4,7,-1,-1,-1,-1,-1,-1,-1,
  2,10,9,2,9,7,2,7,3,7,9,4,-1,-1,-1,-1,
  8,4,7,3,11,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  11,4,7,11,2,4,2,0,4,-1,-1,-1,-1,-1,-1,-1,
  9,0,1,8,4,7,2,3,11,-1,-1,-1,-1,-1,-1,-1,
  4,7,11,9,4,11,9,11,2,9,2,1,-1,-1,-1,-1,
  3,10,1,3,11,10,7,8,4,-1,-1,-1,-1,-1,-1,-1,
  1,11,10,1,4,11,1,0,4,7,11,4,-1,-1,-1,-1,
  4,7,8,9,0,11,9,11,10,11,0,3,-1,-1,-1,-1,
  4,7,11,4,11,9,9,11,10,-1,-1,-1,-1,-1,-1,-1,
  9,5,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  9,5,4,0,8,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  0,5,4,1,5,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  8,5,4,8,3,5,3,1,5,-1,-1,-1,-1,-1,-1,-1,
  1,2,10,9,5,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  3,0,8,1,2,10,4,9,5,-1,-1,-1,-1,-1,-1,-1,
  5,2,10,5,4,2,4,0,2,-1,-1,-1,-1,-1,-1,-1,
  2,10,5,3,2,5,3,5,4,3,4,8,-1,-1,-1,-1,
  9,5,4,2,3,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  0,11,2,0,8,11,4,9,5,-1,-1,-1,-1,-1,-1,-1,
  0,5,4,0,1,5,2,3,11,-1,-1,-1,-1,-1,-1,-1,
  2,1,5,2,5,8,2,8,11,4,8,5,-1,-1,-1,-1,
  10,3,11,10,1,3,9,5,4,-1,-1,-1,-1,-1,-1,-1,
  4,9,5,0,8,1,8,10,1,8,11,10,-1,-1,-1,-1,
  5,4,0,5,0,11,5,11,10,11,0,3,-1,-1,-1,-1,
  5,4,8,5,8,10,10,8,11,-1,-1,-1,-1,-1,-1,-1,
  9,7,8,5,7,9,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  9,3,0,9,5,3,5,7,3,-1,-1,-1,-1,-1,-1,-1,
  0,7,8,0,1,7,1,5,7,-1,-1,-1,-1,-1,-1,-1,
  1,5,3,3,5,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  9,7,8,9,5,7,10,1,2,-1,-1,-1,-1,-1,-1,-1,
  10,1,2,9,5,0,5,3,0,5,7,3,-1,-1,-1,-1,
  8,0,2,8,2,5,8,5,7,10,5,2,-1,-1,-1,-1,
  2,10,5,2,5,3,3,5,7,-1,-1,-1,-1,-1,-1,-1,
  7,9,5,7,8,9,3,11,2,-1,-1,-1,-1,-1,-1,-1,
  9,5,7,9,7,2,9,2,0,2,7,11,-1,-1,-1,-1,
  2,3,11,0,1,8,1,7,8,1,5,7,-1,-1,-1,-1,
  11,2,1,11,1,7,7,1,5,-1,-1,-1,-1,-1,-1,-1,
  9,5,8,8,5,7,10,1,3,10,3,11,-1,-1,-1,-1,
  5,7,0,5,0,9,7,11,0,1,0,10,11,10,0,-1,
  11,10,0,11,0,3,10,5,0,8,0,7,5,7,0,-1,
  11,10,5,7,11,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  10,6,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  0,8,3,5,10,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  9,0,1,5,10,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  1,8,3,1,9,8,5,10,6,-1,-1,-1,-1,-1,-1,-1,
  1,6,5,2,6,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  1,6,5,1,2,6,3,0,8,-1,-1,-1,-1,-1,-1,-1,
  9,6,5,9,0,6,0,2,6,-1,-1,-1,-1,-1,-1,-1,
  5,9,8,5,8,2,5,2,6,3,2,8,-1,-1,-1,-1,
  2,3,11,10,6,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  11,0,8,11,2,0,10,6,5,-1,-1,-1,-1,-1,-1,-1,
  0,1,9,2,3,11,5,10,6,-1,-1,-1,-1,-1,-1,-1,
  5,10,6,1,9,2,9,11,2,9,8,11,-1,-1,-1,-1,
  6,3,11,6,5,3,5,1,3,-1,-1,-1,-1,-1,-1,-1,
  0,8,11,0,11,5,0,5,1,5,11,6,-1,-1,-1,-1,
  3,11,6,0,3,6,0,6,5,0,5,9,-1,-1,-1,-1,
  6,5,9,6,9,11,11,9,8,-1,-1,-1,-1,-1,-1,-1,
  5,10,6,4,7,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  4,3,0,4,7,3,6,5,10,-1,-1,-1,-1,-1,-1,-1,
  1,9,0,5,10,6,8,4,7,-1,-1,-1,-1,-1,-1,-1,
  10,6,5,1,9,7,1,7,3,7,9,4,-1,-1,-1,-1,
  6,1,2,6,5,1,4,7,8,-1,-1,-1,-1,-1,-1,-1,
  1,2,5,5,2,6,3,0,4,3,4,7,-1,-1,-1,-1,
  8,4,7,9,0,5,0,6,5,0,2,6,-1,-1,-1,-1,
  7,3,9,7,9,4,3,2,9,5,9,6,2,6,9,-1,
  3,11,2,7,8,4,10,6,5,-1,-1,-1,-1,-1,-1,-1,
  5,10,6,4,7,2,4,2,0,2,7,11,-1,-1,-1,-1,
  0,1,9,4,7,8,2,3,11,5,10,6,-1,-1,-1,-1,
  9,2,1,9,11,2,9,4,11,7,11,4,5,10,6,-1,
  8,4,7,3,11,5,3,5,1,5,11,6,-1,-1,-1,-1,
  5,1,11,5,11,6,1,0,11,7,11,4,0,4,11,-1,
  0,5,9,0,6,5,0,3,6,11,6,3,8,4,7,-1,
  6,5,9,6,9,11,4,7,9,7,11,9,-1,-1,-1,-1,
  10,4,9,6,4,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  4,10,6,4,9,10,0,8,3,-1,-1,-1,-1,-1,-1,-1,
  10,0,1,10,6,0,6,4,0,-1,-1,-1,-1,-1,-1,-1,
  8,3,1,8,1,6,8,6,4,6,1,10,-1,-1,-1,-1,
  1,4,9,1,2,4,2,6,4,-1,-1,-1,-1,-1,-1,-1,
  3,0,8,1,2,9,2,4,9,2,6,4,-1,-1,-1,-1,
  0,2,4,4,2,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  8,3,2,8,2,4,4,2,6,-1,-1,-1,-1,-1,-1,-1,
  10,4,9,10,6,4,11,2,3,-1,-1,-1,-1,-1,-1,-1,
  0,8,2,2,8,11,4,9,10,4,10,6,-1,-1,-1,-1,
  3,11,2,0,1,6,0,6,4,6,1,10,-1,-1,-1,-1,
  6,4,1,6,1,10,4,8,1,2,1,11,8,11,1,-1,
  9,6,4,9,3,6,9,1,3,11,6,3,-1,-1,-1,-1,
  8,11,1,8,1,0,11,6,1,9,1,4,6,4,1,-1,
  3,11,6,3,6,0,0,6,4,-1,-1,-1,-1,-1,-1,-1,
  6,4,8,11,6,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  7,10,6,7,8,10,8,9,10,-1,-1,-1,-1,-1,-1,-1,
  0,7,3,0,10,7,0,9,10,6,7,10,-1,-1,-1,-1,
  10,6,7,1,10,7,1,7,8,1,8,0,-1,-1,-1,-1,
  10,6,7,10,7,1,1,7,3,-1,-1,-1,-1,-1,-1,-1,
  1,2,6,1,6,8,1,8,9,8,6,7,-1,-1,-1,-1,
  2,6,9,2,9,1,6,7,9,0,9,3,7,3,9,-1,
  7,8,0,7,0,6,6,0,2,-1,-1,-1,-1,-1,-1,-1,
  7,3,2,6,7,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  2,3,11,10,6,8,10,8,9,8,6,7,-1,-1,-1,-1,
  2,0,7,2,7,11,0,9,7,6,7,10,9,10,7,-1,
  1,8,0,1,7,8,1,10,7,6,7,10,2,3,11,-1,
  11,2,1,11,1,7,10,6,1,6,7,1,-1,-1,-1,-1,
  8,9,6,8,6,7,9,1,6,11,6,3,1,3,6,-1,
  0,9,1,11,6,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  7,8,0,7,0,6,3,11,0,11,6,0,-1,-1,-1,-1,
  7,11,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  7,6,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  3,0,8,11,7,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  0,1,9,11,7,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  8,1,9,8,3,1,11,7,6,-1,-1,-1,-1,-1,-1,-1,
  10,1,2,6,11,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  1,2,10,3,0,8,6,11,7,-1,-1,-1,-1,-1,-1,-1,
  2,9,0,2,10,9,6,11,7,-1,-1,-1,-1,-1,-1,-1,
  6,11,7,2,10,3,10,8,3,10,9,8,-1,-1,-1,-1,
  7,2,3,6,2,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  7,0,8,7,6,0,6,2,0,-1,-1,-1,-1,-1,-1,-1,
  2,7,6,2,3,7,0,1,9,-1,-1,-1,-1,-1,-1,-1,
  1,6,2,1,8,6,1,9,8,8,7,6,-1,-1,-1,-1,
  10,7,6,10,1,7,1,3,7,-1,-1,-1,-1,-1,-1,-1,
  10,7,6,1,7,10,1,8,7,1,0,8,-1,-1,-1,-1,
  0,3,7,0,7,10,0,10,9,6,10,7,-1,-1,-1,-1,
  7,6,10,7,10,8,8,10,9,-1,-1,-1,-1,-1,-1,-1,
  6,8,4,11,8,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  3,6,11,3,0,6,0,4,6,-1,-1,-1,-1,-1,-1,-1,
  8,6,11,8,4,6,9,0,1,-1,-1,-1,-1,-1,-1,-1,
  9,4,6,9,6,3,9,3,1,11,3,6,-1,-1,-1,-1,
  6,8,4,6,11,8,2,10,1,-1,-1,-1,-1,-1,-1,-1,
  1,2,10,3,0,11,0,6,11,0,4,6,-1,-1,-1,-1,
  4,11,8,4,6,11,0,2,9,2,10,9,-1,-1,-1,-1,
  10,9,3,10,3,2,9,4,3,11,3,6,4,6,3,-1,
  8,2,3,8,4,2,4,6,2,-1,-1,-1,-1,-1,-1,-1,
  0,4,2,4,6,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  1,9,0,2,3,4,2,4,6,4,3,8,-1,-1,-1,-1,
  1,9,4,1,4,2,2,4,6,-1,-1,-1,-1,-1,-1,-1,
  8,1,3,8,6,1,8,4,6,6,10,1,-1,-1,-1,-1,
  10,1,0,10,0,6,6,0,4,-1,-1,-1,-1,-1,-1,-1,
  4,6,3,4,3,8,6,10,3,0,3,9,10,9,3,-1,
  10,9,4,6,10,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  4,9,5,7,6,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  0,8,3,4,9,5,11,7,6,-1,-1,-1,-1,-1,-1,-1,
  5,0,1,5,4,0,7,6,11,-1,-1,-1,-1,-1,-1,-1,
  11,7,6,8,3,4,3,5,4,3,1,5,-1,-1,-1,-1,
  9,5,4,10,1,2,7,6,11,-1,-1,-1,-1,-1,-1,-1,
  6,11,7,1,2,10,0,8,3,4,9,5,-1,-1,-1,-1,
  7,6,11,5,4,10,4,2,10,4,0,2,-1,-1,-1,-1,
  3,4,8,3,5,4,3,2,5,10,5,2,11,7,6,-1,
  7,2,3,7,6,2,5,4,9,-1,-1,-1,-1,-1,-1,-1,
  9,5,4,0,8,6,0,6,2,6,8,7,-1,-1,-1,-1,
  3,6,2,3,7,6,1,5,0,5,4,0,-1,-1,-1,-1,
  6,2,8,6,8,7,2,1,8,4,8,5,1,5,8,-1,
  9,5,4,10,1,6,1,7,6,1,3,7,-1,-1,-1,-1,
  1,6,10,1,7,6,1,0,7,8,7,0,9,5,4,-1,
  4,0,10,4,10,5,0,3,10,6,10,7,3,7,10,-1,
  7,6,10,7,10,8,5,4,10,4,8,10,-1,-1,-1,-1,
  6,9,5,6,11,9,11,8,9,-1,-1,-1,-1,-1,-1,-1,
  3,6,11,0,6,3,0,5,6,0,9,5,-1,-1,-1,-1,
  0,11,8,0,5,11,0,1,5,5,6,11,-1,-1,-1,-1,
  6,11,3,6,3,5,5,3,1,-1,-1,-1,-1,-1,-1,-1,
  1,2,10,9,5,11,9,11,8,11,5,6,-1,-1,-1,-1,
  0,11,3,0,6,11,0,9,6,5,6,9,1,2,10,-1,
  11,8,5,11,5,6,8,0,5,10,5,2,0,2,5,-1,
  6,11,3,6,3,5,2,10,3,10,5,3,-1,-1,-1,-1,
  5,8,9,5,2,8,5,6,2,3,8,2,-1,-1,-1,-1,
  9,5,6,9,6,0,0,6,2,-1,-1,-1,-1,-1,-1,-1,
  1,5,8,1,8,0,5,6,8,3,8,2,6,2,8,-1,
  1,5,6,2,1,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  1,3,6,1,6,10,3,8,6,5,6,9,8,9,6,-1,
  10,1,0,10,0,6,9,5,0,5,6,0,-1,-1,-1,-1,
  0,3,8,5,6,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  10,5,6,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  11,5,10,7,5,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  11,5,10,11,7,5,8,3,0,-1,-1,-1,-1,-1,-1,-1,
  5,11,7,5,10,11,1,9,0,-1,-1,-1,-1,-1,-1,-1,
  10,7,5,10,11,7,9,8,1,8,3,1,-1,-1,-1,-1,
  11,1,2,11,7,1,7,5,1,-1,-1,-1,-1,-1,-1,-1,
  0,8,3,1,2,7,1,7,5,7,2,11,-1,-1,-1,-1,
  9,7,5,9,2,7,9,0,2,2,11,7,-1,-1,-1,-1,
  7,5,2,7,2,11,5,9,2,3,2,8,9,8,2,-1,
  2,5,10,2,3,5,3,7,5,-1,-1,-1,-1,-1,-1,-1,
  8,2,0,8,5,2,8,7,5,10,2,5,-1,-1,-1,-1,
  9,0,1,5,10,3,5,3,7,3,10,2,-1,-1,-1,-1,
  9,8,2,9,2,1,8,7,2,10,2,5,7,5,2,-1,
  1,3,5,3,7,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  0,8,7,0,7,1,1,7,5,-1,-1,-1,-1,-1,-1,-1,
  9,0,3,9,3,5,5,3,7,-1,-1,-1,-1,-1,-1,-1,
  9,8,7,5,9,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  5,8,4,5,10,8,10,11,8,-1,-1,-1,-1,-1,-1,-1,
  5,0,4,5,11,0,5,10,11,11,3,0,-1,-1,-1,-1,
  0,1,9,8,4,10,8,10,11,10,4,5,-1,-1,-1,-1,
  10,11,4,10,4,5,11,3,4,9,4,1,3,1,4,-1,
  2,5,1,2,8,5,2,11,8,4,5,8,-1,-1,-1,-1,
  0,4,11,0,11,3,4,5,11,2,11,1,5,1,11,-1,
  0,2,5,0,5,9,2,11,5,4,5,8,11,8,5,-1,
  9,4,5,2,11,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  2,5,10,3,5,2,3,4,5,3,8,4,-1,-1,-1,-1,
  5,10,2,5,2,4,4,2,0,-1,-1,-1,-1,-1,-1,-1,
  3,10,2,3,5,10,3,8,5,4,5,8,0,1,9,-1,
  5,10,2,5,2,4,1,9,2,9,4,2,-1,-1,-1,-1,
  8,4,5,8,5,3,3,5,1,-1,-1,-1,-1,-1,-1,-1,
  0,4,5,1,0,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  8,4,5,8,5,3,9,0,5,0,3,5,-1,-1,-1,-1,
  9,4,5,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  4,11,7,4,9,11,9,10,11,-1,-1,-1,-1,-1,-1,-1,
  0,8,3,4,9,7,9,11,7,9,10,11,-1,-1,-1,-1,
  1,10,11,1,11,4,1,4,0,7,4,11,-1,-1,-1,-1,
  3,1,4,3,4,8,1,10,4,7,4,11,10,11,4,-1,
  4,11,7,9,11,4,9,2,11,9,1,2,-1,-1,-1,-1,
  9,7,4,9,11,7,9,1,11,2,11,1,0,8,3,-1,
  11,7,4,11,4,2,2,4,0,-1,-1,-1,-1,-1,-1,-1,
  11,7,4,11,4,2,8,3,4,3,2,4,-1,-1,-1,-1,
  2,9,10,2,7,9,2,3,7,7,4,9,-1,-1,-1,-1,
  9,10,7,9,7,4,10,2,7,8,7,0,2,0,7,-1,
  3,7,10,3,10,2,7,4,10,1,10,0,4,0,10,-1,
  1,10,2,8,7,4,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  4,9,1,4,1,7,7,1,3,-1,-1,-1,-1,-1,-1,-1,
  4,9,1,4,1,7,0,8,1,8,7,1,-1,-1,-1,-1,
  4,0,3,7,4,3,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  4,8,7,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  9,10,8,10,11,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  3,0,9,3,9,11,11,9,10,-1,-1,-1,-1,-1,-1,-1,
  0,1,10,0,10,8,8,10,11,-1,-1,-1,-1,-1,-1,-1,
  3,1,10,11,3,10,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  1,2,11,1,11,9,9,11,8,-1,-1,-1,-1,-1,-1,-1,
  3,0,9,3,9,11,1,2,9,2,11,9,-1,-1,-1,-1,
  0,2,11,8,0,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  3,2,11,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  2,3,8,2,8,10,10,8,9,-1,-1,-1,-1,-1,-1,-1,
  9,10,2,0,9,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  2,3,8,2,8,10,0,1,8,1,10,8,-1,-1,-1,-1,
  1,10,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  1,3,8,9,1,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  0,9,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  0,3,8,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1
]);
