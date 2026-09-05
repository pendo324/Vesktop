#![deny(clippy::all)]

mod accent_color;
mod background;
mod global_shortcuts;
mod launcher_count;

pub use accent_color::get_accent_color;
pub use background::request_background;
pub use global_shortcuts::GlobalShortcuts;
pub use launcher_count::update_unity_launcher_count;
