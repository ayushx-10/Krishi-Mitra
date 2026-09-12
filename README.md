# AgroVision (Krishi-Mitra) — Next-Gen Field Intelligence & Irrigation AI

> ### 🚀 LIVE APPLICATION URL:
> ## 🌐 [https://temporary-rushing-poplar-1u51d6j.vercel.app](https://temporary-rushing-poplar-1u51d6j.vercel.app)

[![Vercel Deployment](https://img.shields.io/badge/Vercel-Live--Demo-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://temporary-rushing-poplar-1u51d6j.vercel.app)
[![Tech Stack](https://img.shields.io/badge/Stack-React_18_%7C_Vite_%7C_Leaflet-61DAFB?style=for-the-badge&logo=react&logoColor=black)](#tech-stack)
[![Database](https://img.shields.io/badge/Database-Neon_PostgreSQL-00E599?style=for-the-badge&logo=postgresql&logoColor=white)](#neon-database)
[![AI Engine](https://img.shields.io/badge/AI Engine-OpenRouter_LLM-FF6467?style=for-the-badge&logo=openai&logoColor=white)](#farmer-ai-assistant)



**AgroVision (Krishi-Mitra)** is an advanced field intelligence platform that combines **physics-based crop water balance models**, **ISRIC SoilGrids v2.0 soil nutrients**, **Open-Meteo satellite weather signals**, and **OpenRouter LLM AI assistance** to help farmers make precision irrigation decisions.

---

## Key Features

- **Interactive Satellite Map & OpenStreetMap Parcel Detection**:
  - Interactive Leaflet satellite map with search, GPS location targeting, draggable location pins, and OpenStreetMap (OSM) agricultural field boundary detection.
  - 2x2 Field Coordinates Matrix calculating exact latitude/longitude bounds and field area in acres/hectares.

- **Natural Language Farmer AI Assistant (OpenRouter LLM)**:
  - Powered by **OpenRouter API** (`google/gemini-2.0-flash-lite-001`, `google/gemini-2.0-flash-exp:free`) to parse natural language farmer notes (e.g. *"Added 2 bags Urea 3 days ago and watered via canal"*).
  - Automatically calculates Nitrogen ($N_2$) fertilizer in kg N/ha, soil pH overrides, crop type, and irrigation system.
  - Includes instant zero-latency heuristic fallback parser.

- **ISRIC SoilGrids v2.0 Real-Time Soil Profile**:
  - Fetches topsoil texture, Total Nitrogen ($g/kg$), Soil pH, Cation Exchange Capacity (CEC), Clay %, Sand %, and Organic Carbon ($g/kg$) based on exact field GPS coordinates.

- **FAO-56 Physics Engine & Dual Crop Water Balance**:
  - Computes daily crop evapotranspiration ($ET_c$), root zone depletion, and yield loss sensitivity across growth stages (Initial, Crop Dev, Mid-Season, Late-Season).

- **High Confidence Irrigation Advisory Engine**:
  - Synthesizes soil water depletion and weather forecasts to recommend exact irrigation depth ($mm$), timing, and water-saving action items with High Confidence evaluation.

- **Neon PostgreSQL Database Storage**:
  - Automatically saves field analysis sessions using `@neondatabase/serverless` for persistent record-keeping.

---

## Tech Stack

- **Frontend**: React 18, Vite 8, Vanilla CSS Design System, Lucide React Icons
- **Mapping**: Leaflet JS, OpenStreetMap Nominatim API, Overpass OSM API
- **Soil & Weather Data**: ISRIC SoilGrids v2.0 REST API, Open-Meteo Historical & Forecast API
- **AI & LLM**: OpenRouter API (Gemini 2.0 Flash Lite / Llama 3.2 / Qwen 2.5)
- **Database**: Neon Serverless PostgreSQL (`@neondatabase/serverless`)
- **Deployment**: Vercel Single-Page Application (SPA)

---

## Quick Start (Local Setup)

### 1. Clone the repository
```bash
git clone https://github.com/ayushx-10/Krishi-Mitra.git
cd Krishi-Mitra
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a `.env` file in the root directory:
```env
# Neon Database Connection String
VITE_NEON_DATABASE_URL="postgresql://neondb_owner:YOUR_NEON_KEY@ep-late-sun-ax2th6if-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
DATABASE_URL="postgresql://neondb_owner:YOUR_NEON_KEY@ep-late-sun-ax2th6if-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# OpenRouter LLM API Key
VITE_OPENROUTER_API_KEY="sk-or-v1-YOUR_OPENROUTER_KEY"
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:5178](http://localhost:5178) in your browser.

### 5. Build for Production
```bash
npm run build
```

---

## Application Workflow

1. **Page 1 (Location)**: Search village/city name, tap on map, or use GPS to locate farm.
2. **Page 2 (Boundary)**: Draw plot boundary lines or detect pre-mapped OSM fields. View 2x2 coordinate matrix.
3. **Page 3 (Crop & Soil)**: State farm activities in plain text to the **Farmer AI Assistant** or use visual crop cards, visual irrigation buttons, and interactive sliders ($N_2$ fertilizer 0–150 kg/ha, pH 4.5–9.0).
4. **Page 4 (Analysis)**: Real-time physics engine simulation combining soil, weather, crop phenology, and satellite signals.
5. **Page 5 (Decision)**: High Confidence yield loss analysis, water depletion charts, and actionable advisory.

---

## License

Distributed under the MIT License. See `LICENSE` for more information.
