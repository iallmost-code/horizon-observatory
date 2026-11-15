(function (global) {
  'use strict';

  const FULLSCREEN_VS = `#version 300 es
precision highp float;
const vec2 POS[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2( 3.0, -1.0),
  vec2(-1.0,  3.0)
);
out vec2 vUv;
void main() {
  vec2 p = POS[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

  // Precomputes seamless 512x512 multi-octave turbulence lookup texture (runs once at boot)
  const NOISE_PRECOMPUTE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

float hash21(vec2 p, float period) {
  p = mod(p, period);
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float tileNoise(vec2 uv, float freq) {
  vec2 gv = uv * freq;
  vec2 id = floor(gv);
  vec2 f = fract(gv);
  f = f * f * (3.0 - 2.0 * f);

  float a = hash21(id, freq);
  float b = hash21(id + vec2(1.0, 0.0), freq);
  float c = hash21(id + vec2(0.0, 1.0), freq);
  float d = hash21(id + vec2(1.0, 1.0), freq);

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float tileFbm(vec2 uv, float baseFreq, int octaves) {
  float v = 0.0;
  float amp = 0.5;
  float freq = baseFreq;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    v += amp * tileNoise(uv, freq);
    freq *= 2.0;
    amp *= 0.5;
  }
  return v;
}

void main() {
  float n1 = tileFbm(vUv, 6.0, 5);
  float n2 = tileFbm(vUv * vec2(2.0, 1.0) + vec2(0.17, 0.43), 12.0, 5);
  float n3 = tileFbm(vUv + vec2(n1 * 0.14, n2 * 0.14), 24.0, 4);
  float n4 = hash21(floor(vUv * 512.0), 512.0);
  fragColor = vec4(n1, n2, n3, n4);
}`;

  // Precomputes 1024x512 equirectangular deep-space starfield & Milky Way dust band (runs once)
  const SKY_PRECOMPUTE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = hash33(i + vec3(0,0,0)).x;
  float n100 = hash33(i + vec3(1,0,0)).x;
  float n010 = hash33(i + vec3(0,1,0)).x;
  float n110 = hash33(i + vec3(1,1,0)).x;
  float n001 = hash33(i + vec3(0,0,1)).x;
  float n101 = hash33(i + vec3(1,0,1)).x;
  float n011 = hash33(i + vec3(0,1,1)).x;
  float n111 = hash33(i + vec3(1,1,1)).x;

  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

float fbm3(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise3(p);
    p = p * 2.03 + vec3(1.7, 9.2, 4.1);
    a *= 0.5;
  }
  return v;
}

vec3 starLayer(vec3 dir, float scale, float density, float brightness) {
  vec3 p = dir * scale;
  vec3 id = floor(p);
  vec3 f = fract(p) - 0.5;
  vec3 h = hash33(id);
  if (h.x < density) return vec3(0.0);

  vec3 offset = (h - 0.5) * 0.65;
  float d = length(f - offset);
  float size = mix(0.03, 0.11, pow(h.y, 4.0));
  float core = (1.0 - smoothstep(0.0, size, d));
  core = pow(core, 2.2) * brightness * mix(0.3, 2.4, pow(h.z, 5.0));

  // Stellar spectral color: O/B blue-white -> G yellow-white -> K/M amber
  vec3 col = mix(vec3(1.0, 0.68, 0.42), vec3(0.72, 0.86, 1.0), h.y);
  col = mix(col, vec3(1.0, 0.96, 0.90), 0.35);
  return col * core;
}

void main() {
  float phi = (vUv.x - 0.5) * 6.28318530718;
  float theta = (vUv.y - 0.5) * 3.14159265359;
  float cosT = cos(theta);
  vec3 dir = normalize(vec3(cosT * cos(phi), sin(theta), cosT * sin(phi)));

  // Tilted galactic plane
  vec3 galAxis = normalize(vec3(0.28, 0.88, -0.38));
  float galLat = abs(dot(dir, galAxis));
  float band = exp(-galLat * 5.2);

  float dust1 = fbm3(dir * 3.5);
  float dust2 = fbm3(dir * 8.5 + vec3(4.2));
  float darkLane = smoothstep(0.36, 0.66, dust2) * exp(-galLat * 11.0);

  vec3 col = vec3(0.00025, 0.0004, 0.0008);
  vec3 nebula = mix(vec3(0.06, 0.09, 0.17), vec3(0.19, 0.12, 0.08), dust1);
  col += nebula * band * 0.12 * (0.42 + 0.58 * dust1) * (1.0 - 0.72 * darkLane);

  // Subtle emission pockets
  float pocket = smoothstep(0.60, 0.88, fbm3(dir * 6.0 + 11.3));
  col += vec3(0.14, 0.22, 0.42) * pocket * band * 0.045;

  // Multi-scale crisp 3D Voronoi-grid stars (zero polar distortion)
  col += starLayer(dir, 55.0, 0.91, 2.1);
  col += starLayer(dir, 115.0, 0.86, 1.2);
  col += starLayer(dir, 210.0, 0.82, 0.55);

  fragColor = vec4(col, 1.0);
}`;

  // Main Relativistic Kerr Black Hole + Volumetric Accretion Disk + Dual Companion Lensing Raymarcher
  const RAYMARCH_FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uCamPos;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamForward;
uniform float uAspect;
uniform float uTanHalfFov;

uniform float uSpin;
uniform float uHorizonR;
uniform float uIscoR;
uniform float uDiskTemp;
uniform float uDiskDensity;
uniform float uJetPower;
uniform int uMode;       // 0=optical, 1=eht, 2=spacetime, 3=geodesics
uniform float uDoppler;
uniform float uMergerPulse;
uniform float uUseCompressedHdr;

uniform int uBodyCount;
uniform vec4 uBodyPos[8]; // xyz = pos, w = radius
uniform vec4 uBodyCol[8]; // rgb = color, w = kind (0=star, 1=probe, 2=companion)

uniform sampler2D uSkyTex;
uniform sampler2D uNoiseTex;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Accurate smooth Planckian blackbody color approximation (Kelvin)
vec3 blackbody(float kelvin) {
  float t = clamp(kelvin, 1200.0, 22000.0) / 100.0;
  vec3 c;
  if (t <= 66.0) {
    c.r = 1.0;
    c.g = clamp(0.390081578769 * log(t) - 0.631841443788, 0.0, 1.0);
    c.b = (t <= 19.0) ? 0.0 : clamp(0.54320678911 * log(t - 10.0) - 1.19625408914, 0.0, 1.0);
  } else {
    float x = t - 60.0;
    c.r = clamp(1.29293618606 * pow(x, -0.1332047592), 0.0, 1.0);
    c.g = clamp(1.12989086090 * pow(x, -0.0755148492), 0.0, 1.0);
    c.b = 1.0;
  }
  return pow(c, vec3(1.15));
}

// Event Horizon Telescope (EHT) 230 GHz Inferno colormap
vec3 ehtPalette(float x) {
  x = clamp(x, 0.0, 1.0);
  vec3 c0 = vec3(0.02, 0.01, 0.04);
  vec3 c1 = vec3(0.45, 0.06, 0.14);
  vec3 c2 = vec3(0.95, 0.36, 0.06);
  vec3 c3 = vec3(1.00, 0.84, 0.34);
  vec3 c4 = vec3(1.00, 0.99, 0.94);
  if (x < 0.25) return mix(c0, c1, x * 4.0);
  if (x < 0.55) return mix(c1, c2, (x - 0.25) / 0.30);
  if (x < 0.85) return mix(c2, c3, (x - 0.55) / 0.30);
  return mix(c3, c4, (x - 0.85) / 0.15);
}

// Disk plasma pattern for one shear clock. ts is the time the differential
// rotation has been winding this copy; it must stay bounded (see SHEAR_PERIOD).
const float SHEAR_PERIOD = 48.0;

float diskPattern(float phi, float logR, float keplerOmega, float ts, float seed) {
  // "+ adv" advects the pattern toward decreasing phi, matching gasDir in main()
  float adv = ts * keplerOmega;
  vec2 uv1 = vec2(phi / TAU * 2.0 + adv * 0.11 + logR * 0.58 + seed, logR * 0.45 - uTime * 0.015);
  vec2 uv2 = vec2(phi / TAU * 4.0 + adv * 0.19 + logR * 1.05 + seed, logR * 0.92 + 0.37);

  vec4 nA = texture(uNoiseTex, uv1);
  vec4 nB = texture(uNoiseTex, uv2);

  float filaments = mix(nA.r, nB.g, 0.54);
  float detail = nB.b;
  float shear = phi + adv * 0.5;
  float warp = texture(uNoiseTex, vec2(shear / TAU + seed, logR * 0.65)).g;
  float rings = 0.5 + 0.5 * sin(logR * 63.0 + warp * 13.0 + sin(shear * 3.0) * 1.8);
  float clump = smoothstep(0.18, 0.92, filaments * 0.52 + detail * 0.24 + rings * 0.30);
  return pow(clump, 2.15);
}

vec3 sampleSky(vec3 dir) {
  dir = normalize(dir);
  float phi = atan(dir.z, dir.x);
  float theta = asin(clamp(dir.y, -0.9999, 0.9999));
  vec2 uv = vec2(phi / TAU + 0.5, theta / PI + 0.5);
  vec3 sky = texture(uSkyTex, uv).rgb * 1.35;
  if (uMode == 1) {
    // EHT radio sky is silent cosmic microwave background
    return sky * 0.08;
  }
  return sky;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 rd = normalize(uCamForward + uCamRight * (ndc.x * uAspect * uTanHalfFov) + uCamUp * (ndc.y * uTanHalfFov));
  vec3 p = uCamPos;
  vec3 v = rd;

  const float R_BOUND = 28.0;
  float totalDist = 0.0;

  // Fast-forward ray from outer camera to bounding sphere
  float rCam = length(p);
  if (rCam > R_BOUND) {
    float b = dot(p, v);
    float c = dot(p, p) - R_BOUND * R_BOUND;
    float disc = b * b - c;
    if (disc <= 0.0) {
      vec3 sky = sampleSky(v);
      if (uUseCompressedHdr > 0.5) sky = sky / (1.0 + sky * 0.25);
      fragColor = vec4(sky, 1.0);
      return;
    }
    float tEnter = max(0.0, -b - sqrt(disc));
    p += v * tEnter;
    totalDist += tEnter;
  }

  // Locate optional secondary companion singularity (kind == 2)
  bool hasCompanion = false;
  vec3 compPos = vec3(0.0);
  float compRad = 0.0;
  for (int bi = 0; bi < 8; bi++) {
    if (bi >= uBodyCount) break;
    if (uBodyCol[bi].w > 1.5) {
      hasCompanion = true;
      compPos = uBodyPos[bi].xyz;
      compRad = uBodyPos[bi].w;
      break;
    }
  }

  vec3 accum = vec3(0.0);
  float transmit = 1.0;
  bool hitHorizon = false;
  float hitDepth = 1.0;
  float minClosestR = 999.0;

  float jitter = hash12(gl_FragCoord.xy + fract(uTime) * 37.0);
  float diskInner = max(uHorizonR * 1.12, uIscoR * 0.88);
  float diskOuter = 11.4;

  // Geodesic ray integration
  const int MAX_STEPS = 96;
  for (int i = 0; i < MAX_STEPS; i++) {
    float r2 = dot(p, p);
    float r = sqrt(r2);
    minClosestR = min(minClosestR, r);

    vec3 L = cross(p, v);
    float L2 = dot(L, L);

    // Kerr asymmetric capture boundary: prograde photons (same sense as the disk,
    // direction (z, 0, -x), i.e. L.y > 0) skim closer
    float progradeFactor = clamp(L.y / (sqrt(L2) + 1e-4), -1.0, 1.0);
    float rCap = max(1.06, uHorizonR * (1.02 - 0.11 * uSpin * progradeFactor));

    if (r <= rCap) {
      hitHorizon = true;
      hitDepth = clamp(totalDist / 120.0, 0.0, 0.99);
      break;
    }

    if (r > R_BOUND && dot(p, v) > 0.0 && i > 6) {
      break;
    }

    // Companion singularity capture check
    if (hasCompanion) {
      vec3 dc = p - compPos;
      float rc = length(dc);
      if (rc <= compRad * 0.92) {
        hitHorizon = true;
        hitDepth = clamp(totalDist / 120.0, 0.0, 0.99);
        // Glowing rim corona around companion horizon
        accum += transmit * vec3(1.6, 0.62, 0.22) * 0.45;
        break;
      }
    }

    // Adaptive step size: tight near horizon and equatorial disk, fast in outer space
    float dt = clamp(0.055 * (r - rCap * 0.72), 0.028, 0.55);
    float diskSlabHalf = 0.028 * r + 0.10;
    if (abs(p.y) < diskSlabHalf * 2.8 && r < diskOuter * 1.05) {
      dt = min(dt, 0.13);
    }
    if (i == 0) {
      dt *= (0.75 + 0.5 * jitter);
    }

    // Schwarzschild exact spatial null geodesic acceleration: -3 * |p x v|^2 / r^5 * p
    float invR5 = 1.0 / (r2 * r2 * r + 1e-4);
    vec3 acc = -3.0 * L2 * invR5 * p;

    // Kerr gravitomagnetic frame-dragging around +Y, in the disk's orbital sense (z, 0, -x)
    if (uSpin > 0.01) {
      float omegaLT = (1.35 * uSpin) / (r2 * r + 0.65);
      acc += vec3(p.z, 0.0, -p.x) * (omegaLT * 0.55);
    }

    // Secondary companion gravitational lensing perturbation
    if (hasCompanion) {
      vec3 dc = p - compPos;
      float rc2 = dot(dc, dc);
      float rc = sqrt(rc2 + 1e-4);
      vec3 Lc = cross(dc, v);
      acc += (-3.0 * 0.26 * dot(Lc, Lc) / (rc2 * rc2 * rc + 0.08)) * dc;
    }

    // Midpoint / Velocity update
    vec3 vNext = normalize(v + acc * dt);
    vec3 pMid = p + 0.5 * (v + vNext) * dt;
    vec3 pNext = p + vNext * dt;

    // Lensed orbiting stars & probes tested along the curved ray segment
    for (int bi = 0; bi < 8; bi++) {
      if (bi >= uBodyCount) break;
      float bKind = uBodyCol[bi].w;
      vec3 bPos = uBodyPos[bi].xyz;
      float bRad = uBodyPos[bi].w;
      vec3 seg = pNext - p;
      float segLen2 = dot(seg, seg) + 1e-6;
      float tProj = clamp(dot(bPos - p, seg) / segLen2, 0.0, 1.0);
      vec3 closest = p + seg * tProj;
      float dBody = length(bPos - closest);

      if (bKind < 1.5) {
        // Star (0) or Probe (1)
        float glowRad = bRad * (bKind < 0.5 ? 2.6 : 2.1);
        if (dBody < glowRad) {
          float core = smoothstep(bRad * 1.05, bRad * 0.2, dBody);
          float halo = exp(-dBody / (bRad * 0.72));
          float lumScale = (bKind < 0.5 ? 3.8 : 2.8);
          vec3 bCol = uBodyCol[bi].rgb;
          if (uMode == 1) bCol = ehtPalette(0.85);
          accum += transmit * bCol * (core * lumScale + halo * 0.65) * clamp(dt * 3.0, 0.15, 1.0);
          if (dBody < bRad * 0.85) {
            transmit *= (1.0 - core * 0.85);
          }
        }
      } else {
        // Companion singularity accretion corona
        if (dBody < bRad * 3.2 && dBody > bRad * 0.9) {
          float corona = exp(-(dBody - bRad) * 2.2) * 0.12 * dt;
          accum += transmit * vec3(1.8, 0.72, 0.28) * corona;
        }
      }
    }

    // Volumetric Accretion Disk sampling
    float rMid2 = dot(pMid.xz, pMid.xz);
    float rMid = sqrt(rMid2);
    float scaleH = 0.026 * rMid + 0.024;
    if (abs(pMid.y) < scaleH * 2.6 && rMid > diskInner * 0.88 && rMid < diskOuter) {
      float vertProfile = exp(-(pMid.y * pMid.y) / (2.0 * scaleH * scaleH));
      float innerEdge = smoothstep(diskInner * 0.90, diskInner * 1.22, rMid);
      float outerEdge = 1.0 - smoothstep(diskOuter * 0.58, diskOuter, rMid);
      float radialFalloff = pow(clamp(diskInner / max(rMid, diskInner), 0.0, 1.0), 1.35);

      if (vertProfile * innerEdge * outerEdge > 0.002) {
        float phi = atan(pMid.z, pMid.x);
        // Differential Keplerian rotation speed
        float keplerOmega = 1.65 * pow(max(rMid, 1.3), -1.35);
        float logR = log(max(rMid, 0.5));

        // Differential rotation driven by raw uTime winds the pattern tighter forever
        // until it aliases into grain. Instead run two copies on clocks that reset
        // every SHEAR_PERIOD seconds, half a period apart, and crossfade so each
        // copy is invisible at the moment its clock resets (flow-map technique).
        float cyc = uTime / SHEAR_PERIOD;
        float fA = fract(cyc);
        float fB = fract(cyc + 0.5);
        float wA = 1.0 - abs(2.0 * fA - 1.0);
        float clump = mix(
          diskPattern(phi, logR, keplerOmega, fB * SHEAR_PERIOD, 0.37),
          diskPattern(phi, logR, keplerOmega, fA * SHEAR_PERIOD, 0.0),
          wA
        );

        // Relativistic Doppler shift & beaming factor g
        vec3 gasDir = normalize(vec3(pMid.z, 0.0, -pMid.x));
        float beta = clamp(sqrt(1.0 / max(1.35, rMid - 0.55 * uSpin)), 0.0, 0.78);
        float gamma = inversesqrt(1.0 - beta * beta);
        float gravRedshift = sqrt(max(0.08, 1.0 - uHorizonR / max(uHorizonR * 1.04, rMid)));
        float mu = dot(gasDir, -vNext);
        float gFactor = gravRedshift / (gamma * (1.0 - beta * mu));
        if (uDoppler < 0.5) {
          gFactor = mix(1.0, gravRedshift, 0.65);
        }

        float beaming = pow(clamp(gFactor, 0.34, 1.92), 2.35);
        float density = vertProfile * innerEdge * outerEdge * (0.075 + 1.22 * clump) * uDiskDensity;

        // Mode-dependent color emission
        vec3 emitCol;
        if (uMode == 1) {
          // EHT 230 GHz synchrotron millimeter emission + subtle magnetic polarization striations
          float polWave = 0.72 + 0.28 * sin(phi * 14.0 + logR * 18.0 + uTime * 0.8);
          float ehtVal = clamp((radialFalloff * 0.58 + 0.42 * clump) * clamp(beaming, 0.28, 2.2) * 0.34 * polWave, 0.0, 1.0);
          emitCol = ehtPalette(ehtVal) * (1.05 + 1.25 * ehtVal);
        } else {
          float localKelvin = uDiskTemp * pow(clamp(diskInner / max(rMid, diskInner), 0.18, 1.0), 0.62) * clamp(gFactor, 0.45, 1.75);
          emitCol = blackbody(localKelvin) * beaming * (0.48 + 0.95 * radialFalloff);
        }

        // Extra fiery ISCO inner rim flare
        float iscoFlare = exp(-abs(rMid - diskInner * 1.08) * 3.8) * 0.65;
        emitCol *= (1.0 + iscoFlare + uMergerPulse * 1.1);

        // Mode 2 & 3 dim disk cleanly so spacetime metric grid & geodesic rays read clearly
        float modeDim = (uMode == 2) ? 0.36 : (uMode == 3) ? 0.24 : 1.0;

        float stepAlpha = clamp(density * dt * 1.22, 0.0, 0.88);
        accum += transmit * emitCol * stepAlpha * modeDim;
        transmit *= (1.0 - stepAlpha * 0.84);

        if (transmit < 0.015) break;
      }
    }

    // Relativistic Polar Jets (collimated Blandford-Znajek funnel)
    if (uJetPower > 0.02 && uSpin > 0.15) {
      float ay = abs(pMid.y);
      if (ay > uHorizonR * 0.85 && ay < 16.5) {
        float funnelR = 0.36 + 0.18 * pow(ay, 0.82);
        if (rMid < funnelR * 1.9) {
          float radialJet = exp(-(rMid * rMid) / (funnelR * funnelR));
          float axialFade = smoothstep(uHorizonR * 0.85, uHorizonR * 2.2, ay) * exp(-ay * 0.14);
          float phi = atan(pMid.z, pMid.x);
          float helix = texture(uNoiseTex, vec2(phi / TAU * 2.0 + ay * 0.18, ay * 0.14 - uTime * 0.55)).g;
          float jetDens = radialJet * axialFade * (0.45 + 0.95 * helix) * uJetPower * uSpin;

          vec3 jetCol = (uMode == 1)
            ? ehtPalette(clamp(0.45 + 0.45 * helix, 0.0, 1.0)) * 1.5
            : mix(vec3(0.32, 0.62, 1.35), vec3(0.68, 0.84, 1.45), helix) * 1.35;

          accum += transmit * jetCol * jetDens * dt * 0.42;
        }
      }
    }

    p = pNext;
    v = vNext;
    totalDist += dt;
  }

  // Sharp photon-ring glow around critical impact sphere (grazing rays)
  float photonSphereR = uHorizonR * 1.42;
  if (!hitHorizon && minClosestR < photonSphereR * 1.45) {
    float ringFocus = exp(-abs(minClosestR - photonSphereR) * 22.0);
    vec3 ringCol = (uMode == 1)
      ? ehtPalette(0.92) * 1.3
      : blackbody(uDiskTemp * 1.25) * 1.25;
    accum += transmit * ringCol * ringFocus * (0.34 + uMergerPulse * 0.9);
  }

  if (!hitHorizon) {
    accum += transmit * sampleSky(v);
  }

  if (uUseCompressedHdr > 0.5) {
    accum = accum / (1.0 + accum * 0.25);
  }

  fragColor = vec4(max(accum, vec3(0.0)), hitDepth);
}`;

  // 3D Geometry Shader (Spacetime Curvature Grid, Orbital Trails, Geodesic Rays)
  const LINE_3D_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aColor;

uniform mat4 uViewProj;
uniform vec3 uCamPos;

out vec4 vColor;
out float vLinearDist;

void main() {
  vColor = aColor;
  vLinearDist = length(aPos - uCamPos);
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

  const LINE_3D_FS = `#version 300 es
precision highp float;
in vec4 vColor;
in float vLinearDist;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform vec2 uViewport;
uniform float uUseCompressedHdr;

void main() {
  vec2 uv = gl_FragCoord.xy / uViewport;
  float sceneDepth = texture(uSceneTex, uv).a * 120.0;
  // Occlude smoothly behind event horizon shadow
  if (vLinearDist > sceneDepth + 0.35 && sceneDepth < 118.0) {
    discard;
  }
  vec3 col = vColor.rgb;
  if (uUseCompressedHdr > 0.5) {
    col = col / (1.0 + col * 0.25);
  }
  fragColor = vec4(col * vColor.a, vColor.a);
}`;

  // 3D Additive Particle Shader (Tidal Disruption Debris Stream)
  const PARTICLE_3D_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aMeta; // temp, life, maxLife, active

uniform mat4 uViewProj;
uniform vec3 uCamPos;
uniform float uPixelRatio;

out vec4 vColor;
out float vLinearDist;

void main() {
  if (aMeta.w < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vColor = vec4(0.0);
    vLinearDist = 9999.0;
    return;
  }
  float lifeFrac = clamp(aMeta.y / max(0.001, aMeta.z), 0.0, 1.0);
  float temp = aMeta.x * (0.45 + 0.55 * lifeFrac);
  vec3 hot = vec3(0.75, 0.92, 1.35);
  vec3 warm = vec3(1.25, 0.62, 0.20);
  vec3 cool = vec3(0.65, 0.16, 0.08);
  vec3 col = temp > 0.65
    ? mix(warm, hot, (temp - 0.65) / 0.35)
    : mix(cool, warm, temp / 0.65);

  float alpha = smoothstep(0.0, 0.15, lifeFrac) * smoothstep(0.0, 0.35, 1.0 - lifeFrac + 0.25);
  vColor = vec4(col * 1.45, alpha * 0.9);
  vLinearDist = length(aPos - uCamPos);
  gl_Position = uViewProj * vec4(aPos, 1.0);
  gl_PointSize = clamp((38.0 / max(1.0, vLinearDist)) * uPixelRatio, 1.5, 9.0);
}`;

  const PARTICLE_3D_FS = `#version 300 es
precision highp float;
in vec4 vColor;
in float vLinearDist;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform vec2 uViewport;
uniform float uUseCompressedHdr;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d2 = dot(c, c);
  if (d2 > 0.25) discard;

  vec2 uv = gl_FragCoord.xy / uViewport;
  float sceneDepth = texture(uSceneTex, uv).a * 120.0;
  if (vLinearDist > sceneDepth + 0.35 && sceneDepth < 118.0) {
    discard;
  }

  float radial = exp(-d2 * 14.0);
  vec3 col = vColor.rgb * radial;
  if (uUseCompressedHdr > 0.5) {
    col = col / (1.0 + col * 0.25);
  }
  fragColor = vec4(col * vColor.a, vColor.a * radial);
}`;

  // Bright-pass extract for HDR bloom pyramid
  const BLOOM_BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTex;
uniform sampler2D uOverlayTex;
uniform float uUseCompressedHdr;

vec3 unpackHdr(vec3 c) {
  if (uUseCompressedHdr > 0.5) {
    return c / max(vec3(0.04), 1.0 - c * 0.25);
  }
  return c;
}

void main() {
  vec3 c = unpackHdr(texture(uTex, vUv).rgb) + unpackHdr(texture(uOverlayTex, vUv).rgb);
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float soft = smoothstep(0.95, 2.45, lum);
  fragColor = vec4(c * soft, 1.0);
}`;

  // Separable Gaussian Blur
  const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTex;
uniform vec2 uTexelOffset;

void main() {
  const float w[5] = float[5](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  vec3 result = texture(uTex, vUv).rgb * w[0];
  for (int i = 1; i < 5; i++) {
    vec2 off = uTexelOffset * float(i);
    result += texture(uTex, vUv + off).rgb * w[i];
    result += texture(uTex, vUv - off).rgb * w[i];
  }
  fragColor = vec4(result, 1.0);
}`;

  // Final ACES Filmic Tone Mapping + Multi-Octave Bloom + Optical Chromatic Fringe
  const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform sampler2D uOverlayTex;
uniform sampler2D uBloomTight;
uniform sampler2D uBloomWide;
uniform float uEnableBloom;
uniform float uMergerPulse;
uniform float uUseCompressedHdr;

vec3 acesFilm(vec3 x) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 unpackHdr(vec3 c) {
  if (uUseCompressedHdr > 0.5) {
    return c / max(vec3(0.04), 1.0 - c * 0.25);
  }
  return c;
}

void main() {
  // Subtle optical radial chromatic dispersion near screen edges
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);
  vec2 shift = d * r2 * 0.0012;

  float rCh = unpackHdr(texture(uSceneTex, vUv + shift).rgb).r;
  float gCh = unpackHdr(texture(uSceneTex, vUv).rgb).g;
  float bCh = unpackHdr(texture(uSceneTex, vUv - shift).rgb).b;
  vec3 hdr = vec3(rCh, gCh, bCh) + unpackHdr(texture(uOverlayTex, vUv).rgb);

  if (uEnableBloom > 0.5) {
    vec3 b1 = texture(uBloomTight, vUv).rgb;
    vec3 b2 = texture(uBloomWide, vUv).rgb;
    hdr += b1 * 0.18 + b2 * 0.085;
  }

  // Merger exposure pulse
  hdr *= (1.0 + uMergerPulse * 0.55);

  // Subtle edge vignette
  hdr *= (1.0 - 0.28 * r2);

  vec3 mapped = acesFilm(hdr * 0.78);
  vec3 srgb = pow(mapped, vec3(1.0 / 2.2));
  fragColor = vec4(srgb, 1.0);
}`;

  global.HorizonShaders = {
    FULLSCREEN_VS,
    NOISE_PRECOMPUTE_FS,
    SKY_PRECOMPUTE_FS,
    RAYMARCH_FS,
    LINE_3D_VS,
    LINE_3D_FS,
    PARTICLE_3D_VS,
    PARTICLE_3D_FS,
    BLOOM_BRIGHT_FS,
    BLUR_FS,
    COMPOSITE_FS,
  };
})(window);
