# 🌟 A-Frame Arabic & English Smart Text 

A complete, lightweight solution for accurately rendering complex text in WebAR and WebVR environments. This solves the historically difficult problem of rendering **Arabic** right-to-left (RTL) correctly with contextual shaping in A-Frame.

## ✨ Features
- **Accurate Arabic Text:** Uses HarfBuzz via WebAssembly to precisely shape Arabic text contexts and ligatures.
- **3D Extruded Text:** Create depth by stacking MSDF layers with the `depth` property.
- **Variable Weight:** Fine-tune text thickness with the `weight` property (independent of font file).
- **Neon Glow:** Add a dynamic aura/glow effect behind your text with the `glow: true` toggle.
- **MSDF Font Rendering:** Uses Multi-Channel Signed Distance Fields for smooth, infinitely scalable text rendering.
- **Advanced Layout:** Control `lineHeight`, `align`, and `valign` (top/center/bottom).
- **Native Fallback:** Automatically falls back to A-Frame native text for English when a standard font is provided.

---

## 🚀 Quick Start (Testing the solution)

Because browsers enforce security restrictions against loading local files, **you must use a local HTTP server**.

1. Open this folder in your terminal.
2. Run: `npx serve .`
3. Open `http://localhost:3000`. You'll see the 3D Arabic and English examples.

---

## 📦 How to Integrate It

1. **Include A-Frame & Script:**
   ```html
   <script src="https://aframe.io/releases/1.7.1/aframe.min.js"></script>
   <script src="aframe-smart-text.js"></script>
   ```

2. **Initialize:**
   ```javascript
   window.onload = () => SmartText.initSmartTextSystem();
   ```

3. **Usage Examples:**

   **Basic Arabic:**
   ```html
   <a-entity smart-text="value: مرحبا; lang: ar; size: 2;"></a-entity>
   ```

   **3D Bold Arabic with Glow:**
   ```html
   <a-entity smart-text="value: نص ثلاثي الأبعاد; lang: ar; depth: 0.2; weight: 0.5; glow: true; color: #00ffff;"></a-entity>
   ```

   **English with custom Weight:**
   ```html
   <a-entity smart-text="value: 3D MSDF Text; depth: 0.1; weight: 0.3; color: #ff00ff;"></a-entity>
   ```

### Component Properties

| Property | Default | Description |
| :--- | :--- | :--- |
| `value` | `""` | The text to display. |
| `lang` | `"en"` | `"ar"` for Arabic (HarfBuzz path) or `"en"`. |
| `size` | `1` | Font scale. |
| `color` | `"#ffffff"` | Text color. |
| `bold` | `false` | Switches to the Bold font variant if available. |
| `weight` | `0.0` | Additional MSDF weight (0.0 to 1.0). |
| `depth` | `0.0` | 3D extrusion depth. |
| `glow` | `false` | Enables the neon aura effect. |
| `lineHeight`| `1.0` | Vertical spacing between lines. |
| `align` | `"center"` | Horizontal alignment (`left`, `center`, `right`). |
| `valign` | `"center"` | Vertical alignment (`top`, `center`, `bottom`). |

---

## 💻 Developer Setup (Modifying the Code)

If you wish to modify the core Text Engine or A-Frame component behavior, the source files are inside `src/`.

1. **Required Packages:**
   Make sure you have [Node.js](https://nodejs.org/) installed on your machine.
   
2. **Install Dev Dependencies:**
   ```bash
   npm install
   ```
   *This explicitly installs `esbuild` as the lightning-fast bundler.*

3. **Edit the Code:**
   Open the `.ts` files inside the `src/` folder. The structure is meticulously separated for clarity.

4. **Rebuild the Bundle:**
   Once your modifications are done, compile it back into `aframe-smart-text.js`:
   ```bash
   npm run build
   ```

---

## 📁 File Structure Review

```text
📁 arabic-text-solution
├── 📄 aframe-smart-text.js       # The primary bundled script for production
├── 📄 index.html                 # The testing/demo scene HTML
├── 📄 package.json               # Defines the dependencies and builder script
├── 📁 fonts                      # Stores the TTF, MSDF JSON schema, and MSDF Atlas WebGL texture
├── 📁 harfbuzz                   # Stores the hb.wasm binaries and JS wrapper for true text shaping
└── 📁 src                        # Uncompiled TypeScript Source Code
    ├── SmartTextSystem.ts        # The A-Frame component registration bridge
    ├── TextEngine.ts             # Global controller to manage font caching & repairs
    ├── harfbuzz.ts               # Bootstraps WebAssembly shaping logic 
    └── msdfBuilder.ts            # Computes WebGL geometry using the shaped MSDF metrics
```

Enjoy building beautiful inclusive XR experiences!
