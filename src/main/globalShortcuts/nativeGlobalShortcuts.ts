/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2026 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { join } from "path";
import { STATIC_DIR } from "shared/paths";

import { acceleratorToXdgTrigger } from "./acceleratorToXdgTrigger";

type LibVesktop = typeof import("libvesktop");
type ShortcutsEvent = import("libvesktop").ShortcutsEvent;

export interface NativeKeyBindSpec {
    id: string;
    action: string;
    key: string;
}

let instance: InstanceType<LibVesktop["GlobalShortcuts"]> | null = null;
let loadFailed = false;

function loadLibVesktop(): LibVesktop | null {
    if (loadFailed) return null;
    try {
        return require(join(STATIC_DIR, `dist/libvesktop-${process.arch}.node`));
    } catch (e) {
        loadFailed = true;
        console.error("[globalShortcuts] Failed to load libvesktop, falling back to Electron globalShortcut:", e);
        return null;
    }
}

/**
 * Returns whether the native GlobalShortcuts portal binding should be used
 * on this system in place of Electron's globalShortcut module. Only
 * applicable on Linux/Wayland, where we talk to the
 * org.freedesktop.portal.GlobalShortcuts portal directly instead of going
 * through Electron's globalShortcut binding.
 */
export function shouldUseNativeGlobalShortcuts(): boolean {
    return (
        process.platform === "linux" && (process.env.XDG_SESSION_TYPE === "wayland" || !!process.env.WAYLAND_DISPLAY)
    );
}

/**
 * Lazily constructs the native GlobalShortcuts session on first use. Returns
 * null if libvesktop failed to load (missing prebuilt for this arch, etc.),
 * in which case callers should fall back to Electron's globalShortcut.
 */
function getOrCreateInstance(onEvent: (event: ShortcutsEvent) => void) {
    if (instance) return instance;

    const lib = loadLibVesktop();
    if (!lib) return null;

    try {
        instance = new lib.GlobalShortcuts(onEvent);
        return instance;
    } catch (e) {
        console.error("[globalShortcuts] Failed to construct native GlobalShortcuts session:", e);
        loadFailed = true;
        return null;
    }
}

/**
 * Replaces the full bound native shortcut set. Returns false if the native
 * binding is unavailable, so callers can fall back to Electron's
 * globalShortcut.
 */
export function bindNativeShortcuts(keyBinds: NativeKeyBindSpec[], onEvent: (event: ShortcutsEvent) => void): boolean {
    const session = getOrCreateInstance(onEvent);
    if (!session) return false;

    const shortcuts = keyBinds.map(({ id, action, key }) => {
        const preferredTrigger = acceleratorToXdgTrigger(key);
        return {
            id,
            description: `Vesktop shortcut: ${action}`,
            preferredTrigger: preferredTrigger ?? undefined
        };
    });

    session.bindShortcuts(shortcuts);
    return true;
}

export function destroyNativeGlobalShortcuts() {
    instance?.destroy();
    instance = null;
}
