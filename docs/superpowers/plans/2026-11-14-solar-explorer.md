# Solar explorer

Add a desktop Solar System scene alongside the existing observatory. Use a separate canvas renderer with procedural planet textures, deterministic stars, orbit paths, mouse pan/zoom, selectable planets, and pause/reset controls. Display eight planets and the Sun with compressed distances and exaggerated sizes clearly labeled. Preserve the black hole scene and pause its rendering while the explorer is open. No external assets or dependencies.

Files: src/solar.js owns rendering and interaction; styles.css owns the explorer layout; index.html loads the module; app.js suspends the hidden simulation.

Verification: JavaScript syntax; live shader startup; open/close explorer; planet selection; pause/reset; mouse zoom; no console errors. Publish the same public URL and synchronize GitHub after review.
