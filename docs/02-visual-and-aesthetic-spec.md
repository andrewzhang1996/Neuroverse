# 02 — Visual, Shader, Physics & HUD Design Specification

This specification translates the project's core aesthetic touchstones — **Universe Sandbox**, **Interstellar**, **2001: A Space Odyssey**, **Van Gogh's Starry Night**, **Biological Neural Synapses**, and **Anthropic's Editorial Clarity** — into deterministic code, GLSL shaders, orbital equations, and CSS tokens.

**Do NOT improvise colors, shaders, or layout styles outside this specification.**

---

## 1. Aesthetic Philosophy & Strict Anti-Patterns

### The Core Tension We Solve
> **3D WebGL Canvas = Cosmic Awe & Immediate Pre-Attentive Activity Sensing**
> **2D HTML Overlay & Inspector = Surgical, High-Contrast Editorial Readability**

### Strictly Banned Visual Clichés (Auto-Fail Criteria)
- **NO** cyberpunk neon (`#00ffff`, `#ff00ff`, `#bc13fe`, electric purple-pink gradients).
- **NO** Matrix/hacker green (`#00ff00`), CRT scanlines, glitch effects, or angled sci-fi "chamfered" HUD corners.
- **NO** flat unlit `MeshBasicMaterial` plastic spheres or straight, rigid `LineBasicMaterial` sticks.
- **NO** 3D extruded fonts (`TextGeometry`) or blurry `CanvasTexture` text sprites. All text is crisp DOM HTML.
- **NO** permanent label soup: dormant (`completed` / `idle`) subagents hide their text labels until hovered, selected, or switched to `Labels: All`.

---

## 2. Color & Typography Tokens (`src/styles/tokens.css`)

```css
:root {
  /* Deep Space Void & Matte Obsidian Glass (2001 × Universe Sandbox) */
  --nv-bg-void: #030508;
  --nv-surface-glass: rgba(9, 12, 18, 0.78);
  --nv-surface-glass-elevated: rgba(14, 19, 28, 0.88);
  --nv-surface-subtle: rgba(255, 248, 235, 0.04);
  --nv-surface-hover: rgba(255, 248, 235, 0.075);

  /* Hairline Architectural Borders */
  --nv-border-hairline: rgba(255, 244, 224, 0.09);
  --nv-border-strong: rgba(255, 244, 224, 0.20);
  --nv-border-focus: rgba(255, 194, 102, 0.55);

  /* Editorial Typography Colors (Anthropic Warmth) */
  --nv-text-primary: #f2efe9;
  --nv-text-secondary: #9d988f;
  --nv-text-muted: #62605b;
  --nv-text-code: #e6dcc8;

  /* Semantic Stellar Status Accents */
  --nv-status-running: #5cb8ff;      /* Young O-star cyan-white */
  --nv-status-tool: #ffc257;         /* Interstellar accretion gold */
  --nv-status-waiting: #e09b46;      /* Warm amber */
  --nv-status-completed: #6f86a3;    /* Cooled white-dwarf slate */
  --nv-status-idle: #4c5b70;         /* Dormant brown-dwarf */
  --nv-status-error: #ff4d3d;        /* Supernova crimson */

  /* Typography Stacks */
  --nv-font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --nv-font-mono: "JetBrains Mono", "SF Mono", "Fira Code", ui-monospace, monospace;

  /* Radii & Motion */
  --nv-radius-sm: 6px;
  --nv-radius-md: 10px;
  --nv-radius-pill: 999px;
  --nv-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

---

## 3. Three.js Renderer & Post-Processing Pipeline

Configure `NeuralCosmosEngine.ts` with these exact parameters so HDR stellar bloom looks physically grounded rather than blown-out:

```ts
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x030508, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(width, height),
  1.08, // strength: lush stellar corona without washing out nearby nodes
  0.65, // radius: wide soft atmospheric scatter
  0.24  // threshold: quiescent/completed nodes (<0.24 luminance) stay crisp & unbloomed!
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
```

Camera setup:
- `PerspectiveCamera(45, width / height, 0.1, 1200)`
- Default initial camera position: `new THREE.Vector3(0, 26, 52)` looking at `(0, 0, 0)`.

---

## 4. Verbatim GLSL Shaders (`src/scene/shaders.ts`)

### 4.1 Stellar Neuron Soma Shader (`SOMA_VERTEX_SHADER` & `SOMA_FRAGMENT_SHADER`)
Used on `new THREE.IcosahedronGeometry(1, 5)` (shared geometry across all nodes; scaled per node).
Uniforms:
- `uTime: { value: 0 }`
- `uCoreColor: { value: new THREE.Color(...) }`
- `uHaloColor: { value: new THREE.Color(...) }`
- `uEmissiveIntensity: { value: 1.0 }`
- `uTurbulence: { value: 0.5 }`
- `uPulseSpeed: { value: 1.0 }`
- `uPulseAmplitude: { value: 0.1 }`
- `uSeed: { value: 0.0 }`

```glsl
// SOMA_VERTEX_SHADER
uniform float uTime;
uniform float uPulseSpeed;
uniform float uPulseAmplitude;
uniform float uTurbulence;
uniform float uSeed;

