// src/app/text/harfbuzz.ts
// This file must run in the browser (client-side) only.
let hbModulePromise: Promise<any> | null = null;

export function loadHarfBuzzOnce() {
  if (hbModulePromise) return hbModulePromise;

  hbModulePromise = new Promise(async (resolve, reject) => {
    try {
      // Helper to load a script
      const loadScript = (src: string) => {
        return new Promise<void>((res, rej) => {
          if (document.querySelector(`script[src="${src}"]`)) {
            res();
            return;
          }
          const script = document.createElement("script");
          script.src = src;
          script.async = true;
          script.onload = () => res();
          script.onerror = (e) =>
            rej(new Error(`Failed to load script: ${src}`));
          document.head.appendChild(script);
        });
      };

      // Load both scripts (order doesn't strictly matter for defining globals, but safest to load both)
      await Promise.all([
        loadScript("./harfbuzz/hb.js"),
        loadScript("./harfbuzz/hbjs.js"),
      ]);

      // Now use them
      if (
        typeof (window as any).createHarfBuzz === "function" &&
        typeof (window as any).hbjs === "function"
      ) {
        const wasmInstance = await (window as any).createHarfBuzz();
        const hb = (window as any).hbjs(wasmInstance);
        resolve(hb);
      } else {
        reject(
          new Error(
            "HarfBuzz scripts loaded but createHarfBuzz or hbjs is missing",
          ),
        );
      }
    } catch (e) {
      reject(e);
    }
  });

  return hbModulePromise;
}

// helper: shape text
export async function shapeArabic(
  fontArrayBuffer: ArrayBuffer,
  text: string,
  fontSize: number = 42,
) {
  const hb = await loadHarfBuzzOnce();
  // API of hbjs wrapper: createBlob / createFace / createFont / createBuffer / shape
  const blob = hb.createBlob(new Uint8Array(fontArrayBuffer));
  const face = hb.createFace(blob, 0);
  const font = hb.createFont(face);
  font.setScale(fontSize, fontSize);

  const buf = hb.createBuffer();
  buf.addText(text);
  buf.guessSegmentProperties();
  // Disable advanced ligatures/alternates to stick to glyphs present in the standard atlas
  hb.shape(font, buf, "liga=0,clig=0,dlig=0,calt=0");
  const json = buf.json(font); // or buf.json()
  // cleanup (optional)
  buf.destroy();
  font.destroy();
  face.destroy();
  blob.destroy();

  return json;
}
