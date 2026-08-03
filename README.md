<div align="center">

# 🚧 Urban Eyes Chennai

**Smart city pothole monitoring & infrastructure survey system for the Greater Chennai Corporation (GCC).**

Detect potholes in real time from GPS-enabled cameras mounted on city buses, map them across Chennai, classify their severity, and track them from detection to repair.

</div>

---

## ✨ Features

- **Real-time pothole detection** — a Raspberry Pi edge device on each bus runs a YOLO model, reads live GPS, and reports detections over HTTP
- **Live geospatial dashboard** — an interactive Leaflet map of Chennai with every reported pothole
- **Automated severity classification** — potholes are graded `SMALL` / `MEDIUM` / `LARGE` from detection data
- **GCC admin workflow** — status lifecycle `DETECTED → SENT_TO_GCC → VIEWED → ACTION_TAKEN` with a full audit history
- **Analytics** — per-route and per-severity breakdowns, resolution tracking, and live stats
- **AI-assisted enrichment** — Gemini-powered analysis of detected images
- **MongoDB persistence with in-memory fallback** — the app boots and demos cleanly even when the database cluster is unreachable

## 🏗️ Architecture

```
┌───────────────────────────┐         ┌───────────────────────────────────────────┐
│ Raspberry Pi (on the bus) │  HTTP   │ Urban Eyes server                         │
│                           │ ──────▶ │  Express API  (MongoDB / memory)         │
│  CSI/USB camera           │         │  React dashboard · map · admin · stats   │
│  NEO-6M GPS → main.py     │         │  Firebase / Firestore · Gemini AI        │
└───────────────────────────┘         └───────────────────────────────────────────┘
```

| Layer | Technology |
|-------|------------|
| Frontend | React 19 · TypeScript · Vite · Tailwind CSS v4 |
| Maps | Leaflet + react-leaflet |
| Charts | Recharts |
| Server | Express (`server.ts`) |
| Database | MongoDB Atlas (with automatic in-memory fallback) |
| Realtime | Firebase Firestore |
| AI | Google Gemini (`@google/genai`) |
| Edge device | Python · YOLO (`edge/main.py`) |

## 🚀 Getting Started

**Prerequisites:** Node.js 18+

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | Google Gemini API key (required for AI analysis) |
| `APP_URL` | Public URL where the app is hosted |
| `MONGODB_USER` / `MONGODB_PASSWORD` | MongoDB Atlas credentials |
| `MONGODB_HOST` | Atlas cluster host (default: `cluster0.uotjzrt.mongodb.net`) |
| `MONGODB_DB` | Database name (default: `urban-eyes`) |

> If MongoDB is not configured or unreachable, the server logs `[MEMORY MODE]` and
> uses an in-memory store so the dashboard, map, and admin flows still work for demos.
> Data resets on restart.

### 3. Run the app

```bash
npm run dev
```

The server starts on **http://localhost:3000** — it serves the API and the Vite
frontend together.

## 🔌 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/potholes` | Report a pothole detection from an edge device (10 m duplicate clustering) |
| `GET` | `/api/potholes` | List all potholes, newest first |
| `PATCH` | `/api/potholes/:id` | Update status / remarks (GCC admin action, appends to history) |
| `GET` | `/api/stats` | Analytics: totals, per-route and per-severity counts |

### Example — report a detection

```bash
curl -X POST http://localhost:3000/api/potholes \
  -H "Content-Type: application/json" \
  -d '{
    "latitude": 13.0827,
    "longitude": 80.2707,
    "confidence": 0.87,
    "busRouteId": "21G",
    "busId": "CHN-BUS-7822",
    "bboxSize": 18240
  }'
```

## 📡 Edge Device (Raspberry Pi)

The `edge/` folder contains the on-bus detector: it captures frames, runs a
pothole-trained YOLO model (NCNN / ONNX / PyTorch), reads live GPS, and POSTs
detections to the server. See **[edge/README.md](edge/README.md)** for hardware,
setup, GPS wiring, model export, and boot auto-start instructions.

```bash
cd edge
chmod +x setup.sh && ./setup.sh     # one-shot Pi setup
source .venv/bin/activate
python main.py --verbose            # run the detector
```

No hardware yet? `python main.py --simulate` generates simulated detections to
verify the full pipeline end-to-end.

## 📁 Project Structure

```
├── server.ts                  # Express API + Vite middleware
├── src/
│   ├── components/            # Dashboard, PotholeMap, PotholeList, AdminPanel
│   ├── lib/                   # Firebase / Firestore setup & helpers
│   ├── services/              # Gemini AI integration
│   └── types.ts               # Pothole, status, severity, stats models
├── edge/                      # Raspberry Pi YOLO detector (Python)
├── firestore.rules            # Firestore security rules
├── security_spec.md           # Security spec + "Dirty Dozen" test payloads
└── public/                    # Sample pothole photos
```

## 🛡️ Security

- Secrets (`GEMINI_API_KEY`, MongoDB credentials) are read from environment variables and are **not** committed
- Firebase client config is public by design (Firebase Web apps); access is enforced by `firestore.rules`
- Server-side validation and update restrictions are specified in **[security_spec.md](security_spec.md)**, including the "Dirty Dozen" test payloads

## 📄 License

Private / internal project — see repository settings for access.
