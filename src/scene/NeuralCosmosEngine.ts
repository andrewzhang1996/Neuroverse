import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import type {
  AggregatedFlowSnapshot,
  FlowNodeInstance,
  ResolvedSynapseEdge,
  StellarNeuronAppearance,
  SynapseEdgeAppearance,
} from "../types/flow";
import { CameraRig } from "./cameraRig";
import {
  computeAllTargetPositions,
  computeOrbitParametersMap,
  evaluateSmoothOpticalArc,
  fillOrbitRingPositions,
  hash01,
  resolveEdgeAppearance,
  resolveNodeAppearance,
  type OrbitParameters,
  type TopologyMode,
} from "./layoutEngine";
import {
  AXON_FRAGMENT_SHADER,
  AXON_VERTEX_SHADER,
  CORONA_FRAGMENT_SHADER,
  CORONA_VERTEX_SHADER,
  PULSE_FRAGMENT_SHADER,
  PULSE_VERTEX_SHADER,
  SOMA_FRAGMENT_SHADER,
  SOMA_VERTEX_SHADER,
  STAR_FRAGMENT_SHADER,
  STAR_VERTEX_SHADER,
} from "./shaders";

export interface ProjectedNodeAnchor {
  id: string;
  x: number;
  y: number;
  screenRadius: number;
  visibleBehindCamera: boolean;
  distance: number;
}

export interface NeuralCosmosEngineCallbacks {
  onSelectNode: (nodeId: string) => void;
  onHoverNode: (nodeId: string | null) => void;
  onFrameProject: (anchors: ProjectedNodeAnchor[]) => void;
}

interface NodeVisual {
  id: string;
  instance: FlowNodeInstance;
  orbit: OrbitParameters;
  targetAppearance: StellarNeuronAppearance;
  currentPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  currentScale: number;
  currentIntensity: number;
  flashIntensity: number;
  birthDelay: number;
  stemProgress: number;
  budProgress: number;
  hasParentInScene: boolean;
  currentCoreColor: THREE.Color;
  currentHaloColor: THREE.Color;
  targetCoreColor: THREE.Color;
  targetHaloColor: THREE.Color;
  somaMesh: THREE.Mesh;
  somaMat: THREE.ShaderMaterial;
  coronaMesh: THREE.Mesh;
  coronaMat: THREE.ShaderMaterial;
  harnessRing: THREE.LineLoop | null;
  harnessRingMat: THREE.LineBasicMaterial | null;
  hitMesh: THREE.Mesh;
  hitMat: THREE.MeshBasicMaterial;
  orbitRing: THREE.LineLoop | null;
  orbitRingMat: THREE.LineBasicMaterial | null;
}

interface EdgeVisual {
  edge: ResolvedSynapseEdge;
  appearance: SynapseEdgeAppearance;
  axonMesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  positions: Float32Array;
  normals: Float32Array;
  spine: THREE.Vector3[];
  seedUp: THREE.Vector3;
  seedHash: number;
  growthRaw: number;
  notifiedArrival: boolean;
  prevPulseCycles: number[];
}

interface CollateralPair {
  idA: string;
  idB: string;
}

interface FarewellNodeEntry {
  vis: NodeVisual;
  age: number;
  duration: number;
  baseScale: number;
}

interface DyingEdgeEntry {
  vis: EdgeVisual;
  age: number;
  duration: number;
  initialOpacity: number;
}

interface FarewellEmberMote {
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  maxDrift: number;
  age: number;
  duration: number;
  size: number;
  color: THREE.Color;
}

const ORBIT_SEGMENTS = 96;
const AXON_SEGMENTS = 36;
const AXON_RING_COUNT = AXON_SEGMENTS + 1;
const AXON_RADIAL = 5;
const AXON_VERTEX_COUNT = AXON_RING_COUNT * AXON_RADIAL;
const MAX_COLLATERAL_PAIRS = 280;
const MAX_PULSES = 2048;

const RADIAL_COS = Array.from({ length: AXON_RADIAL }, (_, r) =>
  Math.cos((r / AXON_RADIAL) * Math.PI * 2)
);
const RADIAL_SIN = Array.from({ length: AXON_RADIAL }, (_, r) =>
  Math.sin((r / AXON_RADIAL) * Math.PI * 2)
);

export class NeuralCosmosEngine {
  private readonly container: HTMLElement;
  private readonly callbacks: NeuralCosmosEngineCallbacks;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly cameraRig: CameraRig;

  private readonly sharedPearlGeo: THREE.IcosahedronGeometry;
  private readonly sharedCoronaGeo: THREE.PlaneGeometry;
  private readonly sharedHitGeo: THREE.SphereGeometry;
  private readonly sharedHarnessRingGeo: THREE.BufferGeometry;
  private readonly sharedAxonIndices: THREE.BufferAttribute;
  private readonly sharedAxonProgress: THREE.BufferAttribute;

  private readonly starfieldPoints: THREE.Points;
  private readonly starfieldMat: THREE.ShaderMaterial;
  private readonly dustPoints: THREE.Points;
  private readonly dustMat: THREE.ShaderMaterial;
  private readonly dustBasePositions: Float32Array;
  private readonly ambientConnectomeGroup: THREE.Group;
  private readonly referenceGridGroup: THREE.Group;

  // Clean geometric constellation plexus lines between nearby nodes
  private readonly collateralGeometry: THREE.BufferGeometry;
  private readonly collateralMaterial: THREE.LineBasicMaterial;
  private readonly collateralLines: THREE.LineSegments;
  private readonly collateralPosAttr: THREE.BufferAttribute;
  private readonly collateralColorAttr: THREE.BufferAttribute;
  private collateralPairs: CollateralPair[] = [];

  // Smooth Optical Pulse Pool
  private readonly pulseGeometry: THREE.BufferGeometry;
  private readonly pulseMaterial: THREE.ShaderMaterial;
  private readonly pulsePoints: THREE.Points;
  private readonly pulsePosAttr: THREE.BufferAttribute;
  private readonly pulseSizeAttr: THREE.BufferAttribute;
  private readonly pulseColorAttr: THREE.BufferAttribute;
  private readonly pulseAlphaAttr: THREE.BufferAttribute;

  private readonly nodeMap = new Map<string, NodeVisual>();
  private readonly edgeMap = new Map<string, EdgeVisual>();
  private readonly dyingNodes: FarewellNodeEntry[] = [];
  private readonly dyingEdges: DyingEdgeEntry[] = [];
  private readonly farewellEmbers: FarewellEmberMote[] = [];
  private readonly targetPositions = new Map<string, THREE.Vector3>();
  private snapshot: AggregatedFlowSnapshot | null = null;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private pointerDownPos: { x: number; y: number } | null = null;
  private hoveredNodeId: string | null = null;

  private readonly resizeObserver: ResizeObserver;
  private width = 1;
  private height = 1;

  private rafId: number | null = null;
  private lastTimeMs = performance.now();
  private elapsedWallTime = 0;
  private simTime = 0;
  private paused = false;
  private speedMultiplier = 1;
  private topologyMode: TopologyMode = "neural";
  private showPlexus = true;
  private showGrid = true;
  private destroyed = false;

  private readonly tmpVec = new THREE.Vector3();
  private readonly tmpFwd = new THREE.Vector3();
  private readonly tmpPerp = new THREE.Vector3();
  private readonly tmpCtrl = new THREE.Vector3();
  private readonly tmpTangent = new THREE.Vector3();
  private readonly tmpNormal = new THREE.Vector3();
  private readonly tmpBinormal = new THREE.Vector3();
  private readonly tmpPulsePos = new THREE.Vector3();
  private readonly tmpColor = new THREE.Color();

