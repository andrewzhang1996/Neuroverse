import * as THREE from "three";
import type {
  EdgeDefinition,
  FlowDefinitionsRegistry,
  FlowNodeInstance,
  NodeDefinition,
  NodeStatus,
  ResolvedSynapseEdge,
  StellarNeuronAppearance,
  SynapseEdgeAppearance,
} from "../types/flow";

export type TopologyMode = "neural" | "orbital";

const FALLBACK_NODE_APPEARANCE: StellarNeuronAppearance = {
  coreColor: "#bddbff",
  haloColor: "#4680c7",
  emissiveIntensity: 0.62,
  scale: 1.2,
  pulseSpeed: 0.5,
  pulseAmplitude: 0.05,
  orbitRingOpacity: 0.14,
  turbulence: 0.34,
};

const FALLBACK_EDGE_APPEARANCE: SynapseEdgeAppearance = {
  color: "#5882b3",
  opacity: 0.44,
  curveArc: 0.14,
  pulseCount: 0,
  pulseSpeed: 0,
  pulseColor: "#8ac0ff",
};

/**
 * Deterministic FNV-1a 32-bit hash mapped to [0, 1).
 */
export function hash01(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 4294967296;
}

export function statusMotionFactor(status: NodeStatus): number {
  if (status === "running" || status === "tool_calling") return 1.0;
  if (status === "waiting") return 0.55;
  if (status === "completed" || status === "idle" || status === "error") return 0.22;
  return 0.35;
}

export function getNodeDefinition(
  type: string,
  definitions?: FlowDefinitionsRegistry
): NodeDefinition | undefined {
  return definitions?.nodeDefinitions.find((d) => d.type === type);
}

export function getEdgeDefinition(
  type: string,
  definitions?: FlowDefinitionsRegistry
): EdgeDefinition | undefined {
  return definitions?.edgeDefinitions.find((d) => d.type === type);
}

export function resolveNodeAppearance(
  node: FlowNodeInstance,
  definitions?: FlowDefinitionsRegistry
): StellarNeuronAppearance {
  const def = getNodeDefinition(node.type, definitions);
  if (!def) return FALLBACK_NODE_APPEARANCE;
  return (
    def.appearance[node.status] ??
    def.appearance.default ??
    FALLBACK_NODE_APPEARANCE
  );
}

export function resolveEdgeAppearance(
  edge: ResolvedSynapseEdge,
  definitions?: FlowDefinitionsRegistry
): SynapseEdgeAppearance {
  const def = getEdgeDefinition(edge.type, definitions);
  if (!def) return FALLBACK_EDGE_APPEARANCE;
  return (
    def.appearance[edge.status] ??
    def.appearance.default ??
    FALLBACK_EDGE_APPEARANCE
  );
}

export interface OrbitParameters {
  tier: number;
  parentId: string | null;
  orbitRadius: number;
  baseAngle: number;
  inclinationX: number;
  inclinationZ: number;
  angularSpeed: number;
  tier0Index: number;
  tier0Count: number;
  neuralAnchor: THREE.Vector3;
  apicalDir: THREE.Vector3;
  driftPhaseX: number;
  driftPhaseY: number;
  driftPhaseZ: number;
  driftAmp: number;
}

function getOrbitTier(
  node: FlowNodeInstance,
  definitions?: FlowDefinitionsRegistry
): number {
  const def = getNodeDefinition(node.type, definitions);
  if (def && typeof def.orbitTier === "number") return def.orbitTier;
  if (node.type === "harness") return 0;
  if (node.type === "session") return 1;
  if (node.type === "subagent") return 2;
  return 2;
}

function buildOrthonormalBasis(
  axis: THREE.Vector3,
  outU: THREE.Vector3,
  outV: THREE.Vector3
): void {
  const ref =
    Math.abs(axis.y) < 0.88
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
  outU.crossVectors(axis, ref).normalize();
  outV.crossVectors(axis, outU).normalize();
}

