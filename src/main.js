// Black hole webapp entry point.
//
// We render a single full-screen quad whose fragment shader does all of the
// gravitational lensing. A separate (virtual) PerspectiveCamera driven by
// OrbitControls supplies the camera position + basis as uniforms, so the
// user can drag/zoom to fly around the black hole interactively.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "lil-gui";

// ---------- helpers ----------
async function loadText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.text();
}

// ---------- bootstrap ----------
const canvas = document.getElementById("view");
const fpsEl = document.getElementById("fps");
const loaderEl = document.getElementById("loader");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: "high-performance",
  alpha: false,
});
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();

// Orthographic camera that draws our fullscreen quad.
const fsCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// "Virtual" perspective camera the user actually controls.
const userCamera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.01,
  1000,
);
userCamera.position.set(0, 4, 22);

const controls = new OrbitControls(userCamera, canvas);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.7;
controls.zoomSpeed = 0.9;
controls.panSpeed = 0.7;
controls.minDistance = 4.5;
controls.maxDistance = 200;
controls.update();

// ---------- parameters ----------
const params = {
  // physics
  schwarzschildRadius: 1.0,
  fovY: 60,

  // disk
  diskEnabled: true,
  diskInner: 3.0,        // in units of Rs (ISCO is 3 Rs for Schwarzschild)
  diskOuter: 12.0,
  diskThickness: 0.25,
  diskColorHot: "#ffd6a3",
  diskColorCool: "#ff5e2b",
  diskBrightness: 1.7,
  diskRotationSpeed: 0.6,
  dopplerStrength: 1.0,

  // background
  starDensity: 0.18,
  starBrightness: 1.0,
  nebulaStrength: 0.6,

  // quality
  qualityPreset: "Medium",
  resolutionScale: 0.8,
  steps: 160,
  stepSize: 0.22,
  escapeRadius: 50.0,
  autoQuality: true,
  targetFps: 55,

  // actions
  resetView: () => {
    controls.target.set(0, 0, 0);
    userCamera.position.set(0, 4, 22);
    controls.update();
  },
  pausedTime: false,
};

// Quality presets — switching one of these updates the corresponding sliders
// (and triggers a single `resize`).
const QUALITY_PRESETS = {
  Potato: { resolutionScale: 0.45, steps: 80, stepSize: 0.32, escapeRadius: 40 },
  Low: { resolutionScale: 0.6, steps: 110, stepSize: 0.28, escapeRadius: 45 },
  Medium: { resolutionScale: 0.8, steps: 160, stepSize: 0.22, escapeRadius: 50 },
  High: { resolutionScale: 1.0, steps: 220, stepSize: 0.18, escapeRadius: 60 },
  Ultra: { resolutionScale: 1.25, steps: 320, stepSize: 0.14, escapeRadius: 80 },
};

// ---------- shader material ----------
const uniforms = {
  uResolution: { value: new THREE.Vector2() },
  uTime: { value: 0 },

  uCamPos: { value: new THREE.Vector3() },
  uCamBasis: { value: new THREE.Matrix3() },
  uFovY: { value: THREE.MathUtils.degToRad(params.fovY) },

  uRs: { value: params.schwarzschildRadius },

  uDiskEnabled: { value: params.diskEnabled ? 1 : 0 },
  uDiskInner: { value: params.diskInner },
  uDiskOuter: { value: params.diskOuter },
  uDiskThickness: { value: params.diskThickness },
  uDiskColorHot: { value: new THREE.Color(params.diskColorHot) },
  uDiskColorCool: { value: new THREE.Color(params.diskColorCool) },
  uDiskBrightness: { value: params.diskBrightness },
  uDiskRotationSpeed: { value: params.diskRotationSpeed },
  uDopplerStrength: { value: params.dopplerStrength },

  uStarDensity: { value: params.starDensity },
  uStarBrightness: { value: params.starBrightness },
  uNebulaStrength: { value: params.nebulaStrength },

  uStepSize: { value: params.stepSize },
  uMaxSteps: { value: params.steps },
  uEscapeRadius: { value: params.escapeRadius },
};

const [vertSrc, fragSrc] = await Promise.all([
  loadText(new URL("./shaders/fullscreen.vert", import.meta.url)),
  loadText(new URL("./shaders/blackhole.frag", import.meta.url)),
]);