  constructor(container: HTMLElement, callbacks: NeuralCosmosEngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    this.width = Math.max(container.clientWidth, 1);
    this.height = Math.max(container.clientHeight, 1);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(this.width, this.height);
    this.renderer.setClearColor(0x03060c, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;

    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x03060c);

    this.camera = new THREE.PerspectiveCamera(
      45,
      this.width / this.height,
      0.1,
      1400
    );
    this.cameraRig = new CameraRig(this.camera, this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.width, this.height),
      0.42,
      0.34,
      0.84
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    // Pure, mathematically smooth sphere geometry for all glass-pearl nodes
    this.sharedPearlGeo = new THREE.IcosahedronGeometry(1, 4);
    this.sharedCoronaGeo = new THREE.PlaneGeometry(1, 1);
    this.sharedHitGeo = new THREE.SphereGeometry(1, 14, 10);

    // Minimalist 2001-style hairline ring for Harness anchor hubs
    const hRingPts: THREE.Vector3[] = [];
    for (let i = 0; i < 64; i += 1) {
      const a = (i / 64) * Math.PI * 2;
      hRingPts.push(new THREE.Vector3(Math.cos(a) * 1.58, 0, Math.sin(a) * 1.58));
    }
    this.sharedHarnessRingGeo = new THREE.BufferGeometry().setFromPoints(hRingPts);

    const indices = new Uint16Array(AXON_SEGMENTS * AXON_RADIAL * 6);
    let iPtr = 0;
    for (let s = 0; s < AXON_SEGMENTS; s += 1) {
      for (let r = 0; r < AXON_RADIAL; r += 1) {
        const nextR = (r + 1) % AXON_RADIAL;
        const v0 = s * AXON_RADIAL + r;
        const v1 = s * AXON_RADIAL + nextR;
        const v2 = (s + 1) * AXON_RADIAL + r;
        const v3 = (s + 1) * AXON_RADIAL + nextR;
        indices[iPtr++] = v0;
        indices[iPtr++] = v2;
        indices[iPtr++] = v1;
        indices[iPtr++] = v1;
        indices[iPtr++] = v2;
        indices[iPtr++] = v3;
      }
    }
    this.sharedAxonIndices = new THREE.BufferAttribute(indices, 1);

    const progressArr = new Float32Array(AXON_VERTEX_COUNT);
    for (let s = 0; s < AXON_RING_COUNT; s += 1) {
      const t = s / AXON_SEGMENTS;
      for (let r = 0; r < AXON_RADIAL; r += 1) {
        progressArr[s * AXON_RADIAL + r] = t;
      }
    }
    this.sharedAxonProgress = new THREE.BufferAttribute(progressArr, 1);

    const stars = this.createStarfield(pixelRatio);
    this.starfieldPoints = stars.points;
    this.starfieldMat = stars.material;
    this.scene.add(this.starfieldPoints);

    const dust = this.createCosmicDust(pixelRatio);
    this.dustPoints = dust.points;
    this.dustMat = dust.material;
    this.dustBasePositions = dust.positions;
    this.scene.add(this.dustPoints);

    this.ambientConnectomeGroup = this.createAmbientConstellationScaffold(pixelRatio);
    this.scene.add(this.ambientConnectomeGroup);

    this.referenceGridGroup = this.createReferenceGrid();
    this.referenceGridGroup.visible = false;
    this.scene.add(this.referenceGridGroup);

    // Clean straight geometric Plexus triangulation between nearby nodes
    const maxColVerts = MAX_COLLATERAL_PAIRS * 2;
    this.collateralGeometry = new THREE.BufferGeometry();
    this.collateralPosAttr = new THREE.BufferAttribute(
      new Float32Array(maxColVerts * 3),
      3
    );
    this.collateralColorAttr = new THREE.BufferAttribute(
      new Float32Array(maxColVerts * 3),
      3
    );
    this.collateralPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.collateralColorAttr.setUsage(THREE.DynamicDrawUsage);
    this.collateralGeometry.setAttribute("position", this.collateralPosAttr);
    this.collateralGeometry.setAttribute("color", this.collateralColorAttr);
    this.collateralGeometry.setDrawRange(0, 0);

    this.collateralMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
    this.collateralLines = new THREE.LineSegments(
      this.collateralGeometry,
      this.collateralMaterial
    );
    this.collateralLines.frustumCulled = false;
    this.collateralLines.renderOrder = 0;
    this.scene.add(this.collateralLines);

    // Batched Optical Pulse Pool
    this.pulseGeometry = new THREE.BufferGeometry();
    this.pulsePosAttr = new THREE.BufferAttribute(
      new Float32Array(MAX_PULSES * 3),
      3
    );
    this.pulseSizeAttr = new THREE.BufferAttribute(new Float32Array(MAX_PULSES), 1);
    this.pulseColorAttr = new THREE.BufferAttribute(
      new Float32Array(MAX_PULSES * 3),
      3
    );
    this.pulseAlphaAttr = new THREE.BufferAttribute(
      new Float32Array(MAX_PULSES),
      1
    );

    this.pulsePosAttr.setUsage(THREE.DynamicDrawUsage);
    this.pulseSizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.pulseColorAttr.setUsage(THREE.DynamicDrawUsage);
    this.pulseAlphaAttr.setUsage(THREE.DynamicDrawUsage);

    this.pulseGeometry.setAttribute("position", this.pulsePosAttr);
    this.pulseGeometry.setAttribute("aSize", this.pulseSizeAttr);
    this.pulseGeometry.setAttribute("aColor", this.pulseColorAttr);
    this.pulseGeometry.setAttribute("aAlpha", this.pulseAlphaAttr);
    this.pulseGeometry.setDrawRange(0, 0);

    this.pulseMaterial = new THREE.ShaderMaterial({
      vertexShader: PULSE_VERTEX_SHADER,
      fragmentShader: PULSE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.pulsePoints = new THREE.Points(this.pulseGeometry, this.pulseMaterial);
    this.pulsePoints.frustumCulled = false;
    this.pulsePoints.renderOrder = 4;
    this.scene.add(this.pulsePoints);

    const dom = this.renderer.domElement;
    dom.addEventListener("pointermove", this.handlePointerMove);
    dom.addEventListener("pointerdown", this.handlePointerDown);
    dom.addEventListener("pointerup", this.handlePointerUp);
    dom.addEventListener("pointerleave", this.handlePointerLeave);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    this.animate();
  }

  private createStarfield(pixelRatio: number) {
    const count = 2000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    const warmAmber = new THREE.Color("#ffd9a8");
    const softIvory = new THREE.Color("#e8eef7");
    const iceBlue = new THREE.Color("#9ec5ff");

    for (let i = 0; i < count; i += 1) {
      const r = 180 + Math.random() * 340;
      const theta = Math.random() * Math.PI * 2;
      const cosPhi = Math.random() * 2 - 1;
      const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));

      positions[i * 3] = r * sinPhi * Math.cos(theta);
      positions[i * 3 + 1] = r * cosPhi;
      positions[i * 3 + 2] = r * sinPhi * Math.sin(theta);

      const roll = Math.random();
      const tint = roll < 0.18 ? warmAmber : roll < 0.62 ? softIvory : iceBlue;
      colors[i * 3] = tint.r;
      colors[i * 3 + 1] = tint.g;
      colors[i * 3 + 2] = tint.b;

      sizes[i] = 0.7 + Math.random() * 1.1;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader: STAR_VERTEX_SHADER,
      fragmentShader: STAR_FRAGMENT_SHADER,
      uniforms: {
        uOpacity: { value: 0.13 },
        uPixelRatio: { value: pixelRatio },
      },
      transparent: true,
      depthWrite: false,
    });

