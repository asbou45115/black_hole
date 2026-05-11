// Schwarzschild black hole renderer.
//
// We integrate null geodesics in 3D Cartesian coordinates using the well-known
// effective equation for light around a Schwarzschild black hole:
//
//   d^2 r / dt^2 = -1.5 * h^2 * r / |r|^5
//
// where h = |r x v| is the (conserved) specific angular momentum of the
// photon. Units are geometrized so the Schwarzschild radius Rs = 2 * M.

precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2  uResolution;
uniform float uTime;

// Camera (world space)
uniform vec3  uCamPos;
uniform mat3  uCamBasis;   // columns: right, up, -forward
uniform float uFovY;       // radians

// Black hole
uniform float uRs;         // Schwarzschild radius (in scene units)

// Accretion disk
uniform float uDiskEnabled;
uniform float uDiskInner;  // in units of Rs
uniform float uDiskOuter;  // in units of Rs
uniform float uDiskThickness;
uniform vec3  uDiskColorHot;
uniform vec3  uDiskColorCool;
uniform float uDiskBrightness;
uniform float uDiskRotationSpeed;
uniform float uDopplerStrength;

// Background
uniform float uStarDensity;
uniform float uStarBrightness;
uniform float uNebulaStrength;

// Quality
uniform float uStepSize;       // base step size
uniform int   uMaxSteps;
uniform float uEscapeRadius;

#define PI 3.14159265359

// ---------- hash / noise ----------
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash31(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

// Smooth value noise on a sphere direction (for nebula).
float valueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i + vec3(0,0,0));
  float n100 = hash31(i + vec3(1,0,0));
  float n010 = hash31(i + vec3(0,1,0));
  float n110 = hash31(i + vec3(1,1,0));
  float n001 = hash31(i + vec3(0,0,1));
  float n101 = hash31(i + vec3(1,0,1));
  float n011 = hash31(i + vec3(0,1,1));
  float n111 = hash31(i + vec3(1,1,1));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

// 3 octaves is plenty for the disk swirl + nebula tint; going higher used
// to cost ~40% of the per-pixel time during disk crossings.
float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * valueNoise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

// ---------- procedural starfield ----------
// Sample a few random stars per cell on a unit-direction grid. Cheap but
// gives a decent deep-space backdrop without needing a cubemap texture.
vec3 starfield(vec3 dir) {
  vec3 col = vec3(0.0);

  // Faint nebula tint
  float n = fbm(dir * 3.0 + 12.7);
  vec3 nebulaA = vec3(0.05, 0.07, 0.18);
  vec3 nebulaB = vec3(0.18, 0.06, 0.20);
  col += mix(nebulaA, nebulaB, smoothstep(0.45, 0.85, n)) *
         pow(n, 2.0) * uNebulaStrength;

  // Stars: 2 grid scales is enough; the 3rd was barely visible.
  for (int s = 0; s < 2; s++) {
    float scale = 80.0 * pow(2.0, float(s));
    vec3  g = dir * scale;
    vec3  cell = floor(g);
    vec3  f = fract(g) - 0.5;

    float seed = hash31(cell + float(s) * 17.13);
    if (seed < uStarDensity) {
      vec3 jitter = vec3(
        hash11(seed + 1.0) - 0.5,
        hash11(seed + 2.0) - 0.5,
        hash11(seed + 3.0) - 0.5
      ) * 0.7;
      float d = length(f - jitter);
      float bright = pow(hash11(seed + 4.0), 6.0);
      float core = exp(-d * 70.0) * bright;
      // give stars a small color tint
      vec3 tint = mix(vec3(0.85, 0.9, 1.1),
                      vec3(1.1, 0.95, 0.8),
                      hash11(seed + 5.0));
      col += core * tint * uStarBrightness;
    }
  }
  return col;
}

