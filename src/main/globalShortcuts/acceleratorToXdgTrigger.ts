/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2026 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Converts an Electron accelerator string (as produced by
// renderer/globalShortcuts/recordKeybind.ts, e.g. "Ctrl+Shift+M") into the
// XDG shortcuts spec trigger format used by the GlobalShortcuts portal's
// `preferred_trigger` (https://specifications.freedesktop.org/shortcuts-spec/latest/),
// e.g. "CTRL+SHIFT+m". Per the spec: modifiers are joined with the key by
// "+", modifiers are among CTRL/ALT/SHIFT/NUM/LOGO, and the key identifier
// is an xkbcommon keysym name (without the XKB_KEY_ prefix).
//
// This is a best-effort mapping covering the accelerator vocabulary
// recordKeybind.ts can actually produce. Keys recordKeybind.ts cannot
// produce (arbitrary Electron accelerator syntax) are not handled.

const MODIFIER_MAP: Record<string, string> = {
    Ctrl: "CTRL",
    CmdOrCtrl: "CTRL",
    CommandOrControl: "CTRL",
    Shift: "SHIFT",
    Alt: "ALT",
    Option: "ALT",
    Super: "LOGO",
    Meta: "LOGO",
    Cmd: "LOGO",
    Command: "LOGO"
};

// Electron accelerator key name -> xkbcommon keysym name. Only covers keys
// recordKeybind.ts can actually emit (see PASSTHROUGH_CODES/CODE_MAP/
// MEDIA_KEY_MAP there); anything else passes through lowercased, which is
// correct for plain letters/digits and most punctuation.
const KEY_MAP: Record<string, string> = {
    Space: "space",
    Tab: "Tab",
    Backspace: "BackSpace",
    Delete: "Delete",
    Insert: "Insert",
    Home: "Home",
    End: "End",
    PageUp: "Prior",
    PageDown: "Next",
    PrintScreen: "Print",
    Escape: "Escape",
    Return: "Return",
    Up: "Up",
    Down: "Down",
    Left: "Left",
    Right: "Right",
    Capslock: "Caps_Lock",
    Numlock: "Num_Lock",
    Scrolllock: "Scroll_Lock",
    numdec: "KP_Decimal",
    numadd: "KP_Add",
    numsub: "KP_Subtract",
    nummult: "KP_Multiply",
    numdiv: "KP_Divide",
    VolumeUp: "XF86AudioRaiseVolume",
    VolumeDown: "XF86AudioLowerVolume",
    VolumeMute: "XF86AudioMute",
    MediaNextTrack: "XF86AudioNext",
    MediaPreviousTrack: "XF86AudioPrev",
    MediaStop: "XF86AudioStop",
    MediaPlayPause: "XF86AudioPlay",
    Plus: "plus"
};

/**
 * Converts an Electron accelerator string to an XDG shortcuts spec trigger
 * string, or `null` if a part of the accelerator has no known mapping.
 */
export function acceleratorToXdgTrigger(accelerator: string): string | null {
    const parts = accelerator.split("+");
    if (parts.length === 0) return null;

    const key = parts[parts.length - 1];
    const modifiers = parts.slice(0, -1);

    const xdgModifiers: string[] = [];
    for (const modifier of modifiers) {
        const mapped = MODIFIER_MAP[modifier];
        if (!mapped) return null;
        xdgModifiers.push(mapped);
    }

    let xdgKey: string;
    if (key in KEY_MAP) {
        xdgKey = KEY_MAP[key];
    } else if (/^[0-9]$/.test(key)) {
        xdgKey = key;
    } else if (/^[A-Z]$/.test(key)) {
        // Single letters: XDG spec examples use lowercase (e.g. "CTRL+a").
        xdgKey = key.toLowerCase();
    } else if (/^F([1-9]|1\d|2[0-4])$/.test(key)) {
        xdgKey = key;
    } else if (key.length === 1) {
        // Remaining punctuation passthrough from recordKeybind.ts's
        // VALID_PUNCTUATION set; xkbcommon keysym names for ASCII
        // punctuation are the literal character itself in most cases.
        xdgKey = key;
    } else {
        return null;
    }

    return [...xdgModifiers, xdgKey].join("+");
}
