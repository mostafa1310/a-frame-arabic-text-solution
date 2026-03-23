/// <reference types="three" />
import { loadHarfBuzzOnce, shapeArabic } from "./harfbuzz";
import { buildMSDFMeshFromShaping } from "./msdfBuilder";
const THREE = (window as any).THREE;

const FONT_CONFIG = {
  ar: {
    ttf: "./fonts/Cairo-Regular.ttf",
    json: "./fonts/Cairo-Regular-msdf.json",
    png: "./fonts/Cairo-Regular.png",
  },
  en: {
    ttf: "./fonts/Cairo-Regular.ttf",
    json: "./fonts/Cairo-Regular-msdf.json",
    png: "./fonts/Cairo-Regular.png",
  },
};

interface FontData {
  buffer: ArrayBuffer | null;
  atlasJson: any | null;
  texture: THREE.Texture | null;
}

const fontsData: Record<"ar" | "en", FontData> = {
  ar: { buffer: null, atlasJson: null, texture: null },
  en: { buffer: null, atlasJson: null, texture: null },
};

const meshCache = new Map<string, THREE.Object3D>();

export async function initTextEngine() {
  const loadFont = async (lang: "ar" | "en") => {
    const config = FONT_CONFIG[lang];
    const data = fontsData[lang];

    if (!data.buffer) {
      data.buffer = await fetch(config.ttf).then((r) => r.arrayBuffer());
    }
    if (!data.atlasJson) {
      let rawJson = await fetch(config.json).then((r) => r.json());
      data.texture = new THREE.TextureLoader().load(config.png);
      data.atlasJson = normalizeAtlas(rawJson);
    }
  };

  await Promise.all([loadFont("ar"), loadFont("en")]);

  if (typeof window !== "undefined") {
    const hb = await loadHarfBuzzOnce();

    // Fix broken indices in MSDF JSON by asking HarfBuzz for the real glyph IDs
    const repair = (lang: "ar" | "en") => {
      const data = fontsData[lang];
      if (data.buffer && data.atlasJson) {
        console.log(`Starting Atlas Repair for ${lang}...`);
        repairAtlasIndices(hb, data.buffer, data.atlasJson);
        console.log(
          `Atlas Repair Complete for ${lang}. Indices count:`,
          Object.keys(data.atlasJson.glyphsByIndex).length,
        );
      }
    };

    repair("ar");
    repair("en");
  }
}

function repairAtlasIndices(hb: any, fontBuffer: ArrayBuffer, atlas: any) {
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

function normalizeAtlas(json: any) {
  const raw = json.glyphs || json.chars || json.charmap || json.items || [];

  let arr = Array.isArray(raw) ? raw : Object.values(raw);

  const glyphsByCodepoint: Record<number, any> = {};
  const glyphsByIndex: Record<number, any> = {};

  for (const g of arr) {
    let codepoint: number | null = null;

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
        index: g.index, // Save the glyph index if available
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
    original: json,
  };
}

async function createMeshCore(
  text: string,
  langKey: "ar" | "en",
  opts: any
) {
  await initTextEngine();
  const scale = opts.scale || (langKey === "ar" ? 0.1 : 1); 
  const color = opts.color !== undefined ? opts.color : 0xffffff;
  const align = opts.align || "center";
  
  const key = `${langKey}:${text}:${scale}:${color}:${align}`;
  if (meshCache.has(key)) return meshCache.get(key)!.clone();

  const data = fontsData[langKey];
  if (!data.atlasJson || !data.buffer || !data.texture) 
    throw new Error(`${langKey.toUpperCase()} fonts not loaded`);

  const fontSize = data.atlasJson.original?.info?.size ?? 42;
  const lines = text.split(/\r\n|\n|\r/);

  // Shape each line individually using HarfBuzz
  const shapingResults = await Promise.all(
    lines.map((line) => shapeArabic(data.buffer!, line, fontSize)),
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

export async function createArabicMesh(
  text: string,
  opts: any = { scale: 1, color: 0xffffff },
) {
  return createMeshCore(text, "ar", opts);
}

export async function createEnglishMesh(
  text: string,
  opts: any = { scale: 1, color: 0xffffff },
) {
  return createMeshCore(text, "en", opts);
}
