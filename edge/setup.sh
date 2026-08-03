#!/usr/bin/env bash
# =============================================================================
# Urban Eyes Chennai — Raspberry Pi edge device setup
#
# Run this ON THE RASPBERRY PI (Raspberry Pi OS Bookworm 64-bit recommended):
#
#   cd urban-eyes-chennai2/edge
#   chmod +x setup.sh
#   ./setup.sh
#
# What it does:
#   1. Installs system packages (Python, OpenCV libs, picamera2).
#   2. Enables the GPIO UART so a NEO-6M GPS module can be read.
#   3. Creates a Python virtualenv and installs edge/requirements.txt.
#   4. Copies edge.env.example -> edge.env for you to configure.
#
# After setup, edit edge.env (server URL, bus ID, model path), then start the
# detector with:
#   source .venv/bin/activate && python main.py
# ...or auto-start it at boot with the included systemd unit (see README).
# =============================================================================
set -euo pipefail

echo "==> [1/5] Updating system packages..."
sudo apt update
sudo apt install -y \
    python3-pip \
    python3-venv \
    python3-picamera2 \
    libatlas-base-dev \
    libopenjp2-7 \
    libhdf5-dev \
    libcblas-dev \
    libjasper-dev \
    libtiff-dev \
    libavcodec-dev \
    libavformat-dev \
    libswscale-dev \
    git

echo "==> [2/5] Enabling GPIO UART for GPS (NEO-6M/8M)..."
# Enable the UART used by /dev/serial0. Bookworm keeps this in config.txt;
# older images use /boot/config.txt.
if [ -f /boot/firmware/config.txt ]; then
    CONFIG_FILE=/boot/firmware/config.txt
else
    CONFIG_FILE=/boot/config.txt
fi
if ! grep -q "^enable_uart=1" "$CONFIG_FILE"; then
    echo "enable_uart=1" | sudo tee -a "$CONFIG_FILE" > /dev/null
fi
# Stop the serial console using the UART so GPS data isn't eaten by a login prompt.
sudo systemctl disable serial-getty@serial0.service > /dev/null 2>&1 || true

echo "==> [3/5] Creating Python virtualenv..."
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip

echo "==> [4/5] Installing Python dependencies (this can take several minutes on a Pi)..."
pip install -r requirements.txt

echo "==> [5/5] Creating edge.env from template..."
if [ ! -f edge.env ]; then
    cp edge.env.example edge.env
    echo "    Created edge.env — EDIT IT NOW with your server URL and bus details."
else
    echo "    edge.env already exists, leaving it untouched."
fi

echo ""
echo "========================================================================"
echo "Setup complete!"
echo ""
echo "Next steps:"
echo "  1. nano edge.env        <- set API_ENDPOINT, BUS_ID, MODEL_PATH"
echo "  2. sudo reboot          <- applies UART changes"
echo "  3. ./run.sh             <- start the pothole detector"
echo "  (or install the systemd service for boot auto-start — see README.md)"
echo "========================================================================"
