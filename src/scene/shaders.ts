export const SOMA_VERTEX_SHADER = /* glsl */ `
uniform float uTime;
uniform float uPulseSpeed;
uniform float uPulseAmplitude;
uniform float uSeed;
uniform float uFlash;

varying vec3 vViewNormal;
varying vec3 vViewDir;

void main() {
  // Pure, serene mathematical sphere — zero lumps, zero vertex deformation
  float breath = sin(uTime * uPulseSpeed * 6.2831853 + uSeed) * uPulseAmplitude;
  float swell = uFlash * 0.06;
  vec3 cleanPos = position * (1.0 + breath * 0.25 + swell);

  vec4 mvPosition = modelViewMatrix * vec4(cleanPos, 1.0);
  vViewNormal = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
}
`;

/**
 * Pure Crystalline Glass-Pearl Shader (2001 × Anthropic Minimalist Optical Precision):
 * - Perfectly smooth radial symmetry (no noisy blotches, no organic texture).
 * - Calm dark-glass interior, delicate satin Fresnel rim, and a crisp luminous inner pearl core.
 */
export const SOMA_FRAGMENT_SHADER = /* glsl */ `
uniform float uTime;
uniform vec3 uCoreColor;
uniform vec3 uHaloColor;
uniform float uEmissiveIntensity;
uniform float uPulseSpeed;
uniform float uPulseAmplitude;
uniform float uSeed;
uniform float uFlash;

varying vec3 vViewNormal;
varying vec3 vViewDir;

void main() {
  vec3 N = normalize(vViewNormal);
  vec3 V = normalize(vViewDir);
  float ndotv = clamp(dot(N, V), 0.001, 0.999);

  // Smooth concentric optical glass profile
  float glassRim = pow(1.0 - ndotv, 2.4);
  float innerPearl = smoothstep(0.52, 0.96, ndotv);
  float softBody = pow(ndotv, 1.35);

  float breath = 1.0 + sin(uTime * uPulseSpeed * 6.2831853 + uSeed) * uPulseAmplitude;

  vec3 glassInterior = uHaloColor * (0.18 + 0.16 * softBody);
  vec3 pearlCore = mix(uHaloColor, uCoreColor, 0.82) * innerPearl * 0.72;
  vec3 satinRim = mix(uHaloColor, uCoreColor, 0.35) * glassRim * 0.92;
  vec3 arrivalGlow = mix(uHaloColor, uCoreColor, 0.75) * uFlash * (0.38 + 0.42 * ndotv);

  vec3 finalRgb = (glassInterior + pearlCore + satinRim) * uEmissiveIntensity * breath
                + arrivalGlow * max(uEmissiveIntensity, 0.65);

  gl_FragColor = vec4(finalRgb, 1.0);
}
`;

export const CORONA_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const CORONA_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uHaloColor;
uniform vec3 uCoreColor;
uniform float uIntensity;
uniform float uDiffraction;
uniform float uFlash;
uniform float uFarewell;

varying vec2 vUv;

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  if (r >= 1.0) discard;

  float edgeFade = smoothstep(1.0, 0.12, r);
  float softAura = exp(-r * 5.2) * 0.4;

  // Clean concentric geometric ripple when a signal arrives
  float rippleRadius = clamp(0.92 - uFlash * 0.72, 0.14, 0.9);
  float dr = (r - rippleRadius) * 16.0;
  float rippleRing = exp(-dr * dr) * uFlash * (1.0 - r) * 0.38;

  // Small-radius "Farewell Afterglow" ring when an expired subagent bows out
  float fwRing = 0.0;
  float fwGlow = 0.0;
  if (uFarewell > 0.001) {
    float fwEnv = (1.0 - uFarewell) * (1.0 - uFarewell);
    float fwRad = 0.16 + uFarewell * 0.74;
    float dfw = (r - fwRad) * 18.0;
    fwRing = exp(-dfw * dfw) * fwEnv * (1.0 - r) * 1.15;
    fwGlow = exp(-r * 4.2) * fwEnv * 0.65;
  }

  float spikeH = exp(-abs(p.y) * 46.0) * exp(-abs(p.x) * 4.0);
  float spikeV = exp(-abs(p.x) * 46.0) * exp(-abs(p.y) * 4.0);
  float spikes = (spikeH + spikeV) * 0.22 * uDiffraction * edgeFade;

  float baseAlpha = (softAura * edgeFade + rippleRing + spikes) * clamp(uIntensity * 0.11, 0.015, 0.15);
  float totalAlpha = clamp(baseAlpha + (fwRing + fwGlow) * 0.48, 0.0, 0.92);
  vec3 col = mix(uHaloColor, uCoreColor, clamp(rippleRing * 0.8 + fwRing * 0.9 + fwGlow * 0.5 + spikes * 0.5, 0.0, 1.0));

  gl_FragColor = vec4(col * totalAlpha, totalAlpha);
}
`;

export const AXON_VERTEX_SHADER = /* glsl */ `
attribute float aProgress;

