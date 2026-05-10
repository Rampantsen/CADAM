<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./public/Github-Banner-Dark.png">
    <source media="(prefers-color-scheme: light)" srcset="./public/Github-Banner-Light.png">
    <img src="./public/Github-Banner-Light.png" alt="CADAM Banner" width="100%"/>
  </picture>
</div>

<h1 align="center"> ⛮ The Open Source Text to CAD Web App ⛮ </h1>

<div align="center">

[![Stars](https://img.shields.io/github/stars/Adam-CAD/cadam?style=social&logo=github)](https://github.com/Adam-CAD/cadam/stargazers)
[![Forks](https://img.shields.io/github/forks/Adam-CAD/CADAM?style=flat)](https://github.com/Adam-CAD/CADAM/network)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg?style=flat)](https://www.gnu.org/licenses/gpl-3.0)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19.1-61DAFB.svg?style=flat&logo=react&logoColor=black)](https://reactjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-3ECF8E.svg?style=flat&logo=supabase&logoColor=white)](https://supabase.com/)
[![OpenSCAD](https://img.shields.io/badge/OpenSCAD-WASM-F9D64F.svg?style=flat)](https://openscad.org/)
[![Website](https://img.shields.io/badge/website-adam.new-blue?style=flat)](https://adam.new)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?style=flat&logo=discord&logoColor=white)](https://discord.com/invite/HKdXDqAHCs)
[![Follow Zach Dive](https://img.shields.io/badge/Follow-Zach%20Dive-1DA1F2?style=flat&logo=x&logoColor=white)](https://x.com/zachdive)
[![Follow Aaron Li](https://img.shields.io/badge/Follow-Aaron%20Li-1DA1F2?style=flat&logo=x&logoColor=white)](https://x.com/aaronhetengli)
[![Follow Dylan Anderson](https://img.shields.io/badge/Follow-tsadpbb-1DA1F2?style=flat&logo=x&logoColor=white)](https://x.com/tsadpbb)

</div>

---

## ✨ Features

- 🤖 **AI-Powered Generation** - Transform natural language and images into 3D models
- 🎛️ **Parametric Controls** - Interactive sliders for instant dimension adjustments
- 📦 **Multiple Export Formats** - Export as .STL or .SCAD files
- 🌐 **Browser-Based** - Runs entirely in your browser using WebAssembly
- 📚 **Library Support** - Includes BOSL, BOSL2, and MCAD libraries

## 🎯 Key Capabilities

| Feature                    | Description                                          |
| -------------------------- | ---------------------------------------------------- |
| **Natural Language Input** | Describe your 3D model in plain English              |
| **Image References**       | Upload images to guide model generation              |
| **Real-time Preview**      | See your model update instantly with Three.js        |
| **Parameter Extraction**   | Automatically identifies adjustable dimensions       |
| **Smart Updates**          | Efficient parameter changes without AI re-generation |
| **Custom Fonts**           | Built-in Geist font support for text in models       |

## 📸 Demo

<!-- Add demo GIFs or screenshots here -->
<!-- Example format:
![CADAM Demo](./demo/demo.gif)

### Example: Creating a parametric gear
![Gear Example](./demo/gear-example.png)
-->

> 🎬 **Try it live:** https://adam.new/cadam

## 📺 Screenshots

<img src="./public/screenshot-2.jpeg" alt="CADAM Screenshot 2" />

<details>
  <summary>More screenshots</summary>

  <br/>
  <img src="./public/screenshot-1.jpeg" alt="CADAM Screenshot 1" />
  <br/>
  <img src="./public/screenshot-3.jpeg" alt="CADAM Screenshot 3" />

</details>

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/Adam-CAD/CADAM.git
cd CADAM

# Install dependencies
npm install

# Start the local FastAPI backend and Vite frontend
npm run dev:local
```

The local FastAPI backend runs on `http://127.0.0.1:8000`; the frontend runs on
`http://localhost:6000/cadam`.

## 📋 Prerequisites

- Node.js and npm
- Python 3.11+

## 🔧 Setting Up Environment Variables

### 1. Frontend Environment:

- Copy `.env.local.template` to `.env.local`
- Update all required keys in `.env.local`:
  ```
  VITE_API_BASE_URL="http://127.0.0.1:8000"
  ```

### 2. FastAPI Backend Environment:

- Copy `backend/.env.template` to `backend/.env`
- Update provider keys as needed:

  ```
  CADAM_SECRET_KEY="<local signing secret>"
  OPENROUTER_API_KEY="<OpenRouter API Key>"
  ANTHROPIC_API_KEY="<Anthropic API Key>"
  FAL_KEY="<Fal API Key>"
  ```

  The local backend exposes an unlimited billing compatibility response, so no
  external billing service keys are required.

## 💻 Development Workflow

### Install Dependencies

```bash
npm i
```

### Start Local Services

```bash
npm run dev:local
```

## 🛠️ Built With

- **Frontend:** React 18 + TypeScript + Vite
- **3D Rendering:** Three.js + React Three Fiber
- **CAD Engine:** OpenSCAD WebAssembly
- **Backend:** FastAPI + SQLite for the local-first runtime
- **AI:** Anthropic Claude API
- **Styling:** Tailwind CSS + shadcn/ui
- **Libraries:** BOSL, BOSL2, MCAD

## 🤝 Contributing

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also [open an issue](https://github.com/Adam-CAD/CADAM/issues).

See the [CONTRIBUTING.md](CONTRIBUTING.md) for instructions and [code of conduct](CODE_OF_CONDUCT.md).

## 🙏 Credits

This app wouldn't be possible without the work of:

- [OpenSCAD](https://github.com/openscad/openscad)
- [openscad-wasm](https://github.com/openscad/openscad-wasm)
- [openscad-playground](https://github.com/openscad/openscad-playground)
- [openscad-web-gui](https://github.com/seasick/openscad-web-gui)
- [dingcad](https://github.com/yacineMTB/dingcad)

## 📄 License

This distribution is licensed under the GNU General Public License v3.0 (GPLv3). See `LICENSE`.

Components and attributions:

- Portions of this project are derived from `openscad-web-gui` (GPLv3).
- This distribution includes unmodified binaries from OpenSCAD WASM under
  GPL v2 or later; distributed here under GPLv3 as part of the combined work.
  See `src/vendor/openscad-wasm/SOURCE-OFFER.txt`.

---

<div align="center">
  
**⭐ If you find CADAM useful, please consider giving it a star!**

[![Stars](https://img.shields.io/github/stars/Adam-CAD/cadam?style=social&logo=github)](https://github.com/Adam-CAD/cadam/stargazers)

Made with 💙 for the 3D printing and CAD community

</div>