varying vec3 vLocalPos;
varying vec3 vViewNormal;
varying vec3 vViewDir;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float valueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
        mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
        mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}

void main() {
  vLocalPos = position;
  float breath = sin(uTime * uPulseSpeed * 6.2831853 + uSeed) * uPulseAmplitude;
  float ripple = (valueNoise(position * 2.6 + vec3(uTime * 0.45 + uSeed)) - 0.5) * 0.08 * uTurbulence;
  vec3 displaced = position * (1.0 + breath * 0.45 + ripple);

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  vViewNormal = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
}
```

```glsl
// SOMA_FRAGMENT_SHADER
uniform float uTime;
uniform vec3 uCoreColor;
uniform vec3 uHaloColor;
uniform float uEmissiveIntensity;
uniform float uTurbulence;
uniform float uPulseSpeed;
uniform float uPulseAmplitude;
uniform float uSeed;

varying vec3 vLocalPos;
varying vec3 vViewNormal;
varying vec3 vViewDir;

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
        mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
        mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
    f.z
  );
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise3(p);
    p = p * 2.03 + vec3(17.1, 31.7, 11.3);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 N = normalize(vViewNormal);
  vec3 V = normalize(vViewDir);
  float ndotv = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = pow(1.0 - ndotv, 2.35);

  // Swirling Van Gogh / solar plasma granulation
  vec3 flowCoord = vLocalPos * 3.1 + vec3(uTime * 0.28 + uSeed, -uTime * 0.21, uTime * 0.17);
  float plasma = fbm(flowCoord + 0.65 * vec3(fbm(flowCoord * 1.4)));
  float granulation = mix(1.0, 0.72 + 0.62 * plasma, uTurbulence);

  float pulse = 1.0 + sin(uTime * uPulseSpeed * 6.2831853 + uSeed) * uPulseAmplitude;

  // Hot incandescent center -> rich chromatic corona limb
  vec3 baseGradient = mix(uHaloColor, uCoreColor, pow(ndotv, 0.75));
  vec3 rimGlow = uHaloColor * fresnel * (1.25 + uTurbulence * 0.8);
  vec3 finalRgb = (baseGradient * granulation + rimGlow) * uEmissiveIntensity * pulse;

  gl_FragColor = vec4(finalRgb, 1.0);
}
```

### 4.2 Procedural Atmospheric Corona & Diffraction Sprite (`CORONA_FRAGMENT_SHADER`)
Attach to a camera-facing `THREE.Sprite` (or billboard quad) parented to each node, scaled to `nodeScale * 5.2` (`depthWrite: false`, `transparent: true`, `blending: THREE.AdditiveBlending`).
- Set `uDiffraction = 1.0` for `type === "harness"` (creates subtle Universe Sandbox / Interstellar 4-point optical star spikes) and `0.0` for `session` / `subagent`.

```glsl
// CORONA_VERTEX_SHADER (for PlaneGeometry billboard or SpriteMaterial custom shader; prefer PlaneGeometry with quaternion copied from camera.quaternion each frame for full ShaderMaterial control)
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

