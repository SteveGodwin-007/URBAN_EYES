#!/usr/bin/env python3
"""
Urban Eyes Chennai — Raspberry Pi Edge Pothole Detector
=======================================================

Real device mode (default):
    - Captures frames from a Raspberry Pi Camera (CSI) via picamera2,
      falling back to a USB webcam via OpenCV.
    - Runs YOLO (ultralytics) inference to detect potholes. Works with
      .pt, .onnx and NCNN model folders (e.g. yolo11n_ncnn_model).
    - Reads live GPS from a NEO-6M/8M module on the UART serial port.
    - POSTs each detection to the Urban Eyes server  /api/potholes.

Simulation mode (no hardware needed):
    python3 main.py --simulate

Environment variables (see edge.env.example):
    API_ENDPOINT          URL of the Urban Eyes server (default http://localhost:3000/api/potholes)
    BUS_ROUTE_ID          MTC bus route id (e.g. 21G)
    BUS_ID                Bus unit id
    MODEL_PATH            Path to YOLO model (.pt / .onnx / ncnn folder)
    CONFIDENCE_THRESHOLD  Minimum detection confidence (0.0 - 1.0)
    IMGSZ                 Inference resolution (320 or 640)
    DETECT_CLASSES        Comma-separated class keywords to report
    GPS_PORT              Serial device for GPS (default /dev/serial0)
    GPS_BAUD              GPS baud rate (default 9600)
    GPS_TIMEOUT           Seconds to wait for a GPS fix each cycle
    COORDS_OVERRIDE       "lat,lon" to use when no GPS module is attached
    SEND_IMAGE            true/false — embed the JPEG frame in the upload
    MIN_UPLOAD_INTERVAL   Min seconds between uploads to the server
    DUPLICATE_DISTANCE_M  Skip detections within this distance (meters)
    USE_CSI               true to try picamera2 first, false to force USB
    USB_CAMERA_INDEX      OpenCV index of the USB webcam (default 0)

Typical usage on the Pi:
    python3 main.py --verbose
"""

import argparse
import base64
import logging
import math
import os
import sys
import time

log = logging.getLogger("urban-eyes-edge")


# ----------------------------------------------------------------- config --


class Config:
    """Reads edge configuration from environment variables."""

    def __init__(self) -> None:
        self.api_endpoint = os.getenv("API_ENDPOINT", "http://localhost:3000/api/potholes")
        self.bus_route_id = os.getenv("BUS_ROUTE_ID", "21G")
        self.bus_id = os.getenv("BUS_ID", "CHN-BUS-7822")
        self.model_path = os.getenv("MODEL_PATH", "yolo11n.pt")
        self.confidence_threshold = float(os.getenv("CONFIDENCE_THRESHOLD", "0.60"))
        self.imgsz = int(os.getenv("IMGSZ", "320"))
        self.detect_classes = [
            c.strip().lower()
            for c in os.getenv("DETECT_CLASSES", "pothole,potholes,hole").split(",")
            if c.strip()
        ]
        self.gps_port = os.getenv("GPS_PORT", "/dev/serial0")
        self.gps_baud = int(os.getenv("GPS_BAUD", "9600"))
        self.gps_timeout = float(os.getenv("GPS_TIMEOUT", "2.0"))
        self.coords_override = None
        override = os.getenv("COORDS_OVERRIDE", "")
        if override:
            try:
                lat_s, lon_s = override.split(",")
                self.coords_override = (float(lat_s.strip()), float(lon_s.strip()))
            except ValueError:
                log.warning("COORDS_OVERRIDE '%s' is invalid, ignoring it.", override)
        self.send_image = os.getenv("SEND_IMAGE", "true").lower() in ("1", "true", "yes")
        self.min_upload_interval = float(os.getenv("MIN_UPLOAD_INTERVAL", "3"))
        self.duplicate_distance_m = float(os.getenv("DUPLICATE_DISTANCE_M", "10"))
        self.use_csi = os.getenv("USE_CSI", "true").lower() in ("1", "true", "yes")
        self.usb_camera_index = int(os.getenv("USB_CAMERA_INDEX", "0"))
        # When true, report every detection above the confidence threshold even
        # if the model has no pothole-like class names. Default (false) is
        # strict: only report detections whose class matches DETECT_CLASSES.
        self.allow_any_class = os.getenv("DETECT_CLASSES_ANY", "false").lower() in ("1", "true", "yes")