/**
 * Compute scale-adaptive 3D Cortical Neural Connectome anchors AND legacy orbital parameters.
 * Scales smoothly from 10 nodes up to 300+ accumulated session/subagent nodes.
 */
export function computeOrbitParametersMap(
  nodes: FlowNodeInstance[],
  definitions?: FlowDefinitionsRegistry
): Map<string, OrbitParameters> {
  const result = new Map<string, OrbitParameters>();
  const tier0Nodes = nodes.filter((n) => getOrbitTier(n, definitions) === 0);
  const tier0Count = tier0Nodes.length;

  // Expand cortical lobe spacing gracefully when local JSON accumulates 50..300+ nodes
  const crowdScale = 1 + Math.min(0.95, Math.max(0, nodes.length - 24) * 0.0042);

  const siblingBuckets = new Map<string, FlowNodeInstance[]>();
  for (const node of nodes) {
    const tier = getOrbitTier(node, definitions);
    if (tier === 0) continue;
    const key = `${tier}:${node.parentId ?? "__root__"}`;
    const list = siblingBuckets.get(key) ?? [];
    list.push(node);
    siblingBuckets.set(key, list);
  }

  // 1. Tier 0: Cortical Nuclei (Harnesses) arranged as 3D brain lobes
  tier0Nodes.forEach((node, idx) => {
    const anchor = new THREE.Vector3();
    if (tier0Count <= 1) {
      anchor.set(0, 0, 0);
    } else if (tier0Count === 2) {
      const sign = idx === 0 ? -1 : 1;
      anchor.set(sign * 19 * crowdScale, sign * 2.5, -sign * 3.0);
    } else {
      const angle = (2 * Math.PI * idx) / tier0Count + 0.38;
      const radius = (24 + (hash01(`${node.id}:nr`) - 0.5) * 4.0) * crowdScale;
      const elevation =
        ((idx % 2 === 0 ? 1 : -1) * 5.5 + (hash01(`${node.id}:ny`) - 0.5) * 3.5) *
        crowdScale;
      anchor.set(
        Math.cos(angle) * radius,
        elevation,
        Math.sin(angle) * radius * 0.88
      );
    }

    const apical = anchor.lengthSq() > 1 ? anchor.clone().normalize() : new THREE.Vector3(0, 1, 0);
    const motion = statusMotionFactor(node.status);
    result.set(node.id, {
      tier: 0,
      parentId: null,
      orbitRadius: tier0Count <= 1 ? 0 : 36 * crowdScale,
      baseAngle: tier0Count <= 1 ? 0 : (2 * Math.PI * idx) / tier0Count + 0.35,
      inclinationX: 0,
      inclinationZ: 0,
      angularSpeed: 0,
      tier0Index: idx,
      tier0Count,
      neuralAnchor: anchor,
      apicalDir: apical,
      driftPhaseX: hash01(`${node.id}:dx`) * Math.PI * 2,
      driftPhaseY: hash01(`${node.id}:dy`) * Math.PI * 2,
      driftPhaseZ: hash01(`${node.id}:dz`) * Math.PI * 2,
      driftAmp: 0.14 * motion + 0.04,
    });
  });

  // 2. Tier 1: Pyramidal Somas (Sessions) radially organized around their Nucleus
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (const [bucketKey, siblings] of siblingBuckets) {
    if (!bucketKey.startsWith("1:")) continue;
    const count = siblings.length;
    siblings.forEach((node, idx) => {
      const motion = statusMotionFactor(node.status);
      const orbitRadius = 11.5 + idx * 3.2;
      const baseAngle = idx * 2.3999632 + hash01(node.id) * 1.2;
      const inclinationX = (hash01(`${node.id}:x`) - 0.5) * 0.24;
      const inclinationZ = (hash01(`${node.id}:z`) - 0.5) * 0.24;
      const angularSpeed =
        (0.11 / Math.pow(orbitRadius / 11.5, 0.85)) * motion;

      const parentParams = node.parentId ? result.get(node.parentId) : undefined;
      const parentCenter = parentParams
        ? parentParams.neuralAnchor
        : new THREE.Vector3(0, 0, 0);

      const denom = Math.max(count, 4);
      const rawY =
        1 - ((idx + 0.5) / denom) * 1.78 + (hash01(`${node.id}:sy`) - 0.5) * 0.32;
      const yNorm = THREE.MathUtils.clamp(rawY, -0.86, 0.86);
      const radialXZ = Math.sqrt(Math.max(0.04, 1 - yNorm * yNorm));
      const theta =
        idx * goldenAngle * 1.65 + hash01(`${node.id}:st`) * Math.PI * 2;
      const shellDist =
        (9.6 + Math.cbrt(idx) * 4.9 + (idx % 3) * 1.65 + hash01(`${node.id}:sd`) * 1.2) *
        (0.9 + crowdScale * 0.14);

      const radialDir = new THREE.Vector3(
        Math.cos(theta) * radialXZ,
        yNorm * 0.9,
        Math.sin(theta) * radialXZ
      ).normalize();

      const anchor = new THREE.Vector3()
        .copy(parentCenter)
        .addScaledVector(radialDir, shellDist);

      result.set(node.id, {
        tier: 1,
        parentId: node.parentId ?? null,
        orbitRadius,
        baseAngle,
        inclinationX,
        inclinationZ,
        angularSpeed,
        tier0Index: 0,
        tier0Count,
        neuralAnchor: anchor,
        apicalDir: radialDir,
        driftPhaseX: hash01(`${node.id}:dx`) * Math.PI * 2,
        driftPhaseY: hash01(`${node.id}:dy`) * Math.PI * 2,
        driftPhaseZ: hash01(`${node.id}:dz`) * Math.PI * 2,
        driftAmp: 0.22 * motion + 0.05,
      });
    });
  }

  // 3. Tier 2+: Dendritic Arbors (Subagents) branching outward along parent's apical cone
  const outwardAxis = new THREE.Vector3();
  const basisU = new THREE.Vector3();
  const basisV = new THREE.Vector3();

  const higherBuckets = Array.from(siblingBuckets.entries())
    .filter(([k]) => !k.startsWith("1:"))
    .sort((a, b) => Number(a[0].split(":")[0]) - Number(b[0].split(":")[0]));

  for (const [, siblings] of higherBuckets) {
    const count = siblings.length;
    siblings.forEach((node, idx) => {
      const tier = getOrbitTier(node, definitions);
      const motion = statusMotionFactor(node.status);

      const orbitRadius = 3.6 + (idx % 3) * 1.15 + Math.floor(idx / 3) * 0.8;
      const baseAngle = idx * 2.3999632 + hash01(node.id) * 1.5;
      const inclinationX = (hash01(`${node.id}:sx`) - 0.5) * 0.95;
      const inclinationZ = (hash01(`${node.id}:sz`) - 0.5) * 0.95;
      const angularSpeed = 0.34 * motion;

      const parentParams = node.parentId ? result.get(node.parentId) : undefined;
      const parentAnchor = parentParams
        ? parentParams.neuralAnchor
        : new THREE.Vector3(0, 0, 0);
      const grandParentAnchor =
        parentParams?.parentId && result.get(parentParams.parentId)
          ? result.get(parentParams.parentId)!.neuralAnchor
          : new THREE.Vector3(0, 0, 0);

      outwardAxis.subVectors(parentAnchor, grandParentAnchor);
      if (outwardAxis.lengthSq() < 1e-3) {
        const a0 = hash01(`${node.id}:oa`) * Math.PI * 2;
        outwardAxis.set(Math.cos(a0), 0.35, Math.sin(a0));
      }
      outwardAxis.normalize();
      buildOrthonormalBasis(outwardAxis, basisU, basisV);

      const fanAngle =
        (count <= 1 ? 0 : (2 * Math.PI * idx) / count) +
        hash01(`${node.id}:fa`) * 0.85;
      const coneSpread = count <= 1 ? 0.32 : 0.75 + (idx % 2) * 0.25;
      const branchLen =
        5.2 + (idx % 3) * 1.35 + Math.floor(idx / 3) * 1.15 + hash01(`${node.id}:bl`) * 0.8;

      const dir = new THREE.Vector3()
        .copy(outwardAxis)
        .multiplyScalar(1.22)
        .addScaledVector(basisU, Math.cos(fanAngle) * coneSpread)
        .addScaledVector(basisV, Math.sin(fanAngle) * coneSpread)
        .normalize();

      const anchor = new THREE.Vector3()
        .copy(parentAnchor)
        .addScaledVector(dir, branchLen);

      result.set(node.id, {
        tier,
        parentId: node.parentId ?? null,
        orbitRadius,
        baseAngle,
        inclinationX,
        inclinationZ,
        angularSpeed,
        tier0Index: 0,
        tier0Count,
        neuralAnchor: anchor,
        apicalDir: dir,
        driftPhaseX: hash01(`${node.id}:dx`) * Math.PI * 2,
        driftPhaseY: hash01(`${node.id}:dy`) * Math.PI * 2,
        driftPhaseZ: hash01(`${node.id}:dz`) * Math.PI * 2,
        driftAmp: 0.19 * motion + 0.04,
      });
    });
  }

  // 4. Fast deterministic cortical repulsion pass so somas never collide even at 200+ nodes
  const entries = Array.from(result.entries());
  const delta = new THREE.Vector3();
  const relaxIters = entries.length > 100 ? 8 : 12;
  for (let iter = 0; iter < relaxIters; iter += 1) {
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const a = entries[i][1];
        const b = entries[j][1];
        const minSep =
          a.tier === 0 && b.tier === 0
            ? 20.0
            : a.tier <= 1 && b.tier <= 1
            ? 6.2
            : 3.4;
        delta.subVectors(b.neuralAnchor, a.neuralAnchor);
        const distSq = delta.lengthSq();
        if (distSq < minSep * minSep) {
          const dist = Math.sqrt(distSq);
          if (dist < 1e-3) {
            delta.set(0.5, 0.7, 0.3).normalize();
          } else {
            delta.divideScalar(dist);
          }
          const push = (minSep - dist) * 0.34;
          if (a.tier === 0 && b.tier > 0) {
            b.neuralAnchor.addScaledVector(delta, push * 2.0);
          } else if (b.tier === 0 && a.tier > 0) {
            a.neuralAnchor.addScaledVector(delta, -push * 2.0);
          } else {
            a.neuralAnchor.addScaledVector(delta, -push);
            b.neuralAnchor.addScaledVector(delta, push);
          }
        }
      }
    }
  }

  return result;
}