// CORONA_FRAGMENT_SHADER
uniform vec3 uHaloColor;
uniform vec3 uCoreColor;
uniform float uIntensity;
uniform float uDiffraction;
uniform float uTime;

varying vec2 vUv;

void main() {
  vec2 p = (vUv - 0.5) * 2.0; // -1..1
  float r = length(p);
  if (r >= 1.0) discard;

  // Smooth physical inverse-exponential scatter that hits 0.0 cleanly at r=1.0
  float edgeFade = smoothstep(1.0, 0.08, r);
  float coreGlow = exp(-r * 4.2) * 0.85 + exp(-r * 1.7) * 0.25;

  // Subtle stellar diffraction spikes for Harness host stars
  float spikeH = exp(-abs(p.y) * 42.0) * exp(-abs(p.x) * 3.2);
  float spikeV = exp(-abs(p.x) * 42.0) * exp(-abs(p.y) * 3.2);
  float spikes = (spikeH + spikeV) * 0.45 * uDiffraction * edgeFade;

  float alpha = (coreGlow * edgeFade + spikes) * clamp(uIntensity * 0.34, 0.04, 1.15);
  vec3 col = mix(uHaloColor, uCoreColor, exp(-r * 5.0) * 0.65 + spikes);

  gl_FragColor = vec4(col * alpha, alpha);
}
```

### 4.3 Synaptic Action-Potential Pulse Shader (`PULSE_VERTEX_SHADER` & `PULSE_FRAGMENT_SHADER`)
Used on a `THREE.Points` pool for all active synapse photon packets (`blending: THREE.AdditiveBlending`, `depthWrite: false`, `transparent: true`):

```glsl
// PULSE_VERTEX_SHADER
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (280.0 / max(-mvPosition.z, 1.0));
  gl_Position = projectionMatrix * mvPosition;
}

// PULSE_FRAGMENT_SHADER
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = (gl_PointCoord - 0.5) * 2.0;
  float r = length(c);
  if (r > 1.0) discard;
  float glow = pow(1.0 - r, 2.2);
  gl_FragColor = vec4(vColor * glow * 2.2, glow * vAlpha);
}
```

---

## 5. Deep-Space Starfield & Van Gogh Nebula Dust (`NeuralCosmosEngine.ts`)

Create 2 background `THREE.Points` layers at startup (non-raycastable):
1. **Distant Starfield (`2,800` stars)** distributed in a spherical shell `R = 140..420`:
   - Sample realistic blackbody star tints: `25%` warm amber (`#ffd9a8`), `45%` soft ivory (`#f5f3ee`), `30%` ice blue (`#bcd8ff`), with tiny `aSize` (`0.8..2.2`) and `opacity: 0.45` so background stars never compete with foreground neurons.
2. **Cosmic Flow Dust (`900` particles)** in a flattened galactic disc (`R = 12..95`, `y = -14..14`):
   - Slowly drifts along a subtle tangential curl velocity (`dθ = 0.015 * dt`), evoking Van Gogh's swirling starry currents at very low opacity (`0.12`).
3. **Universe Sandbox Reference Grid (Toggleable ON/OFF, default ON)**:
   - Polar reference disc on `y = -0.05` centered at `(0, 0, 0)` with 4 concentric hairline `LineLoop` circles (`R = 14, 28, 46, 68`) and 12 radial tick lines in `#6e85a3` at `opacity: 0.065`.

---

## 6. 3D Gravitational-Orbital + Dendritic Layout (`src/scene/layoutEngine.ts`)

Agents never send coordinates. Compute smooth, deterministic target positions every frame:

1. **Deterministic Hash Helper**:
   - `hash01(str)` → FNV-1a 32-bit hash mapped to `[0, 1)`.
2. **Tier 0 (`harness` nodes — Host Stars)**:
   - If `count === 1`: `(0, 0, 0)`.
   - If `count > 1`: evenly spaced around `R_harness = 36` (`angle = 2π * index / count + 0.35`, `y = (hash01(id) - 0.5) * 3.0`).
