(function (global) {
  'use strict';

  const MAX_DEBRIS = 2200;
  const TRAIL_MAX_POINTS = 180;
  const GW_HISTORY_LEN = 220;
  const MAX_BODIES = 8;   // must match uBodyPos[8] / uBodyCol[8] in the raymarch shader
  const TIME_RATE = 2.1;  // simulation time units per real second at 1x speed

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function computeHorizonRadius(spin) {
    const a = clamp(spin, 0, 0.995);
    return 1.0 + Math.sqrt(Math.max(0, 1.0 - a * a));
  }

  function computePhotonSpheres(spin) {
    const a = clamp(spin, 0, 0.995);
    const prograde = 2.0 * (1.0 + Math.cos((2.0 / 3.0) * Math.acos(-a)));
    const retrograde = 2.0 * (1.0 + Math.cos((2.0 / 3.0) * Math.acos(a)));
    return { prograde, retrograde };
  }

  // Exact Bardeen, Press, Teukolsky (1972) equatorial ISCO radius (M = 1)
  function computeISCO(spin) {
    const a = clamp(spin, 0, 0.995);
    const oneMinusA2 = Math.max(1e-6, 1.0 - a * a);
    const z1 = 1.0 + Math.cbrt(oneMinusA2) * (Math.cbrt(1.0 + a) + Math.cbrt(1.0 - a));
    const z2 = Math.sqrt(3.0 * a * a + z1 * z1);
    return 3.0 + z2 - Math.sqrt(Math.max(0, (3.0 - z1) * (3.0 + z1 + 2.0 * z2)));
  }

  function computeTimeDilation(r, vSq, spin) {
    const rPlus = computeHorizonRadius(spin);
    const gravTerm = Math.max(0.015, 1.0 - rPlus / Math.max(rPlus * 1.02, r));
    const kinTerm = Math.max(0.04, 1.0 - Math.min(0.95, vSq));
    return Math.sqrt(gravTerm * kinTerm);
  }

  const PRESETS = {
    gargantua: {
      id: 'gargantua',
      title: 'Gargantua Kerr Singularity',
      subtitle: 'Spinning Kerr Metric (a/M = 0.94) · Doppler-Beamed Plasma & Lensed Companions',
      spin: 0.94,
      diskTemp: 6400,
      diskDensity: 1.15,
      jetPower: 0.45,
      gwDrag: false,
      camera: { theta: 0.48, phi: 1.24, radius: 35.0 },
      mode: 'optical',
      showGrid: false,
      bodies: [
        {
          name: 'Miller Beacon',
          kind: 'probe',
          mass: 0.0001,
          radius: 0.20,
          rocheLimit: 0,
          color: [0.35, 0.85, 1.0],
          pos: [7.6, 0.0, 0.0],
          vel: [0.0, 0.025, -0.464],
        },
        {
          name: 'Rigel-B Companion',
          kind: 'star',
          mass: 0.015,
          radius: 0.44,
          rocheLimit: 4.5,
          color: [0.78, 0.90, 1.0],
          pos: [-13.5, 1.1, 2.5],
          vel: [0.058, -0.025, 0.302],
        },
        {
          name: 'K-Giant Drifter',
          kind: 'star',
          mass: 0.012,
          radius: 0.36,
          rocheLimit: 4.3,
          color: [1.0, 0.68, 0.32],
          pos: [2.2, -0.7, 17.5],
          vel: [0.260, 0.012, -0.032],
        },
      ],
    },

    rosette: {
      id: 'rosette',
      title: 'Relativistic Rosette Precession',
      subtitle: '1PN Curved Spacetime · Perihelion Shift > 34° Per Orbit',
      spin: 0.62,
      diskTemp: 5400,
      diskDensity: 0.65,
      jetPower: 0.15,
      gwDrag: false,
      camera: { theta: 0.65, phi: 0.72, radius: 26.0 },
      mode: 'spacetime',
      showGrid: true,
      bodies: [
        {
          name: 'S2-Class Star',
          kind: 'star',
          mass: 0.008,
          radius: 0.35,
          rocheLimit: 4.1,
          color: [1.0, 0.82, 0.38],
          pos: [14.8, 0.0, 0.0],
          vel: [0.0, 0.0, -0.232],
        },
        {
          name: 'Telemetry Probe-7',
          kind: 'probe',
          mass: 0.0001,
          radius: 0.22,
          rocheLimit: 0,
          color: [0.28, 0.92, 0.78],
          pos: [-11.5, 0.0, 0.0],
          vel: [0.0, 0.0, 0.275],
        },
      ],
    },

    tidal: {
      id: 'tidal',
      title: 'Tidal Disruption Event (TDE)',
      subtitle: 'Grazing Supergiant Crossing Roche Limit · Real-Time Accretion Stream',
      spin: 0.86,
      diskTemp: 7600,
      diskDensity: 0.85,
      jetPower: 0.75,
      gwDrag: false,
      camera: { theta: 0.25, phi: 0.96, radius: 24.0 },
      mode: 'optical',
      showGrid: false,
      bodies: [
        {
          name: 'TDE Supergiant',
          kind: 'star',
          mass: 0.025,
          radius: 0.56,
          rocheLimit: 5.5,
          color: [0.64, 0.86, 1.0],
          pos: [14.0, 0.65, 5.5],
          vel: [-0.242, -0.02, -0.172],
        },
        {
          name: 'Monitor Probe',
          kind: 'probe',
          mass: 0.0001,
          radius: 0.20,
          rocheLimit: 0,
          color: [0.98, 0.70, 0.25],
          pos: [-9.2, 0.0, -4.0],
          vel: [0.135, 0.015, -0.295],
        },
      ],
    },

    binary: {
      id: 'binary',
      title: 'Binary Black Hole Inspiral',
      subtitle: 'Dual Lensing Horizons + Quadrupole GW Radiation Reaction',
      spin: 0.88,
      diskTemp: 6900,
      diskDensity: 0.95,
      jetPower: 0.60,
      gwDrag: true,
      camera: { theta: 0.35, phi: 0.92, radius: 24.5 },
      mode: 'optical',
      showGrid: true,
      bodies: [
        {
          name: 'Secondary Singularity',
          kind: 'companion',
          mass: 0.26,
          radius: 0.62,
          rocheLimit: 0,
          color: [1.0, 0.55, 0.22],
          pos: [8.8, 0.0, 0.0],
          vel: [0.0, 0.0, -0.398],
        },
        {
          name: 'Outer Tracer Star',
          kind: 'star',
          mass: 0.008,
          radius: 0.34,
          rocheLimit: 4.3,
          color: [0.76, 0.92, 1.0],
          pos: [-15.2, 0.9, 1.5],
          vel: [0.03, -0.02, 0.282],
        },
      ],
    },

    m87: {
      id: 'm87',
      title: 'EHT M87* Polar Jet (230 GHz)',
      subtitle: 'Millimeter Synchrotron Interferometry · Extremal Spin a/M = 0.96',
      spin: 0.96,
      diskTemp: 9200,
      diskDensity: 1.45,
      jetPower: 1.35,
      gwDrag: false,
      camera: { theta: 0.95, phi: 1.18, radius: 19.0 },
      mode: 'eht',
      showGrid: false,
      bodies: [
        {
          name: 'Jet Knot Alpha',
          kind: 'probe',
          mass: 0.0001,
          radius: 0.21,
          rocheLimit: 0,
          color: [1.0, 0.78, 0.30],
          pos: [6.5, 0.0, 0.0],
          vel: [0.0, 0.05, -0.528],
        },
      ],
    },
  };

  const LAB_EXPERIMENTS = [
    {
      id: 'kerr-shadow',
      title: '1. Kerr Frame-Dragging & Asymmetric Shadow',
      tag: 'a/M = 0.97',
      desc: 'Compare near-extremal spin frame dragging against static Schwarzschild geometry.',
      note: 'At spin a/M = 0.97, spacetime itself is dragged around the black hole. Prograde photons (left side) can skim down to 1.3 M without falling in, flattening the shadow into a D-shape while the ISCO shrinks from 6.0 M down to ~1.7 M.',
      apply: (sim) => {
        sim.loadPreset('gargantua');
        sim.spin = 0.97;
        sim.diskTemp = 7800;
        sim.mode = 'optical';
        sim.showGrid = false;
        return { theta: 0.08, phi: 1.50, radius: 15.8 };
      },
    },
    {
      id: 'einstein-ring',
      title: '2. Edge-On Einstein Lensing & Photon Ring',
      tag: 'Inclination 88°',
      desc: 'Look along the equatorial plane to watch light bend over and under the horizon.',
      note: 'Every part of the glowing arch above and below the shadow is actually the back side of the flat accretion disk behind the black hole. Light from beneath and behind bends up and over the photon sphere toward your eyes.',
      apply: (sim) => {
        sim.loadPreset('gargantua');
        sim.spin = 0.90;
        sim.diskDensity = 1.25;
        sim.mode = 'optical';
        sim.showGrid = false;
        return { theta: 0.15, phi: 1.54, radius: 17.5 };
      },
    },
    {
      id: 'rosette-precession',
      title: '3. Relativistic Perihelion Precession',
      tag: '1PN Rosette',
      desc: 'Watch curved spacetime prevent closed Keplerian ellipses, tracing a rosette.',
      note: 'In Newtonian gravity, bound orbits are closed ellipses. In General Relativity, the extra 3L²/r² spatial curvature term causes the periapsis to advance forward on every pass—the same effect measured in Mercury and star S2 at Sagittarius A*.',
      apply: (sim) => {
        sim.loadPreset('rosette');
        return { theta: 0.60, phi: 0.68, radius: 25.0 };
      },
    },
    {
      id: 'roche-tde',
      title: '4. Roche Limit Tidal Disruption',
      tag: 'TDE Stream',
      desc: 'A supergiant star ventures inside the Roche radius and shreds into plasma.',
      note: 'Because gravity drops off sharply with distance, the near side of a star passing inside the Roche limit feels far stronger pull than its far side. That tidal gradient rips the star apart into an incandescent stream feeding the disk.',
      apply: (sim) => {
        sim.loadPreset('tidal');
        return { theta: 0.30, phi: 0.95, radius: 22.0 };
      },
    },
    {
      id: 'geodesic-rays',
      title: '5. Photon Sphere & Null Geodesics',
      tag: 'Ray Paths',
      desc: 'Visualize 3D curved light rays bending, orbiting, or plunging at r = 1.5 r_s.',
      note: 'Photons aimed directly inside the critical impact parameter spiral inward and vanish behind the horizon. Rays grazing the photon sphere loop 180°–360° around the singularity, forming the razor-sharp secondary photon ring.',
      apply: (sim) => {
        sim.loadPreset('gargantua');
        sim.mode = 'geodesics';
        sim.showGrid = true;
        sim.spin = 0.0;
        return { theta: 0.25, phi: 0.72, radius: 22.0 };
      },
    },
  ];

  class Simulation {
    constructor() {
      this.spin = 0.94;
      this.diskTemp = 6400;
      this.diskDensity = 1.15;
      this.jetPower = 0.45;
      this.timeScale = 1.0;
      this.paused = false;
      this.mode = 'optical'; // 'optical' | 'eht' | 'spacetime' | 'geodesics'
      this.enableDoppler = true;
      this.showGrid = false;
      this.showTrails = true;
      this.enableBloom = true;
      this.gwDrag = false;
      this.showLabels = true;
      this.activePreset = 'gargantua';

      this.simTime = 0;
      this.probeTau = 0;
      this.nextId = 1;
      this.bodies = [];
      this.selectedBodyId = null;
      this.followBodyId = null;

      // Tidal debris particles (flat typed arrays for zero GC churn)
      this.debrisCount = 0;
      this.debrisCursor = 0;
      this.debrisPos = new Float32Array(MAX_DEBRIS * 3);
      this.debrisVel = new Float32Array(MAX_DEBRIS * 3);
      this.debrisMeta = new Float32Array(MAX_DEBRIS * 4); // [temp, life, maxLife, active]

      // Gravitational wave history & transient merger impulse
      this.gwHistory = new Float32Array(GW_HISTORY_LEN);
      this.gwWriteIdx = 0;
      this.gwStrain = 0;
      this.gwPeak = 0;
      this.mergerPulse = 0;
      this.mergerRingdownPhase = 0;
      this.mergerRingdownAmp = 0;

      // Event callbacks for toast/audio
      this.events = [];

      // Geodesic bundle cache
      this.geodesicRays = [];
      this._lastGeodesicSpin = -1;

      this.loadPreset('gargantua');
    }

    loadPreset(presetId) {
      const p = PRESETS[presetId] || PRESETS.gargantua;
      this.activePreset = p.id;
      this.spin = p.spin;
      this.diskTemp = p.diskTemp;
      this.diskDensity = p.diskDensity;
      this.jetPower = p.jetPower;
      this.gwDrag = Boolean(p.gwDrag);
      this.mode = p.mode || 'optical';
      this.showGrid = Boolean(p.showGrid);

      this.simTime = 0;
      this.probeTau = 0;
      this.bodies = [];
      this.selectedBodyId = null;
      this.followBodyId = null;
      this.debrisCount = 0;
      this.debrisCursor = 0;
      this.debrisMeta.fill(0);
      this.gwHistory.fill(0);
      this.gwPeak = 0;
      this.mergerPulse = 0;
      this.mergerRingdownAmp = 0;
      this.events = [];

      for (const spec of p.bodies) {
        this.addBody(spec);
      }
      if (this.bodies.length > 0) {
        this.selectedBodyId = this.bodies[0].id;
      }

      // Seed subtle ambient debris in tidal preset so user sees faint dust immediately
      if (p.id === 'tidal') {
        for (let i = 0; i < 90; i++) {
          const ang = (i / 90) * Math.PI * 2;
          const r = 4.2 + (i % 15) * 0.45;
          const spd = Math.sqrt(1.0 / r);
          this.spawnDebris(
            [Math.cos(ang) * r, (Math.random() - 0.5) * 0.15, Math.sin(ang) * r],
            [Math.sin(ang) * spd, (Math.random() - 0.5) * 0.02, -Math.cos(ang) * spd],
            0.7 + Math.random() * 0.3,
            8 + Math.random() * 10
          );
        }
      }

      this.rebuildGeodesics();
      return p;
    }

    addBody(spec) {
      const id = this.nextId++;
      const kind = spec.kind || 'star';
      const defaultName =
        kind === 'companion'
          ? `Singularity-${id}`
          : kind === 'probe'
          ? `Probe-${id}`
          : `Star-${id}`;

      const body = {
        id,
        name: spec.name || defaultName,
        kind,
        mass: spec.mass != null ? spec.mass : kind === 'companion' ? 0.22 : kind === 'probe' ? 0.0001 : 0.012,
        radius: spec.radius != null ? spec.radius : kind === 'companion' ? 0.55 : kind === 'probe' ? 0.20 : 0.36,
        rocheLimit: spec.rocheLimit != null ? spec.rocheLimit : kind === 'star' ? 4.4 : 0,
        integrity: 1.0,
        color: spec.color ? [...spec.color] : kind === 'companion' ? [1.0, 0.55, 0.22] : kind === 'probe' ? [0.35, 0.86, 1.0] : [0.85, 0.92, 1.0],
        pos: [...spec.pos],
        vel: [...spec.vel],
        trail: [[...spec.pos]],
        tau: 0,
        lastBeta: 0,
        lastGammaInv: 1,
        trailTimer: 0,
      };
      this.bodies.push(body);
      return body;
    }

    clearBodies() {
      this.bodies = [];
      this.selectedBodyId = null;
      this.followBodyId = null;
      this.debrisMeta.fill(0);
      this.debrisCount = 0;
    }

    getSelectedBody() {
      return this.bodies.find((b) => b.id === this.selectedBodyId) || this.bodies[0] || null;
    }

    getPrimaryCompanion() {
      // Returns the largest companion singularity (or most massive star) for dual lensing in shader
      let best = null;
      for (const b of this.bodies) {
        if (b.kind === 'companion' && (!best || b.mass > best.mass)) {
          best = b;
        }
      }
      return best;
    }

    spawnDebris(pos, vel, temp, maxLife) {
      const idx = this.debrisCursor;
      this.debrisCursor = (this.debrisCursor + 1) % MAX_DEBRIS;
      if (this.debrisCount < MAX_DEBRIS) this.debrisCount++;

      const i3 = idx * 3;
      const i4 = idx * 4;
      this.debrisPos[i3] = pos[0];
      this.debrisPos[i3 + 1] = pos[1];
      this.debrisPos[i3 + 2] = pos[2];

      this.debrisVel[i3] = vel[0];
      this.debrisVel[i3 + 1] = vel[1];
      this.debrisVel[i3 + 2] = vel[2];

      this.debrisMeta[i4] = temp;
      this.debrisMeta[i4 + 1] = maxLife;
      this.debrisMeta[i4 + 2] = maxLife;
      this.debrisMeta[i4 + 3] = 1.0;
    }

    // Relativistic acceleration at position p, velocity v (M1 = 1 at origin)
    computeAcceleration(p, v, excludeIdx = -1) {
      const px = p[0], py = p[1], pz = p[2];
      const vx = v[0], vy = v[1], vz = v[2];
      const r2 = px * px + py * py + pz * pz;
      const r = Math.sqrt(r2 + 1e-6);

      // Angular momentum L = p x v
      const lx = py * vz - pz * vy;
      const ly = pz * vx - px * vz;
      const lz = px * vy - py * vx;
      const l2 = lx * lx + ly * ly + lz * lz;

      // 1PN GR correction: -(1 + 3 L^2 / r^2) / r^3
      const grFactor = 1.0 + Math.min(2.2, (3.0 * l2) / Math.max(2.0, r2));
      const invR3 = 1.0 / (r2 * r + 0.05);
      let ax = -px * invR3 * grFactor;
      let ay = -py * invR3 * grFactor;
      let az = -pz * invR3 * grFactor;

      // Illustrative Kerr gravitomagnetic (Lense-Thirring) coupling, spin axis J = +Y.
      // a = k (v x J): perpendicular to v (does no work), outward for prograde
      // orbits (the disk direction, (z, 0, -x)) and inward for retrograde ones.
      if (this.spin > 0.01) {
        const k = (0.8 * this.spin) / (r2 * r + 1.5);
        ax += -vz * k;
        az += vx * k;
      }

      // Mutual N-body gravity from orbiting massive bodies
      for (let i = 0; i < this.bodies.length; i++) {
        if (i === excludeIdx) continue;
        const other = this.bodies[i];
        if (other.mass < 0.001) continue;
        const dx = other.pos[0] - px;
        const dy = other.pos[1] - py;
        const dz = other.pos[2] - pz;
        const d2 = dx * dx + dy * dy + dz * dz + 0.25;
        const d = Math.sqrt(d2);
        const f = other.mass / (d2 * d);
        ax += dx * f;
        ay += dy * f;
        az += dz * f;
      }

      // Optional Gravitational Wave radiation reaction drag (Peters-Mathews inspiral)
      if (this.gwDrag && excludeIdx >= 0) {
        const self = this.bodies[excludeIdx];
        if (self && self.kind === 'companion') {
          // Tuned so the Binary preset merges after ~40 s. (The inspiral used to come
          // from the old frame-drag term acting as friction on every orbit.)
          const dragCoeff = (1.5 * self.mass) / Math.pow(Math.max(2.2, r), 2.5);
          ax -= vx * dragCoeff;
          ay -= vy * dragCoeff;
          az -= vz * dragCoeff;
        }
      }

      return [ax, ay, az];
    }

    predictTrajectory(startPos, startVel, maxSteps = 360) {
      const rPlus = computeHorizonRadius(this.spin);
      const pts = [];
      let p = [startPos[0], startPos[1], startPos[2]];
      let v = [startVel[0], startVel[1], startVel[2]];
      const dt = 0.26;
      let minR = Infinity;
      let peakBeta = 0;
      let status = 'bound';

      for (let i = 0; i < maxSteps; i++) {
        const r = Math.hypot(p[0], p[1], p[2]);
        const spd = Math.hypot(v[0], v[1], v[2]);
        if (r < minR) minR = r;
        if (spd > peakBeta) peakBeta = spd;

        pts.push([p[0], p[1], p[2]]);

        if (r <= rPlus * 1.06) {
          status = 'plunge';
          break;
        }
        if (r > 48 && (p[0] * v[0] + p[1] * v[1] + p[2] * v[2]) > 0) {
          const energy = 0.5 * spd * spd - 1.0 / r;
          status = energy >= -0.005 ? 'escape' : 'bound';
          break;
        }

        // RK2 midpoint step
        const a1 = this.computeAcceleration(p, v, -1);
        const pMid = [p[0] + v[0] * dt * 0.5, p[1] + v[1] * dt * 0.5, p[2] + v[2] * dt * 0.5];
        const vMid = [v[0] + a1[0] * dt * 0.5, v[1] + a1[1] * dt * 0.5, v[2] + a1[2] * dt * 0.5];
        const a2 = this.computeAcceleration(pMid, vMid, -1);

        p[0] += vMid[0] * dt;
        p[1] += vMid[1] * dt;
        p[2] += vMid[2] * dt;
        v[0] += a2[0] * dt;
        v[1] += a2[1] * dt;
        v[2] += a2[2] * dt;
      }

      if (status === 'bound' && minR < 4.5) {
        status = 'tidal';
      } else if (status === 'bound') {
        const rEnd = Math.hypot(p[0], p[1], p[2]);
        const spdEnd = Math.hypot(v[0], v[1], v[2]);
        if (0.5 * spdEnd * spdEnd - 1.0 / rEnd > 0.002) {
          status = 'escape';
        }
      }

      return { points: pts, status, minR, peakBeta: Math.min(0.99, peakBeta) };
    }

    // 3D Geodesic light-ray trajectories for Mode 4 ("Geodesics")
    rebuildGeodesics() {
      this._lastGeodesicSpin = this.spin;
      const rPlus = computeHorizonRadius(this.spin);
      const rays = [];

      // Fan of parallel rays from z = +18 toward -z across x impact parameters
      const impacts = [
        -10.5, -8.0, -6.2, -5.0, -4.1, -3.45, -3.05, -2.75, -2.4,
        2.15, 2.55, 2.95, 3.35, 4.0, 4.9, 6.1, 8.0, 10.5
      ];

      for (let idx = 0; idx < impacts.length; idx++) {
        const b = impacts[idx];
        let p = [b, 0.12 * Math.sin(idx * 1.1), 17.5];
        let v = [0.0, 0.0, -1.0];
        const pts = [];
        let captured = false;

        for (let step = 0; step < 260; step++) {
          pts.push([p[0], p[1], p[2]]);
          const r2 = p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
          const r = Math.sqrt(r2);

          if (r <= rPlus * 1.03) {
            captured = true;
            break;
          }
          if (r > 22.0 && (p[0] * v[0] + p[1] * v[1] + p[2] * v[2]) > 0) {
            break;
          }

          // Exact null geodesic acceleration: -3.0 * |p x v|^2 / r^5 * p
          const lx = p[1] * v[2] - p[2] * v[1];
          const ly = p[2] * v[0] - p[0] * v[2];
          const lz = p[0] * v[1] - p[1] * v[0];
          const h2 = lx * lx + ly * ly + lz * lz;
          const dt = clamp(0.06 * r, 0.04, 0.35);

          const invR5 = 1.0 / (r2 * r2 * r + 1e-4);
          let ax = -3.0 * h2 * invR5 * p[0];
          let ay = -3.0 * h2 * invR5 * p[1];
          let az = -3.0 * h2 * invR5 * p[2];

          // Subtle Kerr frame dragging on photon path
          if (this.spin > 0.01) {
            const drag = (-1.1 * this.spin) / (r2 * r + 0.5);
            ax += -p[2] * drag * 0.25;
            az += p[0] * drag * 0.25;
          }

          v[0] += ax * dt;
          v[1] += ay * dt;
          v[2] += az * dt;

          // Keep unit direction speed clean for path parameter
          const vn = Math.hypot(v[0], v[1], v[2]) || 1;
          v[0] /= vn;
          v[1] /= vn;
          v[2] /= vn;

          p[0] += v[0] * dt;
          p[1] += v[1] * dt;
          p[2] += v[2] * dt;
        }

        rays.push({ points: pts, captured, impact: b });
      }

      this.geodesicRays = rays;
    }

    step(realDt) {
      if (Math.abs(this._lastGeodesicSpin - this.spin) > 0.02) {
        this.rebuildGeodesics();
      }

      // Decay transient merger flash & ringdown
      this.mergerPulse = Math.max(0, this.mergerPulse - realDt * 1.4);
      this.mergerRingdownAmp = Math.max(0, this.mergerRingdownAmp - realDt * 0.75);

      if (this.paused) return;

      const dtTotal = Math.min(0.05, realDt) * this.timeScale * TIME_RATE;
      const substeps = 10;
      const dt = dtTotal / substeps;
      const rPlus = computeHorizonRadius(this.spin);

      this.simTime += dtTotal;

      // Sub-stepped symplectic Velocity-Verlet for orbiting bodies
      const consumedIndices = [];
      for (let s = 0; s < substeps; s++) {
        for (let i = 0; i < this.bodies.length; i++) {
          const b = this.bodies[i];
          const a0 = this.computeAcceleration(b.pos, b.vel, i);

          b.pos[0] += b.vel[0] * dt + 0.5 * a0[0] * dt * dt;
          b.pos[1] += b.vel[1] * dt + 0.5 * a0[1] * dt * dt;
          b.pos[2] += b.vel[2] * dt + 0.5 * a0[2] * dt * dt;

          const vPred = [
            b.vel[0] + a0[0] * dt,
            b.vel[1] + a0[1] * dt,
            b.vel[2] + a0[2] * dt,
          ];
          const a1 = this.computeAcceleration(b.pos, vPred, i);

          b.vel[0] += 0.5 * (a0[0] + a1[0]) * dt;
          b.vel[1] += 0.5 * (a0[1] + a1[1]) * dt;
          b.vel[2] += 0.5 * (a0[2] + a1[2]) * dt;

          const r = Math.hypot(b.pos[0], b.pos[1], b.pos[2]);
          const vSq = b.vel[0] * b.vel[0] + b.vel[1] * b.vel[1] + b.vel[2] * b.vel[2];
          b.lastBeta = Math.min(0.985, Math.sqrt(vSq));
          b.lastGammaInv = computeTimeDilation(r, vSq, this.spin);
          b.tau += dt * b.lastGammaInv;

          // Check Horizon Plunge
          if (r <= rPlus * 1.07 && !consumedIndices.includes(i)) {
            consumedIndices.push(i);
          }

          // Check Tidal Disruption (stars only)
          if (b.kind === 'star' && b.rocheLimit > 0 && r < b.rocheLimit && b.integrity > 0) {
            const tidalStrength = clamp((b.rocheLimit - r) / b.rocheLimit, 0.04, 1.0);
            b.integrity = Math.max(0, b.integrity - dt * (0.28 + tidalStrength * 0.65));

            // Shed luminous plasma stream along tidal stretching axis
            const spawnCount = Math.random() < 0.72 ? 2 : 1;
            const rNorm = 1.0 / (r + 1e-6);
            const rx = b.pos[0] * rNorm;
            const ry = b.pos[1] * rNorm;
            const rz = b.pos[2] * rNorm;

            for (let k = 0; k < spawnCount; k++) {
              const sign = k === 0 ? -1.0 : 0.85;
              const spread = b.radius * (0.4 + Math.random() * 1.1);
              const px = b.pos[0] + rx * sign * spread + (Math.random() - 0.5) * 0.2;
              const py = b.pos[1] + ry * sign * spread * 0.5 + (Math.random() - 0.5) * 0.14;
              const pz = b.pos[2] + rz * sign * spread + (Math.random() - 0.5) * 0.2;

              // Differential shear creates sweeping dual spiral tails
              const shear = 0.06 * sign;
              const vx = b.vel[0] * (1.0 + shear) + (Math.random() - 0.5) * 0.04;
              const vy = b.vel[1] * 0.75 + (Math.random() - 0.5) * 0.025;
              const vz = b.vel[2] * (1.0 + shear) + (Math.random() - 0.5) * 0.04;

              this.spawnDebris([px, py, pz], [vx, vy, vz], 0.85 + Math.random() * 0.15, 14 + Math.random() * 14);
            }

            if (b.integrity <= 0.01 && !consumedIndices.includes(i)) {
              consumedIndices.push(i);
              this.events.push({
                type: 'tde',
                name: b.name,
                mass: b.mass,
              });
              // Final star burst into debris stream
              for (let k = 0; k < 140; k++) {
                const ang = Math.random() * Math.PI * 2;
                const rad = b.radius * (0.2 + Math.random() * 1.4);
                this.spawnDebris(
                  [
                    b.pos[0] + Math.cos(ang) * rad,
                    b.pos[1] + (Math.random() - 0.5) * 0.35,
                    b.pos[2] + Math.sin(ang) * rad,
                  ],
                  [
                    b.vel[0] + (Math.random() - 0.5) * 0.12,
                    b.vel[1] + (Math.random() - 0.5) * 0.05,
                    b.vel[2] + (Math.random() - 0.5) * 0.12,
                  ],
                  1.0,
                  16 + Math.random() * 16
                );
              }
            }
          }
        }
      }

      // Handle consumed bodies (reverse order)
      consumedIndices.sort((a, b) => b - a);
      for (const idx of consumedIndices) {
        const b = this.bodies[idx];
        if (!b) continue;
        const alreadyTDE = this.events.some((e) => e.type === 'tde' && e.name === b.name);
        if (!alreadyTDE) {
          this.events.push({
            type: b.kind === 'companion' ? 'merger' : 'plunge',
            name: b.name,
            mass: b.mass,
          });
          this.mergerPulse = b.kind === 'companion' ? 1.0 : 0.55;
          this.mergerRingdownAmp = b.kind === 'companion' ? 1.0 : 0.45;
          this.mergerRingdownPhase = 0;
        }
        // Splash debris ring around horizon on plunge (not for stars shredded far outside it)
        for (let k = 0; !alreadyTDE && k < 60; k++) {
          const a = Math.random() * Math.PI * 2;
          const r = rPlus * (1.25 + Math.random() * 0.8);
          const spd = Math.sqrt(1.0 / r) * 0.95;
          this.spawnDebris(
            [Math.cos(a) * r, (Math.random() - 0.5) * 0.25, Math.sin(a) * r],
            [Math.sin(a) * spd, (Math.random() - 0.5) * 0.06, -Math.cos(a) * spd],
            1.0,
            7 + Math.random() * 8
          );
        }
        if (this.followBodyId === b.id) this.followBodyId = null;
        this.bodies.splice(idx, 1);
        if (this.selectedBodyId === b.id) {
          this.selectedBodyId = this.bodies[0] ? this.bodies[0].id : null;
        }
      }

      // Record orbital trails
      for (const b of this.bodies) {
        b.trailTimer += dtTotal;
        if (b.trailTimer >= 0.18) {
          b.trailTimer = 0;
          b.trail.push([b.pos[0], b.pos[1], b.pos[2]]);
          if (b.trail.length > TRAIL_MAX_POINTS) b.trail.shift();
        }
      }

      // Step Tidal Debris Particles (fast Euler-Cromer + mild accretion drag)
      const activeMax = this.debrisCount;
      for (let i = 0; i < activeMax; i++) {
        const i4 = i * 4;
        if (this.debrisMeta[i4 + 3] <= 0) continue;
        this.debrisMeta[i4 + 1] -= dtTotal;
        if (this.debrisMeta[i4 + 1] <= 0) {
          this.debrisMeta[i4 + 3] = 0;
          continue;
        }

        const i3 = i * 3;
        const px = this.debrisPos[i3];
        const py = this.debrisPos[i3 + 1];
        const pz = this.debrisPos[i3 + 2];
        const r2 = px * px + py * py + pz * pz;
        const r = Math.sqrt(r2 + 1e-4);

        if (r <= rPlus * 1.03) {
          this.debrisMeta[i4 + 3] = 0;
          continue;
        }

        const invR3 = 1.0 / (r2 * r + 0.05);
        // Radiative cooling + slight orbital circularization drag near equatorial plane
        const drag = 0.015 * dtTotal;
        const vx = (this.debrisVel[i3] - px * invR3 * dtTotal) * (1.0 - drag);
        const vy = (this.debrisVel[i3 + 1] - py * invR3 * dtTotal) * (1.0 - drag * 3.0);
        const vz = (this.debrisVel[i3 + 2] - pz * invR3 * dtTotal) * (1.0 - drag);

        this.debrisVel[i3] = vx;
        this.debrisVel[i3 + 1] = vy;
        this.debrisVel[i3 + 2] = vz;

        this.debrisPos[i3] = px + vx * dtTotal;
        this.debrisPos[i3 + 1] = py + vy * dtTotal;
        this.debrisPos[i3 + 2] = pz + vz * dtTotal;
      }

      // Compute LIGO Quadrupole Gravitational Wave Strain h_+(t)
      let strain = 0;
      for (const b of this.bodies) {
        const r = Math.hypot(b.pos[0], b.pos[1], b.pos[2]);
        const spd2 = b.vel[0] * b.vel[0] + b.vel[1] * b.vel[1] + b.vel[2] * b.vel[2];
        const phi = Math.atan2(b.pos[2], b.pos[0]);
        // Quadrupole GW h_+ ~ (G m v^2 / r) * cos(2 phi)
        const amp = (b.mass * (spd2 + 0.15 / Math.max(1.5, r))) / Math.max(2.0, r);
        strain += amp * 120.0 * Math.cos(2.0 * phi);
      }

      // Subtle horizon quasi-normal & inner-ISCO magneto-rotational quadrupole ripple
      const qnmAmp = 0.008 * (0.3 + this.spin) * (0.4 + this.diskDensity * 0.5);
      strain += qnmAmp * (Math.sin(this.simTime * 5.6) + 0.45 * Math.cos(this.simTime * 11.3));

      if (this.mergerRingdownAmp > 0.005) {
        this.mergerRingdownPhase += realDt * 46.0;
        strain += Math.sin(this.mergerRingdownPhase) * this.mergerRingdownAmp * 1.8;
      }

      this.gwStrain = strain;
      this.gwPeak = Math.max(this.gwPeak * 0.992, Math.abs(strain));
      this.gwHistory[this.gwWriteIdx] = strain;
      this.gwWriteIdx = (this.gwWriteIdx + 1) % GW_HISTORY_LEN;

      // Update tracked probe clock readout
      const sel = this.getSelectedBody();
      if (sel) {
        this.probeTau = sel.tau;
      } else {
        this.probeTau = this.simTime;
      }
    }
  }

  global.HorizonPhysics = {
    PRESETS,
    LAB_EXPERIMENTS,
    MAX_DEBRIS,
    MAX_BODIES,
    TIME_RATE,
    GW_HISTORY_LEN,
    Simulation,
    computeHorizonRadius,
    computePhotonSpheres,
    computeISCO,
    computeTimeDilation,
  };
})(window);
