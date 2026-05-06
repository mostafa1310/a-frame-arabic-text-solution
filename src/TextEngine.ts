import { loadHarfBuzzOnce, shapeArabic } from "./harfbuzz";
import { buildMSDFMeshFromShaping } from "./msdfBuilder";
import * as THREE from "three";

const FONT_CONFIG = {
  ar: {
    regular: {
      ttf: "/fonts/Cairo/Cairo-Regular.ttf",
      json: "/fonts/Cairo/Cairo-Regular-msdf.json",
      png: "/fonts/Cairo/Cairo-Regular.png",
    },
    bold: {
      ttf: "/fonts/Cairo/Cairo-ExtraBold.ttf",
      json: "/fonts/Cairo/Cairo-ExtraBold-msdf.json",
      png: "/fonts/Cairo/Cairo-ExtraBold-msdf.png",
    },
  },
  en: {
    regular: {
      ttf: "/fonts/Arimo/Arimo-Regular.ttf",
      json: "/fonts/Arimo/Arimo-Regular-msdf.json",
      png: "/fonts/Arimo/Arimo-Regular.png",
    },
    bold: {
      ttf: "/fonts/Arimo/Arimo-Bold.ttf",
      json: "/fonts/Arimo/Arimo-Bold-msdf.json",
      png: "/fonts/Arimo/Arimo-Bold-msdf.png",
    },
  },
};

type FontVariant = "regular" | "bold";

interface FontData {
  buffer: ArrayBuffer | null;
  atlasJson: any | null;
  texture: THREE.Texture | null;
}

const fontsData: Record<"ar" | "en", Record<FontVariant, FontData>> = {
  ar: {
    regular: { buffer: null, atlasJson: null, texture: null },
    bold: { buffer: null, atlasJson: null, texture: null },
  },
  en: {
    regular: { buffer: null, atlasJson: null, texture: null },
    bold: { buffer: null, atlasJson: null, texture: null },
  },
};

const meshCache = new Map<string, THREE.Object3D>();

export async function initTextEngine() {
  const loadFont = async (lang: "ar" | "en", variant: FontVariant) => {
    const config = FONT_CONFIG[lang][variant];
    const data = fontsData[lang][variant];

    if (config.ttf && !data.buffer) {
      try {
        data.buffer = await fetch(config.ttf).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.arrayBuffer();
        });
      } catch (e) {
        console.warn(
          `Font file not found: ${config.ttf} — ${variant} variant for ${lang} will be unavailable.`,
        );
        return;
      }
    }
    if (!data.atlasJson) {
      try {
        let rawJson = await fetch(config.json).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        });

        // Ensure texture is fully loaded before continuing
        data.texture = await new Promise<THREE.Texture>((resolve, reject) => {
          new THREE.TextureLoader().load(
            config.png,
            (tex) => resolve(tex),
            undefined,
            (err) => reject(err),
          );
        });

        data.atlasJson = normalizeAtlas(rawJson);
      } catch (e) {
        console.warn(
          `Atlas files not found for ${lang} ${variant} — variant will be unavailable.`,
        );
        return;
      }
    }
  };

  await Promise.all([
    loadFont("ar", "regular"),
    loadFont("ar", "bold"),
    loadFont("en", "regular"),
    loadFont("en", "bold"),
  ]);

  if (typeof window !== "undefined") {
    await loadHarfBuzzOnce();
  }
}

function normalizeAtlas(json: any) {
  const raw = Array.isArray(json)
    ? json
    : json.glyphs || json.chars || json.charmap || json.items || [];

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
      planeBounds: g.planeBounds,
      atlasBounds: g.atlasBounds,
    };

    if (codepoint != null) {
      glyphsByCodepoint[codepoint] = info;
    }

    if (typeof g.index === "number") {
      glyphsByIndex[g.index] = info;
    }
  }

  // Detect if this atlas has unicode-based mappings or only index-based
  const hasUnicodeMappings = Object.keys(glyphsByCodepoint).length > 0;

  const pages = json.pages || json.pagesCount || (json.page ? [json.page] : []);
  const width = json.common?.scaleW ?? json.width ?? 512;
  const height = json.common?.scaleH ?? json.height ?? 512;

  return {
    glyphsByCodepoint,
    glyphsByIndex,
    hasUnicodeMappings,
    pages,
    width,
    height,
    original: json,
  };
}

