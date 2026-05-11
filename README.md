# Black Hole

An interactive WebGL visualisation of a Schwarzschild black hole - gravitational lensing, accretion disk with relativistic Doppler beaming, procedural starfield - all rendered live in a fragment shader. 
Check it out [here](https://asbou45115.github.io/black_hole/)

- **Drag** to orbit the black hole
- **Scroll** to zoom
- **Right-drag** to pan
- A side panel exposes physics + visual parameters (Schwarzschild radius, disk inner/outer radius, Doppler beaming strength, star density, render quality, …)

The whole thing is a static site (HTML + JS + GLSL), so it deploys to GitHub Pages with no build step.

## Run locally

Ensure python at least 3.11 is installed. Run the following in the terminal:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000> in a modern browser (Chrome, Firefox, Safari, Edge - anything with WebGL 2). 

## Deploy to GitHub Pages

A workflow at `.github/workflows/deploy.yml` publishes the site automatically.

1. Push this repo to GitHub.
2. In the repo settings, go to **Pages → Build and deployment** and set **Source** to **GitHub Actions**.
3. Push to `main`. The action will build and publish the site to `https://<user>.github.io/<repo>/`.

## Project layout

```
.
├── index.html                  # entry, sets up importmap for three.js + lil-gui
├── src/
│   ├── main.js                 # scene, OrbitControls, GUI, render loop
│   ├── style.css               # overlay UI styling
│   └── shaders/
│       ├── fullscreen.vert     # passthrough vertex shader
│       └── blackhole.frag      # ray-marched Schwarzschild lensing + disk
├── .github/workflows/deploy.yml
├── pyproject.toml              # uv project metadata (no runtime deps)
└── README.md
```

## How it works (briefly)

The fragment shader does all the physics. For each pixel it:

1. Constructs a primary ray from the camera.
2. Integrates the photon's path in 3D Cartesian using the Schwarzschild
   approximation `d²r/dt² = -1.5·h²·r/|r|⁵` where `h = |r × v|`.
3. Steps adaptively (smaller steps near the event horizon, bigger far away).
4. On each step:
   - if the ray crosses `|r| < Rs` it's swallowed → black,
   - if it crosses the equatorial plane inside the disk's annulus it picks up emission with a Shakura-Sunyaev-ish radial temperature profile and a relativistic Doppler beaming factor `D³`,
   - if it escapes past the configured escape radius it samples a procedural starfield + nebula.

Three.js handles the WebGL plumbing, the camera, and `OrbitControls`; the actual perspective camera is "virtual" - its position and basis vectors are forwarded to the shader as uniforms each frame, while the geometry rendered is just a single full-screen quad.

## Tweaking ideas

- Set **Disk → Inner radius** below 3 Rs to see what happens inside the ISCO (unphysical but pretty).
- Crank **Doppler beaming** to 1.5 for a strong "one-sided bright crescent" look.
- Drop **Quality → Resolution scale** to 0.6 on slow GPUs, or push **Ray-march steps** to 400+ on fast ones for crisper lensing.