3. **Tier 1 (`session` nodes — Primary Neurons)**:
   - Grouped by `parentId` (if `parentId` missing or unresolved, orbits world origin `(0, 0, 0)`).
   - Sibling `i` (`0..k-1`):
     - `orbitRadius = 11.5 + i * 3.8`
     - `baseAngle = i * 2.3999632 + hash01(id) * 1.2` (Golden-angle offset avoids collinear spoke alignment)
     - `inclinationX = (hash01(id + ":x") - 0.5) * 0.24` (`±7°`)
     - `inclinationZ = (hash01(id + ":z") - 0.5) * 0.24`
     - `angularSpeed = (0.11 / Math.pow(orbitRadius / 11.5, 0.85)) * statusMotionFactor(status)`
       - `statusMotionFactor`: `running | tool_calling` → `1.0`; `waiting` → `0.55`; `completed | idle | error` → `0.22`.
     - Local position relative to parent = `rotateZ(inclinationZ, rotateX(inclinationX, (cos(θ)*R, 0, sin(θ)*R)))`.
   - **Universe Sandbox Orbital Ring**: Render a `96`-segment `THREE.LineLoop` along this exact inclined circle centered at the parent's smoothed position, using `haloColor` with `opacity = appearance.orbitRingOpacity` (toggled via `showOrbits`).
4. **Tier 2+ (`subagent` nodes — Dendritic Satellites)**:
   - Grouped by `parentId` (usually a `session`, or nested `subagent`).
   - Sibling `j`:
     - `orbitRadius = 3.6 + (j % 3) * 1.15 + Math.floor(j / 3) * 0.8`
     - `inclinationX = (hash01(id + ":sx") - 0.5) * 0.95` (`±27°` 3D dendritic cloud feel)
     - `inclinationZ = (hash01(id + ":sz") - 0.5) * 0.95`
     - `angularSpeed = 0.34 * statusMotionFactor(status)`
5. **Damped Position & Appearance Smoothing**:
   - Store `currentPos` per node and damp toward `targetPos` via `alpha = 1 - Math.exp(-6.0 * dt)`.
   - Smoothly lerp `uCoreColor`, `uHaloColor`, `uEmissiveIntensity`, `scale`, and `uTurbulence` over `alpha = 1 - Math.exp(-4.5 * dt)` so status transitions (`running` → `completed`) look like a star physically igniting or cooling down!

---

## 7. Organic 3D Neural Synapses (`NeuralCosmosEngine.ts`)

For each `ResolvedSynapseEdge`:
1. Resolve `p0 = sourceNode.currentPos` and `p2 = targetNode.currentPos`.
2. Compute perpendicular arc lift `p1`:
   - Midpoint `mid = (p0 + p2) * 0.5`.
   - Distance `d = p0.distanceTo(p2)`.
   - Lift direction `up = normalize(vec3(sin(hash), 1.35, cos(hash)))` so `collaborates` edges (`curveArc: 0.38`) arch gracefully through 3D space while `hierarchy` axons (`curveArc: 0.16`) have a subtle organic bow.
   - `p1 = mid + up * (d * edgeAppearance.curveArc)`.
3. Sample `40` points along `THREE.QuadraticBezierCurve3(p0, p1, p2)` into a pre-allocated `BufferGeometry` position buffer (`THREE.Line` with `transparent: true`, `blending: THREE.AdditiveBlending`).
4. **Traveling Action-Potential Pulses**:
   - When `edgeAppearance.pulseCount > 0` (`status === "active"` or `"error"`), emit `pulseCount` particles at `t_m = fract(simTime * edgeAppearance.pulseSpeed + m / pulseCount)`.
   - Envelope `aAlpha = Math.sin(Math.PI * t_m)` so pulses fade in smoothly leaving the soma and fade into the target dendrite without popping!

---

## 8. Camera Tethering & HUD Architecture