export async function createArabicMesh(
  text,
  opts: any = {
    scale: 1,
    color: 0xffffff,
    weight: 0.0,
    depth: 0.0,
    bold: false,
  },
) {
  await initTextEngine();
  const scale = opts.scale || 0.1;
  const color = opts.color !== undefined ? opts.color : 0xffffff;
  const weight = Number(opts.weight !== undefined ? opts.weight : 0.0);
  const depth = Number(opts.depth !== undefined ? opts.depth : 0.0);
  const lineHeight = Number(
    opts.lineHeight !== undefined ? opts.lineHeight : 1.0,
  );
  const valign = opts.valign || "center";
  const bold = !!opts.bold;

  const align = opts.align || "center";
  const key = `ar:${text}:${scale}:${color}:${align}:${weight}:${depth}:${lineHeight}:${valign}:${bold}`;
  if (meshCache.has(key)) return meshCache.get(key)!.clone();

  // Select bold variant if requested and available, otherwise fall back to regular
  const variant: FontVariant =
    bold && fontsData.ar.bold.atlasJson ? "bold" : "regular";
  const data = fontsData.ar[variant];
  if (!data.atlasJson || !data.buffer || !data.texture)
    throw new Error("Arabic fonts not loaded");

  const fontSize = data.atlasJson.original?.info?.size ?? 42;
  const lines = text.split(/\r\n|\n|\r/);

  // Shape each line individually
  const shapingResults = await Promise.all(
    lines.map((line) => shapeArabic(data.buffer!, line, fontSize)),
  );

  const mesh = buildMSDFMeshFromShaping(
    shapingResults,
    data.atlasJson,
    data.texture,
    scale,
    color,
    align,
    opts.isGlow,
    weight,
    depth,
    lineHeight,
    valign,
  );
  meshCache.set(key, mesh);
  return mesh.clone();
}

export async function createEnglishMesh(
  text,
  opts: any = {
    scale: 1,
    color: 0xffffff,
    weight: 0.0,
    depth: 0.0,
    bold: false,
  },
) {
  await initTextEngine();
  const scale = opts.scale || 1;
  const color = opts.color !== undefined ? opts.color : 0xffffff;
  const weight = Number(opts.weight !== undefined ? opts.weight : 0.0);
  const depth = Number(opts.depth !== undefined ? opts.depth : 0.0);
  const lineHeight = Number(
    opts.lineHeight !== undefined ? opts.lineHeight : 1.0,
  );
  const valign = opts.valign || "center";
  const bold = !!opts.bold;

  const align = opts.align || "center";
  const key = `en:${text}:${scale}:${color}:${align}:${weight}:${depth}:${lineHeight}:${valign}:${bold}`;
  if (meshCache.has(key)) return meshCache.get(key)!.clone();

  // Select bold variant if requested and available, otherwise fall back to regular
  const variant: FontVariant =
    bold && fontsData.en.bold.atlasJson ? "bold" : "regular";
  const data = fontsData.en[variant];
  if (!data.atlasJson || !data.buffer || !data.texture)
    throw new Error("English fonts not loaded");

  const fontSize = data.atlasJson.original?.info?.size ?? 42;
  const lines = text.split(/\r\n|\n|\r/);

  let shapingResults: any[];

  if (data.atlasJson.hasUnicodeMappings) {
    shapingResults = lines.map((line) => {
      const glyphs: any[] = [];

      for (let i = 0; i < line.length; i++) {
        const codepoint = line.codePointAt(i);
        if (codepoint === undefined) continue;

        const glyphData = data.atlasJson.glyphsByCodepoint[codepoint];

        if (glyphData) {
          glyphs.push({
            g: glyphData.index !== undefined ? glyphData.index : codepoint,
            codepoint: codepoint,
            ax: glyphData.xadvance,
            dx: 0,
            dy: 0,
          });
        } else if (line[i] === " ") {
          const spaceData = data.atlasJson.glyphsByCodepoint[32];
          glyphs.push({
            g: spaceData?.index !== undefined ? spaceData.index : 32,
            codepoint: 32,
            ax: spaceData?.xadvance ?? fontSize * 0.3,
            dx: 0,
            dy: 0,
          });
        }
        if (codepoint > 0xffff) i++;
      }
      return { glyphs };
    });
  } else {
    // HarfBuzz path: font atlas only has glyph indices (Arimo-Bold from msdf-atlas-gen)
    // Shape with HarfBuzz to get proper glyph IDs that match the atlas indices
    shapingResults = await Promise.all(
      lines.map((line) => shapeArabic(data.buffer!, line, fontSize)),
    );
  }

  const mesh = buildMSDFMeshFromShaping(
    shapingResults,
    data.atlasJson,
    data.texture,
    scale,
    color,
    align,
    opts.isGlow,
    weight,
    depth,
    lineHeight,
    valign,
  );
  meshCache.set(key, mesh);
  return mesh.clone();
}
