//! Emits the Unity LauncherEntry `Update` signal, matching the previous C++
//! `update_launcher_count()`.

use napi_derive::napi;
use std::collections::HashMap;
use std::env;
use zbus::zvariant::Value;
use zbus::Connection;

async fn update_launcher_count_inner(count: i32) -> bool {
    let Ok(connection) = Connection::session().await else {
        eprintln!("[libvesktop::update_launcher_count] Failed to connect to session bus");
        return false;
    };

    let chrome_desktop = env::var("CHROME_DESKTOP").ok();
    let is_flatpak = env::var("FLATPAK_ID").is_ok();
    let desktop_id = format!(
        "application://{}",
        chrome_desktop.as_deref().unwrap_or(if is_flatpak {
            "dev.vencord.Vesktop.desktop"
        } else {
            "vesktop.desktop"
        })
    );

    let mut props: HashMap<&str, Value> = HashMap::new();
    props.insert("count", Value::from(i64::from(count)));
    props.insert("count-visible", Value::from(count != 0));

    connection
        .emit_signal(
            Option::<&str>::None,
            "/",
            "com.canonical.Unity.LauncherEntry",
            "Update",
            &(desktop_id, props),
        )
        .await
        .is_ok()
}

#[napi]
pub async fn update_unity_launcher_count(count: i32) -> bool {
    update_launcher_count_inner(count).await
}
