(function (global) {
  'use strict';

  const Shaders = global.HorizonShaders;
  const Physics = global.HorizonPhysics;

  // Minimal 4x4 column-major matrix utilities
  function mat4Perspective(fovY, aspect, near, far) {
    const f = 1.0 / Math.tan(fovY * 0.5);
    const nf = 1.0 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ]);
  }

  function mat4LookAt(eye, target, up) {
    let fx = target[0] - eye[0];
    let fy = target[1] - eye[1];
    let fz = target[2] - eye[2];
    const fLen = Math.hypot(fx, fy, fz) || 1;
    fx /= fLen; fy /= fLen; fz /= fLen;

    // right = forward x up
    let rx = fy * up[2] - fz * up[1];
    let ry = fz * up[0] - fx * up[2];
    let rz = fx * up[1] - fy * up[0];
    const rLen = Math.hypot(rx, ry, rz) || 1;
    rx /= rLen; ry /= rLen; rz /= rLen;

    // true up = right x forward
    const ux = ry * fz - rz * fy;
    const uy = rz * fx - rx * fz;
    const uz = rx * fy - ry * fx;

    return new Float32Array([
      rx, ux, -fx, 0,
      ry, uy, -fy, 0,
      rz, uz, -fz, 0,
      -(rx * eye[0] + ry * eye[1] + rz * eye[2]),
      -(ux * eye[0] + uy * eye[1] + uz * eye[2]),
      fx * eye[0] + fy * eye[1] + fz * eye[2],
      1,
    ]);
  }

  function mat4Mul(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] =
          a[0 * 4 + r] * b[c * 4 + 0] +
          a[1 * 4 + r] * b[c * 4 + 1] +
          a[2 * 4 + r] * b[c * 4 + 2] +
          a[3 * 4 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }

  function projectPoint(p, vp, width, height) {
    const x = p[0], y = p[1], z = p[2];
    const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
    const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
    const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    if (cw <= 0.05) return null;
    const ndcX = cx / cw;
    const ndcY = cy / cw;
    return {
      x: (ndcX * 0.5 + 0.5) * width,
      y: (0.5 - ndcY * 0.5) * height,
      w: cw,
      visible: Math.abs(ndcX) <= 1.25 && Math.abs(ndcY) <= 1.25,
    };
  }

  function compileShader(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(`Shader compile error: ${log}`);
    }
    return s;
  }

  function createProgram(gl, vsSrc, fsSrc) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error(`Program link error: ${log}`);
    }
    return prog;
  }

  function getUniformLocations(gl, prog, names) {
    const map = {};
    for (const n of names) {
      map[n] = gl.getUniformLocation(prog, n);
    }
    return map;
  }

  class ObservatoryRenderer {
    constructor(glCanvas, overlayCanvas, gwCanvas) {
      this.glCanvas = glCanvas;
      this.overlayCanvas = overlayCanvas;
      this.gwCanvas = gwCanvas;
      this.ctx = overlayCanvas.getContext('2d');
      this.gwCtx = gwCanvas ? gwCanvas.getContext('2d') : null;

      const gl = glCanvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        powerPreference: 'high-performance',
      });
      if (!gl) {
        throw new Error('WebGL2 is not supported in this browser.');
      }
      this.gl = gl;

      // Probe float/half-float FBO capabilities safely
      const floatExt = gl.getExtension('EXT_color_buffer_float');
      const halfFloatExt = gl.getExtension('EXT_color_buffer_half_float');
      const floatLinear = gl.getExtension('OES_texture_float_linear');
      const halfLinear = gl.getExtension('OES_texture_half_float_linear');

      this.useFloatFbo = Boolean(floatExt || halfFloatExt);
      this.useLinearFloat = Boolean(floatLinear || halfLinear || !this.useFloatFbo);
      this.useCompressedHdr = !this.useFloatFbo;

      this.qualityMode = 'auto';
      this.renderScale = 0.85;
      this.cssWidth = 1;
      this.cssHeight = 1;
      this.dpr = 1;

      this.fovY = (50 * Math.PI) / 180;
      this.lastViewProj = new Float32Array(16);
      this.lastCamBasis = {
        pos: [0, 6, 22],
        right: [1, 0, 0],
        up: [0, 1, 0],
        forward: [0, -0.25, -0.96],
      };

      this._initPrograms();
      this._initPrecomputedTextures();
      this._initBuffers();
      this.resize(true);
    }

    _initPrograms() {
      const gl = this.gl;
      this.emptyVao = gl.createVertexArray();

      this.noiseProg = createProgram(gl, Shaders.FULLSCREEN_VS, Shaders.NOISE_PRECOMPUTE_FS);
      this.skyProg = createProgram(gl, Shaders.FULLSCREEN_VS, Shaders.SKY_PRECOMPUTE_FS);

      this.rayProg = createProgram(gl, Shaders.FULLSCREEN_VS, Shaders.RAYMARCH_FS);
      this.rayUni = getUniformLocations(gl, this.rayProg, [
        'uResolution', 'uTime', 'uCamPos', 'uCamRight', 'uCamUp', 'uCamForward',
        'uAspect', 'uTanHalfFov', 'uSpin', 'uHorizonR', 'uIscoR',
        'uDiskTemp', 'uDiskDensity', 'uJetPower', 'uMode', 'uDoppler',
        'uMergerPulse', 'uUseCompressedHdr', 'uBodyCount', 'uSkyTex', 'uNoiseTex',
      ]);
      this.rayUni.uBodyPos = [];
      this.rayUni.uBodyCol = [];
      for (let i = 0; i < 8; i++) {
        this.rayUni.uBodyPos.push(gl.getUniformLocation(this.rayProg, `uBodyPos[${i}]`));
        this.rayUni.uBodyCol.push(gl.getUniformLocation(this.rayProg, `uBodyCol[${i}]`));
      }

      this.lineProg = createProgram(gl, Shaders.LINE_3D_VS, Shaders.LINE_3D_FS);
      this.lineUni = getUniformLocations(gl, this.lineProg, [
        'uViewProj', 'uCamPos', 'uSceneTex', 'uViewport', 'uUseCompressedHdr',
      ]);

      this.partProg = createProgram(gl, Shaders.PARTICLE_3D_VS, Shaders.PARTICLE_3D_FS);
      this.partUni = getUniformLocations(gl, this.partProg, [
        'uViewProj', 'uCamPos', 'uPixelRatio', 'uSceneTex', 'uViewport', 'uUseCompressedHdr',
      ]);

      this.brightProg = createProgram(gl, Shaders.FULLSCREEN_VS, Shaders.BLOOM_BRIGHT_FS);
      this.brightUni = getUniformLocations(gl, this.brightProg, ['uTex', 'uOverlayTex', 'uUseCompressedHdr']);

      this.blurProg = createProgram(gl, Shaders.FULLSCREEN_VS, Shaders.BLUR_FS);
      this.blurUni = getUniformLocations(gl, this.blurProg, ['uTex', 'uTexelOffset']);

      this.compProg = createProgram(gl, Shaders.FULLSCREEN_VS, Shaders.COMPOSITE_FS);
      this.compUni = getUniformLocations(gl, this.compProg, [
        'uSceneTex', 'uOverlayTex', 'uBloomTight', 'uBloomWide', 'uEnableBloom', 'uMergerPulse', 'uUseCompressedHdr',
      ]);
    }

    _createFbo(w, h, repeat = false, forceRgba8 = false) {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);

      const useFloat = this.useFloatFbo && !forceRgba8;
      const internalFmt = useFloat ? gl.RGBA16F : gl.RGBA8;
      const type = useFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
      const filter = (!useFloat || this.useLinearFloat) ? gl.LINEAR : gl.NEAREST;

      gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, w, h, 0, gl.RGBA, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);

      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE && useFloat) {
        // Fallback gracefully to RGBA8 if hardware rejects RGBA16F
        gl.deleteFramebuffer(fbo);
        gl.deleteTexture(tex);
        this.useFloatFbo = false;
        this.useCompressedHdr = true;
        return this._createFbo(w, h, repeat, true);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { fbo, tex, w, h };
    }

    _destroyFbo(obj) {
      if (!obj) return;
      this.gl.deleteFramebuffer(obj.fbo);
      this.gl.deleteTexture(obj.tex);
    }

    _initPrecomputedTextures() {
      const gl = this.gl;
      gl.bindVertexArray(this.emptyVao);

      // 512x512 seamless turbulence noise texture
      this.noiseFbo = this._createFbo(512, 512, true, true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.noiseFbo.fbo);
      gl.viewport(0, 0, 512, 512);
      gl.useProgram(this.noiseProg);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // 1024x512 equirectangular deep space starfield & Milky Way band
      this.skyFbo = this._createFbo(4096, 2048, false, false);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.skyFbo.fbo);
      gl.viewport(0, 0, 4096, 2048);
      gl.useProgram(this.skyProg);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    _initBuffers() {
      const gl = this.gl;

      // Dynamic 3D line VAO (Spacetime grid + orbital trails + geodesic rays)
      this.lineCapacityFloats = 90000 * 7; // x, y, z, r, g, b, a
      this.lineArray = new Float32Array(this.lineCapacityFloats);
      this.lineVertexCount = 0;

      this.lineVao = gl.createVertexArray();
      this.lineVbo = gl.createBuffer();
      gl.bindVertexArray(this.lineVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVbo);
      gl.bufferData(gl.ARRAY_BUFFER, this.lineArray.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);

      // Tidal debris particle VAO
      this.partVao = gl.createVertexArray();
      this.partPosVbo = gl.createBuffer();
      this.partMetaVbo = gl.createBuffer();
      gl.bindVertexArray(this.partVao);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.partPosVbo);
      gl.bufferData(gl.ARRAY_BUFFER, Physics.MAX_DEBRIS * 3 * 4, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.partMetaVbo);
      gl.bufferData(gl.ARRAY_BUFFER, Physics.MAX_DEBRIS * 4 * 4, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 16, 0);

      gl.bindVertexArray(null);
    }

    setQuality(mode) {
      this.qualityMode = mode;
      if (mode === '1.0') this.renderScale = 1.0;
      else if (mode === '0.75') this.renderScale = 0.75;
      else if (mode === '0.5') this.renderScale = 0.5;
      else this.renderScale = 0.85;
      this.resize(true);
    }

    adjustAutoScale(fps) {
      if (this.qualityMode !== 'auto') return;
      let target = this.renderScale;
      if (fps < 42 && this.renderScale > 0.55) {
        target = Math.max(0.55, this.renderScale - 0.1);
      } else if (fps > 57 && this.renderScale < 0.95) {
        target = Math.min(0.95, this.renderScale + 0.05);
      }
      if (Math.abs(target - this.renderScale) >= 0.04) {
        this.renderScale = target;
        this._rebuildSceneFbos();
      }
    }

    resize(force = false) {
      const rect = this.glCanvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      if (!force && w === this.cssWidth && h === this.cssHeight && dpr === this.dpr) {
        return;
      }

      this.cssWidth = w;
      this.cssHeight = h;
      this.dpr = dpr;

      this.glCanvas.width = Math.floor(w * dpr);
      this.glCanvas.height = Math.floor(h * dpr);
      this.overlayCanvas.width = Math.floor(w * dpr);
      this.overlayCanvas.height = Math.floor(h * dpr);

      this._rebuildSceneFbos();
    }

    _rebuildSceneFbos() {
      const fullW = Math.max(64, this.glCanvas.width);
      const fullH = Math.max(64, this.glCanvas.height);

      const rayW = Math.max(120, Math.floor(fullW * this.renderScale));
      const rayH = Math.max(90, Math.floor(fullH * this.renderScale));

      this._destroyFbo(this.rayFbo);
      this._destroyFbo(this.overlayFbo);
      this._destroyFbo(this.bloomTightA);
      this._destroyFbo(this.bloomTightB);
      this._destroyFbo(this.bloomWideA);
      this._destroyFbo(this.bloomWideB);

      this.rayFbo = this._createFbo(rayW, rayH, false, false);
      this.overlayFbo = this._createFbo(fullW, fullH, false, false);

      const b1W = Math.max(48, Math.floor(rayW * 0.5));
      const b1H = Math.max(48, Math.floor(rayH * 0.5));
      const b2W = Math.max(32, Math.floor(rayW * 0.25));
      const b2H = Math.max(32, Math.floor(rayH * 0.25));

      this.bloomTightA = this._createFbo(b1W, b1H, false, false);
      this.bloomTightB = this._createFbo(b1W, b1H, false, false);
      this.bloomWideA = this._createFbo(b2W, b2H, false, false);
      this.bloomWideB = this._createFbo(b2W, b2H, false, false);
    }

    _pushLine(x0, y0, z0, x1, y1, z1, r, g, b, a) {
      if ((this.lineVertexCount + 2) * 7 >= this.lineCapacityFloats) return;
      let o = this.lineVertexCount * 7;
      const arr = this.lineArray;
      arr[o++] = x0; arr[o++] = y0; arr[o++] = z0;
      arr[o++] = r;  arr[o++] = g;  arr[o++] = b;  arr[o++] = a;
      arr[o++] = x1; arr[o++] = y1; arr[o++] = z1;
      arr[o++] = r;  arr[o++] = g;  arr[o++] = b;  arr[o++] = a;
      this.lineVertexCount += 2;
    }

    _build3dGeometry(sim, animTime) {
      this.lineVertexCount = 0;

      // 1. Spacetime Curvature Metric Grid (Flamm's Paraboloid + Orbiting Wells)
      if (sim.showGrid || sim.mode === 'spacetime') {
        const N = 46;
        const halfExtent = 22.0;
        const step = (halfExtent * 2) / N;
        const rPlus = Physics.computeHorizonRadius(sim.spin);

        // Precompute grid heights & curvature intensity
        const gridY = new Float32Array((N + 1) * (N + 1));
        const gridCurve = new Float32Array((N + 1) * (N + 1));

        for (let iz = 0; iz <= N; iz++) {
          const z = -halfExtent + iz * step;
          for (let ix = 0; ix <= N; ix++) {
            const x = -halfExtent + ix * step;
            const r = Math.hypot(x, z);
            // Smooth relativistic potential funnel anchored cleanly under equatorial plane
            const effR = Math.max(rPlus * 0.72, r);
            let depth = -0.58 - 3.35 / Math.sqrt(effR * effR + 1.35);
            let curve = 1.0 / (effR + 0.55);

            // Add smooth dimples for orbiting massive stars & companions
            for (const b of sim.bodies) {
              if (b.mass >= 0.005) {
                const db = Math.hypot(x - b.pos[0], z - b.pos[2]);
                const w = (b.mass * 8.5) / Math.sqrt(db * db + 0.85);
                depth -= w;
                curve += w * 0.4;
              }
            }

            const idx = iz * (N + 1) + ix;
            gridY[idx] = depth;
            gridCurve[idx] = Math.min(1.0, curve * 1.45);
          }
        }

        const gridAlpha = sim.mode === 'spacetime' ? 0.62 : 0.34;
        for (let iz = 0; iz <= N; iz++) {
          const z = -halfExtent + iz * step;
          for (let ix = 0; ix <= N; ix++) {
            const x = -halfExtent + ix * step;
            const idx = iz * (N + 1) + ix;
            const c = gridCurve[idx];
            const distFade = Math.max(0.08, 1.0 - Math.hypot(x, z) / 26.0);
            const rCol = 0.15 + c * 0.85;
            const gCol = 0.42 + c * 0.36;
            const bCol = 0.88 - c * 0.45;
            const a = gridAlpha * distFade;

            if (ix < N) {
              const idxR = iz * (N + 1) + (ix + 1);
              this._pushLine(
                x, gridY[idx], z,
                x + step, gridY[idxR], z,
                rCol, gCol, bCol, a
              );
            }
            if (iz < N) {
              const idxD = (iz + 1) * (N + 1) + ix;
              this._pushLine(
                x, gridY[idx], z,
                x, gridY[idxD], z + step,
                rCol, gCol, bCol, a
              );
            }
          }
        }

        // Highlight ISCO & Photon Sphere reference circles on the metric surface
        const iscoR = Physics.computeISCO(sim.spin);
        const segs = 72;
        const rings = [
          { r: rPlus * 1.5, col: [0.35, 0.88, 1.0, 0.55] },
          { r: iscoR, col: [1.0, 0.68, 0.22, 0.45] },
        ];
        for (const ring of rings) {
          const ringY = -0.58 - 3.35 / Math.sqrt(ring.r * ring.r + 1.35);
          for (let s = 0; s < segs; s++) {
            const a0 = (s / segs) * Math.PI * 2;
            const a1 = ((s + 1) / segs) * Math.PI * 2;
            this._pushLine(
              Math.cos(a0) * ring.r, ringY, Math.sin(a0) * ring.r,
              Math.cos(a1) * ring.r, ringY, Math.sin(a1) * ring.r,
              ring.col[0], ring.col[1], ring.col[2], ring.col[3]
            );
          }
        }
      }

      // 2. Orbital Trails
      if (sim.showTrails) {
        for (const b of sim.bodies) {
          const pts = b.trail;
          if (pts.length < 2) continue;
          const isSel = b.id === sim.selectedBodyId;
          for (let i = 0; i < pts.length - 1; i++) {
            const frac = (i + 1) / pts.length;
            const alpha = frac * frac * (isSel ? 0.92 : 0.62);
            this._pushLine(
              pts[i][0], pts[i][1], pts[i][2],
              pts[i + 1][0], pts[i + 1][1], pts[i + 1][2],
              b.color[0] * 1.25, b.color[1] * 1.25, b.color[2] * 1.25, alpha
            );
          }
        }
      }

      // 3. 3D Geodesic Ray Bundles (Mode 4)
      if (sim.mode === 'geodesics') {
        const pulsePhase = (animTime * 0.42) % 1.0;
        for (const ray of sim.geodesicRays) {
          const pts = ray.points;
          if (pts.length < 2) continue;
          const baseCol = ray.captured ? [1.0, 0.34, 0.38] : [0.35, 0.92, 1.0];
          for (let i = 0; i < pts.length - 1; i++) {
            const t = i / pts.length;
            const pulseDist = Math.abs(t - pulsePhase);
            const pulse = Math.exp(-pulseDist * pulseDist * 260.0);
            const alpha = 0.32 + pulse * 0.85;
            const boost = 1.0 + pulse * 1.8;
            this._pushLine(
              pts[i][0], pts[i][1], pts[i][2],
              pts[i + 1][0], pts[i + 1][1], pts[i + 1][2],
              baseCol[0] * boost, baseCol[1] * boost, baseCol[2] * boost, alpha
            );
          }
        }
      }
    }

    render(sim, camState, animTime, slingshotPreview) {
      const gl = this.gl;
      this.resize();

      // Compute Camera Basis & Projection
      const camPos = camState.pos;
      const target = camState.target;
      let fx = target[0] - camPos[0];
      let fy = target[1] - camPos[1];
      let fz = target[2] - camPos[2];
      const fLen = Math.hypot(fx, fy, fz) || 1;
      fx /= fLen; fy /= fLen; fz /= fLen;

      const worldUp = [0, 1, 0];
      let rx = fy * worldUp[2] - fz * worldUp[1];
      let ry = fz * worldUp[0] - fx * worldUp[2];
      let rz = fx * worldUp[1] - fy * worldUp[0];
      const rLen = Math.hypot(rx, ry, rz) || 1;
      rx /= rLen; ry /= rLen; rz /= rLen;

      const ux = ry * fz - rz * fy;
      const uy = rz * fx - rx * fz;
      const uz = rx * fy - ry * fx;

      this.lastCamBasis = {
        pos: [camPos[0], camPos[1], camPos[2]],
        right: [rx, ry, rz],
        up: [ux, uy, uz],
        forward: [fx, fy, fz],
      };

      const aspect = this.glCanvas.width / Math.max(1, this.glCanvas.height);
      const tanHalfFov = Math.tan(this.fovY * 0.5);
      const view = mat4LookAt(camPos, target, worldUp);
      const proj = mat4Perspective(this.fovY, aspect, 0.1, 250.0);
      const viewProj = mat4Mul(proj, view);
      this.lastViewProj = viewProj;

      const modeIndex =
        sim.mode === 'eht' ? 1 :
        sim.mode === 'spacetime' ? 2 :
        sim.mode === 'geodesics' ? 3 : 0;

      const rPlus = Physics.computeHorizonRadius(sim.spin);
      const iscoR = Physics.computeISCO(sim.spin);

      // PASS 1: Raymarch Black Hole + Volumetric Disk + Lensed Companions into rayFbo
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.rayFbo.fbo);
      gl.viewport(0, 0, this.rayFbo.w, this.rayFbo.h);
      gl.disable(gl.BLEND);
      gl.useProgram(this.rayProg);
      gl.bindVertexArray(this.emptyVao);

      const u = this.rayUni;
      gl.uniform2f(u.uResolution, this.rayFbo.w, this.rayFbo.h);
      gl.uniform1f(u.uTime, animTime);
      gl.uniform3f(u.uCamPos, camPos[0], camPos[1], camPos[2]);
      gl.uniform3f(u.uCamRight, rx, ry, rz);
      gl.uniform3f(u.uCamUp, ux, uy, uz);
      gl.uniform3f(u.uCamForward, fx, fy, fz);
      gl.uniform1f(u.uAspect, aspect);
      gl.uniform1f(u.uTanHalfFov, tanHalfFov);
      gl.uniform1f(u.uSpin, sim.spin);
      gl.uniform1f(u.uHorizonR, rPlus);
      gl.uniform1f(u.uIscoR, iscoR);
      gl.uniform1f(u.uDiskTemp, sim.diskTemp);
      gl.uniform1f(u.uDiskDensity, sim.diskDensity);
      gl.uniform1f(u.uJetPower, sim.jetPower);
      gl.uniform1i(u.uMode, modeIndex);
      gl.uniform1f(u.uDoppler, sim.enableDoppler ? 1.0 : 0.0);
      gl.uniform1f(u.uMergerPulse, sim.mergerPulse);
      gl.uniform1f(u.uUseCompressedHdr, this.useCompressedHdr ? 1.0 : 0.0);

      const bCount = Math.min(8, sim.bodies.length);
      gl.uniform1i(u.uBodyCount, bCount);
      for (let i = 0; i < bCount; i++) {
        const b = sim.bodies[i];
        const kindNum = b.kind === 'companion' ? 2.0 : b.kind === 'probe' ? 1.0 : 0.0;
        const visRad = b.kind === 'star' ? b.radius * Math.max(0.25, b.integrity) : b.radius;
        gl.uniform4f(u.uBodyPos[i], b.pos[0], b.pos[1], b.pos[2], visRad);
        gl.uniform4f(u.uBodyCol[i], b.color[0], b.color[1], b.color[2], kindNum);
      }

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.skyFbo.tex);
      gl.uniform1i(u.uSkyTex, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.noiseFbo.tex);
      gl.uniform1i(u.uNoiseTex, 1);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // PASS 2: Render Native-Res 3D Overlays (Spacetime Grid, Trails, Geodesics, Debris) into overlayFbo
      this._build3dGeometry(sim, animTime);

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.overlayFbo.fbo);
      gl.viewport(0, 0, this.overlayFbo.w, this.overlayFbo.h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // Additive HDR blending for crisp glowing lines & particles

      if (this.lineVertexCount > 0) {
        gl.useProgram(this.lineProg);
        gl.uniformMatrix4fv(this.lineUni.uViewProj, false, viewProj);
        gl.uniform3f(this.lineUni.uCamPos, camPos[0], camPos[1], camPos[2]);
        gl.uniform2f(this.lineUni.uViewport, this.overlayFbo.w, this.overlayFbo.h);
        gl.uniform1f(this.lineUni.uUseCompressedHdr, this.useCompressedHdr ? 1.0 : 0.0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.rayFbo.tex);
        gl.uniform1i(this.lineUni.uSceneTex, 0);

        gl.bindVertexArray(this.lineVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.lineVbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.lineArray.subarray(0, this.lineVertexCount * 7));
        gl.drawArrays(gl.LINES, 0, this.lineVertexCount);
      }

      if (sim.debrisCount > 0) {
        gl.useProgram(this.partProg);
        gl.uniformMatrix4fv(this.partUni.uViewProj, false, viewProj);
        gl.uniform3f(this.partUni.uCamPos, camPos[0], camPos[1], camPos[2]);
        gl.uniform1f(this.partUni.uPixelRatio, this.dpr);
        gl.uniform2f(this.partUni.uViewport, this.overlayFbo.w, this.overlayFbo.h);
        gl.uniform1f(this.partUni.uUseCompressedHdr, this.useCompressedHdr ? 1.0 : 0.0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.rayFbo.tex);
        gl.uniform1i(this.partUni.uSceneTex, 0);

        gl.bindVertexArray(this.partVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.partPosVbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, sim.debrisPos.subarray(0, sim.debrisCount * 3));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.partMetaVbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, sim.debrisMeta.subarray(0, sim.debrisCount * 4));
        gl.drawArrays(gl.POINTS, 0, sim.debrisCount);
      }

      gl.disable(gl.BLEND);
      gl.bindVertexArray(this.emptyVao);

      // PASS 3: Multi-Octave HDR Bloom Pyramid
      if (sim.enableBloom) {
        // Bright extract from rayFbo + overlayFbo
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomTightA.fbo);
        gl.viewport(0, 0, this.bloomTightA.w, this.bloomTightA.h);
        gl.useProgram(this.brightProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.rayFbo.tex);
        gl.uniform1i(this.brightUni.uTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.overlayFbo.tex);
        gl.uniform1i(this.brightUni.uOverlayTex, 1);
        gl.uniform1f(this.brightUni.uUseCompressedHdr, this.useCompressedHdr ? 1.0 : 0.0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // Tight blur H + V
        this._blurPass(this.bloomTightA, this.bloomTightB, 1.35);

        // Wide blur downsample + H + V
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomWideA.fbo);
        gl.viewport(0, 0, this.bloomWideA.w, this.bloomWideA.h);
        gl.useProgram(this.blurProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.bloomTightA.tex);
        gl.uniform1i(this.blurUni.uTex, 0);
        gl.uniform2f(this.blurUni.uTexelOffset, 1.5 / this.bloomTightA.w, 0.0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        this._blurPass(this.bloomWideA, this.bloomWideB, 2.2);
      }

      // PASS 4: Final Composite (Raymarched Scene + Crisp 3D Overlay + Multi-Octave Bloom) onto Screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.glCanvas.width, this.glCanvas.height);
      gl.useProgram(this.compProg);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.rayFbo.tex);
      gl.uniform1i(this.compUni.uSceneTex, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.overlayFbo.tex);
      gl.uniform1i(this.compUni.uOverlayTex, 1);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomTightA.tex);
      gl.uniform1i(this.compUni.uBloomTight, 2);

      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomWideA.tex);
      gl.uniform1i(this.compUni.uBloomWide, 3);

      gl.uniform1f(this.compUni.uEnableBloom, sim.enableBloom ? 1.0 : 0.0);
      gl.uniform1f(this.compUni.uMergerPulse, sim.mergerPulse);
      gl.uniform1f(this.compUni.uUseCompressedHdr, this.useCompressedHdr ? 1.0 : 0.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // PASS 5: Crisp 2D Canvas Reticles, EHT Polarization Ticks, Slingshot Predictor & GW Scope
      this._render2DOverlay(sim, viewProj, slingshotPreview, animTime);
      this._renderGwOscilloscope(sim);
    }

    _blurPass(fboA, fboB, radiusScale) {
      const gl = this.gl;
      gl.useProgram(this.blurProg);

      // Horizontal
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboB.fbo);
      gl.viewport(0, 0, fboB.w, fboB.h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fboA.tex);
      gl.uniform1i(this.blurUni.uTex, 0);
      gl.uniform2f(this.blurUni.uTexelOffset, radiusScale / fboA.w, 0.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Vertical
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboA.fbo);
      gl.viewport(0, 0, fboA.w, fboA.h);
      gl.bindTexture(gl.TEXTURE_2D, fboB.tex);
      gl.uniform2f(this.blurUni.uTexelOffset, 0.0, radiusScale / fboB.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    _render2DOverlay(sim, viewProj, slingshotPreview, animTime) {
      const ctx = this.ctx;
      const w = this.overlayCanvas.width;
      const h = this.overlayCanvas.height;
      ctx.clearRect(0, 0, w, h);

      ctx.save();
      ctx.scale(this.dpr, this.dpr);
      const cw = this.cssWidth;
      const ch = this.cssHeight;

      // EHT 230 GHz Magnetic Polarization Vector Ticks & Interferometry Scale
      if (sim.mode === 'eht') {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 244, 214, 0.65)';
        ctx.lineWidth = 1.25;
        const ringCount = 26;
        for (let i = 0; i < ringCount; i++) {
          const ang = (i / ringCount) * Math.PI * 2 + animTime * 0.04;
          const rad = 3.8 + 0.6 * Math.sin(ang * 2.0);
          const worldPt = [Math.cos(ang) * rad, 0, Math.sin(ang) * rad];
          const p = projectPoint(worldPt, viewProj, cw, ch);
          if (!p || !p.visible) continue;
          const tx = -Math.sin(ang) + 0.35 * Math.cos(ang);
          const tz = Math.cos(ang) + 0.35 * Math.sin(ang);
          const p2 = projectPoint([worldPt[0] + tx * 0.65, 0, worldPt[2] + tz * 0.65], viewProj, cw, ch);
          if (!p2) continue;
          const dx = p2.x - p.x;
          const dy = p2.y - p.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = (dx / len) * 8.5;
          const uy = (dy / len) * 8.5;
          ctx.beginPath();
          ctx.moveTo(p.x - ux, p.y - uy);
          ctx.lineTo(p.x + ux, p.y + uy);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Orbiting Body Reticles & Velocity Tags
      if (sim.showLabels) {
        for (const b of sim.bodies) {
          const proj = projectPoint(b.pos, viewProj, cw, ch);
          if (!proj || proj.x < 12 || proj.x > cw - 12 || proj.y < 12 || proj.y > ch - 12) continue;
          const isSel = b.id === sim.selectedBodyId;
          const rPix = isSel ? 15 : 10;

          ctx.strokeStyle = isSel
            ? 'rgba(56, 189, 248, 0.92)'
            : `rgba(${Math.round(b.color[0] * 255)}, ${Math.round(b.color[1] * 255)}, ${Math.round(b.color[2] * 255)}, 0.58)`;
          ctx.lineWidth = isSel ? 1.5 : 1.0;

          // Precision corner-bracket reticle for selected body, clean circle for others
          if (isSel) {
            const g = 5;
            ctx.beginPath();
            ctx.moveTo(proj.x - rPix, proj.y - rPix + g);
            ctx.lineTo(proj.x - rPix, proj.y - rPix);
            ctx.lineTo(proj.x - rPix + g, proj.y - rPix);

            ctx.moveTo(proj.x + rPix - g, proj.y - rPix);
            ctx.lineTo(proj.x + rPix, proj.y - rPix);
            ctx.lineTo(proj.x + rPix, proj.y - rPix + g);

            ctx.moveTo(proj.x + rPix, proj.y + rPix - g);
            ctx.lineTo(proj.x + rPix, proj.y + rPix);
            ctx.lineTo(proj.x + rPix - g, proj.y + rPix);

            ctx.moveTo(proj.x - rPix + g, proj.y + rPix);
            ctx.lineTo(proj.x - rPix, proj.y + rPix);
            ctx.lineTo(proj.x - rPix, proj.y + rPix - g);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.arc(proj.x, proj.y, rPix, 0, Math.PI * 2);
            ctx.stroke();
          }

          ctx.font = '600 10.5px "JetBrains Mono", Consolas, monospace';
          const tag = `${b.name}  ${b.lastBeta.toFixed(2)}c`;
          ctx.lineJoin = 'round';
          ctx.strokeStyle = 'rgba(3, 5, 10, 0.88)';
          ctx.lineWidth = 3.2;
          ctx.strokeText(tag, proj.x + rPix + 6, proj.y + 3.5);
          ctx.fillStyle = isSel ? '#e0f2fe' : 'rgba(236, 243, 252, 0.92)';
          ctx.fillText(tag, proj.x + rPix + 6, proj.y + 3.5);
        }
      }

      // Live Slingshot Trajectory Preview Curve
      if (slingshotPreview) {
        const { originWorld, velWorld, prediction, cursorCss } = slingshotPreview;
        const pOrigin = projectPoint(originWorld, viewProj, cw, ch);

        const statusColors = {
          bound: '#10b981',
          tidal: '#f5a623',
          plunge: '#f43f5e',
          escape: '#38bdf8',
        };
        const statusLabels = {
          bound: 'BOUND ROSETTE ORBIT',
          tidal: 'ROCHE TIDAL DISRUPTION',
          plunge: 'HORIZON PLUNGE',
          escape: 'HYPERBOLIC ESCAPE',
        };
        const col = statusColors[prediction.status] || '#38bdf8';

        // Draw predicted relativistic trajectory path
        ctx.save();
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.0;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        let started = false;
        for (const pt of prediction.points) {
          const sp = projectPoint(pt, viewProj, cw, ch);
          if (!sp) {
            started = false;
            continue;
          }
          if (!started) {
            ctx.moveTo(sp.x, sp.y);
            started = true;
          } else {
            ctx.lineTo(sp.x, sp.y);
          }
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw launch slingshot vector arrow
        if (pOrigin) {
          const tipWorld = [
            originWorld[0] + velWorld[0] * 10.0,
            originWorld[1] + velWorld[1] * 10.0,
            originWorld[2] + velWorld[2] * 10.0,
          ];
          const pTip = projectPoint(tipWorld, viewProj, cw, ch);
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(pOrigin.x, pOrigin.y, 5.5, 0, Math.PI * 2);
          ctx.fill();

          if (pTip) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            ctx.moveTo(pOrigin.x, pOrigin.y);
            ctx.lineTo(pTip.x, pTip.y);
            ctx.stroke();
          }
        }

        // Floating trajectory classification badge next to cursor
        if (cursorCss) {
          const bx = Math.min(cw - 210, Math.max(12, cursorCss.x + 16));
          const by = Math.min(ch - 70, Math.max(18, cursorCss.y - 42));
          ctx.fillStyle = 'rgba(9, 12, 19, 0.88)';
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.roundRect(bx, by, 196, 46, 8);
          ctx.fill();
          ctx.stroke();

          ctx.font = '700 10px "JetBrains Mono", Consolas, monospace';
          ctx.fillStyle = col;
          ctx.fillText(statusLabels[prediction.status], bx + 10, by + 17);

          ctx.font = '500 10.5px "JetBrains Mono", Consolas, monospace';
          ctx.fillStyle = '#d7e1ef';
          ctx.fillText(
            `r_min ${prediction.minR.toFixed(2)}M  ·  v_max ${prediction.peakBeta.toFixed(2)}c`,
            bx + 10,
            by + 34
          );
        }
        ctx.restore();
      }

      ctx.restore();
    }

    _renderGwOscilloscope(sim) {
      if (!this.gwCtx || !this.gwCanvas) return;
      const ctx = this.gwCtx;
      const w = this.gwCanvas.width;
      const h = this.gwCanvas.height;
      ctx.clearRect(0, 0, w, h);

      // Subtle center baseline
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.5);
      ctx.lineTo(w, h * 0.5);
      ctx.stroke();

      const hist = sim.gwHistory;
      const len = hist.length;
      const scale = Math.max(0.002, sim.gwPeak * 1.25);

      ctx.strokeStyle = sim.mergerRingdownAmp > 0.08 ? '#f5a623' : '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < len; i++) {
        const idx = (sim.gwWriteIdx + i) % len;
        const x = (i / (len - 1)) * w;
        const norm = Math.max(-1, Math.min(1, hist[idx] / scale));
        const y = h * 0.5 - norm * (h * 0.42);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    screenToEquatorialPlane(cssX, cssY) {
      const ndcX = (cssX / Math.max(1, this.cssWidth)) * 2.0 - 1.0;
      const ndcY = 1.0 - (cssY / Math.max(1, this.cssHeight)) * 2.0;
      const aspect = this.cssWidth / Math.max(1, this.cssHeight);
      const tanHalfFov = Math.tan(this.fovY * 0.5);
      const c = this.lastCamBasis;

      const dx = c.forward[0] + c.right[0] * (ndcX * aspect * tanHalfFov) + c.up[0] * (ndcY * tanHalfFov);
      const dy = c.forward[1] + c.right[1] * (ndcX * aspect * tanHalfFov) + c.up[1] * (ndcY * tanHalfFov);
      const dz = c.forward[2] + c.right[2] * (ndcX * aspect * tanHalfFov) + c.up[2] * (ndcY * tanHalfFov);
      const len = Math.hypot(dx, dy, dz) || 1;
      const rx = dx / len, ry = dy / len, rz = dz / len;

      if (Math.abs(ry) < 1e-4) return null;
      const t = -c.pos[1] / ry;
      if (t <= 0 || t > 180) return null;
      return [c.pos[0] + rx * t, 0, c.pos[2] + rz * t];
    }

    pickBodyAtScreen(sim, cssX, cssY) {
      let best = null;
      let bestDist = 26;
      for (const b of sim.bodies) {
        const p = projectPoint(b.pos, this.lastViewProj, this.cssWidth, this.cssHeight);
        if (!p) continue;
        const d = Math.hypot(p.x - cssX, p.y - cssY);
        if (d < bestDist) {
          bestDist = d;
          best = b;
        }
      }
      return best;
    }
  }

  global.HorizonRenderer = {
    ObservatoryRenderer,
    projectPoint,
  };
})(window);
