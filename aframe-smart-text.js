var SmartText = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/SmartTextSystem.ts
  var SmartTextSystem_exports = {};
  __export(SmartTextSystem_exports, {
    initSmartTextSystem: () => initSmartTextSystem
  });

  // src/harfbuzz.ts
  var hbModulePromise = null;
  function loadHarfBuzzOnce() {
    if (hbModulePromise) return hbModulePromise;
    hbModulePromise = new Promise(async (resolve, reject) => {
      try {
        const loadScript = (src) => {
          return new Promise((res, rej) => {
            if (document.querySelector(`script[src="${src}"]`)) {
              res();
              return;
            }
            const script = document.createElement("script");
            script.src = src;
            script.async = true;
            script.onload = () => res();
            script.onerror = (e) => rej(new Error(`Failed to load script: ${src}`));
            document.head.appendChild(script);
          });
        };
        await Promise.all([
          loadScript("./harfbuzz/hb.js"),
          loadScript("./harfbuzz/hbjs.js")
        ]);
        if (typeof window.createHarfBuzz === "function" && typeof window.hbjs === "function") {
          const wasmInstance = await window.createHarfBuzz();
          const hb = window.hbjs(wasmInstance);
          resolve(hb);
        } else {
          reject(
            new Error(
              "HarfBuzz scripts loaded but createHarfBuzz or hbjs is missing"
            )
          );
        }
      } catch (e) {
        reject(e);
      }
    });
    return hbModulePromise;
  }
  async function shapeArabic(fontArrayBuffer, text, fontSize = 42) {
    const hb = await loadHarfBuzzOnce();
    const blob = hb.createBlob(new Uint8Array(fontArrayBuffer));
    const face = hb.createFace(blob, 0);
    const font = hb.createFont(face);
    font.setScale(fontSize, fontSize);
    const buf = hb.createBuffer();
    buf.addText(text);
    buf.guessSegmentProperties();
    hb.shape(font, buf, "liga=0,clig=0,dlig=0,calt=0");
    const json = buf.json(font);
    buf.destroy();
    font.destroy();
    face.destroy();
    blob.destroy();
    return json;
  }

  // src/msdfBuilder.ts
  var THREE = window.THREE;
  function buildMSDFMeshFromShaping(shapingResult, atlasJson, atlasTexture, scale = 1, color = 16777215, align = "center") {
    const lines = Array.isArray(shapingResult) ? shapingResult : [shapingResult];
    const positions = [];
    const uvs = [];
    const indices = [];
    let idx = 0;
    const fontSize = atlasJson.original?.info?.size ?? 42;
    const fontLineHeight = atlasJson.metrics?.lineHeight ?? atlasJson.original?.metrics?.lineHeight ?? atlasJson.original?.common?.lineHeight ?? fontSize * 1.4;
    const lineHeight = fontLineHeight * scale;
    let penY = 0;
    for (const lineShaping of lines) {
      const glyphs = lineShaping.glyphs || lineShaping;
      const lineVerts = [];
      const lineUvs = [];
      let penX = 0;
      const rawGlyphs = atlasJson.glyphs || atlasJson.original?.glyphs || [];
      let fontScale = 1 / 42;
      let fontScaleDetected = false;
      for (const g of glyphs) {
        const glyphIndex = g.g;
        const glyphData = rawGlyphs.find(
          (item) => item.index === glyphIndex
        );
        if (!glyphData) {
          console.warn("Missing glyph index:", glyphIndex);
          penX += (g.ax || g.xAdvance || 0) * scale * fontScale;
          continue;
        }
        if (!glyphData.planeBounds || !glyphData.atlasBounds) {
          const hbAdvance2 = g.ax || g.xAdvance || 0;
          const atlasAdvance2 = glyphData.advance || 0;
          if (!fontScaleDetected && hbAdvance2 > 1e-3 && atlasAdvance2 > 0) {
            fontScale = atlasAdvance2 / hbAdvance2;
            fontScaleDetected = true;
          }
          penX += hbAdvance2 * scale * fontScale;
          continue;
        }
        const hbAdvance = g.ax || g.xAdvance || 0;
        const atlasAdvance = glyphData.advance || 0;
        if (!fontScaleDetected && hbAdvance > 1e-3 && atlasAdvance > 0) {
          fontScale = atlasAdvance / hbAdvance;
          fontScaleDetected = true;
        }
        const { planeBounds, atlasBounds } = glyphData;
        const dx = (g.dx || 0) * fontScale * scale;
        const dy = (g.dy || 0) * fontScale * scale;
        const l = planeBounds.left * scale;
        const b = planeBounds.bottom * scale;
        const r = planeBounds.right * scale;
        const t = planeBounds.top * scale;
        const x0 = penX + dx + l;
        const x1 = penX + dx + r;
        const y0 = dy + b;
        const y1 = dy + t;
        lineVerts.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0);
        const atlasWidth = atlasJson.original?.atlas?.width || atlasJson.width || 4096;
        const atlasHeight = atlasJson.original?.atlas?.height || atlasJson.height || 4096;
        const u0 = atlasBounds.left / atlasWidth;
        const u1 = atlasBounds.right / atlasWidth;
        const v0 = atlasBounds.bottom / atlasHeight;
        const v1 = atlasBounds.top / atlasHeight;
        lineUvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
        penX += hbAdvance * fontScale * scale;
      }
      const lineWidth = penX;
      const xShift = -lineWidth / 2;
      const numQuadsInLine = lineVerts.length / 12;
      for (let i = 0; i < lineVerts.length; i += 3) {
        const valX = lineVerts[i] + xShift;
        const valY = lineVerts[i + 1] + penY;
        positions.push(valX, valY, 0);
      }
      uvs.push(...lineUvs);
      for (let q = 0; q < numQuadsInLine; q++) {
        indices.push(idx, idx + 1, idx + 2, idx, idx + 2, idx + 3);
        idx += 4;
      }
      penY -= lineHeight;
    }
    if (positions.length > 0) {
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < positions.length; i += 3) {
        const vx = positions[i];
        const vy = positions[i + 1];
        if (vx < minX) minX = vx;
        if (vx > maxX) maxX = vx;
        if (vy < minY) minY = vy;
        if (vy > maxY) maxY = vy;
      }
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      let offsetX = 0;
      if (align === "left") {
        offsetX = -minX;
      } else if (align === "right") {
        offsetX = -maxX;
      } else {
        offsetX = -centerX;
      }
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] += offsetX;
        positions[i + 1] -= centerY;
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: atlasTexture },
        color: { value: new THREE.Color(color) },
        opacity: { value: 1 }
        // add range/pxRange if your atlas needs it
      },
      vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
      fragmentShader: `
      uniform sampler2D map;
      uniform vec3 color;
      uniform float opacity;
      varying vec2 vUv;

      float median(float r, float g, float b) {
        return max(min(r, g), min(max(r, g), b));
      }

      void main() {
        vec3 t = texture2D(map, vUv).rgb;
        float sigDist = median(t.r, t.g, t.b) - 0.5;
        float alpha = clamp(sigDist/fwidth(sigDist) + 0.5, 0.0, 1.0);
        gl_FragColor = vec4(color, opacity * alpha);
        if (gl_FragColor.a < 0.0001) discard;
      }
    `,
      transparent: true
    });
    const mesh = new THREE.Mesh(geom, mat);
    return mesh;
  }

  // src/TextEngine.ts
  var THREE2 = window.THREE;
  var FONT_CONFIG = {
    ar: {
      ttf: "./fonts/Cairo-Regular.ttf",
      json: "./fonts/Cairo-Regular-msdf.json",
      png: "./fonts/Cairo-Regular.png"
    },
    en: {
      ttf: "./fonts/Cairo-Regular.ttf",
      json: "./fonts/Cairo-Regular-msdf.json",
      png: "./fonts/Cairo-Regular.png"
    }
  };
  var fontsData = {
    ar: { buffer: null, atlasJson: null, texture: null },
    en: { buffer: null, atlasJson: null, texture: null }
  };
  var meshCache = /* @__PURE__ */ new Map();
  async function initTextEngine() {
    const loadFont = async (lang) => {
      const config = FONT_CONFIG[lang];
      const data = fontsData[lang];
      if (!data.buffer) {
        data.buffer = await fetch(config.ttf).then((r) => r.arrayBuffer());
      }
      if (!data.atlasJson) {
        let rawJson = await fetch(config.json).then((r) => r.json());
        data.texture = new THREE2.TextureLoader().load(config.png);
        data.atlasJson = normalizeAtlas(rawJson);
      }
    };
    await Promise.all([loadFont("ar"), loadFont("en")]);
    if (typeof window !== "undefined") {
      const hb = await loadHarfBuzzOnce();
      const repair = (lang) => {
        const data = fontsData[lang];
        if (data.buffer && data.atlasJson) {
          console.log(`Starting Atlas Repair for ${lang}...`);
          repairAtlasIndices(hb, data.buffer, data.atlasJson);
          console.log(
            `Atlas Repair Complete for ${lang}. Indices count:`,
            Object.keys(data.atlasJson.glyphsByIndex).length
          );
        }
      };
      repair("ar");
      repair("en");
    }
  }
  function repairAtlasIndices(hb, fontBuffer, atlas) {
    const blob = hb.createBlob(new Uint8Array(fontBuffer));
    const face = hb.createFace(blob, 0);
    const font = hb.createFont(face);
    const chars = atlas.original?.chars || [];
    let repairedCount = 0;
    for (const char of chars) {
      if (!char.id) continue;
      const str = String.fromCharCode(char.id);
      const buf = hb.createBuffer();
      buf.addText(str);
      hb.shape(font, buf);
      const json = buf.json(font);
      buf.destroy();
      if (json && json.length > 0) {
        const glyphId = json[0].g;
        const info = atlas.glyphsByCodepoint[char.id];
        if (info && glyphId !== 0) {
          atlas.glyphsByIndex[glyphId] = info;
          repairedCount++;
        }
      }
    }
    console.log(`Repaired ${repairedCount} glyph mappings.`);
    font.destroy();
    face.destroy();
    blob.destroy();
  }
  function normalizeAtlas(json) {
    const raw = json.glyphs || json.chars || json.charmap || json.items || [];
    let arr = Array.isArray(raw) ? raw : Object.values(raw);
    const glyphsByCodepoint = {};
    const glyphsByIndex = {};
    for (const g of arr) {
      let codepoint = null;
      if (g.char && typeof g.char === "string" && g.char.length > 0) {
        codepoint = g.char.codePointAt(0) ?? null;
      } else if (typeof g.id === "number") {
        codepoint = g.id;
      } else if (typeof g.unicode === "number") {
        codepoint = g.unicode;
      } else if (typeof g.code === "number") {
        codepoint = g.code;
      }
      if (codepoint != null) {
        const info = {
          x: g.x ?? g.xoffset ?? 0,
          y: g.y ?? g.yoffset ?? 0,
          width: g.width ?? g.w ?? 0,
          height: g.height ?? g.h ?? 0,
          xoffset: g.xoffset ?? g.xoffset ?? 0,
          yoffset: g.yoffset ?? g.yoffset ?? 0,
          xadvance: g.xadvance ?? g.advance ?? g.xadvance ?? 0,
          page: g.page ?? 0,
          index: g.index
          // Save the glyph index if available
        };
        glyphsByCodepoint[codepoint] = info;
        if (typeof g.index === "number") {
          glyphsByIndex[g.index] = info;
        }
      }
    }
    const pages = json.pages || json.pagesCount || (json.page ? [json.page] : []);
    const width = json.common?.scaleW ?? json.width ?? 512;
    const height = json.common?.scaleH ?? json.height ?? 512;
    return {
      glyphsByCodepoint,
      glyphsByIndex,
      pages,
      width,
      height,
      original: json
    };
  }
  async function createMeshCore(text, langKey, opts) {
    await initTextEngine();
    const scale = opts.scale || (langKey === "ar" ? 0.1 : 1);
    const color = opts.color !== void 0 ? opts.color : 16777215;
    const align = opts.align || "center";
    const key = `${langKey}:${text}:${scale}:${color}:${align}`;
    if (meshCache.has(key)) return meshCache.get(key).clone();
    const data = fontsData[langKey];
    if (!data.atlasJson || !data.buffer || !data.texture)
      throw new Error(`${langKey.toUpperCase()} fonts not loaded`);
    const fontSize = data.atlasJson.original?.info?.size ?? 42;
    const lines = text.split(/\r\n|\n|\r/);
    const shapingResults = await Promise.all(
      lines.map((line) => shapeArabic(data.buffer, line, fontSize))
    );
    const mesh = buildMSDFMeshFromShaping(
      shapingResults,
      data.atlasJson,
      data.texture,
      scale,
      color,
      align
    );
    meshCache.set(key, mesh);
    return mesh.clone();
  }
  async function createArabicMesh(text, opts = { scale: 1, color: 16777215 }) {
    return createMeshCore(text, "ar", opts);
  }
  async function createEnglishMesh(text, opts = { scale: 1, color: 16777215 }) {
    return createMeshCore(text, "en", opts);
  }

  // src/SmartTextSystem.ts
  async function initSmartTextSystem() {
    await initTextEngine();
    if (typeof window !== "undefined") {
      window.createArabicMesh = createArabicMesh;
      window.createEnglishMesh = createEnglishMesh;
      const AFRAME = window.AFRAME;
      if (!AFRAME) {
        console.warn("SmartTextSystem: AFRAME not found on window.");
        return;
      }
      if (!AFRAME.components["smart-text"]) {
        AFRAME.registerComponent("smart-text", {
          schema: {
            value: { type: "string" },
            lang: { default: "en" },
            font: { type: "string", default: "" },
            // Can be A-Frame font like 'roboto' or CDN URL.
            size: { default: 1 },
            color: { type: "string", default: "#ffffff" },
            align: { default: "center" }
          },
          async update(oldData) {
            if (oldData && oldData.value === this.data.value && oldData.lang === this.data.lang && oldData.font === this.data.font && oldData.size === this.data.size && oldData.color === this.data.color && oldData.align === this.data.align)
              return;
            if (this._mesh) {
              this.el.object3D.remove(this._mesh);
              this._mesh.traverse((node) => {
                if (node.geometry) node.geometry.dispose();
                if (node.material) node.material.dispose();
              });
              this._mesh = null;
            }
            if (this._textEntity) {
              this.el.removeChild(this._textEntity);
              this._textEntity = null;
            }
            if (!this.data.value) return;
            if (this.data.lang === "en" && this.data.font) {
              const textEntity = document.createElement("a-entity");
              textEntity.setAttribute("text", {
                value: this.data.value,
                font: this.data.font,
                color: this.data.color,
                align: this.data.align,
                // Convert scale to A-frame equivalent text size modifiers if needed,
                // though scaling the parent entity works just as well.
                width: this.data.size * 5
                // A-frame text width is arbitrary, tuning this to roughly match msdf output
              });
              textEntity.object3D.scale.set(this.data.size, this.data.size, this.data.size);
              this.el.appendChild(textEntity);
              this._textEntity = textEntity;
              return;
            }
            const waitForFunction = async (fnName2) => {
              if (window[fnName2]) return;
              return new Promise((resolve) => {
                const interval = setInterval(() => {
                  if (window[fnName2]) {
                    clearInterval(interval);
                    resolve();
                  }
                }, 50);
                setTimeout(() => {
                  clearInterval(interval);
                  resolve();
                }, 5e3);
              });
            };
            const fnName = this.data.lang === "ar" ? "createArabicMesh" : "createEnglishMesh";
            await waitForFunction(fnName);
            let mesh;
            try {
              const createMesh = window[fnName];
              if (createMesh) {
                mesh = await createMesh(this.data.value, {
                  scale: this.data.size,
                  color: this.data.color,
                  align: this.data.align
                });
              }
            } catch (err) {
              console.error("smart-text: create mesh failed", err);
              return;
            }
            if (!mesh) {
              return;
            }
            this._mesh = mesh;
            this.el.object3D.add(mesh);
          }
        });
        console.log("SmartTextSystem: 'smart-text' component registered.");
      }
    }
  }
  return __toCommonJS(SmartTextSystem_exports);
})();
