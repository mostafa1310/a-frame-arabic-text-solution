# 🌟 A-Frame Arabic & English Smart Text 

A complete, lightweight solution for accurately rendering complex text in WebAR and WebVR environments. This solves the historically difficult problem of rendering **Arabic** right-to-left (RTL) correctly with contextual shaping in A-Frame.

## ✨ Features
- **Accurate Arabic Text:** Uses HarfBuzz via WebAssembly to precisely shape Arabic text contexts and ligatures.
- **MSDF Font Rendering:** Uses Multi-Channel Signed Distance Fields for smooth, infinitely scalable text rendering in WebGL.
- **A-Frame Native:** Implemented explicitly as an A-Frame component `<a-entity smart-text="..."></a-entity>` for drop-in usage.
- **Standalone:** Avoids duplicating `THREE.js` inside the bundle heavily reducing load times.

*(Note: The custom glow code present in earlier versions has been removed to simplify and improve performance.)*

---

## 🚀 Quick Start (Testing the solution)

Because browsers enforce security restrictions against loading local `.json`, `.wasm`, and `.ttf` files over the `file://` protocol, **you must use a local HTTP server** to test the `index.html`.

### The Easiest Way:
1. Open this folder in your terminal.
2. Run a simple local server using `npx`:
   ```bash
   npx serve .
   ```
   *(Alternatively: use VSCode's "Live Server" extension, or `python -m http.server 3000`)*
3. Open `http://localhost:3000` in your web browser. You'll see the A-Frame scene render both English and Arabic text correctly!

---

## 📦 How to Integrate It Into Your Own Project

1. **Include A-Frame:** (If not already present in your `<head>`)
   ```html
   <script src="https://aframe.io/releases/1.7.1/aframe.min.js"></script>
   ```

2. **Copy the Required Files to your project:**
   Make sure you copy the `fonts/` folder, the `harfbuzz/` folder, and `aframe-smart-text.js` file into your project's public directory.

3. **Include the Bundled Script:** 
   Add this directly after A-Frame.
   ```html
   <script src="aframe-smart-text.js"></script>
   ```

4. **Initialize the Text Engine:**
   You must initialize it before rendering the scene components.
   ```html
   <script>
     window.onload = () => {
       SmartText.initSmartTextSystem();
     };
   </script>
   ```

5. **Use the Component!**
   Drop it into your A-Frame `<a-scene>`:
   ```html
   <a-entity smart-text="value: مرحبا بالعالم; lang: ar; color: #ffeb3b; size: 2; align: center;" position="0 1.5 -3"></a-entity>
   ```

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