const material = new THREE.ShaderMaterial({
  vertexShader: vertSrc,
  fragmentShader: fragSrc,
  uniforms,
  glslVersion: THREE.GLSL3,
  depthTest: false,
  depthWrite: false,
});

const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
scene.add(quad);

// ---------- GUI ----------
const gui = new GUI({ title: "Parameters" });

const physicsFolder = gui.addFolder("Black hole");
physicsFolder
  .add(params, "schwarzschildRadius", 0.2, 4.0, 0.05)
  .name("Schwarzschild radius")
  .onChange((v) => (uniforms.uRs.value = v));
physicsFolder
  .add(params, "fovY", 25, 110, 1)
  .name("Field of view °")
  .onChange((v) => {
    uniforms.uFovY.value = THREE.MathUtils.degToRad(v);
    userCamera.fov = v;
    userCamera.updateProjectionMatrix();
  });
physicsFolder.add(params, "resetView").name("Reset view");

const diskFolder = gui.addFolder("Accretion disk");
diskFolder
  .add(params, "diskEnabled")
  .name("Enabled")
  .onChange((v) => (uniforms.uDiskEnabled.value = v ? 1 : 0));
diskFolder
  .add(params, "diskInner", 1.5, 20.0, 0.1)
  .name("Inner radius (Rs)")
  .onChange((v) => (uniforms.uDiskInner.value = v));
diskFolder
  .add(params, "diskOuter", 4.0, 40.0, 0.1)
  .name("Outer radius (Rs)")
  .onChange((v) => (uniforms.uDiskOuter.value = v));
diskFolder
  .add(params, "diskThickness", 0.0, 2.0, 0.01)
  .name("Thickness")
  .onChange((v) => (uniforms.uDiskThickness.value = v));
diskFolder
  .addColor(params, "diskColorHot")
  .name("Inner color")
  .onChange((v) => uniforms.uDiskColorHot.value.set(v));
diskFolder
  .addColor(params, "diskColorCool")
  .name("Outer color")
  .onChange((v) => uniforms.uDiskColorCool.value.set(v));
diskFolder
  .add(params, "diskBrightness", 0.0, 5.0, 0.05)
  .name("Brightness")
  .onChange((v) => (uniforms.uDiskBrightness.value = v));
diskFolder
  .add(params, "diskRotationSpeed", 0.0, 4.0, 0.05)
  .name("Rotation speed")
  .onChange((v) => (uniforms.uDiskRotationSpeed.value = v));
diskFolder
  .add(params, "dopplerStrength", 0.0, 1.5, 0.01)
  .name("Doppler beaming")
  .onChange((v) => (uniforms.uDopplerStrength.value = v));

const skyFolder = gui.addFolder("Background");
skyFolder
  .add(params, "starDensity", 0.0, 0.5, 0.005)
  .name("Star density")
  .onChange((v) => (uniforms.uStarDensity.value = v));
skyFolder
  .add(params, "starBrightness", 0.0, 3.0, 0.05)
  .name("Star brightness")
  .onChange((v) => (uniforms.uStarBrightness.value = v));
skyFolder
  .add(params, "nebulaStrength", 0.0, 2.0, 0.05)
  .name("Nebula tint")
  .onChange((v) => (uniforms.uNebulaStrength.value = v));

const qualityFolder = gui.addFolder("Quality");
const presetCtrl = qualityFolder
  .add(params, "qualityPreset", Object.keys(QUALITY_PRESETS))
  .name("Preset")
  .onChange((name) => applyPreset(name));
qualityFolder
  .add(params, "autoQuality")
  .name("Auto adjust")
  .onChange((v) => {
    drsState.cooldown = 0;
    if (!v) drsState.scaleAdj = 1.0;
  });
qualityFolder
  .add(params, "targetFps", 30, 120, 1)
  .name("Target FPS");
const resCtrl = qualityFolder
  .add(params, "resolutionScale", 0.3, 2.0, 0.05)
  .name("Resolution scale")
  .onChange(resize);
const stepsCtrl = qualityFolder
  .add(params, "steps", 40, 600, 10)
  .name("Ray-march steps")
  .onChange((v) => (uniforms.uMaxSteps.value = Math.round(v)));
const stepSizeCtrl = qualityFolder
  .add(params, "stepSize", 0.05, 0.5, 0.01)
  .name("Step size")
  .onChange((v) => (uniforms.uStepSize.value = v));
