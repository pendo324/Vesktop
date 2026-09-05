//! Native `org.freedesktop.portal.GlobalShortcuts` binding using `ashpd`.
//!
//! This replaces Electron's `globalShortcut` module on Linux/Wayland so we
//! can talk to the portal directly instead of going through Electron's
//! binding logic, which has had bugs around session/shortcut state (e.g.
//! shortcuts silently degrading to focus-bound after relaunch instead of
//! staying truly global).
//!
//! Every `bind_shortcuts()` call here unconditionally issues a real
//! `BindShortcuts` portal call for the current session, which is the
//! sanctioned protocol path and does not force a second user-facing consent
//! prompt when the shortcut ID already has host-side consent (KDE's
//! `kglobalaccel` reuses the existing grant when the ID matches).

use ashpd::desktop::global_shortcuts::{GlobalShortcuts as PortalGlobalShortcuts, NewShortcut};
use ashpd::desktop::Session;
use futures_util::{FutureExt, StreamExt};
use napi::bindgen_prelude::{Error, Function, Result};
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;
use std::sync::Arc;

#[napi(object)]
pub struct ShortcutSpec {
    pub id: String,
    pub description: String,
    pub preferred_trigger: Option<String>,
}

#[napi(object)]
pub struct BoundShortcut {
    pub id: String,
    pub description: String,
    pub trigger_description: String,
}

/// Discriminated-union event payload delivered to the JS callback passed to
/// `GlobalShortcuts`'s constructor. The `event` field is the discriminant;
/// only the fields relevant to that event are populated. Mirrors the event
/// set PR #1290's C++ `XDPGlobalShortcuts` emitted, so JS-side dispatch can
/// follow the same shape (`switch (payload.event) { ... }`).
#[napi(object)]
pub struct ShortcutsEvent {
    pub event: String,
    pub message: Option<String>,
    pub id: Option<String>,
    pub pressed: Option<bool>,
    pub timestamp: Option<f64>,
    pub shortcuts: Option<Vec<BoundShortcut>>,
}

impl ShortcutsEvent {
    fn simple(event: &str, message: Option<String>) -> Self {
        Self {
            event: event.into(),
            message,
            id: None,
            pressed: None,
            timestamp: None,
            shortcuts: None,
        }
    }

    fn shortcut(id: String, pressed: bool, timestamp: f64) -> Self {
        Self {
            event: "shortcutEvent".into(),
            message: None,
            id: Some(id),
            pressed: Some(pressed),
            timestamp: Some(timestamp),
            shortcuts: None,
        }
    }

    fn bound(shortcuts: Vec<BoundShortcut>) -> Self {
        Self {
            event: "shortcutsBound".into(),
            message: None,
            id: None,
            pressed: None,
            timestamp: None,
            shortcuts: Some(shortcuts),
        }
    }
}

type EventChannel = ThreadsafeFunction<ShortcutsEvent, (), ShortcutsEvent, napi::Status, false>;

fn emit(callback: &EventChannel, event: ShortcutsEvent) {
    callback.call(event, ThreadsafeFunctionCallMode::NonBlocking);
}

enum Command {
    Bind(Vec<ShortcutSpec>),
    Configure,
    Shutdown,
}

#[napi]
pub struct GlobalShortcuts {
    command_tx: async_channel::Sender<Command>,
}

#[napi]
impl GlobalShortcuts {
    /// Creates a portal session and starts listening for Activated/
    /// Deactivated signals. `on_event` receives a stream of `ShortcutsEvent`
    /// objects; dispatch on the `event` field.
    #[napi(constructor)]
    pub fn new(on_event: Function<ShortcutsEvent, ()>) -> Result<Self> {
        let callback: EventChannel = on_event
            .build_threadsafe_function()
            .callee_handled::<false>()
            .build()?;
        let callback = Arc::new(callback);

        let (command_tx, command_rx) = async_channel::unbounded();

        std::thread::Builder::new()
            .name("libvesktop-global-shortcuts".into())
            .spawn(move || {
                if let Err(err) = async_io::block_on(run(callback.clone(), command_rx)) {
                    emit(
                        &callback,
                        ShortcutsEvent::simple("fatal", Some(err.to_string())),
                    );
                }
            })
            .map_err(|e| Error::from_reason(e.to_string()))?;

        Ok(Self { command_tx })
    }

