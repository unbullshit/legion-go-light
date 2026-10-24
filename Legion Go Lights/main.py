import asyncio
import glob
import json
import os

import decky

# The Legion Go controller driver (hid-lenovo-go) exposes the stick rings as an
# LED class device, e.g. /sys/class/leds/go:rgb:joystick_rings.
LED_GLOB = "/sys/class/leds/*:rgb:joystick_rings"
SETTINGS_FILE = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "settings.json")
WATCH_INTERVAL = 3  # seconds between checks that the lights still match

EFFECTS = ["monocolor", "breathe", "chroma", "rainbow"]
DEFAULTS = {
    "enabled": True,
    "effect": "monocolor",
    "brightness": 60,
    "color": [0, 90, 100],  # r g b, each 0-100
    "speed": 50,
    "keep_applied": True,
}


def led_dir():
    found = sorted(glob.glob(LED_GLOB))
    return found[0] if found else None


def read_attr(d, name):
    try:
        with open(os.path.join(d, name)) as f:
            return f.read().strip()
    except OSError:
        return None


def write_attr(d, name, value):
    with open(os.path.join(d, name), "w") as f:
        f.write(str(value))


def clamp(v, lo, hi):
    return max(lo, min(hi, int(v)))


def normalize(s, base=None):
    """Validate settings; anything invalid keeps its value from base (or the defaults)."""
    base = base or DEFAULTS
    out = dict(base)
    out.update({k: v for k, v in (s or {}).items() if k in DEFAULTS})
    out["enabled"] = bool(out["enabled"])
    out["keep_applied"] = bool(out["keep_applied"])
    if out["effect"] not in EFFECTS:
        out["effect"] = base["effect"]
    out["brightness"] = clamp(out["brightness"], 0, 100)
    out["speed"] = clamp(out["speed"], 0, 100)
    c = list(out["color"])[:3] if isinstance(out["color"], (list, tuple)) else []
    out["color"] = [clamp(x, 0, 100) for x in c] if len(c) == 3 else list(base["color"])
    return out


def read_hw(d):
    color = read_attr(d, "multi_intensity")
    return {
        "enabled": read_attr(d, "enabled") == "true",
        "effect": read_attr(d, "effect"),
        "mode": read_attr(d, "mode"),
        "brightness": int(read_attr(d, "brightness") or 0),
        "color": [int(x) for x in color.split()] if color else None,
        "speed": int(read_attr(d, "speed") or 0),
    }


def matches(hw, s):
    if hw["enabled"] != s["enabled"]:
        return False
    if not s["enabled"]:
        return True
    return (hw["mode"] == "custom" and hw["effect"] == s["effect"]
            and hw["brightness"] == s["brightness"] and hw["color"] == s["color"]
            and hw["speed"] == s["speed"])


class Plugin:
    settings = dict(DEFAULTS)
    _watch_task = None
    _lock = None

    def _load(self):
        try:
            with open(SETTINGS_FILE) as f:
                self.settings = normalize(json.load(f))
        except (OSError, ValueError):
            self.settings = normalize(None)

    def _save(self):
        os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
        tmp = SETTINGS_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(self.settings, f, indent=2)
        os.replace(tmp, SETTINGS_FILE)

    def _apply_hw(self):
        d = led_dir()
        if not d:
            return False
        s = self.settings
        if not s["enabled"]:
            write_attr(d, "enabled", "false")
            return True
        write_attr(d, "enabled", "true")
        write_attr(d, "mode", "custom")
        write_attr(d, "effect", s["effect"])
        write_attr(d, "multi_intensity", " ".join(str(x) for x in s["color"]))
        write_attr(d, "speed", s["speed"])
        write_attr(d, "brightness", s["brightness"])
        return True

    async def _watch(self):
        """Reapply the saved lights whenever something else changes them
        (Steam, a controller reconnect after sleep, a reboot)."""
        while True:
            await asyncio.sleep(WATCH_INTERVAL)
            if not self.settings["keep_applied"]:
                continue
            try:
                async with self._lock:
                    d = led_dir()
                    if d and not matches(read_hw(d), self.settings):
                        decky.logger.info("Lights changed outside the plugin; reapplying")
                        self._apply_hw()
            except Exception as e:  # keep watching even if one pass fails
                decky.logger.warning(f"Watch pass failed: {e}")

    # ---- called from the frontend ----

    async def get_state(self):
        d = led_dir()
        return {
            "available": d is not None,
            "device": d,
            "settings": self.settings,
            "hardware": read_hw(d) if d else None,
        }

    async def set_settings(self, new_settings):
        async with self._lock:
            self.settings = normalize(new_settings, base=self.settings)
            self._save()
            try:
                ok = self._apply_hw()
            except OSError as e:
                decky.logger.error(f"Failed to apply lights: {e}")
                return {"ok": False, "error": str(e), "settings": self.settings}
        return {"ok": ok, "settings": self.settings}

    # ---- lifecycle ----

    async def _main(self):
        self._lock = asyncio.Lock()
        self._load()
        decky.logger.info(f"Legion Go Lights loaded; LED device: {led_dir()}")
        if self.settings["keep_applied"]:
            try:
                async with self._lock:
                    self._apply_hw()
            except OSError as e:
                decky.logger.error(f"Initial apply failed: {e}")
        self._watch_task = asyncio.get_event_loop().create_task(self._watch())

    async def _unload(self):
        if self._watch_task:
            self._watch_task.cancel()
        decky.logger.info("Legion Go Lights unloaded")

    async def _uninstall(self):
        pass
