# Third-Party Notices & Attribution

This project incorporates visual layout structures, color palettes, facility theming, 16-QR layout constants, and interoperability protocols adapted from **Arknights Mower**:

- **Project:** Arknights Mower (arknights-mower)
- **Author:** Nano & Contributors
- **Repository:** https://github.com/ArkMowers/arknights-mower
- **License:** MIT License
- **Copyright:** Copyright (c) 2021 Nano

---

## MIT License Notice

The exact license notice from the Arknights Mower source repository (`LICENSE`) is reproduced below in accordance with MIT License requirements:

```
MIT License

Copyright (c) 2021 Nano

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Architecture & Compatibility Scope

### 1. Core Main-Roster Scope (`plan1` / Active Default Plan)
The compatibility layer focuses strictly on the **main roster workbench** (`plan1` and the active default plan) and its global configuration (`conf`).
- **Facilities Model:** Covers the 18 facility cards:
  - **9 Output Rooms:** 3×3 grid of production facilities (`room_1_1` through `room_3_3`), supporting Manufacture (`manufacture`), Trading (`trading`), and Power (`power`).
  - **1 Central Control Room:** `central` (up to 5 operator slots).
  - **4 Dormitories:** `dormitory_1` to `dormitory_4` (up to 5 operator slots each, Lv.1–5).
  - **4 Functional Facilities:** Meeting Room (`meeting`), Workshop (`factory`), Office (`contact`), Training Room (`train`).
  - **3 Activity Rooms:** Reserved entries (`gaming_1` to `gaming_3`).
- **Visual Fidelity:** Reproduces Mower's 980px fixed-width canvas layout, facility card dark/light theming, facility category left-border accents, product watermarks (gold, exp3, orirock, lmd, orundum), 45px operator portraits, and drag-and-drop room swapping.

### 2. JSON & 16-QR JPG Import / Export Interchange
- **Lossless JSON Codec (`mowerJson.ts`):**
  - Reads and emits Mower's native top-level JSON structure (`default`, `plan1`, `conf`, `backup_plans`, etc.).
  - Unrecognized fields, secondary plans (`otherPlans`), and metadata are preserved losslessly inside `MowerCompatibilityEnvelope` without corruption across import/export cycles.
  - Normalizes and translates Mower product keys (`gold`, `exp3`, `orirock`, `lmd`, `orundum`).
- **16-QR JPG Codec (`mowerQrCodec.ts`, `base45.ts`, `mowerQrConstants.ts`):**
  - Strictly follows `arknights_mower/utils/qrcode.py` layout specifications: zlib level 9 compression, RFC 9285 Base45 encoding, and 16 equal data chunks without custom headers.
  - Places 16 QR codes at exact geometric coordinates: Top row (7 chunks, `y=40`), Bottom-left row (7 chunks, `y=995`), Bottom-right pair (2 chunks, `x=2520, 2751`, `y=995`).
  - Decodes images via iterative `jsQR` with canvas masking and geometric coordinate sorting (Top-to-Bottom, Left-to-Right), with **zero OCR** dependency.

### 3. Intelligent 2/3-Power-Plant Facility Level Inference
Mower plan files do not store facility levels directly; levels are deduced based on the facility layout and power plant count:
- **3 Power Plants (Typical 243 / 333 layouts):**
  - Sufficient power generation (810 kW) supports maximum facility upgrades across the base.
  - All 9 output rooms are inferred to **Lv.3**.
  - All 4 dormitories are inferred to **Lv.5**.
  - Control central is inferred to **Lv.5**.
  - Right functional facilities (`meeting`, `contact`, `factory`, `train`) are inferred to **Lv.3**.
- **2 Power Plants (Typical 252 / 342 low-power setups):**
  - Tight power budget requires stepped facility level inference:
  - All 4 dormitories are inferred to **Lv.1**.
  - Power plants are inferred to **Lv.3**.
  - Right functional facilities (`meeting`, `contact`, `factory`, `train`) remain **Lv.3**; central remains **Lv.5**.
  - Output rooms (`manufacture`, `trading`) infer levels from active operator count:
    $$\text{level} = \max(1, \min(3, \text{staffedCount} \parallel 1))$$

### 4. Pure AppConfig Adapter & Calculation Bridge
- **Untouched Calculation Engine:** The production yield engines (`src/engine/calculate.ts`, `src/engine/morale.ts`, `src/engine/operatorRules.ts`) are completely untouched and guarded by SHA-256 hash checks and deterministic equivalence baselines.
- **Pure Adapter (`compileMainPlanToAppConfig`):**
  - Compiles the Schema-v8 `RosterWorkspace` and `MowerMainPlan` into the Schema-v7 `AppConfig` format expected by `calculate()`.
  - Maps primary operator slots, converts the first replacement into `operatorBackups`, and aggregates grouped operators into `operatorGroups`.
  - Gracefully handles placeholder occupants (`Free`, `Current`, `Empty`) by filtering them out of active yield simulation.

### 5. Unsupported Subplans, Triggers & Tasks Containment
- **Excluded Dynamic Features:**
  - Secondary plans and alternate shift triggers (`backup_plans`, `TriggerDialog`, AST condition expressions).
  - Scheduled room task automation (`roomTask`, timed swap rules).
  - Continuous runtime dynamic simulation and ADB execution routines.
- **Envelope Preservation:**
  - All imported `backup_plans`, triggers, and non-main configuration entries are safely sequestered in `workspace.compatibility.backupPlans` and `unrecognizedFields`.
  - These entries are never passed into the static yield calculator, but are preserved bit-for-bit upon re-exporting JSON or JPG files, preventing any data loss for Mower users.
