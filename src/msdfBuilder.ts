// src/text/msdfBuilder.ts
/// <reference types="three" />
const THREE = (window as any).THREE;

export function buildMSDFMeshFromShaping(
  shapingResult: any,
  atlasJson: any,
  atlasTexture: any,
  scale = 1.0, // Default to 1.0, let caller handle world units
  color = 0xffffff,
  align = "center"
) {
  // Normalize input to array of lines
  const lines = Array.isArray(shapingResult) ? shapingResult : [shapingResult];

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let idx = 0;

  const fontSize = atlasJson.original?.info?.size ?? 42;
  // Use lineHeight from font metadata or fallback.
  // Common lineHeight is usually around 1.2 - 1.4 * fontSize
  // atlasJson.original.common.lineHeight is in font units
  const fontLineHeight =
    atlasJson.metrics?.lineHeight ??
    atlasJson.original?.metrics?.lineHeight ??
    atlasJson.original?.common?.lineHeight ??
    fontSize * 1.4;
  const lineHeight = fontLineHeight * scale;

  let penY = 0;

  for (const lineShaping of lines) {
    // lineShaping might be {glyphs: [...]} or just [...]
    const glyphs = lineShaping.glyphs || lineShaping;

    // Temporary storage for this line to calculate width before committing
    const lineVerts: number[] = [];
    const lineUvs: number[] = [];

    let penX = 0;

    // Access the raw glyphs array from either the direct property or the original source
    // TextEngine.normalizeAtlas puts raw JSON in .original
    const rawGlyphs = atlasJson.glyphs || atlasJson.original?.glyphs || [];

    // Auto-detect scale factor between HarfBuzz units and Atlas units (Normalized)
    // HarfBuzz might be returning units in 42px (default fontSize) or other.
    // Atlas is normalized (0..1).
    // We compute this lazily. Default to 1/42 if we can't detect.
    let fontScale = 1.0 / 42.0;
    let fontScaleDetected = false;

    for (const g of glyphs) {
      // Use HarfBuzz glyph index
      const glyphIndex = g.g;

      // Find glyph data in atlas using the correct index (not unicode)
      const glyphData = rawGlyphs.find(
        (item: any) => item.index === glyphIndex,
      );

      if (!glyphData) {
        console.warn("Missing glyph index:", glyphIndex);
        // Advance pen even if missing, using current scale guess
        penX += (g.ax || g.xAdvance || 0) * scale * fontScale;
        continue;
      }

      // We need planeBounds and atlasBounds for geometry
      // If missing planeBounds, it might be whitespace (just advance)
      if (!glyphData.planeBounds || !glyphData.atlasBounds) {
        // Update scale if possible (if both advances are known and non-zero)
        const hbAdvance = g.ax || g.xAdvance || 0;
        const atlasAdvance = glyphData.advance || 0;

        if (!fontScaleDetected && hbAdvance > 0.001 && atlasAdvance > 0) {
          fontScale = atlasAdvance / hbAdvance;
          fontScaleDetected = true;
        }

        penX += hbAdvance * scale * fontScale;
        continue;
      }

      // Update scale detection if needed
      const hbAdvance = g.ax || g.xAdvance || 0;
      const atlasAdvance = glyphData.advance || 0;
      if (!fontScaleDetected && hbAdvance > 0.001 && atlasAdvance > 0) {
        fontScale = atlasAdvance / hbAdvance;
        fontScaleDetected = true;
      }

      const { planeBounds, atlasBounds } = glyphData;

      // HarfBuzz offsets need to be scaled to Atlas units
      const dx = (g.dx || 0) * fontScale * scale;
      const dy = (g.dy || 0) * fontScale * scale;

      // 1. Calculate Vertex Positions (planeBounds are in font units -> convert to world units)
      // planeBounds relative to pen position + dx/dy
      // planeBounds.left/right/top/bottom are relative to the glyph origin
      // These are already normalized (0..1) in the JSON
      const l = planeBounds.left * scale;
      const b = planeBounds.bottom * scale;
      const r = planeBounds.right * scale;
      const t = planeBounds.top * scale;

      // Calculate quad coordinates relative to penX (and line Y=0)
      const x0 = penX + dx + l;
      const x1 = penX + dx + r;
      const y0 = dy + b;
      const y1 = dy + t;

      lineVerts.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0);

      // 2. Calculate UVs (atlasBounds are in pixels -> convert to 0..1)
      // We must use the original atlas dimensions, not the scaled ones if any
      const atlasWidth =
        atlasJson.original?.atlas?.width || atlasJson.width || 4096;
      const atlasHeight =
        atlasJson.original?.atlas?.height || atlasJson.height || 4096;

      const u0 = atlasBounds.left / atlasWidth;
      const u1 = atlasBounds.right / atlasWidth;

      // Assumes atlasBounds follow standard bottom-up GL coordinates or similar consistent mapping
      // If yOrigin is bottom (standard), v = y / height
      const v0 = atlasBounds.bottom / atlasHeight;
      const v1 = atlasBounds.top / atlasHeight;

      lineUvs.push(u0, v0, u1, v0, u1, v1, u0, v1);

      // Advance Pen
      penX += hbAdvance * fontScale * scale;
    }

    // --- ALIGNMENT: CENTER THE LINE ---
    // Calculate line width.
    // If empty line, width is 0.
    // penX is effectively the width of the line (glyph sequence).
    const lineWidth = penX;
    const xShift = -lineWidth / 2;

    // Apply line shift and commit to global arrays
    const numQuadsInLine = lineVerts.length / 12; // 4 verts * 3 components
    for (let i = 0; i < lineVerts.length; i += 3) {
      // Offset X by xShift to center line
      // Offset Y by penY (accumulated line height)
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

  // --- ALIGNMENT: OFFSET THE MESH ---
  // The mesh is built starting from penX=0 and moving right/left.
  // We need to calculate the bounding box to align it properly.
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
      positions[i + 1] -= centerY; // Always center Y for now
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
    transparent: true,
  });

  const mesh = new THREE.Mesh(geom, mat);

  return mesh;
}
