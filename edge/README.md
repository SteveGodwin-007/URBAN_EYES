# Urban Eyes Chennai — Raspberry Pi Edge Device

The `edge/` folder contains the **on-bus pothole detector** that runs on a
Raspberry Pi. It captures camera frames, runs YOLO detection, reads live GPS,
and POSTs detections to the Urban Eyes server (`POST /api/potholes`), which
then appears on the dashboard / map automatically.

## How it fits together

```
┌──────────────────────────────┐         ┌────────────────────────────────┐
│ Raspberry Pi (on the bus)    │  HTTP   │ Urban Eyes server (your PC or   │
│                              │ ──────▶ │ cloud)                         │
│  [CSI/USB camera]            │         │  /api/potholes  (MongoDB)       │
│  [NEO-6M GPS] ──▶ main.py    │         │  React dashboard/map/admin      │
└──────────────────────────────┘         └────────────────────────────────┘
```

- `main.py` — the detector (run this on the Pi)
- `requirements.txt` — Python dependencies
- `setup.sh` — one-shot install script for Raspberry Pi OS
- `edge.env.example` — configuration template (copy to `edge.env`)
- `urban-eyes-edge.service` — optional systemd unit for boot auto-start

## Hardware you need

| Item | Notes |
|------|-------|
| Raspberry Pi 4 or 5 (64-bit OS) | Pi 5 is ~2–3× faster; Pi 5 + NCNN ≈ 14–15 FPS |
| Raspberry Pi Camera Module 3 / v2 (CSI) **or** a USB webcam | `main.py` auto-detects: picamera2 first, OpenCV fallback |
| NEO-6M / NEO-8M GPS module (optional) | Wired to GPIO UART (`/dev/serial0`) — see wiring below |

## 1. Set up the Pi (one time)

From a terminal **on the Pi** (or over SSH), with the repo on the Pi:

```bash
cd ~/urban-eyes-chennai2/edge
chmod +x setup.sh
./setup.sh
```

This installs system packages, enables the GPIO UART, creates a Python
virtualenv (`.venv/`), installs `requirements.txt`, and creates `edge.env`.

> **Why not `cv2.VideoCapture(0)`?** Raspberry Pi OS Bookworm moved to the
> `libcamera` stack, which OpenCV's `VideoCapture` doesn't support natively.
> That's why `main.py` uses **picamera2** for CSI cameras.

## 2. Configure `edge.env`

```bash
nano edge.env
```

Key settings:

| Variable | What to set |
|----------|-------------|
| `API_ENDPOINT` | Server URL. Same-Wi-Fi dev: `http://<your-PC-LAN-IP>:3000/api/potholes`. Deployed: your public URL. |
| `BUS_ROUTE_ID` | e.g. `21G` (shown on the dashboard) |
| `BUS_ID` | e.g. `CHN-BUS-7822` |
| `MODEL_PATH` | Your pothole-trained model (see below) |
| `COORDS_OVERRIDE` | `"13.0827,80.2707"` to use fixed coords when no GPS module is attached (leave empty to use GPS) |
| `USE_CSI` | `true` = CSI camera via picamera2, `false` = force USB webcam |
| `DETECT_CLASSES_ANY` | `false` (default) = only report pothole-like classes; `true` = report every detection above the threshold |

### Model choice (important)

Generic COCO models (`yolo11n.pt`) **cannot detect potholes** — they were
trained on 80 everyday object classes. You need a **pothole-trained** model.
Options, from fastest to slowest on a Pi:

1. **NCNN** (best on ARM, ~14–15 FPS on Pi 5) — export on your PC:
   ```bash
   pip install ultralytics
   python -c "from ultralytics import YOLO; YOLO('pothole_v8n.pt').export(format='ncnn')"
   # copy the pothole_v8n_ncnn_model/ folder to the Pi
   ```
   Then set `MODEL_PATH=/home/pi/models/pothole_v8n_ncnn_model`.
2. **ONNX** (~8 FPS) — `MODEL_PATH=/home/pi/models/pothole.onnx`.
3. **PyTorch `.pt`** (~3 FPS) — fine for testing only.

If you don't have a trained model yet, the research-backed starter paths are
**YOLOv8n / YOLO11n** trained on a public pothole dataset (Roboflow "pothole"
or "pothole-segmentation" datasets). A short tutorial to train one is easy to
find with `researcher-web`; the exported NCNN model plugs straight in here.

## 3. GPS wiring (optional)

NEO-6M/8M → Pi GPIO header:

| GPS module | Pi pin |
|------------|--------|
| VCC | 5V (pin 2/4) |
| GND | GND (pin 6) |
| TX | RX / GPIO 15 (pin 10) |
| RX | TX / GPIO 14 (pin 8) *(optional)* |

`setup.sh` already enabled `enable_uart=1` and disabled the serial console.
Reboot after wiring (`sudo reboot`). The module needs a clear sky view to get
a fix — its LED blinks faster once locked.

## 4. Run the detector

```bash
cd ~/urban-eyes-chennai2/edge
source .venv/bin/activate
python main.py --verbose
```

You should see:

```
12:01:03 | INFO    | Camera initialized: picamera2 (CSI)
12:01:03 | INFO    | Model loaded: pothole_v8n_ncnn_model (1 classes)
12:01:03 | INFO    | --- POTHOLE MONITORING [BUS CHN-BUS-7822 | ROUTE 21G] ---
12:01:33 | INFO    | [!] POTHOLE conf=0.87 bbox=18240 @ (13.082700, 80.270700)
12:01:33 | INFO    | [SUCCESS] Uploaded pothole (conf=0.87) @ (13.082700, 80.270700) — id=...
```

Refresh the Urban Eyes dashboard — the new pothole appears on the map.

### Test without hardware (on any machine)

```bash
python main.py --simulate
```

This generates simulated detections and uploads them — useful to verify the
server connection before you have the hardware on the Pi.

## 5. Auto-start at boot (optional)

```bash
sudo cp urban-eyes-edge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now urban-eyes-edge
```

Edit the service file if your project path differs. Watch logs with:

```bash
journalctl -u urban-eyes-edge -f
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Camera initialized: OpenCV USB camera` when using CSI | Check ribbon cable; try `USE_CSI=true` (default). |
| `No GPS fix yet` | Module needs sky view / fix. Or set `COORDS_OVERRIDE`. |
| `Failed to reach server` | Wrong `API_ENDPOINT` or Pi not on the server's network. |
| `Failed to load model` | `MODEL_PATH` doesn't exist on the Pi — copy the exported model over. |
| Slow detection | Use NCNN (`format='ncnn'`) and `IMGSZ=320`. |
| `ultralytics is not installed` | `source .venv/bin/activate && pip install -r requirements.txt` |

## Security note

The `POST /api/potholes` endpoint accepts public writes (it's designed for
edge devices without auth). For production, protect it with a shared secret or
API key in both `server.ts` and `edge.env`. See `security_spec.md`.
