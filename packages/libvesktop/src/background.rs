//! Requests background/autostart permission via the desktop portal,
//! matching the previous C++ `request_background()`.

use napi_derive::napi;
use zbus::zvariant::Value;
use zbus::Connection;

async fn request_background_inner(autostart: bool, commandline: Vec<String>) -> bool {
    let Ok(connection) = Connection::session().await else {
        eprintln!("[libvesktop::request_background] Failed to connect to session bus");
        return false;
    };

    let mut options = std::collections::HashMap::new();
    options.insert("autostart", Value::from(autostart));
    if !commandline.is_empty() {
        options.insert("commandline", Value::from(commandline));
    }

    connection
        .call_method(
            Some("org.freedesktop.portal.Desktop"),
            "/org/freedesktop/portal/desktop",
            Some("org.freedesktop.portal.Background"),
            "RequestBackground",
            &("", options),
        )
        .await
        .is_ok()
}

#[napi]
pub async fn request_background(autostart: bool, commandline: Vec<String>) -> bool {
    request_background_inner(autostart, commandline).await
}
