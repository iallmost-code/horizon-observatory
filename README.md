# HORIZON Observatory

An interactive, browser-based black hole sandbox with custom WebGL2 graphics, orbital bodies, launch controls, procedural audio, and guided experiments.

## Run locally

Open `index.html` in a modern browser with WebGL2 support. There is no build step or package installation. A static web server also works.

## Source map

- `src/app.js`: interface, input, camera, animation loop
- `src/physics.js`: orbital simulation and presets
- `src/shaders.js`: GLSL shaders and light tracing
- `src/renderer.js`: WebGL rendering and canvas overlays
- `src/audio.js`: procedural audio
- `styles.css`: layout and styling

## Collaboration

Start from `main`, create a focused branch such as `codex/disk-detail` or `claude/camera-polish`, and use a pull request for review. Read `AGENTS.md` before editing. Record checks and remaining limitations in each pull request.

## Baseline and accuracy

Imported from the user-provided `horizon-observatory-fixed.zip` on November 14, 2026. The original prototype was generated with Google Antigravity; the user identifies Fable as the source of the fixed revision. Preserve this provenance as the project evolves.

This is a physics-inspired visualization with simplified and tuned calculations. Scientific labels do not establish validated Kerr ray tracing, calibrated gravitational-wave strain, or research accuracy.

The previously shared Netlify demo is https://magenta-twilight-63c1b9.netlify.app/ . This repository is not configured to deploy to that site.

## Manual checks after changes

Check all four viewing modes and five presets; pause/resume; launch up to the body limit; select and ride a body; leave Ride mode; open guided experiments; toggle audio and cinema mode; inspect narrow and desktop layouts. Check the browser console for errors. Explain which checks were actually performed.

## Rights

No distribution license has been selected. Do not assume an open-source license.

## Major moon systems

Select a planet, choose **Explore moon system**, then select a moon for a close view. The 21 included moons use JPL SSD mean radii, semi-major axes, eccentricities, inclinations, nodes, arguments of periapsis and orbital periods (retrieved November 14, 2026). Within each local system, planet and moon radii and orbital distances share one scale. The overview remains compressed. The shared clock defaults to 1 simulated day per second. Use Time speed to select 1 hour, 1 day, 30 days, or 1 year per real second. Planet orbit paths are simplified circles with preserved orbital period ratios; initial phases are illustrative.

Source tables: https://ssd.jpl.nasa.gov/sats/phys_par/sep.html and https://ssd.jpl.nasa.gov/sats/elem/sep.html . These elements describe approximate orbit shapes; JPL explicitly advises using Horizons for accurate ephemerides. The local reference plane is used directly, without global pole orientation or precession. Initial phases are illustrative, not dated ephemerides. Surfaces are procedural illustrations, not mapped imagery. Small nonspherical moons are represented using their equivalent mean radii. Mercury and Venus have no natural moons.
