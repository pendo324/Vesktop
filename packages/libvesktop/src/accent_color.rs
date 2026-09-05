//! Reads the desktop portal's configured accent color, matching the
//! behavior of the previous C++ `get_accent_color()`.

use napi_derive::napi;
use zbus::zvariant::Value;
use zbus::Connection;

async fn get_accent_color_inner() -> Option<i32> {
    let connection = Connection::session().await.ok()?;

    let reply = connection
        .call_method(
            Some("org.freedesktop.portal.Desktop"),
            "/org/freedesktop/portal/desktop",
            Some("org.freedesktop.portal.Settings"),
            "Read",
            &("org.freedesktop.appearance", "accent-color"),
        )
        .await
        .ok()?;

    // The Settings.Read reply is `(v)`, and the appearance accent-color
    // value itself is a variant wrapping a (ddd) tuple. Some implementations
    // double-wrap it, so unwrap nested Value::Value layers until we hit the
    // tuple, mirroring the previous C++ implementation's unwrap loop.
    let body = reply.body();
    let mut value: Value = body.deserialize().ok()?;
    while let Value::Value(inner) = value {
        value = *inner;
    }

    let (r, g, b): (f64, f64, f64) = value.try_into().ok()?;

    let to_int = |v: f64| -> Option<i32> {
        if !v.is_finite() || !(0.0..=1.0).contains(&v) {
            return None;
        }
        Some((v * 255.0).round() as i32)
    };

    let (r, g, b) = (to_int(r)?, to_int(g)?, to_int(b)?);
    Some((r << 16) | (g << 8) | b)
}

#[napi]
pub async fn get_accent_color() -> Option<i32> {
    get_accent_color_inner().await
}
