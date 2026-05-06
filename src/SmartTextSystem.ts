import * as TextEngine from "./TextEngine";

declare global {
  interface Window {
    AFRAME: any;
    createArabicMesh: any;
    createEnglishMesh: any;
  }
}

export async function initSmartTextSystem() {
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
          bold: { type: "boolean", default: false },
          weight: { type: "number", default: 0.0 },
          depth: { type: "number", default: 0.0 },
          lineHeight: { type: "number", default: 1.0 },
          valign: { default: "center" },
        },

        async update(oldData: any) {
          if (
            oldData &&
            oldData.value === this.data.value &&
            oldData.lang === this.data.lang &&
            oldData.font === this.data.font &&
            oldData.size === this.data.size &&
            oldData.color === this.data.color &&
            oldData.align === this.data.align &&
            oldData.bold === this.data.bold &&
            oldData.weight === this.data.weight &&
            oldData.depth === this.data.depth &&
            oldData.lineHeight === this.data.lineHeight &&
            oldData.valign === this.data.valign
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

          // Cleanup previous A-Frame native text component
          if (this.el.hasAttribute("text")) {
            this.el.removeAttribute("text");
          }

          // Cleanup glow mesh if it exists
          if (this._glowMesh) {
            this.el.object3D.remove(this._glowMesh);
            this._glowMesh.traverse((node: any) => {
              if (node.geometry) node.geometry.dispose();
              if (node.material) node.material.dispose();
            });
            this._glowMesh = null;
          }

          if (!this.data.value) return;

          if (
            this.data.lang !== "ar" &&
            this.data.font &&
            !this.data.glow &&
            this.data.depth <= 0
          ) {
            this.el.setAttribute("text", {
              value: this.data.value,
              font: this.data.font,
              color: this.data.color,
              align: this.data.align,
              width: this.data.size * 2, // Approximate width for native text
              baseline: this.data.valign,
            });
            return;
          }

          const fnName =
            this.data.lang === "ar" ? "createArabicMesh" : "createEnglishMesh";

          let mesh;
          try {
            const createMesh = (window as any)[fnName];
            if (createMesh) {
              mesh = await createMesh(this.data.value, {
                scale: this.data.size,
                color: this.data.color,
                align: this.data.align,
                isGlow: this.data.glow,
                bold: this.data.bold,
                weight: this.data.weight,
                depth: this.data.depth,
                lineHeight: this.data.lineHeight,
                valign: this.data.valign,
              });
            }
          } catch (err) {
            console.error("smart-text: create mesh failed", err);
            return;
          }

          if (!mesh) return;

          this._mesh = mesh;
          this.el.object3D.add(mesh);
        },
      });
      console.log("SmartTextSystem: 'smart-text' component registered.");
    }
  }
}
