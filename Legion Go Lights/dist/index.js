// Legion Go Lights - Decky Loader frontend (hand-written, no build step).
// Uses the globals Decky provides: SP_REACT (React) and DFL (@decky/ui).

const manifest = {"name":"Legion Go Lights"};
const API_VERSION = 2;
const internalAPIConnection = window.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit;
if (!internalAPIConnection) {
    throw new Error('[Legion Go Lights]: Decky loader API was not initialized.');
}
let api;
try {
    api = internalAPIConnection.connect(API_VERSION, manifest.name);
}
catch {
    api = internalAPIConnection.connect(1, manifest.name);
}
const callable = api.callable;
const definePlugin = (fn) => (...args) => fn(...args);

const h = window.SP_REACT.createElement;
const { useState, useEffect, useRef } = window.SP_REACT;

const getState = callable("get_state");
const setSettings = callable("set_settings");

const EFFECTS = [
    { data: "monocolor", label: "Solid colour" },
    { data: "breathe", label: "Breathing" },
    { data: "chroma", label: "Chroma (colour cycle)" },
    { data: "rainbow", label: "Rainbow" },
];
// Colours are 0-100 per channel (the driver's scale).
const PRESETS = [
    { name: "Red", rgb: [100, 0, 0] },
    { name: "Orange", rgb: [100, 40, 0] },
    { name: "Yellow", rgb: [100, 85, 0] },
    { name: "Green", rgb: [0, 100, 0] },
    { name: "Cyan", rgb: [0, 90, 100] },
    { name: "Blue", rgb: [0, 0, 100] },
    { name: "Purple", rgb: [55, 0, 100] },
    { name: "Pink", rgb: [100, 0, 60] },
    { name: "White", rgb: [100, 100, 100] },
];

function hsvToRgb(hue, sat) {
    const s = sat / 100, c = s, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = 1 - c;
    const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x]
        : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
    return [r, g, b].map((v) => Math.round((v + m) * 100));
}

function rgbToHueSat(rgb) {
    const [r, g, b] = rgb.map((v) => v / 100);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let hue = 0;
    if (d > 0) {
        if (max === r) hue = 60 * (((g - b) / d) % 6);
        else if (max === g) hue = 60 * ((b - r) / d + 2);
        else hue = 60 * ((r - g) / d + 4);
    }
    if (hue < 0) hue += 360;
    return { hue: Math.round(hue), sat: max === 0 ? 0 : Math.round((d / max) * 100) };
}

const cssColor = (rgb) => `rgb(${rgb.map((v) => Math.round(v * 2.55)).join(",")})`;

function Swatch({ rgb, selected, onClick, name }) {
    return h(DFL.DialogButton, {
        onClick,
        "aria-label": name,
        style: {
            minWidth: "0", width: "26px", height: "26px", padding: "0", margin: "2px",
            borderRadius: "50%", background: cssColor(rgb),
            border: selected ? "3px solid white" : "2px solid rgba(255,255,255,0.25)",
        },
    });
}

