import * as THREE from 'three';
import { Structure, Atom, Bond, Chain, atomAtomDistance } from '../models';
import { Renderer, RenderOptions } from './renderer';
import { atom_radii, ATOM_SIZE, SecondaryStructureType, ColorMethod, RGB } from '../types';
import { buildGaussianSurface, effectiveRadius, SurfaceAtom } from '../surface';

// Resolve an atom's RGB color from its colorMethod (or a fallback). Mirrors
// the logic in Canvas2DRenderer.depthShadedColorString minus the depth tint —
// 3D shading is handled by the lighting model.
function atomRGB(a: Atom, fallback: ColorMethod = 'cpk'): RGB {
  const method = a.info.colorMethod || fallback;
  switch (method) {
    case 'ss': return a.ssColor();
    case 'chain': return a.chainColor();
    case 'b-factor': return a.bFactorColor();
    case 'hydrophobicity': return a.hydrophobicityColor();
    case 'formal-charge': return a.formalChargeColor();
    case 'cpk':
    default: return a.cpkColor();
  }
}

export class ThreeRenderer implements Renderer {
  private canvas!: HTMLCanvasElement;
  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer | null = null;
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  
  private atomsGroup: THREE.Group = new THREE.Group();
  private bondsGroup: THREE.Group = new THREE.Group();
  private ribbonsGroup: THREE.Group = new THREE.Group();
  private lightsGroup: THREE.Group = new THREE.Group();
  private measurementsGroup: THREE.Group = new THREE.Group();

  private instancedAtomsList: THREE.InstancedMesh[] = [];
  // Per-chain ordered backbone atoms for screen-space ribbon picking.
  private ribbonPickChains: Atom[][] = [];

  // Vignette overlay — a fullscreen quad rendered in clip space after the main
  // pass. Mirrors the radial darkening that Canvas2DRenderer paints over its
  // 2D output so the 3D and 2D renderers feel consistent.
  private vignetteScene: THREE.Scene | null = null;
  private vignetteCamera: THREE.OrthographicCamera | null = null;
  private vignetteMaterial: THREE.ShaderMaterial | null = null;

  // Three-step gradient ramp for cartoon shading. Without a gradientMap, MeshToonMaterial
  // defaults to a 2-step ramp that crushes the shadow side to near-black; a 3-step ramp
  // keeps shadows readable while still reading as cell-shaded.
  private toonGradient: THREE.DataTexture | null = null;

  // Cached surface mesh — rebuilding the Gaussian density grid + marching cubes
  // is the most expensive step in the scene by orders of magnitude. We hold the
  // built mesh between renders and only rebuild when the source atom positions
  // change (detected via a sampled position hash), and never during interaction.
  private surfaceCache: { mesh: THREE.Mesh | null; key: string; sampleCount: number } = {
    mesh: null,
    key: '',
    sampleCount: 0,
  };

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const aspect = width / height || 1;
    
