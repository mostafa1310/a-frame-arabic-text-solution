import * as TextEngine from "./TextEngine";

declare global {
  interface Window {
    AFRAME: any;
    createArabicMesh: any;
    createEnglishMesh: any;
  }
}

/**
 * Initializes the connection between TextEngine (Arabic/English)
 * and A-Frame via a custom 'smart-text' component.
 * This function should be called after AFRAME is loaded.
 */
export async function initSmartTextSystem() {
  // 1. Initialize the Text Engine (wasm/fonts)
  await TextEngine.initTextEngine();

  // 2. Expose helpers to window for easy access in A-Frame component
  if (typeof window !== "undefined") {
    window.createArabicMesh = TextEngine.createArabicMesh;
    window.createEnglishMesh = TextEngine.createEnglishMesh;

    const AFRAME = window.AFRAME;
    if (!AFRAME) {
      console.warn("SmartTextSystem: AFRAME not found on window.");
      return;
    }

    // 3. Register the 'smart-text' component
    if (!AFRAME.components["smart-text"]) {
      AFRAME.registerComponent("smart-text", {
        schema: {
          value: { type: "string" },
          lang: { default: "en" },
          font: { type: "string", default: "" }, // Can be A-Frame font like 'roboto' or CDN URL.
          size: { default: 1 },
          color: { type: "string", default: "#ffffff" },
          align: { default: "center" },
          glow: { type: "boolean", default: false },
        },

        async update(oldData: any) {
          if (
            oldData &&
            oldData.value === this.data.value &&
            oldData.lang === this.data.lang &&
            oldData.font === this.data.font &&
            oldData.size === this.data.size &&
            oldData.color === this.data.color &&
            oldData.align === this.data.align
          )
            return;

          // Cleanup previous custom mesh
          if (this._mesh) {
            this.el.object3D.remove(this._mesh);
            this._mesh.traverse((node: any) => {
              if (node.geometry) node.geometry.dispose();
              if (node.material) node.material.dispose();
            });
            this._mesh = null;
          }

          // Cleanup previous A-Frame native text entity
          if (this._textEntity) {
            this.el.removeChild(this._textEntity);
            this._textEntity = null;
          }

          // Cleanup glow mesh if it exists (Legacy handling, now unified in _mesh)
          if (this._glowMesh) {
            this.el.object3D.remove(this._glowMesh);
            this._glowMesh.traverse((node: any) => {
              if (node.geometry) node.geometry.dispose();
              if (node.material) node.material.dispose();
            });
            this._glowMesh = null;
          }

          if (!this.data.value) return;

          // --- A-FRAME NATIVE TEXT PATH ---
          // If Language is English AND a custom A-Frame font path/name is provided
          // We bypass generating a mesh entirely and leverage the standard text component
          if (this.data.lang === "en" && this.data.font) {
            const textEntity = document.createElement("a-entity") as any;
            textEntity.setAttribute("text", {
              value: this.data.value,
              font: this.data.font,
              color: this.data.color,
              align: this.data.align,
              // Convert scale to A-frame equivalent text size modifiers if needed,
              // though scaling the parent entity works just as well.
              width: this.data.size * 5, // A-frame text width is arbitrary, tuning this to roughly match msdf output
            });
            
            // Adjust to center appropriately based on our previous sizing
            textEntity.object3D.scale.set(this.data.size, this.data.size, this.data.size);

            this.el.appendChild(textEntity);
            this._textEntity = textEntity;
            return;
          }

          // --- HARFBUZZ / CUSTOM MSDF TEXT PATH ---
          // Arabic ALWAYS uses this path. English uses it if `font` is omitted.
          const waitForFunction = async (fnName: string) => {
            if ((window as any)[fnName]) return;
            return new Promise<void>((resolve) => {
              const interval = setInterval(() => {
                if ((window as any)[fnName]) {
                  clearInterval(interval);
                  resolve();
                }
              }, 50);
              setTimeout(() => {
                clearInterval(interval);
                resolve();
              }, 5000);
            });
          };

          const fnName =
            this.data.lang === "ar" ? "createArabicMesh" : "createEnglishMesh";
          await waitForFunction(fnName);

          let mesh;
          try {
            const createMesh = (window as any)[fnName];
            if (createMesh) {
              mesh = await createMesh(this.data.value, {
                scale: this.data.size,
                color: this.data.color,
                align: this.data.align,
                isGlow: this.data.glow,
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
        },
      });
      console.log("SmartTextSystem: 'smart-text' component registered.");
    }
  }
}