const escapeCtrl = qualityFolder
  .add(params, "escapeRadius", 30, 200, 5)
  .name("Escape radius")
  .onChange((v) => (uniforms.uEscapeRadius.value = v));
qualityFolder.add(params, "pausedTime").name("Pause time");

function applyPreset(name) {
  const p = QUALITY_PRESETS[name];
  if (!p) return;
  Object.assign(params, p);
  uniforms.uMaxSteps.value = p.steps;
  uniforms.uStepSize.value = p.stepSize;
  uniforms.uEscapeRadius.value = p.escapeRadius;
  drsState.scaleAdj = 1.0;
  drsState.cooldown = 0;
  resize();
  resCtrl.updateDisplay();
  stepsCtrl.updateDisplay();
  stepSizeCtrl.updateDisplay();
  escapeCtrl.updateDisplay();
}

// fold inner-most folder by default to keep the panel small on first paint
skyFolder.close();

// ---------- resize ----------
// Dynamic-resolution-scaling state. `scaleAdj` is multiplied into the
// user-chosen `resolutionScale` and lives between [drsMin, 1.0].
const drsState = {
  scaleAdj: 1.0,
  drsMin: 0.45,
  cooldown: 0, // seconds until next adjustment is allowed
  fpsAvg: 60,
};

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const scale = params.resolutionScale * drsState.scaleAdj;

  // Effective pixel ratio combines device dpr, the user's quality slider,
  // and the auto-DRS adjustment.
  renderer.setPixelRatio(dpr * scale);
  renderer.setSize(w, h, true);

  const rw = Math.max(1, Math.floor(w * dpr * scale));
  const rh = Math.max(1, Math.floor(h * dpr * scale));
  uniforms.uResolution.value.set(rw, rh);

  userCamera.aspect = w / h;
  userCamera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// ---------- render loop ----------
const tmpBasis = new THREE.Matrix4();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const fwd = new THREE.Vector3();

let last = performance.now();
let frames = 0;
let fpsAccum = 0;
let simTime = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  controls.update();

  // Update camera uniforms from the user-controlled perspective camera.
  userCamera.updateMatrixWorld();
  tmpBasis.copy(userCamera.matrixWorld);
  // basis columns: right, up, -forward (matches the dirCam construction in shader)
  right.setFromMatrixColumn(tmpBasis, 0);
  up.setFromMatrixColumn(tmpBasis, 1);
  fwd.setFromMatrixColumn(tmpBasis, 2);

  uniforms.uCamPos.value.copy(userCamera.position);
  // prettier-ignore
  uniforms.uCamBasis.value.set(
    right.x, up.x, fwd.x,
    right.y, up.y, fwd.y,
    right.z, up.z, fwd.z,
  );

  if (!params.pausedTime) simTime += dt;
  uniforms.uTime.value = simTime;

  renderer.render(scene, fsCamera);

  // FPS HUD + Auto-DRS
  frames++;
  fpsAccum += dt;
  drsState.cooldown = Math.max(0, drsState.cooldown - dt);

  if (fpsAccum >= 0.5) {
    const fps = frames / fpsAccum;
    drsState.fpsAvg = drsState.fpsAvg * 0.5 + fps * 0.5;
    fpsEl.textContent = fps.toFixed(0);
    frames = 0;
    fpsAccum = 0;

    if (params.autoQuality && drsState.cooldown === 0) {
      const target = params.targetFps;
      const avg = drsState.fpsAvg;
      let adjusted = false;

      // Too slow → drop internal resolution.
      if (avg < target - 6 && drsState.scaleAdj > drsState.drsMin) {
        drsState.scaleAdj = Math.max(drsState.drsMin, drsState.scaleAdj * 0.85);
        adjusted = true;
      }
      // Plenty of headroom → claw resolution back, but never above 1.0
      // (so we don't fight the user's manual slider).
      else if (avg > target + 12 && drsState.scaleAdj < 1.0) {
        drsState.scaleAdj = Math.min(1.0, drsState.scaleAdj * 1.1);
        adjusted = true;
      }

      if (adjusted) {
        drsState.cooldown = 1.2; // give the new resolution time to settle
        resize();
      }
    }
  }

  requestAnimationFrame(frame);
}

// Hide loader once we've drawn one full frame.
requestAnimationFrame((t) => {
  last = t;
  frame(t);
  requestAnimationFrame(() => loaderEl.classList.add("hidden"));
});