const _rotEuler = new THREE.Euler(0, 0, 0, "XYZ");
const _localVec = new THREE.Vector3();

export function evaluateInclinedOrbitOffset(
  orbitRadius: number,
  theta: number,
  inclinationX: number,
  inclinationZ: number,
  out: THREE.Vector3
): THREE.Vector3 {
  out.set(Math.cos(theta) * orbitRadius, 0, Math.sin(theta) * orbitRadius);
  _rotEuler.set(inclinationX, 0, inclinationZ, "XYZ");
  return out.applyEuler(_rotEuler);
}

export function computeAllTargetPositions(
  nodes: FlowNodeInstance[],
  paramsMap: Map<string, OrbitParameters>,
  simTime: number,
  outMap: Map<string, THREE.Vector3>,
  mode: TopologyMode = "neural"
): void {
  if (mode === "neural") {
    for (const node of nodes) {
      const target = outMap.get(node.id) ?? new THREE.Vector3();
      outMap.set(node.id, target);
      const params = paramsMap.get(node.id);
      if (!params) {
        target.set(0, 0, 0);
        continue;
      }
      const dx = Math.sin(simTime * 0.52 + params.driftPhaseX) * params.driftAmp;
      const dy = Math.cos(simTime * 0.41 + params.driftPhaseY) * params.driftAmp * 0.85;
      const dz = Math.sin(simTime * 0.47 + params.driftPhaseZ) * params.driftAmp;
      target.set(
        params.neuralAnchor.x + dx,
        params.neuralAnchor.y + dy,
        params.neuralAnchor.z + dz
      );
    }
    return;
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const resolved = new Set<string>();

  const resolveOne = (node: FlowNodeInstance, depth = 0): THREE.Vector3 => {
    const existing = outMap.get(node.id);
    if (resolved.has(node.id) && existing) return existing;

    const target = existing ?? new THREE.Vector3();
    outMap.set(node.id, target);
    const params = paramsMap.get(node.id);
    if (!params) {
      target.set(0, 0, 0);
      resolved.add(node.id);
      return target;
    }

    if (params.tier === 0) {
      if (params.tier0Count <= 1) {
        target.set(0, 0, 0);
      } else {
        const y = (hash01(node.id) - 0.5) * 3.0;
        target.set(
          Math.cos(params.baseAngle) * params.orbitRadius,
          y,
          Math.sin(params.baseAngle) * params.orbitRadius
        );
      }
      resolved.add(node.id);
      return target;
    }

    let parentX = 0;
    let parentY = 0;
    let parentZ = 0;

    if (
      params.parentId &&
      params.parentId !== node.id &&
      nodeIds.has(params.parentId) &&
      depth < 6
    ) {
      const parentNode = nodes.find((n) => n.id === params.parentId);
      if (parentNode) {
        const parentPos = resolveOne(parentNode, depth + 1);
        parentX = parentPos.x;
        parentY = parentPos.y;
        parentZ = parentPos.z;
      }
    }

    const theta = params.baseAngle + simTime * params.angularSpeed;
    evaluateInclinedOrbitOffset(
      params.orbitRadius,
      theta,
      params.inclinationX,
      params.inclinationZ,
      _localVec
    );
    target.set(parentX + _localVec.x, parentY + _localVec.y, parentZ + _localVec.z);
    resolved.add(node.id);
    return target;
  };

  for (const node of nodes) {
    resolveOne(node, 0);
  }
}

export function fillOrbitRingPositions(
  orbitRadius: number,
  inclinationX: number,
  inclinationZ: number,
  buffer: Float32Array,
  segments = 96
): void {
  const vec = new THREE.Vector3();
  for (let i = 0; i < segments; i += 1) {
    const theta = (i / segments) * Math.PI * 2;
    evaluateInclinedOrbitOffset(orbitRadius, theta, inclinationX, inclinationZ, vec);
    const offset = i * 3;
    buffer[offset] = vec.x;
    buffer[offset + 1] = vec.y;
    buffer[offset + 2] = vec.z;
  }
}

/**
 * Evaluate a pure, smooth, single-sweep C2 Bezier curve point along t in [0, 1]
 * (like an optical fiber or cello string — zero wiggles, zero bumps).
 */
export function evaluateSmoothOpticalArc(
  p0: THREE.Vector3,
  p3: THREE.Vector3,
  seedUp: THREE.Vector3,
  curveArc: number,
  t: number,
  out: THREE.Vector3,
  tmpFwd: THREE.Vector3,
  tmpPerp: THREE.Vector3,
  tmpCtrl: THREE.Vector3
): THREE.Vector3 {
  tmpFwd.subVectors(p3, p0);
  const dist = tmpFwd.length();
  if (dist < 1e-4) {
    return out.copy(p0);
  }
  tmpFwd.divideScalar(dist);

  tmpPerp.crossVectors(tmpFwd, seedUp);
  if (tmpPerp.lengthSq() < 1e-4) {
    tmpPerp.set(-tmpFwd.y, tmpFwd.x, 0.25);
  }
  tmpPerp.normalize();

  tmpCtrl
    .addVectors(p0, p3)
    .multiplyScalar(0.5)
    .addScaledVector(tmpPerp, dist * curveArc);

  const invT = 1 - t;
  return out
    .set(0, 0, 0)
    .addScaledVector(p0, invT * invT)
    .addScaledVector(tmpCtrl, 2 * invT * t)
    .addScaledVector(p3, t * t);
}