function Content() {
    const [state, setState] = useState(null);
    const [error, setError] = useState(null);
    const timer = useRef(null);
    const pending = useRef({});

    useEffect(() => {
        getState().then(setState).catch((e) => setError(String(e)));
    }, []);

    if (error) {
        return h(DFL.PanelSection, null,
            h(DFL.PanelSectionRow, null, h(DFL.Field, { label: "Error", description: error })));
    }
    if (!state) {
        return h(DFL.PanelSection, null,
            h(DFL.PanelSectionRow, null, h(DFL.Field, { label: "Loading..." })));
    }
    if (!state.available) {
        return h(DFL.PanelSection, null,
            h(DFL.PanelSectionRow, null, h(DFL.Field, {
                label: "Controller lights not found",
                description: "Attach both Legion Go controllers, then reopen this panel.",
            })));
    }

    const s = state.settings;
    const { hue, sat } = rgbToHueSat(s.color);

    // Update the UI at once; send to the backend after a short pause so
    // sliders don't flood the controller with writes.
    const update = (changes) => {
        setState((prev) => ({ ...prev, settings: { ...prev.settings, ...changes } }));
        pending.current = { ...pending.current, ...changes };
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            const batch = pending.current;
            pending.current = {};
            setSettings(batch).then((res) => {
                if (res && res.ok === false) setError(res.error || "Failed to apply");
            });
        }, 150);
    };

    const colourControls = s.effect === "monocolor" || s.effect === "breathe";

    return h(window.SP_REACT.Fragment, null,
        h(DFL.PanelSection, { title: "Stick lights" },
            h(DFL.PanelSectionRow, null,
                h(DFL.ToggleField, {
                    label: "Lights",
                    checked: s.enabled,
                    onChange: (v) => update({ enabled: v }),
                })),
            s.enabled && h(DFL.PanelSectionRow, null,
                h(DFL.DropdownItem, {
                    label: "Effect",
                    rgOptions: EFFECTS,
                    selectedOption: s.effect,
                    onChange: (opt) => update({ effect: opt.data }),
                })),
            s.enabled && h(DFL.PanelSectionRow, null,
                h(DFL.SliderField, {
                    label: "Brightness",
                    value: s.brightness, min: 0, max: 100, step: 5,
                    showValue: true, valueSuffix: "%",
                    onChange: (v) => update({ brightness: v }),
                })),
            s.enabled && s.effect !== "monocolor" && h(DFL.PanelSectionRow, null,
                h(DFL.SliderField, {
                    label: "Speed",
                    value: s.speed, min: 0, max: 100, step: 5, showValue: true,
                    onChange: (v) => update({ speed: v }),
                }))),
        s.enabled && colourControls && h(DFL.PanelSection, { title: "Colour" },
            h(DFL.PanelSectionRow, null,
                h(DFL.Focusable, {
                    "flow-children": "horizontal",
                    style: { display: "flex", flexWrap: "wrap", justifyContent: "center", padding: "4px 0" },
                }, PRESETS.map((p) => h(Swatch, {
                    key: p.name, name: p.name, rgb: p.rgb,
                    selected: p.rgb.join() === s.color.join(),
                    onClick: () => update({ color: p.rgb }),
                })))),
            h(DFL.PanelSectionRow, null,
                h(DFL.SliderField, {
                    label: h("span", null, "Hue ",
                        h("span", { style: { display: "inline-block", width: "12px", height: "12px",
                            borderRadius: "50%", marginLeft: "6px", background: cssColor(s.color) } })),
                    value: hue, min: 0, max: 359, step: 1,
                    onChange: (v) => update({ color: hsvToRgb(v, sat) }),
                })),
            h(DFL.PanelSectionRow, null,
                h(DFL.SliderField, {
                    label: "Saturation",
                    description: "Lower for paler colours, 0 for white",
                    value: sat, min: 0, max: 100, step: 5, showValue: true, valueSuffix: "%",
                    onChange: (v) => update({ color: hsvToRgb(hue, v) }),
                }))),
        h(DFL.PanelSection, { title: "Options" },
            h(DFL.PanelSectionRow, null,
                h(DFL.ToggleField, {
                    label: "Keep applied",
                    description: "Reapply these lights after sleep, restarts, or when Steam changes them",
                    checked: s.keep_applied,
                    onChange: (v) => update({ keep_applied: v }),
                }))));
}

function BulbIcon() {
    return h("svg", { viewBox: "0 0 24 24", width: "1em", height: "1em", fill: "currentColor" },
        h("path", { d: "M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2zm-3 18h6v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-1z" }));
}

var index = definePlugin(() => ({
    name: "Legion Go Lights",
    titleView: h("div", { className: DFL.staticClasses.Title }, "Legion Go Lights"),
    content: h(Content, null),
    icon: h(BulbIcon, null),
    onDismount() {},
}));

export { index as default };