// ---------- accretion disk ----------
// Disk lies in the y = 0 plane. Returns emitted color when the ray segment
// crosses the plane within the disk's annulus.
vec3 sampleDisk(vec3 hitPos, vec3 rayDir, float Rs) {
  float r = length(hitPos.xz);
  float rN = r / Rs;
  if (rN < uDiskInner || rN > uDiskOuter) return vec3(0.0);

  // Radial profile: hot near ISCO, cool at the edges.
  float t = clamp((rN - uDiskInner) / (uDiskOuter - uDiskInner), 0.0, 1.0);
  vec3 base = mix(uDiskColorHot, uDiskColorCool, pow(t, 0.6));

  // Azimuthal turbulence — gives the streaky rotating texture.
  float phi  = atan(hitPos.z, hitPos.x);
  float spin = phi - uDiskRotationSpeed * uTime / sqrt(max(rN, 1e-3));
  float swirl = fbm(vec3(cos(spin) * rN, sin(spin) * rN, rN * 0.4) * 1.6);
  float bands = 0.55 + 0.55 * fbm(vec3(spin * 3.0, rN * 6.0, rN));
  float density = pow(swirl, 1.5) * bands;

  // Inner edge gets brighter (T ~ r^(-3/4) Shakura-Sunyaev-ish falloff).
  float temperature = pow(uDiskInner / max(rN, uDiskInner), 0.75);
  vec3 emission = base * density * temperature * uDiskBrightness;

  // Relativistic Doppler beaming. The disk orbits prograde around +y.
  vec3 radial = normalize(vec3(hitPos.x, 0.0, hitPos.z));
  vec3 tangent = vec3(-radial.z, 0.0, radial.x);
  float vKepler = sqrt(0.5 / max(rN, 1e-3));        // v/c at this radius
  vKepler = clamp(vKepler, 0.0, 0.95);
  float beta = vKepler * uDopplerStrength;
  float cosA = dot(tangent, -rayDir);
  float doppler = 1.0 / (1.0 - beta * cosA);        // boost factor
  emission *= pow(doppler, 3.0);                    // I_obs ~ D^3 for line emission

  return emission;
}

void main() {
  // ----- build the primary ray -----
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float tanHalf = tan(uFovY * 0.5);
  vec3 dirCam = normalize(vec3(uv * 2.0 * tanHalf, -1.0));
  vec3 rayDir = normalize(uCamBasis * dirCam);
  vec3 rayPos = uCamPos;

  // ----- integrate the geodesic -----
  vec3 accumulated = vec3(0.0);
  float diskAlpha = 0.0;

  // h = |r x v| is conserved; we keep it constant for stability.
  vec3 angMom = cross(rayPos, rayDir);
  float h2 = dot(angMom, angMom);

  bool eaten = false;
  bool escaped = false;

  float prevY = rayPos.y;

  // Tight upper bound helps the WebGL compiler reason about the loop.
  for (int i = 0; i < 1024; i++) {
    if (i >= uMaxSteps) break;

    float r2 = dot(rayPos, rayPos);
    float r = sqrt(r2);
    if (r < uRs) { eaten = true; break; }
    if (r > uEscapeRadius) { escaped = true; break; }

    // Adaptive step size: tiny near the BH (where the curvature is wild),
    // up to ~3.5x the base step in nearly-flat space far away. This single
    // change lets us reach the escape radius in a fraction of the steps.
    float dt = uStepSize * mix(0.25, 3.5, smoothstep(uRs * 2.0, uRs * 25.0, r));

    // gravitational pull on light: a = -1.5 * h^2 * r / |r|^5
    vec3 accel = -1.5 * h2 * rayPos / (r2 * r2 * r);

    rayDir = normalize(rayDir + accel * dt);
    vec3 nextPos = rayPos + rayDir * dt;

    // disk-plane crossing test (sign change in y) within disk thickness.
    if (uDiskEnabled > 0.5 && diskAlpha < 0.99) {
      float y0 = rayPos.y;
      float y1 = nextPos.y;
      if (y0 * y1 < 0.0) {
        float k = y0 / (y0 - y1);
        vec3 hit = mix(rayPos, nextPos, k);
        vec3 emission = sampleDisk(hit, rayDir, uRs);
        // soften by thickness so very thin disks aren't aliased pixels
        float thicknessFade = 1.0;
        if (uDiskThickness > 0.0) {
          float d = abs(hit.y) / uDiskThickness;
          thicknessFade = exp(-d * d);
        }
        emission *= thicknessFade;
        // accumulate as semi-transparent emission
        accumulated += emission * (1.0 - diskAlpha);
        diskAlpha   += clamp(length(emission) * 0.4, 0.0, 1.0) * (1.0 - diskAlpha);
      }
    }

    rayPos = nextPos;
    prevY = rayPos.y;
  }

  vec3 col = accumulated;

  if (escaped) {
    col += starfield(rayDir) * (1.0 - diskAlpha);
  } else if (!eaten) {
    // ran out of steps — fade to background using current direction
    col += starfield(rayDir) * 0.5 * (1.0 - diskAlpha);
  }

  // soft event-horizon halo (photon ring is naturally produced by lensing,
  // but a tiny rim helps the silhouette read against the nebula)
  if (eaten) {
    // pure black absorber
    col = vec3(0.0);
  }

  // mild tonemap so bright disk doesn't blow out
  col = col / (1.0 + col * 0.6);
  col = pow(col, vec3(1.0 / 2.2));

  fragColor = vec4(col, 1.0);
}
