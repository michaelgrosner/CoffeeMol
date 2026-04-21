# CoffeeMol Project Context

## Project Overview
**CoffeeMol** is a high-performance, embeddable molecular visualizer written in TypeScript. It renders PDB and mmCIF files on an HTML5 `<canvas>` element using 2D drawing APIs, achieving a "3D" look through a custom volumetric multi-pass shading engine. It has **no runtime dependencies** and does **not** require WebGL.

### Key Features
- **File Support**: Parses `.pdb`, `.cif`, and `.mmcif` formats.
- **Rendering Modes**: `ribbon`, `tube`, `cartoon`, `points`, `lines`, and `both` (points+lines).
- **Secondary Structure**: Automatic detection of helices, sheets, and loops from input files.
- **Interactive Tools**: Built-in distance measurement, rotation, and zoom support (including mobile touch/pinch).
- **Custom Shading**: Depth-based contrast and volumetric highlights for a 3D effect in 2D.

## Core Technologies
- **Language**: TypeScript
- **Bundler**: `esbuild` (minifies to a single `CoffeeMol.js` file)
- **Testing**: `vitest`
- **Platform**: Web (HTML5 Canvas 2D API)

## Project Structure
- `src/`: Core source code.
  - `coffeemol.ts`: Main entry point; contains the `CanvasContext` class.
  - `models.ts`: Structural hierarchy classes (`Structure`, `Chain`, `Residue`, `Atom`, `Bond`).
  - `parser.ts`: PDB and mmCIF parsing logic.
  - `types.ts`: Shared TypeScript interfaces and constant definitions (colors, radii).
  - `utils.ts`: Mathematical helpers (rotations) and UI utilities.
- `tests/`: Comprehensive test suite using Vitest.
- `traces/`: Contains performance traces and output screenshots.
- `index.html`, `index.css`: Demonstration and local development page.

## Building and Running
- **Installation**: `npm install`
- **Development Server**: `npm run dev` (starts esbuild watch mode on `http://localhost:8000`)
- **Build**: `npm run build` (runs type check, bundles with esbuild, and generates `.d.ts` files)
- **Test**: `npm run test` (executes Vitest suite)
- **Type-Check**: `npm run type-check`

## Development Conventions
- **Rendering Logic**:
  - Uses Z-sorting for correct transparency and occlusion.
  - Multi-pass rendering is used for "volumetric" effects (shadow/outline, main body, soft highlight, sharp shine).
- **Structural Hierarchy**:
  - `CanvasContext` manages one or more `Structure` elements.
  - `Structure` contains `Chain` elements.
  - `Chain` contains `Residue` elements.
  - `Residue` contains `Atom` elements.
- **Color Schemes**:
  - **CPK**: Element-based (defined in `types.ts`).
  - **SS**: Secondary Structure-based (Helix: Magenta, Sheet: Yellow, Loop: Gray).
  - **Chain**: Distinct colors for different chains.
- **Selection System**: Uses a hierarchical `Selector` string (e.g., `structureIndex/chainIndex/residueIndex/atomIndex`).

## Key Symbols
- `CanvasContext`: The main API class. Initialize via `CoffeeMol.create(target)`.
- `parsePDB`, `parseMmCIF`: Core parsing functions in `parser.ts`.
- `MolElement`: Abstract base class for all structural units in `models.ts`.
- `Atom.depthShadedColorString()`: Handles the depth-aware color calculation for the 3D effect.
