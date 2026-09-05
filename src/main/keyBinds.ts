/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2026 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, globalShortcut } from "electron";
import { IpcCommands } from "shared/IpcEvents";

import {
    bindNativeShortcuts,
    destroyNativeGlobalShortcuts,
    shouldUseNativeGlobalShortcuts
} from "./globalShortcuts/nativeGlobalShortcuts";
import { sendRendererCommand } from "./ipcCommands";
import { Settings } from "./settings";

function unregisterElectronKeyBinds() {
    if (!app.isReady()) return;
    globalShortcut.unregisterAll();
}

function registerElectronKeyBinds() {
    unregisterElectronKeyBinds();

    let success = true;

    for (const { action, enabled, key } of Settings.store.keyBinds || []) {
        if (!enabled || !key || action === "unassigned") continue;

        const registeredSuccessfully = globalShortcut.register(key, () =>
            sendRendererCommand(IpcCommands.KEY_BINDS_HANDLE, action)
        );
        success &&= registeredSuccessfully;
    }

    sendRendererCommand(IpcCommands.KEY_BINDS_SET_STATUS, success);
}

// Maps native GlobalShortcuts session shortcut IDs back to the keybind
// action they represent, so the shortcutEvent handler below can dispatch to
// the same IPC command the Electron path uses.
let nativeIdToAction = new Map<string, string>();

function onNativeShortcutEvent(event: import("libvesktop").ShortcutsEvent) {
    switch (event.event) {
        case "shortcutEvent": {
            // Only dispatch on press, matching Electron's globalShortcut
            // (which only fires on keydown, not keyup).
            if (!event.pressed || !event.id) return;
            const action = nativeIdToAction.get(event.id);
            if (action) sendRendererCommand(IpcCommands.KEY_BINDS_HANDLE, action);
            break;
        }
        case "shortcutsBound":
            sendRendererCommand(IpcCommands.KEY_BINDS_SET_STATUS, true);
            break;
        case "error":
        case "fatal":
            console.error(`[globalShortcuts] Native GlobalShortcuts ${event.event}:`, event.message);
            if (event.event === "fatal") {
                // The native session is gone; fall back to Electron for
                // future registrations rather than silently doing nothing.
                registerElectronKeyBinds();
            }
            break;
    }
}

function registerNativeKeyBinds(): boolean {
    nativeIdToAction = new Map();

    const shortcuts = (Settings.store.keyBinds || [])
        .filter(({ enabled, key, action }) => enabled && key && action !== "unassigned")
        .map(({ id, action, key }) => {
            nativeIdToAction.set(id, action);
            return { id, action, key };
        });

    return bindNativeShortcuts(shortcuts, onNativeShortcutEvent);
}

export async function registerKeyBinds() {
    await app.whenReady();

    if (shouldUseNativeGlobalShortcuts() && registerNativeKeyBinds()) {
        return;
    }

    registerElectronKeyBinds();
}

function unregisterKeyBinds() {
    unregisterElectronKeyBinds();
    destroyNativeGlobalShortcuts();
}

Settings.addChangeListener("keyBinds", registerKeyBinds);

app.on("will-quit", unregisterKeyBinds);
