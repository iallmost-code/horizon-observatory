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
