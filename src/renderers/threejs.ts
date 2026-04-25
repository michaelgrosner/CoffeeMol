import * as THREE from 'three';
import { Structure, Atom, Bond, Chain, sortByZ, atomAtomDistance } from '../models';
import { Renderer, RenderOptions } from './renderer';
import { atom_radii, ATOM_SIZE } from '../types';

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
  
  private instancedAtomsList: THREE.InstancedMesh[] = [];

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

    this.setupLights();
    this.raycaster.params.Points!.threshold = 1;
  }

  private setupLights(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.lightsGroup.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight1.position.set(1, 1, 2);
    this.lightsGroup.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight2.position.set(-1, -1, -2);
    this.lightsGroup.add(dirLight2);
  }

  render(elements: Structure[], bonds: Bond[], options: RenderOptions): void {
    if (!this.renderer) return;
    this.updateScene(elements, options);
    this.camera.zoom = options.zoom;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  private updateScene(elements: Structure[], options: RenderOptions): void {
    this.atomsGroup.clear();
    this.bondsGroup.clear();
    this.ribbonsGroup.clear();
    this.instancedAtomsList = [];

    const atomsByElement: Map<string, Atom[]> = new Map();
    const allBonds: Bond[] = [];
    const ribbonChains: Map<Chain, Atom[]> = new Map();

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
          if (!atomsByElement.has(a.name)) atomsByElement.set(a.name, []);
          atomsByElement.get(a.name)!.push(a);
        }
      }

      const collectBonds = (m: any) => {
        if (m.bonds) allBonds.push(...m.bonds);
        if (m.children) for (const c of m.children) collectBonds(c);
      };
      collectBonds(el);
    }

    // 1. Atoms
    const sphereGeom = new THREE.SphereGeometry(1, 12, 12);
    for (const [elementName, atoms] of atomsByElement) {
      const relR = atom_radii[elementName] ?? 1.0;
      const radius = (ATOM_SIZE * relR) / options.zoom;
      const colorArr = atoms[0].cpkColor();
      const color = new THREE.Color(colorArr[0] / 255, colorArr[1] / 255, colorArr[2] / 255);
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.1 });
      const instancedMesh = new THREE.InstancedMesh(sphereGeom, material, atoms.length);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < atoms.length; i++) {
        const a = atoms[i];
        dummy.position.set(a.x, -a.y, a.z);
        dummy.scale.set(radius, radius, radius);
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(i, dummy.matrix);
      }
      (instancedMesh.userData as any).atoms = atoms;
      this.instancedAtomsList.push(instancedMesh);
      this.atomsGroup.add(instancedMesh);
    }

    // 2. Bonds
    this.renderBonds(allBonds, options);

    // 3. Ribbon / Cartoon / Tube
    for (const [chain, atoms] of ribbonChains) {
      if (atoms.length < 2) continue;
      const points = atoms.map(a => new THREE.Vector3(a.x, -a.y, a.z));
      const curve = new THREE.CatmullRomCurve3(points);
      const firstAtom = atoms[0];
      const method = firstAtom.info.drawMethod;
      const colorArr = firstAtom.chainColor();
      const baseColor = new THREE.Color(colorArr[0]/255, colorArr[1]/255, colorArr[2]/255);
      const material = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.4, metalness: 0.1 });

      if (method === 'tube') {
        const geometry = new THREE.TubeGeometry(curve, atoms.length * 8, 0.4, 12, false);
        this.ribbonsGroup.add(new THREE.Mesh(geometry, material));
      } else {
        this.buildAdvancedRibbon(atoms, curve, method, material, options);
      }
    }
  }

  private renderBonds(allBonds: Bond[], options: RenderOptions): void {
    const lineBonds: Bond[] = [];
    const thickBonds: Bond[] = [];

    for (const b of allBonds) {
      const m1 = b.a1.info.drawMethod;
      const m2 = b.a2.info.drawMethod;

      if (['lines', 'both'].includes(m1) || ['lines', 'both'].includes(m2)) {
        lineBonds.push(b);
      } else if (['tube', 'cartoon'].includes(m1) || ['tube', 'cartoon'].includes(m2)) {
        thickBonds.push(b);
      }
    }

    if (lineBonds.length > 0) {
      // Match 2D lineWidth (0.15 diameter -> 0.075 radius)
      this.renderInstancedBonds(lineBonds, 0.075, options, true);
    }
    if (thickBonds.length > 0) {
      // Match 2D tube width (0.4-0.8 diameter -> 0.2-0.4 radius). Using 0.3 as a good middle ground.
      this.renderInstancedBonds(thickBonds, 0.3, options, false);
    }
  }

  private renderInstancedBonds(bonds: Bond[], radius: number, options: RenderOptions, splitCPK: boolean): void {
    const cylinderGeom = new THREE.CylinderGeometry(1, 1, 1, 6);
    cylinderGeom.rotateX(Math.PI / 2);

    if (splitCPK) {
      const elementPairs: Map<string, Array<{pos: THREE.Vector3, target: THREE.Vector3, dist: number, atom: Atom}>> = new Map();

      for (const b of bonds) {
        const p1 = new THREE.Vector3(b.a1.x, -b.a1.y, b.a1.z);
        const p2 = new THREE.Vector3(b.a2.x, -b.a2.y, b.a2.z);
        const mid = new THREE.Vector3().copy(p1).add(p2).multiplyScalar(0.5);
        const distHalf = p1.distanceTo(p2) / 2;

        const name1 = b.a1.name;
        if (!elementPairs.has(name1)) elementPairs.set(name1, []);
        elementPairs.get(name1)!.push({ pos: new THREE.Vector3().copy(p1).add(mid).multiplyScalar(0.5), target: mid, dist: distHalf, atom: b.a1 });

        const name2 = b.a2.name;
        if (!elementPairs.has(name2)) elementPairs.set(name2, []);
        elementPairs.get(name2)!.push({ pos: new THREE.Vector3().copy(p2).add(mid).multiplyScalar(0.5), target: mid, dist: distHalf, atom: b.a2 });
      }

      for (const [name, instances] of elementPairs) {
        const colorArr = instances[0].atom.cpkColor();
        const color = new THREE.Color(colorArr[0]/255, colorArr[1]/255, colorArr[2]/255);
        // Fully opaque, slightly less rough for more highlight
        const material = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
        const mesh = new THREE.InstancedMesh(cylinderGeom, material, instances.length);
        const dummy = new THREE.Object3D();

        for (let i = 0; i < instances.length; i++) {
          const inst = instances[i];
          dummy.position.copy(inst.pos);
          dummy.lookAt(inst.target);
          dummy.scale.set(radius, radius, inst.dist);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
        this.bondsGroup.add(mesh);
      }
    } else {
      const material = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5 });
      const mesh = new THREE.InstancedMesh(cylinderGeom, material, bonds.length);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < bonds.length; i++) {
        const b = bonds[i];
        const p1 = new THREE.Vector3(b.a1.x, -b.a1.y, b.a1.z);
        const p2 = new THREE.Vector3(b.a2.x, -b.a2.y, b.a2.z);
        const dist = p1.distanceTo(p2);
        dummy.position.copy(p1).add(p2).multiplyScalar(0.5);
        dummy.lookAt(p2);
        dummy.scale.set(radius, radius, dist);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      this.bondsGroup.add(mesh);
    }
  }

  private buildAdvancedRibbon(atoms: Atom[], curve: THREE.CatmullRomCurve3, method: string, material: THREE.MeshStandardMaterial, options: RenderOptions): void {
    const segments = atoms.length * 10;
    const points = curve.getPoints(segments);
    const tangents = curve.getSpacedPoints(segments).map((_, i) => curve.getTangent(i / segments));
    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const indices: number[] = [];

    const normals: THREE.Vector3[] = [];
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      const oxygen = atom.parent.children.find(a => (a as Atom).original_atom_name === 'O') as Atom;
      normals.push(oxygen ? new THREE.Vector3(oxygen.x - atom.x, -(oxygen.y - atom.y), oxygen.z - atom.z).normalize() : new THREE.Vector3(0, 1, 0));
    }

    const smoothedNormals: THREE.Vector3[] = [];
    for (let i = 0; i < normals.length; i++) {
      const smoothed = new THREE.Vector3(0, 0, 0);
      for (let j = i - 2; j <= i + 2; j++) {
        if (j >= 0 && j < normals.length) smoothed.add(normals[j]);
      }
      smoothedNormals.push(smoothed.normalize());
    }

    const edgeVerticesFrontL: THREE.Vector3[] = [];
    const edgeVerticesFrontR: THREE.Vector3[] = [];
    const thickness = method === 'cartoon' ? 0.3 : 0.15;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const pos = points[i];
      const tangent = tangents[i];
      const atomIdx = t * (atoms.length - 1);
      const lowIdx = Math.floor(atomIdx);
      const alpha = atomIdx - lowIdx;
      
      const n = new THREE.Vector3().lerpVectors(smoothedNormals[lowIdx], smoothedNormals[Math.min(lowIdx + 1, smoothedNormals.length-1)], alpha).normalize();
      const binormal = new THREE.Vector3().crossVectors(tangent, n).normalize();
      if (binormal.length() < 0.1) binormal.crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
      const actualNormal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();

      const atom = atoms[lowIdx];
      const ss = atom.parent.ss;
      
      let width = 0.4;
      if (ss === 'helix') width = method === 'cartoon' ? 1.0 : 0.7;
      else if (ss === 'sheet') width = method === 'cartoon' ? 1.3 : 0.9;
      else width = 0.25;

      if (ss === 'sheet' && (lowIdx === atoms.length - 1 || atoms[lowIdx + 1].parent.ss !== 'sheet')) {
        const progressInResidue = atomIdx % 1.0;
        if (progressInResidue > 0.3) {
          const taper = 1.0 - (progressInResidue - 0.3) / 0.7;
          width *= (1.2 + (1.0 - taper) * 0.8) * taper;
        }
      }

      const halfThickness = thickness / 2;
      const pFrontLeft = pos.clone().add(binormal.clone().multiplyScalar(width)).add(actualNormal.clone().multiplyScalar(halfThickness));
      const pFrontRight = pos.clone().add(binormal.clone().multiplyScalar(-width)).add(actualNormal.clone().multiplyScalar(halfThickness));
      const pBackLeft = pos.clone().add(binormal.clone().multiplyScalar(width)).add(actualNormal.clone().multiplyScalar(-halfThickness));
      const pBackRight = pos.clone().add(binormal.clone().multiplyScalar(-width)).add(actualNormal.clone().multiplyScalar(-halfThickness));

      vertices.push(pFrontLeft.x, pFrontLeft.y, pFrontLeft.z);
      vertices.push(pFrontRight.x, pFrontRight.y, pFrontRight.z);
      vertices.push(pBackLeft.x, pBackLeft.y, pBackLeft.z);
      vertices.push(pBackRight.x, pBackRight.y, pBackRight.z);
      
      edgeVerticesFrontL.push(pFrontLeft);
      edgeVerticesFrontR.push(pFrontRight);
    }

    for (let i = 0; i < segments; i++) {
      const b = i * 4;
      const n = (i + 1) * 4;
      indices.push(b+0, b+1, n+0); indices.push(b+1, n+1, n+0);
      indices.push(b+2, n+2, b+3); indices.push(b+3, n+2, n+3);
      indices.push(b+0, n+0, b+2); indices.push(b+2, n+0, n+2);
      indices.push(b+1, b+3, n+1); indices.push(b+3, n+3, n+1);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    this.ribbonsGroup.add(new THREE.Mesh(geometry, material));

    const edgeColor = options.isDarkBackground ? 0x000000 : 0x333333;
    const edgeMat = new THREE.LineBasicMaterial({ color: edgeColor });
    this.ribbonsGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(edgeVerticesFrontL), edgeMat));
    this.ribbonsGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(edgeVerticesFrontR), edgeMat));
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

  getAtomAt(x: number, y: number, zoom: number, x_origin: number, y_origin: number): Atom | null {
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
    return null;
  }

  clear(): void {
    this.atomsGroup.clear();
    this.bondsGroup.clear();
    this.ribbonsGroup.clear();
    this.instancedAtomsList = [];
  }

  dispose(): void {
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
  }
}