### 8.1 Universe Sandbox Camera Fly-To & Tethering (`src/scene/cameraRig.ts`)
- Maintain `tetheredNodeId: string | null`.
- When user clicks a node (in 3D or in Hierarchy/Inspector):
  - Set `tetheredNodeId = node.id`.
  - Compute ideal framing distance `desiredDist = Math.max(nodeRadius * 9.5, 11)` along the current view vector `normalize(camera.position - controls.target)`.
  - Smoothly ease camera distance over `0.65s` while still allowing user mouse rotation/zoom!
- While `tetheredNodeId` is active, each frame add `deltaPos = node.currentPos - prevTetherPos` to **both** `controls.target` and `camera.position` — the camera effortlessly rides along with the orbiting neuron just like Universe Sandbox!
- Pressing `Escape` or clicking `Untether / Cosmos Overview` clears `tetheredNodeId` and smoothly frames the full system.

### 8.2 HUD Surfaces (`src/components/*.tsx`)
1. **Top-Left Telemetry Header (`TopTelemetryBar.tsx`)**:
   - Minimal floating pill (`height: 40px`):
     - `NEUROVERSE` wordmark (`11px`, `letter-spacing: 0.16em`, `font-weight: 600`)
     - Live SSE dot (`#4be3c8` when connected, `#e09b46` reconnecting) + shortened `stateDir`
     - Counters: `Harnesses` · `Active Neurons` · `Firing Synapses`
2. **Left Collapsible Navigator (`HierarchyNavigator.tsx`, width `260px`)**:
   - Clean nested tree (`Harness → Session → Subagent`) with status dot, label, and active tool micro-badge (`⚡ read_file`). Clicking a row selects & tethers the camera to that node.
3. **60fps Screen-Space Reticles & Labels (`ScreenSpaceOverlay.tsx`)**:
   - Imperative `requestAnimationFrame` callback from `NeuralCosmosEngine` updates DOM refs directly via `el.style.transform = translate3d(${x}px, ${y}px, 0)` (do NOT trigger React state re-renders at 60fps!).
   - **Selected / Hovered Node Reticle**: Thin `1px` circular ring + 4 corner ticks (`width/height` proportional to projected screen radius, softly rotating dashed inner ring on selected target).
   - **Label Visibility Rule** (when `labelMode === "smart"`, default):
     - Always show labels for `harness`, `selected`, `hovered`, and any node with `status` in `["running", "tool_calling", "waiting", "error"]`.
     - Hide labels for `completed`/`idle` subagents unless hovered/selected or `labelMode === "all"`.
4. **Right Telemetry Inspector Drawer (`NodeInspectorDrawer.tsx`, width `360px`)**:
   - Slides in smoothly (`transform: translateX(0)`) when a node is selected.
   - **Header**: `typeLabel` eyebrow (`PRIMARY NEURON · SESSION`), status pill, `node.label`, `node.id` monospace subtitle, clickable `Parent` breadcrumb button.
   - **Live Vitals Strip**: `Status`, **Live Elapsed Duration** (ticks every `1s` from `config.startedAt` to `config.endedAt ?? now`), `Updated At`.
   - **Declarative Fields Section**: Iterates `nodeDefinition.fields` (`badge`, `code`, `multiline`, `timestamp`, `tags` for `toolsUsed` chronological pills), skipping `null`/empty fields cleanly (or showing subtle `—` for key vitals).
   - **Connected Synapses Section**: Lists incoming (`parent`) and outgoing (`children` + `links`) connections; clicking any item flies the camera to that connected neuron.
5. **Bottom Universe Sandbox Control Bar (`SimulationControlBar.tsx`)**:
   - Centered floating glass bar (`bottom: 20px`):
     - `⏸ Pause / ▶ Orbit` + Speed selector (`0.5×` | `1×` | `2×`)
     - Toggle buttons: `Orbits` (ON/OFF), `Grid` (ON/OFF), `Labels` (`Smart` / `All` / `Off`), `Reset Camera`
     - Action buttons: **`✦ Run Neural Demo`** (`POST /api/demo/start`) and `Clear` (`POST /api/state/clean` with subtle confirm/click).