varying float vProgress;
varying vec3 vViewNormal;
varying vec3 vViewDir;

void main() {
  vProgress = aProgress;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewNormal = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
}
`;

/**
 * Pure Smooth Optical Fiber Shader:
 * - Uniformly sleek, calm, bump-free translucent light thread.
 * - Inactive links remain clearly legible in soft steel-blue without bloom wash.
 * - Active links carry a serene, smooth optical light comet gliding along the arc.
 */
export const AXON_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uBaseColor;
uniform vec3 uPulseColor;
uniform float uOpacity;
uniform float uSimTime;
uniform float uPulseSpeed;
uniform float uPulseCount;
uniform float uSeed;
uniform float uGrowth;

varying float vProgress;
varying vec3 vViewNormal;
varying vec3 vViewDir;

void main() {
  if (uGrowth <= 0.001 || vProgress > uGrowth) discard;

  vec3 N = normalize(vViewNormal);
  vec3 V = normalize(vViewDir);
  float ndotv = clamp(abs(dot(N, V)), 0.001, 0.999);

  float opticalCore = pow(ndotv, 0.55);
  float startFade = smoothstep(0.0, 0.05, vProgress);
  float endFade = uGrowth >= 0.995
    ? smoothstep(1.0, 0.95, vProgress)
    : smoothstep(0.0, 0.028, uGrowth - vProgress);
  float endpointFade = startFade * endFade;

  // Luminous leading growth cone while the fiber is extending toward its target
  float distFromTip = max(0.0, uGrowth - vProgress);
  float growthCone = (uGrowth < 0.995)
    ? exp(-distFromTip * 20.0) * smoothstep(0.0, 0.06, uGrowth)
    : 0.0;

  float lightStream = 0.0;
  if (uGrowth >= 0.98 && uPulseCount > 0.5 && uPulseSpeed > 0.001) {
    float cycle = fract(vProgress * uPulseCount - (uSimTime * uPulseSpeed + uSeed) * uPulseCount);
    float head = smoothstep(0.92, 0.995, cycle);
    float tail = exp(-cycle * 11.0) * (1.0 - smoothstep(0.90, 1.0, cycle));
    lightStream = (head + tail) * endpointFade;
  }

  float activeTip = lightStream + growthCone;
  vec3 fiberRgb = uBaseColor * (0.72 + 0.35 * opticalCore) + uPulseColor * (activeTip * 1.35);
  float fiberAlpha = clamp((uOpacity * (0.75 + 0.25 * opticalCore) + activeTip * 0.88) * endpointFade, 0.0, 0.96);

  gl_FragColor = vec4(fiberRgb, fiberAlpha);
}
`;

export const PULSE_VERTEX_SHADER = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (210.0 / max(-mvPosition.z, 1.0));
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const PULSE_FRAGMENT_SHADER = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = (gl_PointCoord - 0.5) * 2.0;
  float r = length(c);
  if (r > 1.0) discard;
  float glow = pow(1.0 - r, 2.6);
  gl_FragColor = vec4(vColor * glow * 1.3, glow * vAlpha);
}
`;

export const STAR_VERTEX_SHADER = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
uniform float uPixelRatio;
varying vec3 vColor;

void main() {
  vColor = aColor;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uPixelRatio * (160.0 / max(-mvPosition.z, 1.0)), 1.0, 4.2);
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const STAR_FRAGMENT_SHADER = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;

void main() {
  vec2 c = (gl_PointCoord - 0.5) * 2.0;
  float r = length(c);
  if (r > 1.0) discard;
  float soft = pow(1.0 - r, 2.0);
  gl_FragColor = vec4(vColor, soft * uOpacity);
}
`;