    const frustumSize = height;
    this.camera = new THREE.OrthographicCamera(
      frustumSize * aspect / -2,
      frustumSize * aspect / 2,
      frustumSize / 2,
      frustumSize / -2,
      0.1,
      5000
    );
    this.camera.position.z = 1000;

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: true
      });
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(width, height, false);
    } catch (e) {
      console.error("Failed to create WebGL renderer:", e);
      return;
    }

    this.scene.add(this.atomsGroup);
    this.scene.add(this.bondsGroup);
    this.scene.add(this.ribbonsGroup);
    this.scene.add(this.lightsGroup);
    this.scene.add(this.measurementsGroup);

    this.setupLights();
    this.setupVignette();
    this.setupToonGradient();
    this.raycaster.params.Points!.threshold = 1;
  }

  private setupToonGradient(): void {
    // 3-stop ramp: deep shadow / midtone / full highlight.
    // Wider gaps between stops (18%→63%→100%) produce sharper, more visible
    // band transitions compared to the previous 4-stop soft ramp.
    const data = new Uint8Array([45, 160, 255]);
    const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    this.toonGradient = tex;
  }

  // Inverted-hull outline for cartoon geometry. Clones the geometry and displaces
  // each vertex outward by `d` world units along its computed vertex normal, then
  // renders the back faces in solid black. Works correctly for any closed or thick
  // geometry where computeVertexNormals() has already been called.
  private addCartoonOutline(geo: THREE.BufferGeometry, d = 0.14): void {
    const outlineGeo = geo.clone();
    const positions = outlineGeo.getAttribute('position') as THREE.BufferAttribute;
    const normals   = outlineGeo.getAttribute('normal')   as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      positions.setXYZ(
        i,
        positions.getX(i) + normals.getX(i) * d,
        positions.getY(i) + normals.getY(i) * d,
        positions.getZ(i) + normals.getZ(i) * d,
      );
    }
    positions.needsUpdate = true;
    this.ribbonsGroup.add(new THREE.Mesh(outlineGeo,
      new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide })));
  }

  private setupVignette(): void {
    this.vignetteScene = new THREE.Scene();
    // Identity-projection camera; the vertex shader emits clip-space directly.
    this.vignetteCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.vignetteMaterial = new THREE.ShaderMaterial({
      uniforms: {
        // Larger offset = darker corners, larger inner clear area.
        offset:   { value: 1.6 },
        darkness: { value: 0.55 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float offset;
        uniform float darkness;
        varying vec2 vUv;
        void main() {
          vec2 uv = (vUv - 0.5) * offset;
          float d = clamp(dot(uv, uv), 0.0, 1.0);
          gl_FragColor = vec4(0.0, 0.0, 0.0, d * darkness);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.vignetteMaterial);
    quad.frustumCulled = false;
    this.vignetteScene.add(quad);
  }

  private setupLights(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    this.lightsGroup.add(ambientLight);

    // Key light: upper-left-front for primary shading
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.3);
    dirLight1.position.set(1, 2, 3);
    this.lightsGroup.add(dirLight1);

    // Subtle fill from lower-right to soften shadows
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.2);
    dirLight2.position.set(-1, -1, -2);
    this.lightsGroup.add(dirLight2);

    // Cool rim light from behind-left for edge definition
    const rimLight = new THREE.DirectionalLight(0x99aacc, 0.35);
    rimLight.position.set(-2, 0.5, -1);
    this.lightsGroup.add(rimLight);
  }

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
  private renderSurface(surfaceAtoms: Atom[], pointAtomsOut: Atom[], options: RenderOptions): void {
    if (surfaceAtoms.length === 0) return;

    if (options.isInteracting) {
      // Cheap fallback: route the surface atoms through the existing point
      // path so the molecule is still visible during rotation. Reusing the
      // last cached mesh would look broken (it would be in old positions
      // while the rest of the scene rotates).
      for (const a of surfaceAtoms) pointAtomsOut.push(a);
      return;
    }

    // Sampled position hash — 16 atoms is enough to detect any rotation
    // (rotations affect every atom uniformly) without per-frame cost scaling
    // with structure size.
    const sampleStep = Math.max(1, Math.floor(surfaceAtoms.length / 16));
    let h = 2166136261; // FNV-1a seed
    for (let i = 0; i < surfaceAtoms.length; i += sampleStep) {
      const a = surfaceAtoms[i];
      h = Math.imul(h ^ ((a.x * 1024) | 0), 16777619);
      h = Math.imul(h ^ ((a.y * 1024) | 0), 16777619);
      h = Math.imul(h ^ ((a.z * 1024) | 0), 16777619);
    }
    // Color method may have changed without atoms moving — encode it too.
    const cm = surfaceAtoms[0].info.colorMethod || 'cpk';
    const key = `${surfaceAtoms.length}|${cm}|${h}`;

    if (this.surfaceCache.mesh && this.surfaceCache.key === key) {
      this.atomsGroup.add(this.surfaceCache.mesh);
      return;
    }

    // Convert to SurfaceAtom — Y is flipped to match the rest of the 3D scene
    // (see atomsGroup positions below: `dummy.position.set(a.x, -a.y, a.z)`).
    const surfInput: SurfaceAtom[] = new Array(surfaceAtoms.length);
    for (let i = 0; i < surfaceAtoms.length; i++) {
      const a = surfaceAtoms[i];
      const elem = a.element || a.name;
      surfInput[i] = {
        x: a.x,
        y: -a.y,
        z: a.z,
        radius: effectiveRadius(elem, 1.0, 1.4),
        color: atomRGB(a, 'cpk'),
        ref: a,
      };
    }

    const mesh = buildGaussianSurface(surfInput);
    if (!mesh || mesh.vertexCount === 0) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(mesh.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.45,
      metalness: 0.05,
      side: THREE.DoubleSide,
      flatShading: false,
    });

    const threeMesh = new THREE.Mesh(geo, mat);

    // Dispose previous cached geometry/material to avoid GPU memory leaks.
    if (this.surfaceCache.mesh) {
      const old = this.surfaceCache.mesh;
      old.geometry.dispose();
      (old.material as THREE.Material).dispose();
    }

    this.surfaceCache.mesh = threeMesh;
    this.surfaceCache.key = key;
    this.surfaceCache.sampleCount = surfaceAtoms.length;
    this.atomsGroup.add(threeMesh);
  }

  render(elements: Structure[], bonds: Bond[], options: RenderOptions): void {
    if (!this.renderer) return;
    this.updateScene(elements, options);

    // Support panning by offsetting the camera position.
    // In our orthographic setup, 1 world unit = 1 pixel at zoom 1.
    // x_origin/y_origin are screen-space pixels from top-left.
    // We divide by zoom so that panning 10px on screen always moves the 
    // camera by the equivalent world distance, regardless of zoom level.
    const dx = (options.x_origin - this.canvas.width / 2) / options.zoom;
    const dy = (options.y_origin - this.canvas.height / 2) / options.zoom;
    this.camera.position.set(-dx, dy, 1000);
    this.camera.lookAt(-dx, dy, 0);

    this.camera.zoom = options.zoom;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);

    // Composite the vignette over the molecule. Only meaningful on dark
    // backgrounds; on light backgrounds the soft black halo would just look
    // like uneven exposure.
    if (options.isDarkBackground && this.vignetteScene && this.vignetteCamera) {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.vignetteScene, this.vignetteCamera);
      this.renderer.autoClear = true;
    }
  }

  private updateScene(elements: Structure[], options: RenderOptions): void {
    this.atomsGroup.clear();
    this.bondsGroup.clear();
    this.ribbonsGroup.clear();
    this.measurementsGroup.clear();
    this.instancedAtomsList = [];
    this.ribbonPickChains = [];

    const pointAtoms: Atom[] = [];
    const allBonds: Bond[] = [];
    const ribbonChains: Map<Chain, Atom[]> = new Map();
    const surfaceAtoms: Atom[] = [];

    for (const el of elements) {
      const atoms = el.getOfType(Atom);
      for (const a of atoms) {
        const method = a.info.drawMethod;

        if (['ribbon', 'cartoon', 'tube'].includes(method)) {
          if ((a.parent.isProtein() && a.original_atom_name === 'CA') ||
              (a.parent.isDNA() && a.original_atom_name === 'P')) {
            const c = a.parent.parent;
            if (!ribbonChains.has(c)) ribbonChains.set(c, []);
            ribbonChains.get(c)!.push(a);
          }
        }

        if (['points', 'both'].includes(method)) {
          pointAtoms.push(a);
        }

        if (method === 'surface') {
          surfaceAtoms.push(a);
        }
      }

      const collectBonds = (m: any) => {
        if (m.bonds) allBonds.push(...m.bonds);
        if (m.children) for (const c of m.children) collectBonds(c);
      };
      collectBonds(el);
    }

    // Collect ordered per-chain backbone atoms for screen-space ribbon picking.
    for (const atoms of ribbonChains.values()) {
      if (atoms.length > 0) this.ribbonPickChains.push(atoms);
    }

    // Render surface BEFORE points so points (used as a fallback during
    // interaction) draw inside or on top of the cached mesh, not behind it.
    this.renderSurface(surfaceAtoms, pointAtoms, options);

    // 1. Atoms — single instanced mesh with per-instance color so each atom can
    // honor its own colorMethod (cpk / ss / chain / b-factor / hydrophobicity).
    if (pointAtoms.length > 0) {
      // Atom radius in world units. Camera frustum is sized in pixels (frustumSize=height,
      // left/right=±width/2), so 1 world unit = 1 px at zoom=1. Dividing by zoom keeps
      // points a constant ~6px diameter on screen across zoom levels.
      const baseRadius = ATOM_SIZE / options.zoom;
      const sphereGeom = new THREE.SphereGeometry(1, 12, 12);
      // Three.js auto-enables `USE_INSTANCING_COLOR` when the InstancedMesh has an
      // instanceColor attribute; the material color is multiplied by it. Setting the
      // base color to white means the per-instance color shows through unchanged.
      const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.1 });
      const mesh = new THREE.InstancedMesh(sphereGeom, material, pointAtoms.length);
      const dummy = new THREE.Object3D();
      const tmpColor = new THREE.Color();
      for (let i = 0; i < pointAtoms.length; i++) {
        const a = pointAtoms[i];
        const relR = atom_radii[a.element] ?? atom_radii[a.name] ?? 1.0;
        const radius = baseRadius * relR * a.occupancy;
        dummy.position.set(a.x, -a.y, a.z);
        dummy.scale.set(radius, radius, radius);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        if (a.isHighlighted) {
          tmpColor.setRGB(1.0, 1.0, 0.0);
        } else {
          const c = atomRGB(a, 'cpk');
          tmpColor.setRGB(c[0] / 255, c[1] / 255, c[2] / 255);
        }
        mesh.setColorAt(i, tmpColor);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      (mesh.userData as any).atoms = pointAtoms;
      this.instancedAtomsList.push(mesh);
      this.atomsGroup.add(mesh);
    }

    // 2. Bonds
    this.renderBonds(allBonds, options);

    // 3. Ribbon / Cartoon / Tube
    // The atom's own colorMethod decides how the ribbon is colored. Falling back
    // to the scheme's ribbon_color_method preserves the historical 'ss' default
    // for the Modern preset; otherwise chain coloring matches 2D behavior.
    const ribbonFallback: ColorMethod = options.colorScheme?.ribbon_color_method === 'ss' ? 'ss' : 'chain';
    for (const [_chain, atoms] of ribbonChains) {
      if (atoms.length < 2) continue;
      const firstAtom = atoms[0];
      const method = firstAtom.info.drawMethod;

      if (method === 'tube') {
        const pts = atoms.map(a => new THREE.Vector3(a.x, -a.y, a.z));
        const curve = new THREE.CatmullRomCurve3(pts);
        const colorArr = atomRGB(firstAtom, ribbonFallback);
        const color = new THREE.Color(colorArr[0]/255, colorArr[1]/255, colorArr[2]/255);
        const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.0 });
        const geo = new THREE.TubeGeometry(curve, atoms.length * 10, 0.4, 16, false);
        this.ribbonsGroup.add(new THREE.Mesh(geo, mat));
      } else {
        this.buildRibbons(atoms, method, options, ribbonFallback);
      }
    }

    // 4. Measurements overlay
    this.renderMeasurements(options);
  }

  private renderMeasurements(options: RenderOptions): void {
    if (!options.measureStartAtom) return;

    const endAtom = options.measureEndAtom || options.highlightedAtom;
    if (endAtom === options.measureStartAtom) return;

    const s = options.measureStartAtom;
    const startPos = new THREE.Vector3(s.x, -s.y, s.z);

    let endPos: THREE.Vector3;
    if (endAtom) {
      endPos = new THREE.Vector3(endAtom.x, -endAtom.y, endAtom.z);
    } else {
      endPos = new THREE.Vector3(options.mouseX, -options.mouseY, s.z);
    }

    const points = [startPos, endPos];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const dashSize = 5 / options.zoom;
    const lineMat = new THREE.LineDashedMaterial({
      color: 0xff3333,
      dashSize,
      gapSize: dashSize,
      linewidth: 2,
    });
    const line = new THREE.Line(lineGeo, lineMat);
    line.computeLineDistances();
    this.measurementsGroup.add(line);

    if (!endAtom) return;

    const dist = atomAtomDistance(s, endAtom);
    const label = `${dist.toFixed(2)} Å`;
    const midPos = startPos.clone().lerp(endPos, 0.5);

    const texCanvas = document.createElement('canvas');
    texCanvas.width = 256;
    texCanvas.height = 64;
    const ctx2d = texCanvas.getContext('2d')!;
    ctx2d.clearRect(0, 0, 256, 64);
    ctx2d.font = 'bold 36px sans-serif';
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.strokeStyle = 'white';
    ctx2d.lineWidth = 6;
    ctx2d.strokeText(label, 128, 32);
    ctx2d.fillStyle = '#ff3333';
    ctx2d.fillText(label, 128, 32);

    const texture = new THREE.CanvasTexture(texCanvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.copy(midPos);
    const scale = 40 / options.zoom;
    sprite.scale.set(scale * 4, scale, 1);
    this.measurementsGroup.add(sprite);
  }

  private renderBonds(allBonds: Bond[], options: RenderOptions): void {
    const lineBonds: Bond[] = [];
    const bothBonds: Bond[] = [];
    const thickBonds: Bond[] = [];

    for (const b of allBonds) {
      const m1 = b.a1.info.drawMethod;
      const m2 = b.a2.info.drawMethod;

      // Cartoon and ribbon are represented entirely by ribbon geometry — bonds
      // between two such atoms would obscure the ribbon (matches Canvas2D
      // drawLines, which skips cartoon/ribbon bonds). Cross-mode bonds (e.g.
      // cartoon protein to a lines-mode ligand) still draw via the lines path.
      const r1 = m1 === 'cartoon' || m1 === 'ribbon';
      const r2 = m2 === 'cartoon' || m2 === 'ribbon';
      if (r1 && r2) continue;

      if (m1 === 'both' || m2 === 'both') {
        bothBonds.push(b);
      } else if (m1 === 'lines' || m2 === 'lines') {
        lineBonds.push(b);
      } else if (m1 === 'tube' || m2 === 'tube') {
        thickBonds.push(b);
      }
    }

    if (bothBonds.length > 0) {
      // Points and lines mode: very thin, semi-transparent bonds.
      this.renderInstancedBonds(bothBonds, 0.6 / options.zoom, options, true, 0.4);
    }
    if (lineBonds.length > 0) {
      this.renderInstancedBonds(lineBonds, 1.0 / options.zoom, options, true);
    }
    if (thickBonds.length > 0) {
      // Tube side-chain bonds — thin lines, like Canvas2D's tube mode where the
      // backbone is the tube and side chains read as light hash marks.
      this.renderInstancedBonds(thickBonds, 1.0 / options.zoom, options, true);
    }
  }

  private renderInstancedBonds(bonds: Bond[], radius: number, options: RenderOptions, splitColor: boolean, opacity: number = 1.0): void {
    const cylinderGeom = new THREE.CylinderGeometry(1, 1, 1, 6);
    cylinderGeom.rotateX(Math.PI / 2);

    // Two half-cylinders per bond when splitColor, one full cylinder otherwise.
    const count = splitColor ? bonds.length * 2 : bonds.length;
    // Base color must be white when relying on per-instance instanceColor (it is
    // multiplied with the material color). For non-split bonds we use a single
    // neutral grey across all instances.
    const material = new THREE.MeshStandardMaterial({
      color: splitColor ? 0xffffff : 0x888888,
      roughness: 0.4,
      transparent: opacity < 1.0,
      opacity: opacity,
    });
    const mesh = new THREE.InstancedMesh(cylinderGeom, material, count);
    const dummy = new THREE.Object3D();
    const tmpColor = new THREE.Color();
    const p1 = new THREE.Vector3();
    const p2 = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const halfPos = new THREE.Vector3();

    let idx = 0;
    for (const b of bonds) {
      p1.set(b.a1.x, -b.a1.y, b.a1.z);
      p2.set(b.a2.x, -b.a2.y, b.a2.z);

      if (splitColor) {
        mid.copy(p1).add(p2).multiplyScalar(0.5);
        const half = p1.distanceTo(p2) / 2;

        // Half 1: a1 → midpoint, colored by a1.
        halfPos.copy(p1).add(mid).multiplyScalar(0.5);
        dummy.position.copy(halfPos);
        dummy.lookAt(mid);
        dummy.scale.set(radius, radius, half);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
        const c1 = atomRGB(b.a1, 'cpk');
        tmpColor.setRGB(c1[0] / 255, c1[1] / 255, c1[2] / 255);
        mesh.setColorAt(idx, tmpColor);
        idx++;

        // Half 2: a2 → midpoint, colored by a2.
        halfPos.copy(p2).add(mid).multiplyScalar(0.5);
        dummy.position.copy(halfPos);
        dummy.lookAt(mid);
        dummy.scale.set(radius, radius, half);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
        const c2 = atomRGB(b.a2, 'cpk');
        tmpColor.setRGB(c2[0] / 255, c2[1] / 255, c2[2] / 255);
        mesh.setColorAt(idx, tmpColor);
        idx++;
      } else {
        const dist = p1.distanceTo(p2);
        dummy.position.copy(p1).add(p2).multiplyScalar(0.5);
        dummy.lookAt(p2);
        dummy.scale.set(radius, radius, dist);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
        idx++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.bondsGroup.add(mesh);
  }

  // Split a chain's CA atoms into contiguous secondary-structure segments,
  // overlapping by 1 atom at each boundary so adjacent curves meet smoothly.
  private splitBySSType(atoms: Atom[]): Array<{ atoms: Atom[]; ss: SecondaryStructureType }> {
    const result: Array<{ atoms: Atom[]; ss: SecondaryStructureType }> = [];
    if (atoms.length === 0) return result;

    let segStart = 0;
    for (let i = 1; i <= atoms.length; i++) {
      const atEnd = i === atoms.length || atoms[i].parent.ss !== atoms[segStart].parent.ss;
      if (atEnd) {
        const from = Math.max(0, segStart - 1);
        const to = Math.min(atoms.length, i + 1);
        result.push({ atoms: atoms.slice(from, to), ss: atoms[segStart].parent.ss });
        segStart = i;
      }
    }
    return result;
  }

  // Dispatch each SS segment to the appropriate geometry builder.
  private buildRibbons(atoms: Atom[], method: string, options: RenderOptions, ribbonFallback: ColorMethod): void {
    const segs = this.splitBySSType(atoms);

    for (const seg of segs) {
      if (seg.atoms.length < 2) continue;
      const pts = seg.atoms.map(a => new THREE.Vector3(a.x, -a.y, a.z));
      const curve = new THREE.CatmullRomCurve3(pts);

      // Color the segment using the middle atom's resolved color. b-factor /
      // hydrophobicity get a per-segment readout (not per-residue), but that
      // matches how the 2D renderer colors ribbon segments today.
      const midAtom = seg.atoms[Math.floor(seg.atoms.length / 2)];
      const c = atomRGB(midAtom, ribbonFallback);
      const color = new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255);

      const isCartoon = method === 'cartoon';
      const isSegHighlighted = seg.atoms.some(a => a.isHighlighted || a.parent.isHighlighted);
      const segColor = isSegHighlighted ? new THREE.Color(1, 0.85, 0) : color;
      const mat = isCartoon
        ? new THREE.MeshToonMaterial({ color: segColor, gradientMap: this.toonGradient })
        : new THREE.MeshStandardMaterial({ color: segColor, roughness: 0.55, metalness: 0.0 });

      if (seg.ss === 'helix') {
        this.buildHelixRibbon(seg.atoms, curve, method, mat, isCartoon);
      } else if (seg.ss === 'loop') {
        const radius = isCartoon ? 0.28 : 0.14;
        const geo = new THREE.TubeGeometry(curve, seg.atoms.length * 8, radius, 8, false);
        this.ribbonsGroup.add(new THREE.Mesh(geo, mat));
        if (isCartoon) this.addCartoonOutline(geo);
      } else {
        // sheet: flat ribbon with arrowhead, using parallel-transport framing
        this.buildSheetRibbon(seg.atoms, curve, method, mat, isCartoon);
      }
    }
  }

  // Flat wide ribbon for helices, oriented using the helix barrel axis as a stable
  // normal reference. The binormal = tangent × helixAxis spirals smoothly with the
  // helix, giving the classic coiled-ribbon appearance without the wild spinning
  // caused by the CA→O normal (which rotates ~100° per residue in an alpha helix).
  private buildHelixRibbon(atoms: Atom[], curve: THREE.CatmullRomCurve3, _method: string, mat: THREE.Material, isCartoon: boolean): void {
    const segs = atoms.length * 20;
    const points = curve.getPoints(segs);

    // Cartoon = wider, fatter band so the cell-shaded outline reads clearly.
    const width = isCartoon ? 1.7 : 0.9;
    const thickness = isCartoon ? 0.5 : 0.2;

    // Helix axis: overall start→end direction of the segment.
    // Using this as a fixed reference keeps the ribbon plane stable as it
    // winds around the helix, rather than tracking each individual CA→O vector.
    const firstPt = new THREE.Vector3(atoms[0].x, -atoms[0].y, atoms[0].z);
    const lastPt  = new THREE.Vector3(atoms[atoms.length - 1].x, -atoms[atoms.length - 1].y, atoms[atoms.length - 1].z);
    const helixAxis = lastPt.clone().sub(firstPt).normalize();

    const vertices: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= segs; i++) {
      const pos = points[i];
      const tangent = curve.getTangent(i / segs).normalize();

      // Binormal: tangent × helixAxis — spirals with the helix smoothly.
      let binormal = new THREE.Vector3().crossVectors(tangent, helixAxis).normalize();
      if (binormal.lengthSq() < 0.01) {
        binormal = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(1, 0, 0)).normalize();
      }
      const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();

      const hT = thickness / 2;
      const pFL = pos.clone().addScaledVector(binormal,  width).addScaledVector(normal,  hT);
      const pFR = pos.clone().addScaledVector(binormal, -width).addScaledVector(normal,  hT);
      const pBL = pos.clone().addScaledVector(binormal,  width).addScaledVector(normal, -hT);
      const pBR = pos.clone().addScaledVector(binormal, -width).addScaledVector(normal, -hT);

      vertices.push(pFL.x, pFL.y, pFL.z, pFR.x, pFR.y, pFR.z, pBL.x, pBL.y, pBL.z, pBR.x, pBR.y, pBR.z);
    }

    for (let i = 0; i < segs; i++) {
      const b = i * 4, nn = (i + 1) * 4;
      indices.push(b, b+1, nn,   b+1, nn+1, nn);
      indices.push(b+2, nn+2, b+3, b+3, nn+2, nn+3);
      indices.push(b, nn, b+2,   b+2, nn, nn+2);
      indices.push(b+1, b+3, nn+1, b+3, nn+3, nn+1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    this.ribbonsGroup.add(new THREE.Mesh(geo, mat));
    if (isCartoon) this.addCartoonOutline(geo);
  }

  // Flat ribbon with a tapered arrowhead at the C-terminal end of a sheet segment.
  // Uses parallel-transport framing so the ribbon stays flat instead of spinning
  // with the Frenet normal (which flips on tightly curved strands).
  private buildSheetRibbon(atoms: Atom[], curve: THREE.CatmullRomCurve3, _method: string, mat: THREE.Material, isCartoon: boolean): void {
    const segs = atoms.length * 20;
    const points = curve.getPoints(segs);

    const baseWidth = isCartoon ? 1.9 : 1.0;
    const thickness = isCartoon ? 0.42 : 0.16;

    // Seed the parallel-transport normal: world-up projected perpendicular to tangent.
    const t0 = curve.getTangent(0).normalize();
    const pN = new THREE.Vector3(0, 1, 0);
    pN.sub(t0.clone().multiplyScalar(pN.dot(t0))).normalize();
    if (pN.lengthSq() < 0.1) {
      pN.set(1, 0, 0).sub(t0.clone().multiplyScalar(t0.x)).normalize();
    }

    const vertices: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const pos = points[i];
      const tangent = curve.getTangent(t).normalize();

      // Parallel-transport: keep pN perpendicular to tangent without net rotation.
      pN.sub(tangent.clone().multiplyScalar(pN.dot(tangent))).normalize();
      const binormal = new THREE.Vector3().crossVectors(tangent, pN).normalize();
      const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();

      // Arrowhead on the last residue of the segment.
      const atomIdx = t * (atoms.length - 1);
      const lowIdx = Math.min(Math.floor(atomIdx), atoms.length - 2);
      const progress = atomIdx - lowIdx;

      let width = baseWidth;
      if (lowIdx === atoms.length - 2) {
        if (progress < 0.15) {
          width *= 1.0 + (progress / 0.15) * 0.65;      // flare to 1.65×
        } else {
          width *= 1.65 * (1.0 - (progress - 0.15) / 0.85); // linear taper to 0
        }
      }

      const hT = thickness / 2;
      const pFL = pos.clone().addScaledVector(binormal,  width).addScaledVector(normal,  hT);
      const pFR = pos.clone().addScaledVector(binormal, -width).addScaledVector(normal,  hT);
      const pBL = pos.clone().addScaledVector(binormal,  width).addScaledVector(normal, -hT);
      const pBR = pos.clone().addScaledVector(binormal, -width).addScaledVector(normal, -hT);

      vertices.push(pFL.x, pFL.y, pFL.z, pFR.x, pFR.y, pFR.z, pBL.x, pBL.y, pBL.z, pBR.x, pBR.y, pBR.z);
    }

    for (let i = 0; i < segs; i++) {
      const b = i * 4, nn = (i + 1) * 4;
      indices.push(b, b+1, nn,   b+1, nn+1, nn);      // front face
      indices.push(b+2, nn+2, b+3, b+3, nn+2, nn+3);  // back face
      indices.push(b, nn, b+2,   b+2, nn, nn+2);       // left edge
      indices.push(b+1, b+3, nn+1, b+3, nn+3, nn+1);  // right edge
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    this.ribbonsGroup.add(new THREE.Mesh(geo, mat));
    if (isCartoon) this.addCartoonOutline(geo);
  }

  resize(width: number, height: number): void {
    const aspect = width / height || 1;
    const frustumSize = height;
    this.camera.left = -frustumSize * aspect / 2;
    this.camera.right = frustumSize * aspect / 2;
    this.camera.top = frustumSize / 2;
    this.camera.bottom = -frustumSize / 2;
    this.camera.updateProjectionMatrix();
    if (this.renderer) this.renderer.setSize(width, height, false);
  }

  setBackgroundColor(color: string): void {
    this.scene.background = new THREE.Color(color);
  }

  getAtomAt(x: number, y: number, _zoom: number, _x_origin: number, _y_origin: number): Atom | null {
    if (!this.renderer) return null;
    const rect = this.canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.instancedAtomsList);
    if (intersects.length > 0) {
      const intersect = intersects[0];
      const mesh = intersect.object as THREE.InstancedMesh;
      const instanceId = intersect.instanceId;
      if (instanceId !== undefined && mesh.userData.atoms) return mesh.userData.atoms[instanceId];
    }

    // Fallback: screen-space search against ribbon backbone atoms + midpoints.
    if (this.ribbonPickChains.length === 0) return null;
    const w = rect.width;
    const h = rect.height;
    const tmp = new THREE.Vector3();
    const pickRadius = 35 * 35;
    let best: Atom | null = null;
    let bestDist = pickRadius;

    const check = (wx: number, wy: number, wz: number, a: Atom) => {
      tmp.set(wx, wy, wz).project(this.camera);
      const sx = (tmp.x + 1) * 0.5 * w;
      const sy = (-tmp.y + 1) * 0.5 * h;
      const d = (x - sx) ** 2 + (y - sy) ** 2;
      if (d < bestDist) { bestDist = d; best = a; }
    };

    for (const chain of this.ribbonPickChains) {
      for (let i = 0; i < chain.length; i++) {
        const a = chain[i];
        check(a.x, -a.y, a.z, a);
        if (i + 1 < chain.length) {
          const b = chain[i + 1];
          // Three interpolated points between consecutive CAs to densify coverage
          for (const t of [0.25, 0.5, 0.75]) {
            check(
              a.x + (b.x - a.x) * t,
              -(a.y + (b.y - a.y) * t),
              a.z + (b.z - a.z) * t,
              t < 0.5 ? a : b
            );
          }
        }
      }
    }
    return best;
  }

  clear(): void {
    this.atomsGroup.clear();
    this.bondsGroup.clear();
    this.ribbonsGroup.clear();
    this.measurementsGroup.clear();
    this.instancedAtomsList = [];
    this.disposeSurfaceCache();
  }

  dispose(): void {
    this.disposeSurfaceCache();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
  }

  private disposeSurfaceCache(): void {
    if (this.surfaceCache.mesh) {
      this.surfaceCache.mesh.geometry.dispose();
      (this.surfaceCache.mesh.material as THREE.Material).dispose();
      this.surfaceCache.mesh = null;
      this.surfaceCache.key = '';
    }
  }
}