    const points = new THREE.Points(geo, material);
    points.renderOrder = -3;
    return { points, material };
  }

  private createCosmicDust(pixelRatio: number) {
    const count = 650;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    const synapticBlue = new THREE.Color("#6b9fd4");
    const bioTeal = new THREE.Color("#5bc4b8");
    const warmGold = new THREE.Color("#d9b489");

    for (let i = 0; i < count; i += 1) {
      const r = 10 + Math.random() * 90;
      const theta = Math.random() * Math.PI * 2;
      const cosPhi = (Math.random() - 0.5) * 1.65;
      const sinPhi = Math.sqrt(Math.max(0.08, 1 - cosPhi * cosPhi));

      positions[i * 3] = Math.cos(theta) * sinPhi * r;
      positions[i * 3 + 1] = cosPhi * r * 0.65;
      positions[i * 3 + 2] = Math.sin(theta) * sinPhi * r;

      const roll = Math.random();
      const c = roll < 0.55 ? synapticBlue : roll < 0.82 ? bioTeal : warmGold;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;

      sizes[i] = 1.0 + Math.random() * 1.4;
    }

    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", posAttr);
    geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader: STAR_VERTEX_SHADER,
      fragmentShader: STAR_FRAGMENT_SHADER,
      uniforms: {
        uOpacity: { value: 0.038 },
        uPixelRatio: { value: pixelRatio },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geo, material);
    points.renderOrder = -1;
    return { points, material, positions };
  }

  /**
   * Serene geometric constellation scaffold in deep background space.
   */
  private createAmbientConstellationScaffold(pixelRatio: number): THREE.Group {
    const group = new THREE.Group();
    const anchorCount = 64;
    const anchors: THREE.Vector3[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < anchorCount; i += 1) {
      const h1 = hash01(`bg-cortex:${i}:1`);
      const h2 = hash01(`bg-cortex:${i}:2`);
      const y = 1 - ((i + 0.5) / anchorCount) * 2;
      const rXZ = Math.sqrt(Math.max(0.02, 1 - y * y));
      const theta = i * golden + h1 * 0.6;
      const radius = 72 + h2 * 50;
      anchors.push(
        new THREE.Vector3(
          Math.cos(theta) * rXZ * radius,
          y * radius * 0.72,
          Math.sin(theta) * rXZ * radius
        )
      );
    }

    const nodePos = new Float32Array(anchorCount * 3);
    const nodeCol = new Float32Array(anchorCount * 3);
    const nodeSize = new Float32Array(anchorCount);
    const cNode = new THREE.Color("#6890bd");
    anchors.forEach((p, idx) => {
      nodePos[idx * 3] = p.x;
      nodePos[idx * 3 + 1] = p.y;
      nodePos[idx * 3 + 2] = p.z;
      nodeCol[idx * 3] = cNode.r;
      nodeCol[idx * 3 + 1] = cNode.g;
      nodeCol[idx * 3 + 2] = cNode.b;
      nodeSize[idx] = 1.8 + hash01(`bg-sz:${idx}`) * 1.4;
    });

    const nodeGeo = new THREE.BufferGeometry();
    nodeGeo.setAttribute("position", new THREE.BufferAttribute(nodePos, 3));
    nodeGeo.setAttribute("aColor", new THREE.BufferAttribute(nodeCol, 3));
    nodeGeo.setAttribute("aSize", new THREE.BufferAttribute(nodeSize, 1));
    const nodeMat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERTEX_SHADER,
      fragmentShader: STAR_FRAGMENT_SHADER,
      uniforms: {
        uOpacity: { value: 0.08 },
        uPixelRatio: { value: pixelRatio },
      },
      transparent: true,
      depthWrite: false,
    });
    const bgNodes = new THREE.Points(nodeGeo, nodeMat);
    bgNodes.renderOrder = -2;
    group.add(bgNodes);

    const segVerts: number[] = [];
    for (let i = 0; i < anchorCount; i += 1) {
      const candidates: Array<{ j: number; d: number }> = [];
      for (let j = i + 1; j < anchorCount; j += 1) {
        const d = anchors[i].distanceTo(anchors[j]);
        if (d < 54) candidates.push({ j, d });
      }
      candidates.sort((a, b) => a.d - b.d);
      const limit = Math.min(2, candidates.length);
      for (let k = 0; k < limit; k += 1) {
        const a = anchors[i];
        const b = anchors[candidates[k].j];
        segVerts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }

    const tractGeo = new THREE.BufferGeometry();
    tractGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(segVerts), 3)
    );
    const tractMat = new THREE.LineBasicMaterial({
      color: 0x3f628a,
      transparent: true,
      opacity: 0.065,
      depthWrite: false,
    });
    const bgTracts = new THREE.LineSegments(tractGeo, tractMat);
    bgTracts.renderOrder = -2;
    group.add(bgTracts);

    return group;
  }

  private createReferenceGrid(): THREE.Group {
    const group = new THREE.Group();
    const radii = [14, 28, 46, 68];
    const gridMat = new THREE.LineBasicMaterial({
      color: 0x6e85a3,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
    });

    for (const r of radii) {
      const pts: THREE.Vector3[] = [];
      const segs = 96;
      for (let i = 0; i < segs; i += 1) {
        const a = (i / segs) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, -0.05, Math.sin(a) * r));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      group.add(new THREE.LineLoop(geo, gridMat));
    }

    const radialPts: THREE.Vector3[] = [];
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      radialPts.push(new THREE.Vector3(Math.cos(a) * 10, -0.05, Math.sin(a) * 10));
      radialPts.push(new THREE.Vector3(Math.cos(a) * 72, -0.05, Math.sin(a) * 72));
    }
    const radialGeo = new THREE.BufferGeometry().setFromPoints(radialPts);
    group.add(new THREE.LineSegments(radialGeo, gridMat));

    return group;
  }

  private refreshVisibilityModes(): void {
    const isNeural = this.topologyMode === "neural";
    this.ambientConnectomeGroup.visible = isNeural && this.showGrid;
    this.referenceGridGroup.visible = !isNeural && this.showGrid;
    this.collateralLines.visible = isNeural && this.showPlexus;

    for (const vis of this.nodeMap.values()) {
      if (vis.orbitRing) {
        vis.orbitRing.visible = !isNeural && this.showPlexus;
      }
      if (vis.harnessRing) {
        vis.harnessRing.visible = isNeural;
      }
      vis.coronaMat.uniforms.uDiffraction.value =
        !isNeural && vis.instance.type === "harness" ? 1.0 : 0.0;
    }
  }

  private rebuildCollateralPairs(snapshot: AggregatedFlowSnapshot): void {
    const primaryPairs = new Set<string>();
    for (const e of snapshot.edges) {
      const k =
        e.source < e.target
          ? `${e.source}::${e.target}`
          : `${e.target}::${e.source}`;
      primaryPairs.add(k);
    }

    const nodes = snapshot.nodes;
    const chosen = new Map<string, CollateralPair>();

    const tryAddPair = (idA: string, idB: string) => {
      if (idA === idB || chosen.size >= MAX_COLLATERAL_PAIRS) return;
      const key = idA < idB ? `${idA}::${idB}` : `${idB}::${idA}`;
      if (primaryPairs.has(key) || chosen.has(key)) return;
      chosen.set(key, { idA, idB });
    };

    const harnesses = nodes.filter((n) => n.type === "harness");
    for (let i = 0; i < harnesses.length; i += 1) {
      for (let j = i + 1; j < harnesses.length; j += 1) {
        tryAddPair(harnesses[i].id, harnesses[j].id);
      }
    }

    const maxNeighbors = nodes.length > 80 ? 1 : 2;
    for (let i = 0; i < nodes.length; i += 1) {
      const visA = this.nodeMap.get(nodes[i].id);
      if (!visA) continue;
      const candidates: Array<{ id: string; d: number }> = [];
      for (let j = 0; j < nodes.length; j += 1) {
        if (i === j) continue;
        const visB = this.nodeMap.get(nodes[j].id);
        if (!visB) continue;
        const d = visA.orbit.neuralAnchor.distanceTo(visB.orbit.neuralAnchor);
        if (d < 18) candidates.push({ id: nodes[j].id, d });
      }
      candidates.sort((a, b) => a.d - b.d);
      const count = Math.min(maxNeighbors, candidates.length);
      for (let k = 0; k < count; k += 1) {
        tryAddPair(nodes[i].id, candidates[k].id);
      }
    }

    this.collateralPairs = Array.from(chosen.values());
  }

  private triggerFarewellAfterglow(vis: NodeVisual): void {
    // Remove hit target & orbit ring immediately so vanishing node is non-interactive
    this.scene.remove(vis.hitMesh);
    if (vis.orbitRing) {
      this.scene.remove(vis.orbitRing);
    }
    if (this.cameraRig.tetheredNodeId === vis.id) {
      this.cameraRig.tetheredNodeId = null;
    }

    const baseScale = Math.max(vis.currentScale, 0.4);
    this.dyingNodes.push({
      vis,
      age: 0,
      duration: 1.25,
      baseScale,
    });

    // Spawn 10 tiny, localized farewell stardust embers ("再见的余晖")
    const warmChampagne = new THREE.Color("#ffe5ad");
    const paleStarlight = new THREE.Color("#dff2ff");
    for (let i = 0; i < 10; i += 1) {
      const theta = (i / 10) * Math.PI * 2 + Math.random() * 0.5;
      const cosPhi = (Math.random() - 0.5) * 1.7;
      const sinPhi = Math.sqrt(Math.max(0.05, 1 - cosPhi * cosPhi));
      const dir = new THREE.Vector3(
        Math.cos(theta) * sinPhi,
        cosPhi + 0.18,
        Math.sin(theta) * sinPhi
      ).normalize();

      this.farewellEmbers.push({
        origin: vis.currentPos.clone(),
        dir,
        maxDrift: baseScale * (1.8 + Math.random() * 1.9),
        age: 0,
        duration: 1.05 + Math.random() * 0.35,
        size: 0.6 + Math.random() * 0.45,
        color: (i % 3 === 0 ? paleStarlight : warmChampagne).clone(),
      });
    }
  }

  public syncSnapshot(snapshot: AggregatedFlowSnapshot): void {
    this.snapshot = snapshot;
    const isMassClear = snapshot.nodes.length === 0 && this.nodeMap.size > 1;
    const paramsMap = computeOrbitParametersMap(
      snapshot.nodes,
      snapshot.definitions
    );
    computeAllTargetPositions(
      snapshot.nodes,
      paramsMap,
      this.simTime,
      this.targetPositions,
      this.topologyMode
    );

    const incomingNodeIds = new Set(snapshot.nodes.map((n) => n.id));
    for (const [id, visual] of this.nodeMap) {
      if (!incomingNodeIds.has(id)) {
        this.nodeMap.delete(id);
        if (!isMassClear && visual.instance.type === "subagent") {
          this.triggerFarewellAfterglow(visual);
        } else {
          this.disposeNodeVisual(visual);
        }
      }
    }

    for (const node of snapshot.nodes) {
      const appearance = resolveNodeAppearance(node, snapshot.definitions);
      const orbit = paramsMap.get(node.id)!;
      const targetPos =
        this.targetPositions.get(node.id) ?? new THREE.Vector3();

      const existing = this.nodeMap.get(node.id);
      if (existing) {
        const wasIdle =
          existing.instance.status !== "running" &&
          existing.instance.status !== "tool_calling";
        const nowFiring =
          node.status === "running" || node.status === "tool_calling";
        if (wasIdle && nowFiring) {
          existing.flashIntensity = Math.min(1.0, existing.flashIntensity + 0.8);
        }

        const hasParent = Boolean(
          node.parentId && incomingNodeIds.has(node.parentId)
        );
        existing.hasParentInScene = hasParent;
        existing.instance = node;
        existing.orbit = orbit;
        existing.targetAppearance = appearance;
        existing.targetPos.copy(targetPos);
        existing.targetCoreColor.set(appearance.coreColor);
        existing.targetHaloColor.set(appearance.haloColor);

        if (existing.orbitRing) {
          const posAttr = existing.orbitRing.geometry.getAttribute(
            "position"
          ) as THREE.BufferAttribute;
          fillOrbitRingPositions(
            orbit.orbitRadius,
            orbit.inclinationX,
            orbit.inclinationZ,
            posAttr.array as Float32Array,
            ORBIT_SEGMENTS
          );
          posAttr.needsUpdate = true;
        }
      } else {
        const hasParent = Boolean(
          node.parentId && incomingNodeIds.has(node.parentId)
        );
        const parentExisting = node.parentId
          ? this.nodeMap.get(node.parentId)
          : undefined;
        const created = this.createNodeVisual(
          node,
          orbit,
          appearance,
          targetPos,
          hasParent,
          parentExisting
        );
        this.nodeMap.set(node.id, created);
      }
    }

    const incomingEdgeIds = new Set(snapshot.edges.map((e) => e.id));
    for (const [id, edgeVis] of this.edgeMap) {
      if (!incomingEdgeIds.has(id)) {
        this.edgeMap.delete(id);
        if (!isMassClear) {
          this.dyingEdges.push({
            vis: edgeVis,
            age: 0,
            duration: 0.55,
            initialOpacity: edgeVis.appearance.opacity,
          });
        } else {
          this.disposeEdgeVisual(edgeVis);
        }
      }
    }

    for (const edge of snapshot.edges) {
      const appearance = resolveEdgeAppearance(edge, snapshot.definitions);
      const existing = this.edgeMap.get(edge.id);
      if (existing) {
        existing.edge = edge;
        existing.appearance = appearance;
        existing.material.uniforms.uBaseColor.value.set(appearance.color);
        existing.material.uniforms.uPulseColor.value.set(appearance.pulseColor);
        existing.material.uniforms.uOpacity.value = appearance.opacity;
        existing.material.uniforms.uPulseSpeed.value = appearance.pulseSpeed;
        existing.material.uniforms.uPulseCount.value = appearance.pulseCount;
      } else {
        this.edgeMap.set(edge.id, this.createEdgeVisual(edge, appearance));
      }
    }

    this.rebuildCollateralPairs(snapshot);
    this.refreshVisibilityModes();
  }

  private createNodeVisual(
    node: FlowNodeInstance,
    orbit: OrbitParameters,
    appearance: StellarNeuronAppearance,
    initialPos: THREE.Vector3,
    hasParentInScene: boolean,
    parentVis?: NodeVisual
  ): NodeVisual {
    const coreColor = new THREE.Color(appearance.coreColor);
    const haloColor = new THREE.Color(appearance.haloColor);
    const seed = hash01(node.id) * 100.0;

    // Cascade hierarchical growth: wait if parent itself is still growing/budding!
    let birthDelay = 0;
    if (hasParentInScene) {
      if (parentVis && parentVis.budProgress < 0.85) {
        const parentWait =
          parentVis.birthDelay +
          Math.max(0, 1 - parentVis.stemProgress) * 0.68 +
          Math.max(0, 0.85 - parentVis.budProgress) * 0.35;
        birthDelay = parentWait + hash01(`${node.id}:bd`) * 0.18;
      } else {
        birthDelay = hash01(`${node.id}:bd`) * 0.08;
      }
    } else if (orbit.tier > 0) {
      birthDelay = hash01(`${node.id}:bd`) * 0.12;
    }

    const stemProgress = hasParentInScene ? 0.0 : 1.0;
    const budProgress = 0.0;

    const somaMat = new THREE.ShaderMaterial({
      vertexShader: SOMA_VERTEX_SHADER,
      fragmentShader: SOMA_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: this.elapsedWallTime },
        uCoreColor: { value: coreColor.clone() },
        uHaloColor: { value: haloColor.clone() },
        uEmissiveIntensity: { value: appearance.emissiveIntensity },
        uPulseSpeed: { value: appearance.pulseSpeed },
        uPulseAmplitude: { value: appearance.pulseAmplitude },
        uSeed: { value: seed },
        uFlash: { value: 0.2 },
        uFarewell: { value: 0.0 },
      },
    });

    const somaMesh = new THREE.Mesh(this.sharedPearlGeo, somaMat);
    somaMesh.position.copy(initialPos);
    somaMesh.scale.setScalar(0.001);
    somaMesh.visible = false;
    somaMesh.renderOrder = 3;
    this.scene.add(somaMesh);

    const coronaMat = new THREE.ShaderMaterial({
      vertexShader: CORONA_VERTEX_SHADER,
      fragmentShader: CORONA_FRAGMENT_SHADER,
      uniforms: {
        uHaloColor: { value: haloColor.clone() },
        uCoreColor: { value: coreColor.clone() },
        uIntensity: { value: appearance.emissiveIntensity },
        uDiffraction: {
          value:
            this.topologyMode === "orbital" && node.type === "harness"
              ? 1.0
              : 0.0,
        },
        uFlash: { value: 0.2 },
        uFarewell: { value: 0.0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const coronaMesh = new THREE.Mesh(this.sharedCoronaGeo, coronaMat);
    coronaMesh.position.copy(initialPos);
    coronaMesh.scale.setScalar(0.001);
    coronaMesh.visible = false;
    coronaMesh.renderOrder = 2;
    this.scene.add(coronaMesh);

    let harnessRing: THREE.LineLoop | null = null;
    let harnessRingMat: THREE.LineBasicMaterial | null = null;

    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitMesh = new THREE.Mesh(this.sharedHitGeo, hitMat);
    hitMesh.position.copy(initialPos);
    hitMesh.scale.setScalar(Math.max(appearance.scale * 2.4, 1.15));
    hitMesh.userData.nodeId = node.id;
    this.scene.add(hitMesh);

    let orbitRing: THREE.LineLoop | null = null;
    let orbitRingMat: THREE.LineBasicMaterial | null = null;

    if (orbit.tier >= 1) {
      const ringBuf = new Float32Array(ORBIT_SEGMENTS * 3);
      fillOrbitRingPositions(
        orbit.orbitRadius,
        orbit.inclinationX,
        orbit.inclinationZ,
        ringBuf,
        ORBIT_SEGMENTS
      );
      const ringGeo = new THREE.BufferGeometry();
      ringGeo.setAttribute("position", new THREE.BufferAttribute(ringBuf, 3));
      orbitRingMat = new THREE.LineBasicMaterial({
        color: haloColor.clone(),
        transparent: true,
        opacity: appearance.orbitRingOpacity,
        depthWrite: false,
      });
      orbitRing = new THREE.LineLoop(ringGeo, orbitRingMat);
      orbitRing.visible = this.topologyMode === "orbital" && this.showPlexus;
      orbitRing.renderOrder = 0;
      this.scene.add(orbitRing);
    }

    return {
      id: node.id,
      instance: node,
      orbit,
      targetAppearance: appearance,
      currentPos: initialPos.clone(),
      targetPos: initialPos.clone(),
      currentScale: appearance.scale,
      currentIntensity: appearance.emissiveIntensity,
      flashIntensity: 0.2,
      birthDelay,
      stemProgress,
      budProgress,
      hasParentInScene,
      currentCoreColor: coreColor.clone(),
      currentHaloColor: haloColor.clone(),
      targetCoreColor: coreColor.clone(),
      targetHaloColor: haloColor.clone(),
      somaMesh,
      somaMat,
      coronaMesh,
      coronaMat,
      harnessRing,
      harnessRingMat,
      hitMesh,
      hitMat,
      orbitRing,
      orbitRingMat,
    };
  }

  private disposeNodeVisual(vis: NodeVisual): void {
    this.scene.remove(vis.somaMesh);
    vis.somaMat.dispose();

    this.scene.remove(vis.coronaMesh);
    vis.coronaMat.dispose();

    if (vis.harnessRing) {
      this.scene.remove(vis.harnessRing);
    }
    vis.harnessRingMat?.dispose();

    this.scene.remove(vis.hitMesh);
    vis.hitMat.dispose();

    if (vis.orbitRing) {
      this.scene.remove(vis.orbitRing);
      vis.orbitRing.geometry.dispose();
    }
    vis.orbitRingMat?.dispose();
  }

  private createEdgeVisual(
    edge: ResolvedSynapseEdge,
    appearance: SynapseEdgeAppearance
  ): EdgeVisual {
    const positions = new Float32Array(AXON_VERTEX_COUNT * 3);
    const normals = new Float32Array(AXON_VERTEX_COUNT * 3);
    const geometry = new THREE.BufferGeometry();

    const posAttr = new THREE.BufferAttribute(positions, 3);
    const normAttr = new THREE.BufferAttribute(normals, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    normAttr.setUsage(THREE.DynamicDrawUsage);

    geometry.setAttribute("position", posAttr);
    geometry.setAttribute("normal", normAttr);
    geometry.setAttribute("aProgress", this.sharedAxonProgress);
    geometry.setIndex(this.sharedAxonIndices);

    const seedHash = hash01(edge.id);
    const hAngle = seedHash * Math.PI * 2;
    const seedUp = new THREE.Vector3(
      Math.sin(hAngle),
      1.15 + hash01(`${edge.id}:up`) * 0.4,
      Math.cos(hAngle)
    ).normalize();

    const material = new THREE.ShaderMaterial({
      vertexShader: AXON_VERTEX_SHADER,
      fragmentShader: AXON_FRAGMENT_SHADER,
      uniforms: {
        uSimTime: { value: this.simTime },
        uBaseColor: { value: new THREE.Color(appearance.color) },
        uPulseColor: { value: new THREE.Color(appearance.pulseColor) },
        uOpacity: { value: appearance.opacity },
        uPulseSpeed: { value: appearance.pulseSpeed },
        uPulseCount: { value: appearance.pulseCount },
        uSeed: { value: seedHash },
        uGrowth: { value: 0.0 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      blending: THREE.NormalBlending,
    });

    const axonMesh = new THREE.Mesh(geometry, material);
    axonMesh.frustumCulled = false;
    axonMesh.renderOrder = 2;
    this.scene.add(axonMesh);

    const spine = Array.from(
      { length: AXON_RING_COUNT },
      () => new THREE.Vector3()
    );

    const prevPulseCycles: number[] = [];
    const maxTrack = Math.max(appearance.pulseCount, 8);
    for (let m = 0; m < maxTrack; m += 1) {
      const rawT =
        this.simTime * appearance.pulseSpeed +
        m / Math.max(appearance.pulseCount, 1) +
        seedHash;
      prevPulseCycles.push(Math.floor(rawT));
    }

    return {
      edge,
      appearance,
      axonMesh,
      geometry,
      material,
      positions,
      normals,
      spine,
      seedUp,
      seedHash,
      growthRaw: 0.0,
      notifiedArrival: false,
      prevPulseCycles,
    };
  }

  private disposeEdgeVisual(vis: EdgeVisual): void {
    this.scene.remove(vis.axonMesh);
    vis.geometry.setIndex(null);
    vis.geometry.deleteAttribute("aProgress");
    vis.geometry.dispose();
    vis.material.dispose();
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
  }

  public setSpeedMultiplier(speed: number): void {
    this.speedMultiplier = speed;
  }

  public setTopologyMode(mode: TopologyMode): void {
    if (this.topologyMode === mode) return;
    this.topologyMode = mode;
    this.refreshVisibilityModes();
  }

  public setShowOrbits(show: boolean): void {
    this.showPlexus = show;
    this.refreshVisibilityModes();
  }

  public setShowGrid(show: boolean): void {
    this.showGrid = show;
    this.refreshVisibilityModes();
  }

  public focusNode(nodeId: string): void {
    const vis = this.nodeMap.get(nodeId);
    if (!vis) return;
    this.cameraRig.focusNode(nodeId, vis.currentPos, vis.currentScale);
  }

  public resetOverview(): void {
    this.cameraRig.resetOverview();
  }

  private getHitMeshes(): THREE.Object3D[] {
    const arr: THREE.Object3D[] = [];
    for (const vis of this.nodeMap.values()) {
      if (vis.budProgress >= 0.4) {
        arr.push(vis.hitMesh);
      }
    }
    return arr;
  }

  private pickNodeAtEvent(ev: PointerEvent): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.pointerNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.getHitMeshes(), false);
    if (hits.length > 0) {
      const id = hits[0].object.userData.nodeId;
      return typeof id === "string" ? id : null;
    }
    return null;
  }

  private handlePointerMove = (ev: PointerEvent) => {
    const hitId = this.pickNodeAtEvent(ev);
    if (hitId !== this.hoveredNodeId) {
      this.hoveredNodeId = hitId;
      this.renderer.domElement.style.cursor = hitId ? "pointer" : "grab";
      this.callbacks.onHoverNode(hitId);
    }
  };

  private handlePointerDown = (ev: PointerEvent) => {
    this.pointerDownPos = { x: ev.clientX, y: ev.clientY };
  };

  private handlePointerUp = (ev: PointerEvent) => {
    if (!this.pointerDownPos) return;
    const dx = ev.clientX - this.pointerDownPos.x;
    const dy = ev.clientY - this.pointerDownPos.y;
    this.pointerDownPos = null;
    if (Math.hypot(dx, dy) >= 5) return;

    const hitId = this.pickNodeAtEvent(ev);
    if (hitId) {
      this.focusNode(hitId);
      this.callbacks.onSelectNode(hitId);
    }
  };

  private handlePointerLeave = () => {
    this.pointerDownPos = null;
    if (this.hoveredNodeId !== null) {
      this.hoveredNodeId = null;
      this.renderer.domElement.style.cursor = "grab";
      this.callbacks.onHoverNode(null);
    }
  };

  private handleResize(): void {
    if (this.destroyed) return;
    const nextW = Math.max(this.container.clientWidth, 1);
    const nextH = Math.max(this.container.clientHeight, 1);
    if (nextW === this.width && nextH === this.height) return;

    this.width = nextW;
    this.height = nextH;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(this.width, this.height);
    this.composer.setSize(this.width, this.height);
    this.bloomPass.setSize(this.width, this.height);

    this.starfieldMat.uniforms.uPixelRatio.value = pixelRatio;
    this.dustMat.uniforms.uPixelRatio.value = pixelRatio;
  }

  /**
   * Update uniformly sleek, bump-free optical fiber arc between src and dst.
   */
  private updateOpticalFiberGeometry(
    evis: EdgeVisual,
    src: NodeVisual,
    dst: NodeVisual
  ): void {
    const p0 = src.currentPos;
    const p3 = dst.currentPos;

    for (let s = 0; s < AXON_RING_COUNT; s += 1) {
      evaluateSmoothOpticalArc(
        p0,
        p3,
        evis.seedUp,
        evis.appearance.curveArc,
        s / AXON_SEGMENTS,
        evis.spine[s],
        this.tmpFwd,
        this.tmpPerp,
        this.tmpCtrl
      );
    }

    const isActive =
      evis.edge.status === "active" || evis.edge.status === "error";
    const radius =
      (evis.edge.type === "collaborates" ? 0.032 : 0.025) *
      (isActive ? 1.25 : 1.0);

    this.tmpNormal.copy(evis.seedUp);

    for (let s = 0; s < AXON_RING_COUNT; s += 1) {
      const prevIdx = Math.max(0, s - 1);
      const nextIdx = Math.min(AXON_SEGMENTS, s + 1);
      this.tmpTangent.subVectors(evis.spine[nextIdx], evis.spine[prevIdx]);
      if (this.tmpTangent.lengthSq() < 1e-6) {
        this.tmpTangent.set(0, 1, 0);
      } else {
        this.tmpTangent.normalize();
      }

      const dotTN = this.tmpNormal.dot(this.tmpTangent);
      this.tmpNormal.addScaledVector(this.tmpTangent, -dotTN);
      if (this.tmpNormal.lengthSq() < 1e-5) {
        this.tmpNormal.set(-this.tmpTangent.y, this.tmpTangent.x, 0.25);
      }
      this.tmpNormal.normalize();
      this.tmpBinormal.crossVectors(this.tmpTangent, this.tmpNormal).normalize();

      const t = s / AXON_SEGMENTS;
      const edgeFlare = Math.pow(Math.abs(t * 2 - 1), 3.0);
      const rLocal = radius * (0.78 + 0.72 * edgeFlare);

      const center = evis.spine[s];
      for (let r = 0; r < AXON_RADIAL; r += 1) {
        const c = RADIAL_COS[r];
        const sn = RADIAL_SIN[r];
        const nx = this.tmpNormal.x * c + this.tmpBinormal.x * sn;
        const ny = this.tmpNormal.y * c + this.tmpBinormal.y * sn;
        const nz = this.tmpNormal.z * c + this.tmpBinormal.z * sn;

        const vOffset = (s * AXON_RADIAL + r) * 3;
        evis.positions[vOffset] = center.x + nx * rLocal;
        evis.positions[vOffset + 1] = center.y + ny * rLocal;
        evis.positions[vOffset + 2] = center.z + nz * rLocal;

        evis.normals[vOffset] = nx;
        evis.normals[vOffset + 1] = ny;
        evis.normals[vOffset + 2] = nz;
      }
    }

    (evis.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate =
      true;
    (evis.geometry.getAttribute("normal") as THREE.BufferAttribute).needsUpdate =
      true;
  }

  private updateCollateralPlexus(): void {
    if (
      this.topologyMode !== "neural" ||
      !this.showPlexus ||
      this.collateralPairs.length === 0
    ) {
      this.collateralGeometry.setDrawRange(0, 0);
      return;
    }

    const posArr = this.collateralPosAttr.array as Float32Array;
    const colArr = this.collateralColorAttr.array as Float32Array;
    let vCount = 0;
    const slateTint = new THREE.Color("#567da8");

    for (const pair of this.collateralPairs) {
      const visA = this.nodeMap.get(pair.idA);
      const visB = this.nodeMap.get(pair.idB);
      if (!visA || !visB) continue;
      const ready = Math.min(visA.budProgress, visB.budProgress);
      if (ready < 0.7) continue;
      const fade = (ready - 0.7) / 0.3;

      const idx0 = vCount * 3;
      posArr[idx0] = visA.currentPos.x;
      posArr[idx0 + 1] = visA.currentPos.y;
      posArr[idx0 + 2] = visA.currentPos.z;
      this.tmpColor.copy(visA.currentHaloColor).lerp(slateTint, 0.65);
      colArr[idx0] = this.tmpColor.r * fade;
      colArr[idx0 + 1] = this.tmpColor.g * fade;
      colArr[idx0 + 2] = this.tmpColor.b * fade;
      vCount += 1;

      const idx1 = vCount * 3;
      posArr[idx1] = visB.currentPos.x;
      posArr[idx1 + 1] = visB.currentPos.y;
      posArr[idx1 + 2] = visB.currentPos.z;
      this.tmpColor.copy(visB.currentHaloColor).lerp(slateTint, 0.65);
      colArr[idx1] = this.tmpColor.r * fade;
      colArr[idx1 + 1] = this.tmpColor.g * fade;
      colArr[idx1 + 2] = this.tmpColor.b * fade;
      vCount += 1;
    }

    this.collateralGeometry.setDrawRange(0, vCount);
    if (vCount > 0) {
      this.collateralPosAttr.needsUpdate = true;
      this.collateralColorAttr.needsUpdate = true;
    }
  }

  private animate = (): void => {
    if (this.destroyed) return;
    this.rafId = requestAnimationFrame(this.animate);

    const nowMs = performance.now();
    const rawDt = Math.min((nowMs - this.lastTimeMs) / 1000, 0.1);
    this.lastTimeMs = nowMs;

    this.elapsedWallTime += rawDt;
    if (!this.paused) {
      this.simTime += rawDt * this.speedMultiplier;
    }

    this.ambientConnectomeGroup.rotation.y += 0.004 * rawDt;

    const dustAttr = this.dustPoints.geometry.getAttribute(
      "position"
    ) as THREE.BufferAttribute;
    const dTheta = 0.006 * rawDt;
    const cosD = Math.cos(dTheta);
    const sinD = Math.sin(dTheta);
    for (let i = 0; i < this.dustBasePositions.length; i += 3) {
      const x = this.dustBasePositions[i];
      const z = this.dustBasePositions[i + 2];
      this.dustBasePositions[i] = x * cosD - z * sinD;
      this.dustBasePositions[i + 2] = x * sinD + z * cosD;
    }
    dustAttr.needsUpdate = true;

    if (this.snapshot && this.snapshot.nodes.length > 0) {
      const paramsMap = new Map<string, OrbitParameters>();
      for (const vis of this.nodeMap.values()) {
        paramsMap.set(vis.id, vis.orbit);
      }
      computeAllTargetPositions(
        this.snapshot.nodes,
        paramsMap,
        this.simTime,
        this.targetPositions,
        this.topologyMode
      );
    }

    const posAlpha = 1 - Math.exp(-5.0 * rawDt);
    const appAlpha = 1 - Math.exp(-3.8 * rawDt);
    const flashDecay = Math.exp(-2.2 * rawDt);

    for (const vis of this.nodeMap.values()) {
      const nextTarget = this.targetPositions.get(vis.id);
      if (nextTarget) {
        vis.targetPos.copy(nextTarget);
      }
      vis.currentPos.lerp(vis.targetPos, posAlpha);
      vis.flashIntensity *= flashDecay;
      if (vis.flashIntensity < 0.002) vis.flashIntensity = 0;

      // Advance organic path-stem growth -> tip pearl budding sequence
      if (vis.birthDelay > 0) {
        vis.birthDelay = Math.max(0, vis.birthDelay - rawDt);
      } else {
        if (vis.stemProgress < 1) {
          vis.stemProgress = Math.min(1, vis.stemProgress + rawDt / 0.68);
        }
        if (!vis.hasParentInScene || vis.stemProgress >= 0.86) {
          if (vis.budProgress < 1) {
            const prevBud = vis.budProgress;
            vis.budProgress = Math.min(1, vis.budProgress + rawDt / 0.42);
            if (prevBud === 0 && vis.budProgress > 0) {
              vis.flashIntensity = Math.max(vis.flashIntensity, 0.48);
            }
          }
        }
      }

      vis.currentCoreColor.lerp(vis.targetCoreColor, appAlpha);
      vis.currentHaloColor.lerp(vis.targetHaloColor, appAlpha);
      vis.currentScale = THREE.MathUtils.lerp(
        vis.currentScale,
        vis.targetAppearance.scale,
        appAlpha
      );
      vis.currentIntensity = THREE.MathUtils.lerp(
        vis.currentIntensity,
        vis.targetAppearance.emissiveIntensity,
        appAlpha
      );

      const budEase = 1 - Math.pow(1 - vis.budProgress, 2.6);
      const effectiveScale = vis.currentScale * budEase;
      const isVisiblePearl = vis.budProgress > 0.005;

      vis.somaMesh.visible = isVisiblePearl;
      vis.coronaMesh.visible = isVisiblePearl;

      vis.somaMesh.position.copy(vis.currentPos);
      vis.somaMesh.scale.setScalar(Math.max(0.001, effectiveScale));
      vis.somaMat.uniforms.uTime.value = this.elapsedWallTime;
      vis.somaMat.uniforms.uCoreColor.value.copy(vis.currentCoreColor);
      vis.somaMat.uniforms.uHaloColor.value.copy(vis.currentHaloColor);
      vis.somaMat.uniforms.uEmissiveIntensity.value = vis.currentIntensity;
      vis.somaMat.uniforms.uPulseSpeed.value = THREE.MathUtils.lerp(
        vis.somaMat.uniforms.uPulseSpeed.value,
        vis.targetAppearance.pulseSpeed,
        appAlpha
      );
      vis.somaMat.uniforms.uPulseAmplitude.value = THREE.MathUtils.lerp(
        vis.somaMat.uniforms.uPulseAmplitude.value,
        vis.targetAppearance.pulseAmplitude,
        appAlpha
      );
      vis.somaMat.uniforms.uFlash.value = vis.flashIntensity;

      vis.coronaMesh.position.copy(vis.currentPos);
      vis.coronaMesh.scale.setScalar(Math.max(0.001, effectiveScale * 3.0));
      vis.coronaMesh.quaternion.copy(this.camera.quaternion);
      vis.coronaMat.uniforms.uCoreColor.value.copy(vis.currentCoreColor);
      vis.coronaMat.uniforms.uHaloColor.value.copy(vis.currentHaloColor);
      vis.coronaMat.uniforms.uIntensity.value = vis.currentIntensity * budEase;
      vis.coronaMat.uniforms.uFlash.value = vis.flashIntensity;

      if (vis.harnessRing && vis.harnessRingMat) {
        vis.harnessRing.position.copy(vis.currentPos);
        vis.harnessRing.scale.setScalar(Math.max(0.001, effectiveScale));
        vis.harnessRing.rotation.y += 0.08 * rawDt;
        vis.harnessRingMat.color.copy(vis.currentHaloColor);
      }

      vis.hitMesh.position.copy(vis.currentPos);
      vis.hitMesh.scale.setScalar(Math.max(effectiveScale * 2.4, 1.15));

      if (vis.orbitRing && vis.orbitRingMat) {
        const parentVis = vis.orbit.parentId
          ? this.nodeMap.get(vis.orbit.parentId)
          : undefined;
        if (parentVis) {
          vis.orbitRing.position.copy(parentVis.currentPos);
        } else {
          vis.orbitRing.position.set(0, 0, 0);
        }
        vis.orbitRingMat.color.copy(vis.currentHaloColor);
        vis.orbitRingMat.opacity = THREE.MathUtils.lerp(
          vis.orbitRingMat.opacity,
          vis.targetAppearance.orbitRingOpacity,
          appAlpha
        );
      }
    }

    // Animate Farewell Afterglow on expiring subagents (brief localized warm pop -> gentle ember dissolve)
    const farewellCore = new THREE.Color("#fff7e6");
    const farewellHalo = new THREE.Color("#ffca75");
    for (let i = this.dyingNodes.length - 1; i >= 0; i -= 1) {
      const entry = this.dyingNodes[i];
      entry.age += rawDt;
      const p = Math.min(1, entry.age / entry.duration);
      const vis = entry.vis;

      if (p >= 1) {
        this.disposeNodeVisual(vis);
        this.dyingNodes.splice(i, 1);
        continue;
      }

      let somaScale: number;
      let intensity: number;
      let flashVal: number;
      if (p < 0.18) {
        // Phase 1: Small-radius warm farewell micro-flash
        const flare = Math.sin((p / 0.18) * (Math.PI * 0.5));
        somaScale = entry.baseScale * (1.0 + 0.26 * flare);
        intensity = THREE.MathUtils.lerp(vis.currentIntensity, 1.68, flare);
        flashVal = 0.85 * flare;
        vis.currentCoreColor.lerp(farewellCore, 0.35);
        vis.currentHaloColor.lerp(farewellHalo, 0.35);
      } else {
        // Phase 2: Soft warm afterglow shrinking into stardust
        const tOut = (p - 0.18) / 0.82;
        const rem = Math.max(0, 1 - tOut);
        somaScale = entry.baseScale * 1.26 * Math.pow(rem, 1.75);
        intensity = 1.68 * Math.pow(rem, 2.05);
        flashVal = 0.85 * Math.pow(rem, 1.8);
      }

      vis.somaMesh.scale.setScalar(Math.max(0.001, somaScale));
      vis.somaMat.uniforms.uTime.value = this.elapsedWallTime;
      vis.somaMat.uniforms.uCoreColor.value.copy(vis.currentCoreColor);
      vis.somaMat.uniforms.uHaloColor.value.copy(vis.currentHaloColor);
      vis.somaMat.uniforms.uEmissiveIntensity.value = intensity;
      vis.somaMat.uniforms.uFlash.value = flashVal;

      const coronaScale = entry.baseScale * (3.0 + p * 2.8);
      vis.coronaMesh.scale.setScalar(coronaScale);
      vis.coronaMesh.quaternion.copy(this.camera.quaternion);
      vis.coronaMat.uniforms.uCoreColor.value.copy(farewellCore);
      vis.coronaMat.uniforms.uHaloColor.value.copy(farewellHalo);
      vis.coronaMat.uniforms.uIntensity.value = intensity;
      vis.coronaMat.uniforms.uFlash.value = flashVal;
      vis.coronaMat.uniforms.uFarewell.value = p;
    }

    // Dissolve detached links smoothly over 0.55s instead of snapping out
    for (let i = this.dyingEdges.length - 1; i >= 0; i -= 1) {
      const de = this.dyingEdges[i];
      de.age += rawDt;
      const p = Math.min(1, de.age / de.duration);
      if (p >= 1) {
        this.disposeEdgeVisual(de.vis);
        this.dyingEdges.splice(i, 1);
        continue;
      }
      de.vis.material.uniforms.uOpacity.value =
        de.initialOpacity * Math.pow(1 - p, 1.8);
      de.vis.material.uniforms.uPulseCount.value = 0;
    }

    let pulseCount = 0;
    const pPosArr = this.pulsePosAttr.array as Float32Array;
    const pSizeArr = this.pulseSizeAttr.array as Float32Array;
    const pColorArr = this.pulseColorAttr.array as Float32Array;
    const pAlphaArr = this.pulseAlphaAttr.array as Float32Array;

    for (const evis of this.edgeMap.values()) {
      const src = this.nodeMap.get(evis.edge.source);
      const dst = this.nodeMap.get(evis.edge.target);
      if (!src || !dst || src.budProgress < 0.25) {
        evis.axonMesh.visible = false;
        continue;
      }

      // Compute progressive growth curve along the path (0 -> 1)
      let growthEased = 1.0;
      if (evis.edge.type === "hierarchy") {
        const raw = dst.stemProgress;
        growthEased = 1 - Math.pow(1 - raw, 2.4);
        evis.growthRaw = raw;
      } else {
        // Cross-node link waits until both endpoint nodes exist, then grows across!
        if (src.budProgress >= 0.55 && dst.budProgress >= 0.55) {
          evis.growthRaw = Math.min(1, evis.growthRaw + rawDt / 0.78);
        }
        const g = evis.growthRaw;
        growthEased = g < 0.5 ? 4 * g * g * g : 1 - Math.pow(-2 * g + 2, 3) / 2;
        if (evis.growthRaw >= 1 && !evis.notifiedArrival) {
          evis.notifiedArrival = true;
          dst.flashIntensity = Math.min(0.65, dst.flashIntensity + 0.42);
        }
      }

      if (growthEased <= 0.002) {
        evis.axonMesh.visible = false;
        continue;
      }
      evis.axonMesh.visible = true;

      this.updateOpticalFiberGeometry(evis, src, dst);
      evis.material.uniforms.uSimTime.value = this.simTime;
      evis.material.uniforms.uGrowth.value = growthEased;

      // Render a luminous leading "growth bud" riding the growing tip of the fiber!
      if (growthEased > 0.01 && growthEased < 0.992 && pulseCount < MAX_PULSES) {
        const floatIdx = growthEased * AXON_SEGMENTS;
        const s0 = Math.min(AXON_SEGMENTS, Math.floor(floatIdx));
        const s1 = Math.min(AXON_SEGMENTS, s0 + 1);
        this.tmpPulsePos.lerpVectors(
          evis.spine[s0],
          evis.spine[s1],
          floatIdx - s0
        );
        this.tmpColor.set(evis.appearance.pulseColor);

        const p3 = pulseCount * 3;
        pPosArr[p3] = this.tmpPulsePos.x;
        pPosArr[p3 + 1] = this.tmpPulsePos.y;
        pPosArr[p3 + 2] = this.tmpPulsePos.z;
        pColorArr[p3] = this.tmpColor.r;
        pColorArr[p3 + 1] = this.tmpColor.g;
        pColorArr[p3 + 2] = this.tmpColor.b;
        pSizeArr[pulseCount] =
          evis.edge.type === "hierarchy"
            ? Math.max(1.25, dst.targetAppearance.scale * 1.65)
            : 1.45;
        pAlphaArr[pulseCount] = Math.sin(
          Math.min(1, growthEased * 5.0) * (Math.PI * 0.5)
        );
        pulseCount += 1;
      }

      const countForEdge = evis.appearance.pulseCount;
      if (growthEased >= 0.98 && countForEdge > 0 && evis.appearance.pulseSpeed > 0) {
        this.tmpColor.set(evis.appearance.pulseColor);
        for (let m = 0; m < countForEdge; m += 1) {
          if (pulseCount >= MAX_PULSES) break;
          const rawT =
            this.simTime * evis.appearance.pulseSpeed +
            m / countForEdge +
            evis.seedHash;
          const cycleFloor = Math.floor(rawT);
          const prevCycle = evis.prevPulseCycles[m] ?? cycleFloor;
          if (!this.paused && cycleFloor > prevCycle) {
            dst.flashIntensity = Math.min(0.65, dst.flashIntensity + 0.38);
          }
          evis.prevPulseCycles[m] = cycleFloor;

          const t = rawT - cycleFloor;
          const floatIdx = t * AXON_SEGMENTS;
          const s0 = Math.min(AXON_SEGMENTS, Math.floor(floatIdx));
          const s1 = Math.min(AXON_SEGMENTS, s0 + 1);
          this.tmpPulsePos.lerpVectors(
            evis.spine[s0],
            evis.spine[s1],
            floatIdx - s0
          );

          const p3 = pulseCount * 3;
          pPosArr[p3] = this.tmpPulsePos.x;
          pPosArr[p3 + 1] = this.tmpPulsePos.y;
          pPosArr[p3 + 2] = this.tmpPulsePos.z;

          pColorArr[p3] = this.tmpColor.r;
          pColorArr[p3 + 1] = this.tmpColor.g;
          pColorArr[p3 + 2] = this.tmpColor.b;

          pSizeArr[pulseCount] =
            evis.edge.type === "collaborates" ? 1.35 : 1.05;
          pAlphaArr[pulseCount] =
            Math.sin(Math.PI * t) *
            THREE.MathUtils.smoothstep(t, 0.04, 0.14) *
            THREE.MathUtils.smoothstep(1.0 - t, 0.04, 0.14);
          pulseCount += 1;
        }
      }
    }

    // Append tiny drifting farewell stardust embers into the batched glow point pool
    for (let i = this.farewellEmbers.length - 1; i >= 0; i -= 1) {
      const m = this.farewellEmbers[i];
      m.age += rawDt;
      const p = m.age / m.duration;
      if (p >= 1) {
        this.farewellEmbers.splice(i, 1);
        continue;
      }
      if (pulseCount >= MAX_PULSES) continue;

      const easeOut = 1 - Math.pow(1 - p, 2.6);
      const p3 = pulseCount * 3;
      pPosArr[p3] = m.origin.x + m.dir.x * m.maxDrift * easeOut;
      pPosArr[p3 + 1] =
        m.origin.y + m.dir.y * m.maxDrift * easeOut + p * 0.28;
      pPosArr[p3 + 2] = m.origin.z + m.dir.z * m.maxDrift * easeOut;

      pColorArr[p3] = m.color.r;
      pColorArr[p3 + 1] = m.color.g;
      pColorArr[p3 + 2] = m.color.b;

      pSizeArr[pulseCount] = m.size * (1 - p * 0.45);
      pAlphaArr[pulseCount] =
        Math.sin(Math.min(1, p * 4.5) * (Math.PI * 0.5)) *
        Math.pow(1 - p, 1.65);
      pulseCount += 1;
    }

    this.pulseGeometry.setDrawRange(0, pulseCount);
    if (pulseCount > 0) {
      this.pulsePosAttr.needsUpdate = true;
      this.pulseSizeAttr.needsUpdate = true;
      this.pulseColorAttr.needsUpdate = true;
      this.pulseAlphaAttr.needsUpdate = true;
    }

    this.updateCollateralPlexus();

    this.cameraRig.update(rawDt, (id) => this.nodeMap.get(id)?.currentPos);
    this.composer.render();

    const halfFovRad = (this.camera.fov * Math.PI) / 360;
    const tanHalfFov = Math.tan(halfFovRad);
    const anchors: ProjectedNodeAnchor[] = [];

    for (const vis of this.nodeMap.values()) {
      this.tmpVec.copy(vis.currentPos).project(this.camera);
      // Keep screen-space labels hidden until the growing fiber arrives and buds the node!
      const visibleBehindCamera =
        vis.budProgress < 0.35 || this.tmpVec.z > 1 || this.tmpVec.z < -1;
      const x = (this.tmpVec.x * 0.5 + 0.5) * this.width;
      const y = (-this.tmpVec.y * 0.5 + 0.5) * this.height;
      const distance = this.camera.position.distanceTo(vis.currentPos);
      const screenRadius =
        (vis.currentScale / Math.max(distance * tanHalfFov, 0.001)) *
        (this.height * 0.5);

      anchors.push({
        id: vis.id,
        x,
        y,
        screenRadius,
        visibleBehindCamera,
        distance,
      });
    }

    this.callbacks.onFrameProject(anchors);
  };

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.resizeObserver.disconnect();
    const dom = this.renderer.domElement;
    dom.removeEventListener("pointermove", this.handlePointerMove);
    dom.removeEventListener("pointerdown", this.handlePointerDown);
    dom.removeEventListener("pointerup", this.handlePointerUp);
    dom.removeEventListener("pointerleave", this.handlePointerLeave);

    for (const vis of this.nodeMap.values()) {
      this.disposeNodeVisual(vis);
    }
    this.nodeMap.clear();
    for (const entry of this.dyingNodes) {
      this.disposeNodeVisual(entry.vis);
    }
    this.dyingNodes.length = 0;
    this.farewellEmbers.length = 0;

    for (const evis of this.edgeMap.values()) {
      this.disposeEdgeVisual(evis);
    }
    this.edgeMap.clear();
    for (const de of this.dyingEdges) {
      this.disposeEdgeVisual(de.vis);
    }
    this.dyingEdges.length = 0;

    this.sharedPearlGeo.dispose();
    this.sharedCoronaGeo.dispose();
    this.sharedHitGeo.dispose();
    this.sharedHarnessRingGeo.dispose();

    this.starfieldPoints.geometry.dispose();
    this.starfieldMat.dispose();
    this.dustPoints.geometry.dispose();
    this.dustMat.dispose();

    this.ambientConnectomeGroup.traverse((obj) => {
      if (obj instanceof THREE.Points || obj instanceof THREE.Line) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    this.referenceGridGroup.traverse((obj) => {
      if (obj instanceof THREE.Line) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    this.collateralGeometry.dispose();
    this.collateralMaterial.dispose();

    this.pulseGeometry.dispose();
    this.pulseMaterial.dispose();

    this.cameraRig.dispose(dom);
    this.composer.dispose();
    this.renderer.dispose();

    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
