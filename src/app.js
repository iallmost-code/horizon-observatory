(function (global) {
  'use strict';

  const Physics = global.HorizonPhysics;
  const RendererMod = global.HorizonRenderer;
  const AudioMod = global.HorizonAudio;

  function formatClock(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const mm = String(mins).padStart(2, '0');
    const ss = secs.toFixed(2).padStart(5, '0');
    return `${mm}:${ss}`;
  }

  function main() {
    const glCanvas = document.getElementById('gl-canvas');
    const overlayCanvas = document.getElementById('overlay-canvas');
    const gwCanvas = document.getElementById('gw-canvas');
    const appShell = document.getElementById('app');

    const sim = new Physics.Simulation();
    const audio = new AudioMod.RelativisticAudioEngine();

    let renderer;
    try {
      renderer = new RendererMod.ObservatoryRenderer(glCanvas, overlayCanvas, gwCanvas);
    } catch (err) {
      document.body.innerHTML = `<div style="padding:32px;font-family:sans-serif;color:#fff;background:#080a10;">
        <h2>WebGL2 Initialization Failed</h2>
        <p>${err.message}</p>
      </div>`;
      return;
    }

    // Camera state (smooth damped spherical coordinates)
    const cam = {
      theta: 0.48,
      phi: 1.24,
      radius: 35.0,
      targetTheta: 0.48,
      targetPhi: 1.24,
      targetRadius: 35.0,
      pos: [0, 7, 25],
      target: [0, 0, 0],
      autoSpin: true,
    };

    let interactionTool = 'orbit'; // 'orbit' | 'launch'
    let pointerState = null; // { mode: 'orbit'|'launch', startX, startY, moved, originWorld, velWorld, prediction, cursorCss }
    let toastTimer = null;

    // UI Element References
    const el = {
      subtitle: document.getElementById('scenario-subtitle'),
      modeBtns: Array.from(document.querySelectorAll('.mode-btn')),
      presetBtns: Array.from(document.querySelectorAll('.preset-chip')),
      btnAudio: document.getElementById('btn-audio'),
      audioLed: document.getElementById('audio-led'),
      audioLabel: document.getElementById('audio-label'),
      btnLab: document.getElementById('btn-lab'),
      labDrawer: document.getElementById('lab-drawer'),
      btnLabClose: document.getElementById('btn-lab-close'),
      labCards: document.getElementById('lab-cards'),
      labActiveNote: document.getElementById('lab-active-note'),
      btnHudHide: document.getElementById('btn-hud-hide'),
      btnCinemaExit: document.getElementById('btn-cinema-exit'),
      btnInspectorToggle: document.getElementById('btn-inspector-toggle'),
      inspectorPanel: document.getElementById('inspector-panel'),
      btnPlay: document.getElementById('btn-play'),
      playIcon: document.getElementById('play-icon'),
      btnToolOrbit: document.getElementById('btn-tool-orbit'),
      btnToolLaunch: document.getElementById('btn-tool-launch'),
      launchKind: document.getElementById('launch-kind'),
      btnFollow: document.getElementById('btn-follow'),
      btnResetCam: document.getElementById('btn-reset-cam'),
      btnClearBodies: document.getElementById('btn-clear-bodies'),

      sliderSpin: document.getElementById('slider-spin'),
      readoutSpin: document.getElementById('readout-spin'),
      sliderTemp: document.getElementById('slider-disk-temp'),
      readoutTemp: document.getElementById('readout-disk-temp'),
      sliderDensity: document.getElementById('slider-disk-density'),
      readoutDensity: document.getElementById('readout-disk-density'),
      sliderJet: document.getElementById('slider-jet'),
      readoutJet: document.getElementById('readout-jet'),
      sliderTimeScale: document.getElementById('slider-time-scale'),
      readoutTimeScale: document.getElementById('readout-time-scale'),

      chkDoppler: document.getElementById('chk-doppler'),
      chkGrid: document.getElementById('chk-grid'),
      chkTrails: document.getElementById('chk-trails'),
      chkBloom: document.getElementById('chk-bloom'),
      chkGwDrag: document.getElementById('chk-gw-drag'),
      chkLabels: document.getElementById('chk-labels'),
      selectQuality: document.getElementById('select-quality'),
      readoutRes: document.getElementById('readout-res'),

      bodyCount: document.getElementById('body-count'),
      bodyList: document.getElementById('body-list'),

      fpsReadout: document.getElementById('fps-readout'),
      valHorizon: document.getElementById('val-horizon'),
      valIsco: document.getElementById('val-isco'),
      valVelocity: document.getElementById('val-velocity'),
      valDilation: document.getElementById('val-dilation'),
      clockEarth: document.getElementById('clock-earth'),
      clockProbe: document.getElementById('clock-probe'),
      clockProbeLabel: document.getElementById('clock-probe-label'),
      gwPeak: document.getElementById('gw-peak'),
      eventToast: document.getElementById('event-toast'),
    };

    function showToast(msg) {
      el.eventToast.textContent = msg;
      el.eventToast.classList.remove('hidden');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        el.eventToast.classList.add('hidden');
      }, 3400);
    }

    function setCameraGoal(camGoal) {
      if (!camGoal) return;
      cam.targetTheta = camGoal.theta;
      cam.targetPhi = camGoal.phi;
      cam.targetRadius = camGoal.radius;
    }

    function setMode(mode) {
      sim.mode = mode;
      if (mode === 'spacetime') {
        sim.showGrid = true;
      }
      syncUiFromSim();
    }

    function setTool(tool) {
      interactionTool = tool;
      el.btnToolOrbit.classList.toggle('active', tool === 'orbit');
      el.btnToolLaunch.classList.toggle('active', tool === 'launch');
      glCanvas.classList.toggle('is-launch-mode', tool === 'launch');
    }

    function syncUiFromSim() {
      const p = Physics.PRESETS[sim.activePreset];
      if (p) el.subtitle.textContent = p.subtitle;

      el.modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === sim.mode));
      el.presetBtns.forEach((b) => b.classList.toggle('active', b.dataset.preset === sim.activePreset));

      el.sliderSpin.value = sim.spin.toFixed(2);
      el.readoutSpin.textContent = sim.spin.toFixed(2);

      el.sliderTemp.value = Math.round(sim.diskTemp);
      el.readoutTemp.textContent = `${Math.round(sim.diskTemp).toLocaleString()} K`;

      el.sliderDensity.value = sim.diskDensity.toFixed(2);
      el.readoutDensity.textContent = sim.diskDensity.toFixed(2);

      el.sliderJet.value = sim.jetPower.toFixed(2);
      el.readoutJet.textContent = sim.jetPower.toFixed(2);

      el.sliderTimeScale.value = sim.timeScale.toFixed(2);
      el.readoutTimeScale.textContent = `${sim.timeScale.toFixed(2)} ×`;

      el.chkDoppler.checked = sim.enableDoppler;
      el.chkGrid.checked = sim.showGrid;
      el.chkTrails.checked = sim.showTrails;
      el.chkBloom.checked = sim.enableBloom;
      el.chkGwDrag.checked = sim.gwDrag;
      el.chkLabels.checked = sim.showLabels;

      el.playIcon.innerHTML = sim.paused ? '&#9654;' : '&#10074;&#10074;';
      el.btnFollow.classList.toggle('active', sim.followBodyId !== null);

      renderBodyList();
    }

    function renderBodyList() {
      el.bodyCount.textContent = sim.bodies.length;
      if (sim.bodies.length === 0) {
        el.bodyList.innerHTML = `<div class="hint-caption">No orbiting bodies. Drag with Launch tool or Shift+Drag to launch one.</div>`;
        return;
      }

      const html = sim.bodies.map((b) => {
        const r = Math.hypot(b.pos[0], b.pos[1], b.pos[2]);
        const rgb = `rgb(${Math.round(b.color[0] * 255)}, ${Math.round(b.color[1] * 255)}, ${Math.round(b.color[2] * 255)})`;
        const isSel = b.id === sim.selectedBodyId;
        const integ = b.kind === 'star' && b.integrity < 0.99 ? ` · ${Math.round(b.integrity * 100)}%` : '';
        return `
          <div class="body-item ${isSel ? 'selected' : ''}" data-id="${b.id}">
            <div class="body-item-left">
              <span class="body-swatch" style="background:${rgb};box-shadow:0 0 8px ${rgb}"></span>
              <span class="body-name">${b.name}${integ}</span>
            </div>
            <span class="body-stats">${r.toFixed(1)}M · ${b.lastBeta.toFixed(2)}c</span>
          </div>`;
      }).join('');
      el.bodyList.innerHTML = html;

      el.bodyList.querySelectorAll('.body-item').forEach((item) => {
        item.addEventListener('click', () => {
          const id = Number(item.dataset.id);
          sim.selectedBodyId = id;
          if (sim.followBodyId !== null) sim.followBodyId = id;
          syncUiFromSim();
        });
      });
    }

    function buildLabDrawer() {
      el.labCards.innerHTML = Physics.LAB_EXPERIMENTS.map((exp, idx) => `
        <button class="lab-card ${idx === 0 ? 'active' : ''}" data-lab="${exp.id}">
          <div class="lab-card-title">
            <span>${exp.title}</span>
            <span class="lab-card-tag">${exp.tag}</span>
          </div>
          <div class="lab-card-desc">${exp.desc}</div>
        </button>
      `).join('');

      el.labActiveNote.textContent = Physics.LAB_EXPERIMENTS[0].note;

      el.labCards.querySelectorAll('.lab-card').forEach((card) => {
        card.addEventListener('click', () => {
          const exp = Physics.LAB_EXPERIMENTS.find((e) => e.id === card.dataset.lab);
          if (!exp) return;
          el.labCards.querySelectorAll('.lab-card').forEach((c) => c.classList.remove('active'));
          card.classList.add('active');
          el.labActiveNote.textContent = exp.note;
          const camGoal = exp.apply(sim);
          setCameraGoal(camGoal);
          cam.autoSpin = false;
          syncUiFromSim();
        });
      });
    }

    buildLabDrawer();

    // Wire UI Events
    el.modeBtns.forEach((btn) => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });

    el.presetBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = sim.loadPreset(btn.dataset.preset);
        setCameraGoal(preset.camera);
        cam.autoSpin = true;
        syncUiFromSim();
        showToast(`LOADED: ${preset.title.toUpperCase()}`);
      });
    });

    el.btnAudio.addEventListener('click', async () => {
      const on = await audio.toggle();
      el.audioLed.classList.toggle('on', on);
      el.audioLabel.textContent = on ? 'Audio On' : 'Audio Off';
      el.btnAudio.classList.toggle('active', on);
    });

    el.btnLab.addEventListener('click', () => {
      const opening = el.labDrawer.classList.contains('hidden');
      el.labDrawer.classList.toggle('hidden', !opening);
      el.btnLab.classList.toggle('active', opening);
    });
    el.btnLabClose.addEventListener('click', () => {
      el.labDrawer.classList.add('hidden');
      el.btnLab.classList.remove('active');
    });

    function toggleCinema(forceState) {
      const next = forceState !== undefined ? forceState : !appShell.classList.contains('cinema-mode');
      appShell.classList.toggle('cinema-mode', next);
      el.btnCinemaExit.classList.toggle('hidden', !next);
    }
    el.btnHudHide.addEventListener('click', () => toggleCinema(true));
    el.btnCinemaExit.addEventListener('click', () => toggleCinema(false));

    el.btnInspectorToggle.addEventListener('click', () => {
      const collapsed = el.inspectorPanel.classList.toggle('collapsed');
      el.btnInspectorToggle.classList.toggle('active', !collapsed);
    });

    el.btnPlay.addEventListener('click', () => {
      sim.paused = !sim.paused;
      syncUiFromSim();
    });

    el.btnToolOrbit.addEventListener('click', () => setTool('orbit'));
    el.btnToolLaunch.addEventListener('click', () => setTool('launch'));

    el.btnFollow.addEventListener('click', () => {
      if (sim.followBodyId !== null) {
        sim.followBodyId = null;
        showToast('RETURNED TO ORBITAL OBSERVATORY CAMERA');
      } else {
        const sel = sim.getSelectedBody();
        if (sel) {
          sim.followBodyId = sel.id;
          showToast(`RIDING PROBE CAM: ${sel.name.toUpperCase()}`);
        } else {
          showToast('NO BODY AVAILABLE TO RIDE');
        }
      }
      syncUiFromSim();
    });

    el.btnResetCam.addEventListener('click', () => {
      sim.followBodyId = null;
      const preset = Physics.PRESETS[sim.activePreset] || Physics.PRESETS.gargantua;
      setCameraGoal(preset.camera);
      cam.autoSpin = true;
      syncUiFromSim();
    });

    el.btnClearBodies.addEventListener('click', () => {
      sim.clearBodies();
      syncUiFromSim();
    });

    // Sliders
    el.sliderSpin.addEventListener('input', (e) => {
      sim.spin = parseFloat(e.target.value);
      el.readoutSpin.textContent = sim.spin.toFixed(2);
    });
    el.sliderTemp.addEventListener('input', (e) => {
      sim.diskTemp = parseFloat(e.target.value);
      el.readoutTemp.textContent = `${Math.round(sim.diskTemp).toLocaleString()} K`;
    });
    el.sliderDensity.addEventListener('input', (e) => {
      sim.diskDensity = parseFloat(e.target.value);
      el.readoutDensity.textContent = sim.diskDensity.toFixed(2);
    });
    el.sliderJet.addEventListener('input', (e) => {
      sim.jetPower = parseFloat(e.target.value);
      el.readoutJet.textContent = sim.jetPower.toFixed(2);
    });
    el.sliderTimeScale.addEventListener('input', (e) => {
      sim.timeScale = parseFloat(e.target.value);
      el.readoutTimeScale.textContent = `${sim.timeScale.toFixed(2)} ×`;
    });

    // Checkboxes
    el.chkDoppler.addEventListener('change', (e) => { sim.enableDoppler = e.target.checked; });
    el.chkGrid.addEventListener('change', (e) => { sim.showGrid = e.target.checked; });
    el.chkTrails.addEventListener('change', (e) => { sim.showTrails = e.target.checked; });
    el.chkBloom.addEventListener('change', (e) => { sim.enableBloom = e.target.checked; });
    el.chkGwDrag.addEventListener('change', (e) => { sim.gwDrag = e.target.checked; });
    el.chkLabels.addEventListener('change', (e) => { sim.showLabels = e.target.checked; });

    el.selectQuality.addEventListener('change', (e) => {
      renderer.setQuality(e.target.value);
      el.readoutRes.textContent = e.target.value === 'auto' ? 'Auto' : `${e.target.value}x`;
    });

    // Canvas Pointer Controls (Orbit, Body Picking, Slingshot Launch)
    function computeSlingshotVelocity(originWorld, dragWorld) {
      const dx = dragWorld[0] - originWorld[0];
      const dz = dragWorld[2] - originWorld[2];
      const dragDist = Math.hypot(dx, dz);

      if (dragDist < 0.35) {
        // Quick click-release: auto-compute prograde circular relativistic velocity
        const r = Math.max(4.4, Math.hypot(originWorld[0], originWorld[2]));
        const vCirc = Math.min(0.66, Math.sqrt(1.0 / (r - 3.0)));
        return [(originWorld[2] / r) * vCirc, 0.0, (-originWorld[0] / r) * vCirc];
      }
      // Aim vector mapped cleanly to relativistic velocity scale [0 .. 0.65c]
      const scale = 0.048;
      const speed = Math.min(0.66, dragDist * scale);
      return [(dx / dragDist) * speed, 0.0, (dz / dragDist) * speed];
    }

    glCanvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      glCanvas.setPointerCapture(e.pointerId);
      const rect = glCanvas.getBoundingClientRect();
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;

      const isLaunch = interactionTool === 'launch' || e.shiftKey;
      if (isLaunch) {
        const originWorld = renderer.screenToEquatorialPlane(cssX, cssY);
        if (!originWorld) return;
        const velWorld = computeSlingshotVelocity(originWorld, originWorld);
        pointerState = {
          mode: 'launch',
          startX: cssX,
          startY: cssY,
          moved: false,
          originWorld,
          velWorld,
          prediction: sim.predictTrajectory(originWorld, velWorld),
          cursorCss: { x: cssX, y: cssY },
        };
      } else {
        cam.autoSpin = false;
        glCanvas.classList.add('is-dragging');
        pointerState = {
          mode: 'orbit',
          startX: cssX,
          startY: cssY,
          lastX: cssX,
          lastY: cssY,
          moved: false,
        };
      }
    });

    glCanvas.addEventListener('pointermove', (e) => {
      if (!pointerState) return;
      const rect = glCanvas.getBoundingClientRect();
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;

      if (Math.hypot(cssX - pointerState.startX, cssY - pointerState.startY) > 4) {
        pointerState.moved = true;
      }

      if (pointerState.mode === 'orbit') {
        const dx = cssX - pointerState.lastX;
        const dy = cssY - pointerState.lastY;
        pointerState.lastX = cssX;
        pointerState.lastY = cssY;
        cam.targetTheta -= dx * 0.0062;
        cam.targetPhi = Math.max(0.08, Math.min(Math.PI - 0.08, cam.targetPhi - dy * 0.0062));
      } else if (pointerState.mode === 'launch') {
        const dragWorld = renderer.screenToEquatorialPlane(cssX, cssY) || pointerState.originWorld;
        pointerState.velWorld = computeSlingshotVelocity(pointerState.originWorld, dragWorld);
        pointerState.prediction = sim.predictTrajectory(pointerState.originWorld, pointerState.velWorld);
        pointerState.cursorCss = { x: cssX, y: cssY };
      }
    });

    function finishPointer(e) {
      if (!pointerState) return;
      glCanvas.classList.remove('is-dragging');
      const rect = glCanvas.getBoundingClientRect();
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;

      if (pointerState.mode === 'orbit' && !pointerState.moved) {
        // Pick orbiting body if clicked near its reticle
        const picked = renderer.pickBodyAtScreen(sim, cssX, cssY);
        if (picked) {
          sim.selectedBodyId = picked.id;
          if (sim.followBodyId !== null) sim.followBodyId = picked.id;
          syncUiFromSim();
          showToast(`TRACKING: ${picked.name.toUpperCase()}`);
        }
      } else if (pointerState.mode === 'launch') {
        const kind = el.launchKind.value;
        const origin = pointerState.originWorld;
        const vel = pointerState.velWorld;
        const r = Math.hypot(origin[0], origin[2]);
        const rPlus = Physics.computeHorizonRadius(sim.spin);

        if (sim.bodies.length >= Physics.MAX_BODIES) {
          showToast(`BODY LIMIT REACHED (${Physics.MAX_BODIES}) · CLEAR SOME TO LAUNCH MORE`);
        } else if (r > rPlus * 1.1) {
          const palette =
            kind === 'companion'
              ? [1.0, 0.56, 0.24]
              : kind === 'probe'
              ? [0.35, 0.90, 1.0]
              : [0.82, 0.92, 1.0];

          const newBody = sim.addBody({
            kind,
            pos: origin,
            vel,
            color: palette,
          });
          sim.selectedBodyId = newBody.id;
          audio.playLaunchChime(pointerState.prediction.status);
          syncUiFromSim();
        }
      }
      pointerState = null;
    }

    glCanvas.addEventListener('pointerup', finishPointer);
    glCanvas.addEventListener('pointercancel', () => {
      glCanvas.classList.remove('is-dragging');
      pointerState = null;
    });

    // Right-drag orbits the camera, so keep the browser menu out of the way
    glCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

    glCanvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      cam.targetRadius = Math.max(4.5, Math.min(58.0, cam.targetRadius * (1 + e.deltaY * 0.0009)));
    }, { passive: false });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      const tgt = e.target;
      const tag = tgt.tagName;
      const isToggle = tag === 'INPUT' && tgt.type === 'checkbox';
      const isSlider = tag === 'INPUT' && tgt.type === 'range';
      // Sliders and checkboxes keep focus after use; shortcuts should still work there
      if (tag === 'SELECT' || tag === 'TEXTAREA' || (tag === 'INPUT' && !isToggle && !isSlider)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Space') {
        // Let Space activate a focused button or checkbox as usual
        if (tag === 'BUTTON' || isToggle) return;
        e.preventDefault();
        sim.paused = !sim.paused;
        syncUiFromSim();
      } else if (e.key === '1') setMode('optical');
      else if (e.key === '2') setMode('eht');
      else if (e.key === '3') setMode('spacetime');
      else if (e.key === '4') setMode('geodesics');
      else if (e.key.toLowerCase() === 'l') setTool(interactionTool === 'launch' ? 'orbit' : 'launch');
      else if (e.key.toLowerCase() === 'r') el.btnResetCam.click();
      else if (e.key.toLowerCase() === 'h') toggleCinema();
      else if (e.key.toLowerCase() === 'i') el.btnInspectorToggle.click();
      else if (e.key.toLowerCase() === 'm') el.btnAudio.click();
    });

    // Start with an unobstructed scene; Inspector is always available in the header.
    el.inspectorPanel.classList.add('collapsed');
    el.btnInspectorToggle.classList.remove('active');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) cam.autoSpin = false;

    // Initial sync
    syncUiFromSim();

    // Animation & Simulation Loop
    let lastTime = performance.now();
    let animTime = 0;
    let fpsAccum = 0;
    let fpsFrames = 0;
    let currentFps = 60;
    let lastHudUpdate = 0;

    function frame(now) {
      const realDt = Math.min(0.05, (now - lastTime) * 0.001);
      lastTime = now;

      if (!sim.paused) {
        animTime += realDt * sim.timeScale;
      }

      sim.step(realDt);

      // Process physics events (TDE, Merger, Horizon Plunge)
      while (sim.events.length > 0) {
        const ev = sim.events.shift();
        if (ev.type === 'merger') {
          showToast(`BINARY MERGER & GW RINGDOWN: ${ev.name.toUpperCase()}`);
          audio.playMergerChirp(true);
        } else if (ev.type === 'tde') {
          showToast(`ROCHE TIDAL DISRUPTION: ${ev.name.toUpperCase()} SHREDDED`);
          audio.playMergerChirp(false);
        } else {
          showToast(`EVENT HORIZON PLUNGE: ${ev.name.toUpperCase()}`);
          audio.playMergerChirp(false);
        }
        syncUiFromSim();
      }

      // Camera damping & Ride Probe Mode
      if (cam.autoSpin && !pointerState && sim.followBodyId === null && !sim.paused) {
        cam.targetTheta += realDt * 0.065;
      }

      const damp = 1.0 - Math.exp(-realDt * 10.0);
      cam.theta += (cam.targetTheta - cam.theta) * damp;
      cam.phi += (cam.targetPhi - cam.phi) * damp;
      cam.radius += (cam.targetRadius - cam.radius) * damp;

      const followBody = sim.followBodyId !== null
        ? sim.bodies.find((b) => b.id === sim.followBodyId)
        : null;

      if (followBody) {
        const p = followBody.pos;
        const v = followBody.vel;
        const vLen = Math.hypot(v[0], v[1], v[2]) || 1;
        // Chase cam positioned slightly behind and above the probe looking forward toward the black hole
        const bx = p[0] - (v[0] / vLen) * 3.4;
        const by = p[1] + 1.05 - (v[1] / vLen) * 1.2;
        const bz = p[2] - (v[2] / vLen) * 3.4;
        cam.pos[0] += (bx - cam.pos[0]) * 0.16;
        cam.pos[1] += (by - cam.pos[1]) * 0.16;
        cam.pos[2] += (bz - cam.pos[2]) * 0.16;

        // Blend look target between orbital tangent and singularity center for epic framing
        const tx = p[0] * 0.35;
        const ty = p[1] * 0.35;
        const tz = p[2] * 0.35;
        cam.target[0] += (tx - cam.target[0]) * 0.16;
        cam.target[1] += (ty - cam.target[1]) * 0.16;
        cam.target[2] += (tz - cam.target[2]) * 0.16;
        cam.easeFromRide = true;
      } else {
        const sinP = Math.sin(cam.phi);
        const cx = cam.radius * sinP * Math.cos(cam.theta);
        const cy = cam.radius * Math.cos(cam.phi);
        const cz = cam.radius * sinP * Math.sin(cam.theta);
        if (cam.easeFromRide) {
          // Glide back from the chase cam instead of cutting to the orbit camera
          cam.pos[0] += (cx - cam.pos[0]) * 0.1;
          cam.pos[1] += (cy - cam.pos[1]) * 0.1;
          cam.pos[2] += (cz - cam.pos[2]) * 0.1;
          if (Math.hypot(cx - cam.pos[0], cy - cam.pos[1], cz - cam.pos[2]) < 0.05) {
            cam.easeFromRide = false;
          }
        } else {
          cam.pos[0] = cx;
          cam.pos[1] = cy;
          cam.pos[2] = cz;
        }
        cam.target[0] += (0 - cam.target[0]) * 0.15;
        cam.target[1] += (0 - cam.target[1]) * 0.15;
        cam.target[2] += (0 - cam.target[2]) * 0.15;
      }

      audio.update(sim, Math.hypot(cam.pos[0], cam.pos[1], cam.pos[2]));

      const preview = pointerState && pointerState.mode === 'launch' ? pointerState : null;
      renderer.render(sim, cam, animTime, preview);

      // FPS & Telemetry HUD updates (~10Hz)
      fpsAccum += realDt;
      fpsFrames++;
      if (now - lastHudUpdate >= 100) {
        if (fpsAccum >= 0.8) {
          currentFps = Math.round(fpsFrames / fpsAccum);
          renderer.adjustAutoScale(currentFps);
          fpsAccum = 0;
          fpsFrames = 0;
        }

        const rPlus = Physics.computeHorizonRadius(sim.spin);
        const isco = Physics.computeISCO(sim.spin);
        const sel = sim.getSelectedBody();

        el.fpsReadout.textContent = `${currentFps} FPS · ${Math.round(renderer.renderScale * 100)}%`;
        el.valHorizon.textContent = `${rPlus.toFixed(2)} M`;
        el.valIsco.textContent = `${isco.toFixed(2)} M`;
        el.valVelocity.textContent = sel ? `${sel.lastBeta.toFixed(3)} c` : '0.000 c';
        el.valDilation.textContent = sel ? `${sel.lastGammaInv.toFixed(3)} ×` : '1.000 ×';

        // Show clocks in real seconds at 1x speed (sim time advances TIME_RATE units per second)
        el.clockEarth.textContent = formatClock(sim.simTime / Physics.TIME_RATE);
        el.clockProbe.textContent = formatClock(sim.probeTau / Physics.TIME_RATE);
        el.clockProbeLabel.textContent = sel ? `${sel.name} (τ)` : 'Probe (τ)';

        const strainScaled = sim.gwPeak * 1.4e-21;
        el.gwPeak.textContent = `${strainScaled.toExponential(2)}`;

        // Refresh body distances inside inspector smoothly
        if (el.bodyList.children.length === sim.bodies.length) {
          sim.bodies.forEach((b, i) => {
            const row = el.bodyList.children[i];
            if (!row) return;
            const stats = row.querySelector('.body-stats');
            if (stats) {
              const r = Math.hypot(b.pos[0], b.pos[1], b.pos[2]);
              stats.textContent = `${r.toFixed(1)}M · ${b.lastBeta.toFixed(2)}c`;
            }
          });
        }

        lastHudUpdate = now;
      }

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  window.addEventListener('DOMContentLoaded', main);
})(window);
