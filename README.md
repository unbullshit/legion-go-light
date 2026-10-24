# legion-go-light

A [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) plugin for controlling the
**Lenovo Legion Go** joystick ring lights on SteamOS, like the lighting page in Lenovo's Legion Space app.

## Features

- Turn the stick lights on or off
- Effects: solid colour, breathing, chroma (colour cycle), rainbow
- Brightness (0–100%) and effect speed
- Colour: 9 presets plus hue and saturation sliders
- **Keep applied**: checks every 3 seconds and restores your lights if Steam, a sleep/wake
  cycle or a reboot changes them

## Requirements

- Lenovo Legion Go (original) with both controllers attached
- SteamOS with a kernel whose `hid-lenovo-go` driver exposes
  `/sys/class/leds/*:rgb:joystick_rings`
- Decky Loader v3.x

## Install

1. Download **[Legion-Go-Lights.zip](https://github.com/unbullshit/legion-go-light/raw/main/Legion-Go-Lights.zip)**.
2. In Gaming Mode: **Decky → Settings → Developer → Install plugin from ZIP file**, and pick the zip.

To build the zip yourself instead, zip the `Legion Go Lights` folder (the folder itself must be at
the top of the zip).

## How it works

- `main.py` (backend, runs as root) reads and writes the LED class attributes:
  `enabled`, `mode`, `effect`, `multi_intensity` (r g b, 0–100 each), `brightness`, `speed`.
  Settings are saved to the plugin's Decky settings directory.
- `dist/index.js` is the Quick Access panel, written by hand against Decky's globals
  (`SP_REACT`, `DFL`), so there's no build step.
- `package.json` must keep `"type": "module"`; that's how Decky decides to load the panel as an
  ES module.