    /// Replaces the full bound shortcut set. Called on every keybind
    /// settings change; semantics match Electron's
    /// `globalShortcut.unregisterAll()` + re-register-everything loop.
    #[napi]
    pub fn bind_shortcuts(&self, shortcuts: Vec<ShortcutSpec>) -> Result<()> {
        self.command_tx
            .try_send(Command::Bind(shortcuts))
            .map_err(|e| Error::from_reason(e.to_string()))
    }

    /// Shows the portal's native "configure shortcuts" UI for our session.
    #[napi]
    pub fn configure_shortcuts(&self) -> Result<()> {
        self.command_tx
            .try_send(Command::Configure)
            .map_err(|e| Error::from_reason(e.to_string()))
    }

    #[napi]
    pub fn destroy(&self) -> Result<()> {
        let _ = self.command_tx.try_send(Command::Shutdown);
        Ok(())
    }
}

async fn run(
    callback: Arc<EventChannel>,
    command_rx: async_channel::Receiver<Command>,
) -> ashpd::Result<()> {
    let portal = PortalGlobalShortcuts::new().await?;
    let session: Session<PortalGlobalShortcuts> = portal.create_session(Default::default()).await?;

    emit(&callback, ShortcutsEvent::simple("ready", None));

    let mut activated = portal.receive_activated().await?;
    let mut deactivated = portal.receive_deactivated().await?;

    loop {
        futures_util::select_biased! {
            command = command_rx.recv().fuse() => {
                match command {
                    Ok(Command::Bind(shortcuts)) => {
                        let new_shortcuts: Vec<NewShortcut> = shortcuts
                            .into_iter()
                            .map(|s| {
                                let mut shortcut = NewShortcut::new(s.id, s.description);
                                if let Some(trigger) = s.preferred_trigger {
                                    shortcut = shortcut.preferred_trigger(Some(trigger.as_str()));
                                }
                                shortcut
                            })
                            .collect();

                        match portal
                            .bind_shortcuts(&session, &new_shortcuts, None, Default::default())
                            .await
                        {
                            Ok(request) => match request.response() {
                                Ok(bound) => {
                                    let bound_shortcuts = bound
                                        .shortcuts()
                                        .iter()
                                        .map(|s| BoundShortcut {
                                            id: s.id().to_owned(),
                                            description: s.description().to_owned(),
                                            trigger_description: s.trigger_description().to_owned(),
                                        })
                                        .collect();
                                    emit(&callback, ShortcutsEvent::bound(bound_shortcuts));
                                }
                                Err(err) => emit(
                                    &callback,
                                    ShortcutsEvent::simple("error", Some(format!("BindShortcuts: {err}"))),
                                ),
                            },
                            Err(err) => emit(
                                &callback,
                                ShortcutsEvent::simple("error", Some(format!("BindShortcuts: {err}"))),
                            ),
                        }
                    }
                    Ok(Command::Configure) => {
                        if let Err(err) = portal
                            .configure_shortcuts(&session, None, Default::default())
                            .await
                        {
                            emit(
                                &callback,
                                ShortcutsEvent::simple("error", Some(format!("ConfigureShortcuts: {err}"))),
                            );
                        }
                    }
                    Ok(Command::Shutdown) | Err(_) => break,
                }
            }
            event = activated.next().fuse() => {
                if let Some(event) = event {
                    emit(
                        &callback,
                        ShortcutsEvent::shortcut(
                            event.shortcut_id().to_owned(),
                            true,
                            event.timestamp().as_millis() as f64,
                        ),
                    );
                }
            }
            event = deactivated.next().fuse() => {
                if let Some(event) = event {
                    emit(
                        &callback,
                        ShortcutsEvent::shortcut(
                            event.shortcut_id().to_owned(),
                            false,
                            event.timestamp().as_millis() as f64,
                        ),
                    );
                }
            }
        }
    }

    // `Session` closes itself on drop.
    Ok(())
}