# ------------------------------------------------------------------- helpers --


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two coordinates in meters."""
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def bbox_area(xyxy) -> int:
    """Bounding-box area in pixels (used by the server for severity)."""
    x1, y1, x2, y2 = xyxy
    return max(0, int((x2 - x1) * (y2 - y1)))


def frame_to_data_url(frame, quality: int = 80, max_width: int = 640):
    """Encode a frame as a JPEG data-URL so the dashboard can show it.

    Assumes the frame is in BGR order (OpenCV convention). The image is
    downscaled to at most `max_width` pixels so the base64 payload stays
    small enough for the dashboard's 10s polling to stay snappy.
    """
    try:
        import cv2
    except ImportError:
        return None
    h, w = frame.shape[:2]
    if w > max_width:
        scale = max_width / float(w)
        frame = cv2.resize(frame, (max_width, int(h * scale)))
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        return None
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("ascii")


# --------------------------------------------------------------------- gps --


class GpsReader:
    """Reads NMEA fixes from a serial GPS module (pyserial + pynmea2)."""

    def __init__(self, port: str, baud: int, timeout: float, override=None):
        self.port = port
        self.baud = baud
        self.timeout = timeout
        self.override = override
        self._serial = None
        self._last_fix = None  # (lat, lon, timestamp)

    def _connect(self) -> bool:
        try:
            import serial
        except ImportError:
            log.error("pyserial is not installed. On the Pi run: pip install pyserial pynmea2")
            return False
        try:
            self._serial = serial.Serial(self.port, self.baud, timeout=self.timeout)
            log.info("GPS connected on %s @ %d baud", self.port, self.baud)
            return True
        except Exception as exc:
            log.error("Could not open GPS port %s: %s", self.port, exc)
            self._serial = None
            return False

    def read_fix(self):
        """Returns (latitude, longitude) or None if no fix is available."""
        if self.override is not None:
            return self.override
        # Reuse a recent fix while the module is between satellite locks.
        if self._last_fix and time.time() - self._last_fix[2] < 30:
            return (self._last_fix[0], self._last_fix[1])
        if self._serial is None and not self._connect():
            return None
        try:
            import pynmea2
        except ImportError:
            log.error("pynmea2 is not installed. On the Pi run: pip install pynmea2")
            return None
        deadline = time.time() + self.timeout
        while time.time() < deadline:
            line = self._serial.readline().decode("ascii", errors="replace").strip()
            if not line.startswith("$"):
                continue
            try:
                msg = pynmea2.parse(line)
            except pynmea2.ParseError:
                continue
            if hasattr(msg, "latitude") and hasattr(msg, "longitude"):
                if msg.latitude and msg.longitude:
                    fix = (round(float(msg.latitude), 6), round(float(msg.longitude), 6))
                    self._last_fix = (fix[0], fix[1], time.time())
                    return fix
        return None

    def close(self) -> None:
        if self._serial is not None:
            try:
                self._serial.close()
            except Exception:
                pass


# ------------------------------------------------------------------ camera --


class Camera:
    """Wraps picamera2 (CSI) with an OpenCV (USB) fallback."""

    def __init__(self, use_csi: bool, usb_index: int):
        self._picam = None
        self._cv = None
        self.source = None
        if use_csi:
            self._init_picamera()
        if self.source is None:
            self._init_usb(usb_index)

    def _init_picamera(self) -> None:
        try:
            from picamera2 import Picamera2
        except ImportError:
            log.warning("picamera2 not available; trying USB webcam.")
            return
        try:
            self._picam = Picamera2()
            # preview_configuration is the idiomatic choice for a continuous
            # capture loop; capture_array() then returns live frames.
            config = self._picam.create_preview_configuration(
                main={"size": (1280, 720), "format": "RGB888"}
            )
            self._picam.configure(config)
            self._picam.start()
            self.source = "picamera2"
            log.info("Camera initialized: picamera2 (CSI)")
        except Exception as exc:
            log.error("picamera2 init failed (%s); trying USB webcam.", exc)
            self._picam = None

    def _init_usb(self, index: int) -> None:
        try:
            import cv2
        except ImportError:
            log.error("OpenCV not available. On the Pi run: pip install opencv-python-headless")
            return
        cap = cv2.VideoCapture(index)
        if cap.isOpened():
            self._cv = cap
            self.source = "opencv"
            log.info("Camera initialized: OpenCV USB camera (index %d)", index)
        else:
            cap.release()
            log.error("Could not open USB camera (index %d).", index)

    def read(self):
        """Return a frame in BGR order (OpenCV convention) or None.

        picamera2 yields RGB888 frames; OpenCV USB cameras yield BGR. We
        normalize to BGR here so the detector and cv2.imencode always see
        the same channel order (avoids red/blue swapped dashboard images).
        """
        if self.source == "picamera2":
            frame = self._picam.capture_array()
            if frame is None:
                return None
            try:
                import cv2
                return cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
            except ImportError:
                return frame
        if self.source == "opencv":
            ok, frame = self._cv.read()
            return frame if ok else None
        return None

    def close(self) -> None:
        if self._picam is not None:
            try:
                self._picam.stop()
            except Exception:
                pass
        if self._cv is not None:
            try:
                self._cv.release()
            except Exception:
                pass


# ---------------------------------------------------------------- detector --


class Detector:
    """YOLO wrapper around ultralytics (works with .pt / .onnx / NCNN)."""

    def __init__(self, model_path: str, conf_threshold: float, imgsz: int, allow_any_class: bool = False):
        self.model = None
        self.names = {}
        self.conf_threshold = conf_threshold
        self.imgsz = imgsz
        self.allow_any_class = allow_any_class
        self._warned = False
        try:
            from ultralytics import YOLO
        except ImportError:
            log.error("ultralytics is not installed. On the Pi run: pip install ultralytics")
            return
        try:
            self.model = YOLO(model_path)
            self.names = self.model.names or {}
            log.info("Model loaded: %s (%d classes)", model_path, len(self.names))
        except Exception as exc:
            log.error("Failed to load model '%s': %s", model_path, exc)

    @property
    def available(self) -> bool:
        return self.model is not None

    def detect(self, frame):
        """Returns a list of detection dicts: {xyxy, conf, cls}."""
        if not self.available:
            return []
        results = self.model.predict(
            frame, imgsz=self.imgsz, conf=self.conf_threshold, verbose=False
        )
        detections = []
        for r in results:
            for box in r.boxes:
                detections.append(
                    {
                        "xyxy": [float(v) for v in box.xyxy[0].tolist()],
                        "conf": float(box.conf[0]),
                        "cls": int(box.cls[0]),
                    }
                )
        return detections

    def is_pothole(self, det, detect_classes) -> bool:
        """True if the detection should be reported.

        Strict by default: only detections whose class name matches one of the
        configured keywords are reported. If the model has no pothole-like
        class names at all (e.g. a custom single-class model), set
        DETECT_CLASSES_ANY=true to report everything above the threshold.
        """
        if not detect_classes:
            return True
        cls_name = (self.names.get(det["cls"]) or "").lower()
        if any(keyword in cls_name for keyword in detect_classes):
            return True
        # Opt-in fallback for custom models with unusual class names.
        if self.allow_any_class:
            if not self._warned:
                self._warned = True
                log.warning(
                    "Model classes %s do not match DETECT_CLASSES %s; "
                    "reporting all detections (DETECT_CLASSES_ANY=true).",
                    sorted(set(self.names.values())),
                    detect_classes,
                )
            return True
        if not self._warned:
            self._warned = True
            log.warning(
                "Model classes %s do not match DETECT_CLASSES %s. "
                "No detections will be reported unless DETECT_CLASSES_ANY=true "
                "or the class names match.",
                sorted(set(self.names.values())),
                detect_classes,
            )
        return False


# ------------------------------------------------------------------ upload --


def upload_detection(cfg: Config, det: dict, frame, lat: float, lon: float) -> bool:
    """POSTs a detection to the Urban Eyes server. Returns True on success/skip."""
    payload = {
        "latitude": lat,
        "longitude": lon,
        "confidence": round(float(det["conf"]), 4),
        "bboxSize": int(det.get("bbox_size", 0)),
        "busRouteId": cfg.bus_route_id,
        "busId": cfg.bus_id,
    }
    if cfg.send_image and frame is not None:
        img_url = frame_to_data_url(frame)
        if img_url:
            payload["imageUrl"] = img_url
    try:
        import requests
    except ImportError:
        log.error("requests is not installed. On the Pi run: pip install requests")
        return False
    try:
        resp = requests.post(cfg.api_endpoint, json=payload, timeout=10)
        if resp.status_code == 201:
            log.info(
                "[SUCCESS] Uploaded pothole (conf=%.2f) @ (%.6f, %.6f) — id=%s",
                det["conf"], lat, lon, resp.json().get("id"),
            )
            return True
        if resp.status_code == 200:
            log.info("[SKIP] %s", resp.json().get("message", "duplicate"))
            return True
        log.warning("[ERROR] Server responded %s", resp.status_code)
    except Exception as exc:
        log.error("[ERROR] Failed to reach server: %s", exc)
    return False


# ------------------------------------------------------------------- modes --


def run_edge(cfg: Config) -> int:
    camera = Camera(cfg.use_csi, cfg.usb_camera_index)
    if camera.source is None:
        log.error("No camera available. Plug in a CSI or USB camera, or run with --simulate.")
        return 1

    detector = Detector(
        cfg.model_path,
        cfg.confidence_threshold,
        cfg.imgsz,
        allow_any_class=cfg.allow_any_class,
    )
    if not detector.available:
        camera.close()
        return 1

    gps = GpsReader(cfg.gps_port, cfg.gps_baud, cfg.gps_timeout, cfg.coords_override)

    log.info("--- POTHOLE MONITORING [BUS %s | ROUTE %s] ---", cfg.bus_id, cfg.bus_route_id)
    log.info("Server endpoint: %s", cfg.api_endpoint)
    log.info("Press Ctrl+C to stop.")

    last_upload_at = 0.0
    last_upload_pos = None
    last_gps_warn_at = 0.0

    try:
        while True:
            frame = camera.read()
            if frame is None:
                log.warning("No frame captured; retrying in 2s.")
                time.sleep(2)
                continue

            detections = detector.detect(frame)
            for det in detections:
                if not detector.is_pothole(det, cfg.detect_classes):
                    continue
                det["bbox_size"] = bbox_area(det["xyxy"])

                now = time.time()
                if now - last_upload_at < cfg.min_upload_interval:
                    continue

                fix = gps.read_fix()
                if fix is None:
                    # Throttle this warning so tunnels/trees don't spam the log.
                    if time.time() - last_gps_warn_at > 30:
                        last_gps_warn_at = time.time()
                        log.warning("No GPS fix yet — waiting for the module to lock satellites.")
                    continue
                lat, lon = fix

                if last_upload_pos and haversine_m(lat, lon, *last_upload_pos) < cfg.duplicate_distance_m:
                    log.info("[SKIP] Detection too close to the previous upload.")
                    continue

                log.info(
                    "[!] POTHOLE conf=%.2f bbox=%d @ (%.6f, %.6f)",
                    det["conf"], det["bbox_size"], lat, lon,
                )
                if upload_detection(cfg, det, frame, lat, lon):
                    last_upload_at = now
                    last_upload_pos = (lat, lon)
    except KeyboardInterrupt:
        log.info("\n--- SHUTTING DOWN MONITOR ---")
    finally:
        camera.close()
        gps.close()
    return 0


def run_simulation(cfg: Config) -> int:
    import random

    log.info("--- SIMULATED POTHOLE MONITORING [BUS %s | ROUTE %s] ---", cfg.bus_id, cfg.bus_route_id)
    log.info("No camera or GPS required. Press Ctrl+C to stop.")
    try:
        while True:
            if random.random() < 0.1:
                conf = random.uniform(0.7, 0.95)
                det = {"conf": conf, "bbox_size": random.randint(1000, 40000)}
                lat = 13.0827 + random.uniform(-0.1, 0.1)
                lon = 80.2707 + random.uniform(-0.1, 0.1)
                log.info("[!] (SIM) POTHOLE conf=%.2f @ (%.6f, %.6f)", conf, lat, lon)
                upload_detection(cfg, det, None, lat, lon)
            time.sleep(2)
    except KeyboardInterrupt:
        log.info("\n--- SHUTTING DOWN SIMULATOR ---")
    return 0


# -------------------------------------------------------------------- main --


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Urban Eyes Chennai — Raspberry Pi edge pothole detector"
    )
    parser.add_argument(
        "--simulate",
        action="store_true",
        help="Run without hardware (simulated detections for testing)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable DEBUG logging",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s | %(levelname)-7s | %(message)s",
        datefmt="%H:%M:%S",
    )

    cfg = Config()
    if args.simulate:
        return run_simulation(cfg)
    return run_edge(cfg)


if __name__ == "__main__":
    sys.exit(main())
