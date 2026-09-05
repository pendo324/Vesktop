/**
 * @type {typeof import(".")}
 */
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

function resolveNativeModule() {
    // Prefer a fresh local debug/release build (see `pnpm build`/`pnpm build:debug`)
    // so tests exercise the code that was just compiled, falling back to the
    // checked-in prebuilt used by the app itself.
    const candidates = [
        path.join(__dirname, "target/release/liblibvesktop.so"),
        path.join(__dirname, "target/debug/liblibvesktop.so"),
        path.join(__dirname, `prebuilds/vesktop-${process.arch === "arm64" ? "arm64" : "x64"}.node`)
    ];

    for (const candidate of candidates) {
        try {
            return require(candidate);
        } catch {
            continue;
        }
    }

    throw new Error(`Could not find a built libvesktop module. Tried:\n${candidates.join("\n")}`);
}

const libVesktop = resolveNativeModule();

test("getAccentColor should return a number or null", async () => {
    const color = await libVesktop.getAccentColor();
    assert.ok(color === null || typeof color === "number");
});

test("updateUnityLauncherCount should return true (success)", async () => {
    assert.strictEqual(await libVesktop.updateUnityLauncherCount(5), true);
    assert.strictEqual(await libVesktop.updateUnityLauncherCount(0), true);
    assert.strictEqual(await libVesktop.updateUnityLauncherCount(10), true);
});

test("requestBackground should return true (success)", async () => {
    assert.strictEqual(await libVesktop.requestBackground(true, ["bash"]), true);
    assert.strictEqual(await libVesktop.requestBackground(false, []), true);
});

test("GlobalShortcuts should create a session, bind a shortcut, and receive a ready event", async () => {
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Timed out waiting for GlobalShortcuts 'ready' event")), 10_000);

        const gs = new libVesktop.GlobalShortcuts(event => {
            if (event.event === "ready") {
                clearTimeout(timeout);
                gs.destroy();
                resolve();
            } else if (event.event === "fatal") {
                clearTimeout(timeout);
                reject(new Error(`GlobalShortcuts reported a fatal error: ${event.message}`));
            }
        });
    });
});
