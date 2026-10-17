---
name: sensifai-media-generation
description: Generates and verifies all required SENSIFAI Marketplace visual assets — 1:1 minimalist logo with verified transparent alpha channel, 16:9 photorealistic domain cover, 16:9 live platform UI screenshot (real app mockup), 16:9 landing hero photograph, and 3–4 feature card visuals. Use before and during coding whenever an app needs its visual identity, landing imagery, or platform screenshots created.
---

# SENSIFAI Media Generation — Domain-Tailored Imagery, Transparent Logo & Live UI Screenshots

## Required Visual Inventory (All Mandatory)

Every SENSIFAI Marketplace application requires these exact visual files before completion:

| File Path | Aspect & Format | Purpose & Rules |
|---|---|---|
| `media/logo.png` & `public/logo.png` | 1:1 Square PNG (`512x512`+), **100% Transparent Alpha Background** | Used in Marketplace listing AND app Navbar / Left Sidebar. Must never have a solid white box background. |
| `media/cover.png` | 16:9 PNG/JPG (`1280x720`+) | Photorealistic domain scene for Marketplace cover. **ZERO text baked in.** |
| `media/platform-mockup.png` | 16:9 PNG (`1280x720`+) | **Real desktop screenshot** of the running application's workspace/dashboard. |
| `public/images/hero.jpg` | 16:9 JPG/PNG | High-craft photorealistic hero image matching the app's domain and brand color accents. **ZERO text baked in.** |
| `public/images/feature-1.jpg` | 16:9 or 4:3 JPG/PNG | Domain-specific visual for Feature 1 card. **ZERO text baked in.** |
| `public/images/feature-2.jpg` | 16:9 or 4:3 JPG/PNG | Domain-specific visual for Feature 2 card. **ZERO text baked in.** |
| `public/images/feature-3.jpg` | 16:9 or 4:3 JPG/PNG | Domain-specific visual for Feature 3 card. **ZERO text baked in.** |
| `public/images/platform-ui.png` | 16:9 PNG (`1280x720`) | Real desktop screenshot embedded inside the landing page's browser/device frame. |

Run `node scripts/generate-media.mjs` at any time to audit which files are present or missing and to automatically sync `media/logo.png` to `public/logo.png`.

---

## Phase A — Generate Bespoke Domain Scene Images & Logo (Before or During Build)

Read `PROJECT.md` (`name`, `category`, `media_brand.primary_color`, `media_brand.style`, `media_brand.keywords`, `media_brand.visual_metaphor`).

### Art Direction Rule: Avoid Generic Office Desks!
Tailor every image prompt to the **exact physical world of the application**:
- **Healthcare / Medical / Wellness**: Clinical diagnostic glassware, macro cellular lighting, modern biometric sensors, emerald/teal ambient accents.
- **Vision / Security / Smart Mobility**: High-contrast optical lenses, architectural smart-city traffic flow, industrial robotics inspection lines, cyan laser grid lighting.
- **Creative / Video / Audio / Media**: Cinema studio color-grading suite, acoustic diffuser panels with warm studio condensers, vibrant violet/magenta rim lighting.
- **Fintech / Executive / Legal**: Architectural glass boardroom details, minimalist brushed aluminum hardware, precision sapphire/cobalt lighting.
- **EdTech / Kids / Consumer**: Tactile craft materials, warm sunlit studio textures, colorful geometric props matching `media_brand.primary_color`.

### Generation Prompt Template (Use with `image-generator` subagent or LiteLLM Image API)

```text
Generate these bespoke visual assets for "{{name}}" ({{category}} domain, primary brand color {{media_brand.primary_color}}):

1. <PROJECT_FOLDER>/media/logo.png (also copy to <PROJECT_FOLDER>/public/logo.png)
   - Aspect: 1:1 square.
   - Style: Ultra-clean modern geometric vector mark combining {{media_brand.visual_metaphor}} in {{media_brand.primary_color}} on a pure white or transparent background. Zero text or typography inside the icon.

2. <PROJECT_FOLDER>/media/cover.png
   - Aspect: 16:9 widescreen.
   - Style: Editorial commercial photography, 50mm f/1.4 shallow depth of field, subtle {{media_brand.primary_color}} lighting accent.
   - Subject: Authentic physical environment and tools representing {{media_brand.keywords}} in the {{category}} industry.
   - Constraint: Clean composition, text-free, no labels, no watermarks, no garbled UI screens.

3. <PROJECT_FOLDER>/public/images/hero.jpg
   - Aspect: 16:9 widescreen.
   - Style: High-craft cinematic hero photograph complementing the cover from a fresh angle, showcasing real-world context for "{{name}}".
   - Constraint: Clean composition, text-free, no labels, no watermarks.

4. <PROJECT_FOLDER>/public/images/feature-1.jpg, feature-2.jpg, feature-3.jpg
   - Aspect: 16:9 widescreen.
   - Subject: Three distinct close-up studio shots, each illustrating one core capability of "{{name}}" ({{media_brand.keywords}}) with consistent color grading and {{media_brand.primary_color}} highlights.
   - Constraint: Clean composition, text-free, no labels, no watermarks.
```

### Mandatory Logo Transparency Step (Programmatic Alpha Removal)
Image generators often output a solid white (`#FFFFFF`) background even when asked for transparency. Always run this one-liner (Python or Node) right after generating `media/logo.png` to strip any solid white/near-white background pixels into true alpha transparency (`0`) and copy it to `public/logo.png`:

```bash
python3 -c '
from PIL import Image
import shutil
img = Image.open("media/logo.png").convert("RGBA")
datas = img.getdata()
new_data = []
for item in datas:
    if item[0] > 240 and item[1] > 240 and item[2] > 240:
        new_data.append((255, 255, 255, 0))
    else:
        new_data.append(item)
img.putdata(new_data)
img.save("media/logo.png", "PNG")
shutil.copy("media/logo.png", "public/logo.png")
print("Verified transparent alpha channel on media/logo.png and public/logo.png")
'
```

---

## Phase B — Capture Real Platform UI Screenshots (Mandatory Post-Build Step)

Once the Next.js application is built and running on `http://localhost:3000`:

1. Navigate to the running app's **interactive workspace / dashboard view** with a rich sample preset loaded (showing charts, scorecards, gauges, and visual outputs).
2. Capture a clean **1280×720 (16:9)** desktop screenshot and save it to **both**:
   - `media/platform-mockup.png`
   - `public/images/platform-ui.png`
3. Also capture responsive verification screenshots at **1280px**, **768px**, and **375px** (verifying the desktop left sidebar and mobile bottom navigation bar) and reference them in `REVIEW.md`.
4. Run `node scripts/generate-media.mjs` to confirm all 8 visual assets pass inspection.
