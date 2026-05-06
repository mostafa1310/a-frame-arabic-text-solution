// src/text/msdfBuilder.ts
import * as THREE from "three";

export function buildMSDFMeshFromShaping(
  shapingResult,
  atlasJson,
  atlasTexture,
  scale = 1.0,
  color = 0xffffff,
  align = "center",
  isGlow = false,
  weight = 0.0,
  depth = 0.0,
  lineHeightScale = 1.0,
  valign = "center",
) {
  // Normalize the user-provided weight scale to safe MSDF thresholds
  weight = weight * 0.015;
  // Normalize input to array of lines
  const lines = Array.isArray(shapingResult) ? shapingResult : [shapingResult];

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let idx = 0;

  const fontSize = atlasJson.original?.info?.size ?? 42;

  const baseLineHeight = 1.4;
  const lineHeight = baseLineHeight * scale * (lineHeightScale || 1.0);

  let penY = 0;

  for (const lineShaping of lines) {
    const glyphs = lineShaping.glyphs || lineShaping;

    const lineVerts: number[] = [];
    const lineUvs: number[] = [];

    let penX = 0;
    const rawGlyphs = atlasJson.glyphs || atlasJson.original?.glyphs || [];

    let fontScale = 1.0 / 42.0;
    let fontScaleDetected = false;

    for (const g of glyphs) {
      const glyphIndex = g.g;

      const rawGlyphsArr = Array.isArray(atlasJson.original)
        ? atlasJson.original
        : atlasJson.original?.glyphs || atlasJson.original?.chars || [];

      const glyphData =
        (g.codepoint !== undefined
          ? atlasJson.glyphsByCodepoint[g.codepoint]
          : null) ||
        atlasJson.glyphsByIndex[glyphIndex] ||
        atlasJson.glyphsByCodepoint[glyphIndex] ||
        rawGlyphsArr.find(
          (item: any) =>
            item.index === glyphIndex ||
            item.id === glyphIndex ||
            item.unicode === glyphIndex,
        );

      if (!glyphData) {
        console.warn("Missing glyph index:", glyphIndex);
        penX += (g.ax || g.xAdvance || 0) * scale * fontScale;
        continue;
      }

      if (!glyphData.planeBounds || !glyphData.atlasBounds) {
        const hbAdvance = g.ax || g.xAdvance || 0;
        const atlasAdvance = glyphData.advance || glyphData.xadvance || 0;

        if (!fontScaleDetected && hbAdvance > 0.001 && atlasAdvance > 0) {
          fontScale = atlasAdvance / hbAdvance;
          fontScaleDetected = true;
        }

        penX += hbAdvance * scale * fontScale;
        continue;
      }

      const hbAdvance = g.ax || g.xAdvance || 0;
      const atlasAdvance = glyphData.advance || glyphData.xadvance || 0;
      if (!fontScaleDetected && hbAdvance > 0.001 && atlasAdvance > 0) {
        fontScale = atlasAdvance / hbAdvance;
        fontScaleDetected = true;
      }

      const { planeBounds, atlasBounds } = glyphData;

      const maxSafeExpansion = 0.045;
      const weightExpansion = Math.min(weight * 2.0, maxSafeExpansion);

      const dx = (g.dx || 0) * fontScale * scale;
      const dy = (g.dy || 0) * fontScale * scale;

      const l = (planeBounds.left - weightExpansion) * scale;
      const b = (planeBounds.bottom - weightExpansion) * scale;
      const r = (planeBounds.right + weightExpansion) * scale;
      const t = (planeBounds.top + weightExpansion) * scale;

      const x0 = penX + dx + l;
      const x1 = penX + dx + r;
      const y0 = dy + b;
      const y1 = dy + t;

      lineVerts.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0);

      // 2. Calculate UVs
      const atlasWidth =
        atlasTexture.image?.width ||
        atlasJson.original?.atlas?.width ||
        atlasJson.width ||
        4096;
      const atlasHeight =
        atlasTexture.image?.height ||
        atlasJson.original?.atlas?.height ||
        atlasJson.height ||
        4096;

      const pW =
        (weightExpansion / (planeBounds.right - planeBounds.left || 1)) *
        (atlasBounds.right - atlasBounds.left);
      const pH =
        (weightExpansion / (planeBounds.top - planeBounds.bottom || 1)) *
        (atlasBounds.top - atlasBounds.bottom);

      const u0 = (atlasBounds.left - pW) / atlasWidth;
      const u1 = (atlasBounds.right + pW) / atlasWidth;
      const v0 = (atlasBounds.bottom - pH) / atlasHeight;
      const v1 = (atlasBounds.top + pH) / atlasHeight;

      lineUvs.push(u0, v0, u1, v0, u1, v1, u0, v1);

      // Advance Pen
      penX += hbAdvance * fontScale * scale;
    }

    const lineWidth = penX;
    const xShift = -lineWidth / 2;

    const numQuadsInLine = lineVerts.length / 12; // 4 verts * 3 components
    for (let i = 0; i < lineVerts.length; i += 3) {
      const valX = lineVerts[i] + xShift;
      const valY = lineVerts[i + 1] + penY;

      positions.push(valX, valY, 0);
    }

    // Push UVs
    uvs.push(...lineUvs);

    // Push Indices
    // Each char added 4 verts.
    for (let q = 0; q < numQuadsInLine; q++) {
      indices.push(idx, idx + 1, idx + 2, idx, idx + 2, idx + 3);
      idx += 4;
    }

    // Move penY down for next line
    penY -= lineHeight;
  }

  if (positions.length > 0) {
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

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

    let offsetY = 0;
    if (valign === "top") {
      offsetY = -maxY;
    } else if (valign === "bottom") {
      offsetY = -minY;
    } else {
      offsetY = -centerY;
    }

    let offsetX = 0;
    if (align === "left") {
      offsetX = -minX; // Shift so minX becomes 0
    } else if (align === "right") {
      offsetX = -maxX; // Shift so maxX becomes 0
    } else {
      offsetX = -centerX; // Default center
    }

    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += offsetX;
      positions[i + 1] += offsetY;
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);

  // MSDF shader material (minimal)
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: atlasTexture },
      color: { value: new THREE.Color(color) },
      opacity: { value: 1.0 },
      weight: { value: weight },
      is3D: { value: depth > 0 ? 1.0 : 0.0 }, // Check if depth is active
    },
    vertexShader: `
      #include <common>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 pos = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          pos = instanceMatrix * pos;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * pos;
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec3 color;
      uniform float opacity;
      uniform float weight;
      uniform float is3D;
      varying vec2 vUv;

      float median(float r, float g, float b) {
        return max(min(r, g), min(max(r, g), b));
      }

      void main() {
        vec3 t = texture2D(map, vUv).rgb;
        
        float sigDist = median(t.r, t.g, t.b) - 0.5 + weight;
        
        float afwidth = max(fwidth(sigDist), 0.0001);
        float alpha = clamp(sigDist / afwidth + 0.5, 0.0, 1.0);
        
        if (is3D > 0.5) {
          if (alpha < 0.5) discard;
          gl_FragColor = vec4(color, 1.0);
        } else {
          gl_FragColor = vec4(color, opacity * alpha);
          if (gl_FragColor.a < 0.0001) discard;
        }
      }
    `,
    transparent: depth <= 0.0,
    depthWrite: depth > 0.0,
  });

  let mesh;
  if (depth > 0) {
    const layers = Math.max(3, Math.ceil(depth * 300));
    mesh = new THREE.InstancedMesh(geom, mat, layers);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < layers; i++) {
      dummy.position.set(0, 0, -(i / layers) * depth);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
  } else {
    mesh = new THREE.Mesh(geom, mat);
  }

  if (!isGlow) {
    return mesh;
  }

  // Create an Aura Plane matched to text size
  let w = 1.0;
  let h = 0.3 * scale;
  let cx = 0;
  let cy = 0;

  if (positions.length > 0) {
    // We already aligned vertices earlier, so we can calculate bounds directly
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
      if (positions[i] < minX) minX = positions[i];
      if (positions[i] > maxX) maxX = positions[i];
      if (positions[i + 1] < minY) minY = positions[i + 1];
      if (positions[i + 1] > maxY) maxY = positions[i + 1];
    }
    w = (maxX - minX) * 1.6; // expand width slightly past letters
    h = Math.max((maxY - minY) * 1.5, 0.4 * scale); // expand height safely
    cx = (minX + maxX) / 2;
    cy = (minY + maxY) / 2;
  }

  const auraCanvas = document.createElement("canvas");
  auraCanvas.width = 512;
  auraCanvas.height = 128;
  const ctx = auraCanvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, 512, 128);
    const cyCanvas = 64;
    ctx.save();
    ctx.lineCap = "round";

    // broad soft blue
    ctx.shadowBlur = 40;
    ctx.shadowColor = "rgba(0, 120, 255, 1)";
    ctx.lineWidth = 40;
    ctx.strokeStyle = "rgba(0, 150, 255, 0.5)";
    ctx.beginPath();
    ctx.moveTo(80, cyCanvas);
    ctx.lineTo(512 - 80, cyCanvas);
    ctx.stroke();
    ctx.stroke();

    // bright cyan core
    ctx.shadowBlur = 20;
    ctx.shadowColor = "rgba(80, 220, 255, 1)";
    ctx.lineWidth = 20;
    ctx.strokeStyle = "rgba(100, 255, 255, 0.8)";
    ctx.beginPath();
    ctx.moveTo(100, cyCanvas);
    ctx.lineTo(512 - 100, cyCanvas);
    ctx.stroke();
    ctx.restore();
  }

  const auraTex = new THREE.CanvasTexture(auraCanvas);
  const auraMat = new THREE.MeshBasicMaterial({
    map: auraTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.9,
  });

  const auraGeom = new THREE.PlaneGeometry(w, h);
  const auraMesh = new THREE.Mesh(auraGeom, auraMat);
  auraMesh.position.set(cx, cy, -0.01);

  const group = new THREE.Group();
  group.add(auraMesh);
  group.add(mesh);

  return group;
}
