# CoffeeMol: Prioritized Future Features

This document outlines potential features for CoffeeMol, weighted by their biological value and ease of implementation within the current 2D Canvas architecture.

## 1. High-Value, Low-Effort (Quick Wins)

### B-Factor (Temperature) & Hydrophobicity Coloring
*   **Biological Value:** High. Helps researchers identify flexible regions (high B-factor) or potential membrane-spanning domains (high hydrophobicity).
*   **Implementation:** Easy.
    *   Update PDB/CIF parsers to extract the `tempFactor` column.
    *   Add a new color mode to `Atom.depthShadedColorString` using a blue-to-red color ramp.
    *   Implement a hydrophobicity lookup table for residue names.

### "Scene" State Serialization
*   **Biological Value:** High. Allows scientists to share specific structural "views" (angles, zooms, selections) via URLs or embedded scripts.
*   **Implementation:** Easy.
    *   Add `getState()` and `loadState()` to `CanvasContext` to export/import `zoom`, `rotation`, `translation`, and `drawMethod` states as JSON.

### High-Resolution Image Export
*   **Biological Value:** High. Necessary for generating figures for publications and presentations.
*   **Implementation:** Easy.
    *   Add a method to trigger `canvas.toDataURL()` at a higher resolution/scale factor.

---

## 2. High-Value, Medium-Effort (The "Pro" Upgrade)

### Automatic Ligand (HETATM) Detection & Highlight
*   **Biological Value:** Very High. Usually, the protein is "background" (cartoon) and the ligand is "foreground" (sticks).
*   **Implementation:** Medium.
    *   Add an `isHetatm` flag to the `ParsedAtom` and `Atom` types.
    *   Update `CanvasContext.buildStructure` to default `isHetatm` residues to `both` (points+lines) mode while keeping proteins in `ribbon` mode.

### Non-Covalent Interaction Visualization (H-Bonds)
*   **Biological Value:** High. Essential for explaining binding affinity and specificity.
*   **Implementation:** Medium.
    *   Implement a geometric search (Donor-Acceptor pairs within ~3.0Å) in a new `findHydrogenBonds()` method.
    *   Render these as dashed lines using `ctx.setLineDash()`.

---

## 3. Medium-Value, Medium-Effort (Usability)

### In-Canvas Labeling
*   **Biological Value:** Medium. Facilitates quick identification of key residues (e.g., active site residues) without a sidebar.
*   **Implementation:** Medium.
    *   Add a `drawLabel()` method to render text at an atom's `(x, y)` position with occlusion handling.

### Synced Sequence Viewer
*   **Biological Value:** Medium. Helps map linear sequence data (mutations, conservation) to the 3D fold.
*   **Implementation:** Medium.
    *   Develop a separate DOM-based sequence component that interacts with `CanvasContext` to trigger highlights on hover/click.

---

## 4. High-Value, High-Effort (Long-Term Goals)

### Biological Assembly / Symmetry
*   **Biological Value:** Very High. Critical for visualizing functional units (dimers, capsids) that aren't fully represented in the asymmetric unit.
*   **Implementation:** Hard.
    *   Requires parsing `REMARK 350` (PDB) or `_struct_biol` (CIF) symmetry matrices and generating virtual coordinate copies.

### Molecular Surfaces (SES/SAS)
*   **Biological Value:** High. Necessary for visualizing binding pockets and "roominess."
*   **Implementation:** Very Hard.
    *   Calculating Solvent Excluded/Accessible surfaces is computationally expensive for a 2D engine; would likely require a simplified geometric approximation or a background worker.
