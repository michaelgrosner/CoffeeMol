# CoffeeMol: Prioritized Future Features

This document outlines potential features for CoffeeMol, weighted by their biological value and ease of implementation within the current 2D Canvas architecture.

## 1. High-Value, Medium-Effort (The "Pro" Upgrade)

### Non-Covalent Interaction Visualization (H-Bonds)
*   **Biological Value:** High. Essential for explaining binding affinity and specificity.
*   **Implementation:** Medium.
    *   Implement a geometric search (Donor-Acceptor pairs within ~3.0Å) in a new `findHydrogenBonds()` method.
    *   Render these as dashed lines using `ctx.setLineDash()`.

---

## 2. Medium-Value, Medium-Effort (Usability)

### In-Canvas Labeling
*   **Biological Value:** Medium. Facilitates quick identification of key residues (e.g., active site residues) without a sidebar.
*   **Implementation:** Medium.
    *   Add a `drawLabel()` method to render text at an atom's `(x, y)` position with occlusion handling.

### Synced Sequence Viewer
*   **Biological Value:** Medium. Helps map linear sequence data (mutations, conservation) to the 3D fold.
*   **Implementation:** Medium.
    *   Develop a separate DOM-based sequence component that interacts with `CanvasContext` to trigger highlights on hover/click.

---

## 3. High-Value, High-Effort (Long-Term Goals)

### Biological Assembly / Symmetry
*   **Biological Value:** Very High. Critical for visualizing functional units (dimers, capsids) that aren't fully represented in the asymmetric unit.
*   **Implementation:** Hard.
    *   Requires parsing `REMARK 350` (PDB) or `_struct_biol` (CIF) symmetry matrices and generating virtual coordinate copies.

### Molecular Surfaces (SES/SAS)
*   **Biological Value:** High. Necessary for visualizing binding pockets and "roominess."
*   **Implementation:** Very Hard.
    *   Calculating Solvent Excluded/Accessible surfaces is computationally expensive for a 2D engine; would likely require a simplified geometric approximation or a background worker.
