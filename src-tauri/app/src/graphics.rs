//! WebKitGTK graphics flags, picked from the session and the GPU before GTK
//! and WebKit start.
//!
//! On the NVIDIA proprietary driver under Wayland, WebKitGTK 2.52 turns
//! hardware acceleration off by itself (`webkit://gpu` shows the policy
//! "never"), so every frame is painted and composited by the CPU and
//! scrolling stutters. Measured in issue #66 on a GTX 1660 (driver 580, GNOME
//! 50):
//!
//! - forcing the DMA-BUF renderer alone ends in `Error 71 (Protocol error)`;
//! - with NVIDIA's explicit sync also off it renders on the GPU, but one 5
//!   minute run crashed the web process (`SkiaGPUWorker` segfault in
//!   `libnvidia-eglcore`);
//! - keeping Skia's painting on the CPU avoids that path and still composites
//!   and scrolls on the GPU at 60 fps on every screen.
//!
//! Every other configuration keeps WebKit's own choice, which already uses the
//! GPU on Mesa drivers.
//!
//! The flags must be in the environment before GTK starts, and
//! `std::env::set_var` is `unsafe` in edition 2024, so `app::run` relaunches
//! the binary with them instead (`relaunch_command`).

use std::ffi::{OsStr, OsString};
use std::fs;
use std::path::Path;
use std::process::Command;

/// An environment variable and the value it gets.
pub type Flag = (&'static str, &'static str);

/// GPU compositing with CPU painting, on the NVIDIA proprietary driver under Wayland.
pub const NVIDIA_WAYLAND_FLAGS: &[Flag] = &[
    ("WEBKIT_FORCE_DMABUF_RENDERER", "1"),
    ("__NV_DISABLE_EXPLICIT_SYNC", "1"),
    ("WEBKIT_SKIA_ENABLE_CPU_RENDERING", "1"),
];

/// Where the kernel lists the GPUs.
pub const DRM_ROOT: &str = "/sys/class/drm";

/// The display protocol GTK will use.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Session {
    Wayland,
    X11,
    Unknown,
}

/// The driver of the GPU that drives the display.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Gpu {
    /// NVIDIA's proprietary driver (`nvidia`), not `nouveau`.
    NvidiaProprietary,
    /// Any other driver (Mesa: `amdgpu`, `i915`, `xe`, `nouveau`…).
    Other,
    Unknown,
}

/// A `/sys/class/drm/cardN` entry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Card {
    pub driver: String,
    /// The firmware's boot display device (`device/boot_vga` is `1`).
    pub boot_vga: bool,
}

/// The session GTK picks: `GDK_BACKEND` first, then the session variables.
pub fn session(
    xdg_session_type: Option<&OsStr>,
    wayland_display: Option<&OsStr>,
    gdk_backend: Option<&OsStr>,
) -> Session {
    let backend = gdk_backend.and_then(OsStr::to_str).and_then(|value| value.split(',').next()).map(str::trim);
    let has_wayland = wayland_display.is_some_and(|value| !value.is_empty())
        || xdg_session_type.is_some_and(|value| value == "wayland");
    match backend {
        Some("x11") => Session::X11,
        Some("wayland") | Some("*") | Some("") | None if has_wayland => Session::Wayland,
        Some("wayland") => Session::Unknown,
        _ if xdg_session_type.is_some_and(|value| value == "x11") => Session::X11,
        _ => Session::Unknown,
    }
}

/// The display GPU: the boot display device, or the only card there is.
pub fn display_gpu(cards: &[Card]) -> Gpu {
    let card = match cards.iter().find(|card| card.boot_vga) {
        Some(card) => card,
        None if cards.len() == 1 => &cards[0],
        None => return Gpu::Unknown,
    };
    match card.driver.as_str() {
        "nvidia" => Gpu::NvidiaProprietary,
        "" => Gpu::Unknown,
        _ => Gpu::Other,
    }
}

/// The flags for a session and GPU. Empty unless the configuration needs one.
pub fn flags(session: Session, gpu: Gpu) -> &'static [Flag] {
    match (session, gpu) {
        (Session::Wayland, Gpu::NvidiaProprietary) => NVIDIA_WAYLAND_FLAGS,
        _ => &[],
    }
}

/// The flags not set yet. A variable the user already set, to any value, is
/// left alone, which also stops a relaunched process from relaunching again.
pub fn missing(flags: &[Flag], env: impl Fn(&str) -> Option<OsString>) -> Vec<Flag> {
    flags.iter().copied().filter(|(name, _)| env(name).is_none()).collect()
}

/// The `cardN` entries under `root` (connectors such as `card1-DP-1` are skipped).
pub fn read_cards(root: &Path) -> Vec<Card> {
    let Ok(entries) = fs::read_dir(root) else { return Vec::new() };
    let mut cards: Vec<(String, Card)> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_str()?.to_owned();
            let index = name.strip_prefix("card")?;
            if index.is_empty() || !index.bytes().all(|byte| byte.is_ascii_digit()) {
                return None;
            }
            let device = entry.path().join("device");
            let driver = fs::read_link(device.join("driver"))
                .ok()
                .and_then(|path| path.file_name().and_then(OsStr::to_str).map(str::to_owned))
                .unwrap_or_default();
            let boot_vga = fs::read_to_string(device.join("boot_vga")).is_ok_and(|value| value.trim() == "1");
            Some((name, Card { driver, boot_vga }))
        })
        .collect();
    cards.sort_by(|a, b| a.0.cmp(&b.0));
    cards.into_iter().map(|(_, card)| card).collect()
}

/// The current process again, with the same arguments and the missing flags.
pub fn relaunch_command(exe: &Path, args: impl IntoIterator<Item = OsString>, flags: &[Flag]) -> Command {
    let mut command = Command::new(exe);
    command.args(args).envs(flags.iter().copied());
    command
}

/// The flags this machine still needs, from the real environment and `/sys`.
pub fn missing_for_this_machine() -> Vec<Flag> {
    let var = |name: &str| std::env::var_os(name);
    let session =
        session(var("XDG_SESSION_TYPE").as_deref(), var("WAYLAND_DISPLAY").as_deref(), var("GDK_BACKEND").as_deref());
    let gpu = display_gpu(&read_cards(Path::new(DRM_ROOT)));
    missing(flags(session, gpu), var)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use std::collections::HashMap;
    use std::os::unix::fs::symlink;

    use super::*;

    fn os(value: &str) -> Option<&OsStr> {
        Some(OsStr::new(value))
    }

    fn card(driver: &str, boot_vga: bool) -> Card {
        Card { driver: driver.to_owned(), boot_vga }
    }

    #[test]
    fn detects_wayland_from_the_display_or_the_session_type() {
        assert_eq!(session(os("wayland"), os("wayland-0"), None), Session::Wayland);
        assert_eq!(session(None, os("wayland-0"), None), Session::Wayland);
        assert_eq!(session(os("wayland"), None, None), Session::Wayland);
        assert_eq!(session(os("wayland"), os("wayland-0"), os("wayland,x11")), Session::Wayland);
        assert_eq!(session(os("wayland"), os("wayland-0"), os("*")), Session::Wayland);
        assert_eq!(session(os("wayland"), os(""), os("")), Session::Wayland);
    }

    #[test]
    fn detects_x11_and_xwayland() {
        assert_eq!(session(os("x11"), None, None), Session::X11);
        // GDK_BACKEND=x11 runs on Xwayland even in a Wayland session.
        assert_eq!(session(os("wayland"), os("wayland-0"), os("x11")), Session::X11);
        assert_eq!(session(os("wayland"), os("wayland-0"), os("x11,wayland")), Session::X11);
    }

    #[test]
    fn reports_an_unknown_session() {
        assert_eq!(session(None, None, None), Session::Unknown);
        assert_eq!(session(os("tty"), os(""), None), Session::Unknown);
        assert_eq!(session(os("x11"), None, os("wayland")), Session::Unknown);
        assert_eq!(session(None, None, os("broadway")), Session::Unknown);
    }

    #[test]
    fn picks_the_boot_display_gpu() {
        assert_eq!(display_gpu(&[card("nvidia", true)]), Gpu::NvidiaProprietary);
        assert_eq!(display_gpu(&[card("nvidia", false)]), Gpu::NvidiaProprietary);
        // A laptop whose panel is on the Intel GPU, with NVIDIA for offload.
        assert_eq!(display_gpu(&[card("i915", true), card("nvidia", false)]), Gpu::Other);
        assert_eq!(display_gpu(&[card("amdgpu", false), card("nvidia", true)]), Gpu::NvidiaProprietary);
        assert_eq!(display_gpu(&[card("nouveau", true)]), Gpu::Other);
    }

    #[test]
    fn reports_an_unknown_gpu() {
        assert_eq!(display_gpu(&[]), Gpu::Unknown);
        assert_eq!(display_gpu(&[card("i915", false), card("nvidia", false)]), Gpu::Unknown);
        assert_eq!(display_gpu(&[card("", true)]), Gpu::Unknown);
    }

    #[test]
    fn sets_flags_only_for_nvidia_under_wayland() {
        assert_eq!(flags(Session::Wayland, Gpu::NvidiaProprietary), NVIDIA_WAYLAND_FLAGS);
        for session in [Session::Wayland, Session::X11, Session::Unknown] {
            for gpu in [Gpu::NvidiaProprietary, Gpu::Other, Gpu::Unknown] {
                if (session, gpu) != (Session::Wayland, Gpu::NvidiaProprietary) {
                    assert!(flags(session, gpu).is_empty(), "{session:?} {gpu:?}");
                }
            }
        }
    }

    #[test]
    fn keeps_variables_the_user_already_set() {
        let env: HashMap<&str, &str> = HashMap::from([("WEBKIT_FORCE_DMABUF_RENDERER", "0")]);
        let lookup = |name: &str| env.get(name).map(OsString::from);

        assert_eq!(
            missing(NVIDIA_WAYLAND_FLAGS, lookup),
            vec![("__NV_DISABLE_EXPLICIT_SYNC", "1"), ("WEBKIT_SKIA_ENABLE_CPU_RENDERING", "1")]
        );
        assert_eq!(missing(NVIDIA_WAYLAND_FLAGS, |_| None), NVIDIA_WAYLAND_FLAGS.to_vec());
        assert!(missing(NVIDIA_WAYLAND_FLAGS, |_| Some(OsString::from("1"))).is_empty());
        assert!(missing(&[], |_| None).is_empty());
    }

    fn add_card(root: &Path, name: &str, driver: Option<&str>, boot_vga: Option<&str>) {
        let device = root.join(name).join("device");
        fs::create_dir_all(&device).unwrap();
        if let Some(driver) = driver {
            symlink(root.join("drivers").join(driver), device.join("driver")).unwrap();
        }
        if let Some(boot_vga) = boot_vga {
            fs::write(device.join("boot_vga"), boot_vga).unwrap();
        }
    }

    #[test]
    fn reads_cards_and_skips_connectors() {
        let root = tempfile::tempdir().unwrap();
        add_card(root.path(), "card1", Some("nvidia"), Some("1\n"));
        add_card(root.path(), "card0", Some("i915"), Some("0\n"));
        add_card(root.path(), "card2", None, None);
        fs::create_dir_all(root.path().join("card1-DP-1")).unwrap();
        fs::create_dir_all(root.path().join("renderD128")).unwrap();
        fs::create_dir_all(root.path().join("card")).unwrap();
        fs::create_dir_all(root.path().join("version")).unwrap();

        assert_eq!(read_cards(root.path()), vec![card("i915", false), card("nvidia", true), card("", false)]);
        assert_eq!(display_gpu(&read_cards(root.path())), Gpu::NvidiaProprietary);
    }

    #[test]
    fn reads_no_cards_from_a_missing_directory() {
        let root = tempfile::tempdir().unwrap();
        assert!(read_cards(&root.path().join("missing")).is_empty());
    }

    #[test]
    fn relaunches_with_the_same_arguments_and_the_flags() {
        let command = relaunch_command(
            Path::new("/opt/life-board/life-board-desktop"),
            [OsString::from("--hidden"), OsString::from("a b")],
            NVIDIA_WAYLAND_FLAGS,
        );

        assert_eq!(command.get_program(), "/opt/life-board/life-board-desktop");
        assert_eq!(command.get_args().collect::<Vec<_>>(), ["--hidden", "a b"]);
        // `get_envs` lists the variables sorted by name.
        let envs: Vec<_> =
            command.get_envs().map(|(name, value)| (name.to_owned(), value.map(OsStr::to_owned))).collect();
        assert_eq!(
            envs,
            [
                (OsString::from("WEBKIT_FORCE_DMABUF_RENDERER"), Some(OsString::from("1"))),
                (OsString::from("WEBKIT_SKIA_ENABLE_CPU_RENDERING"), Some(OsString::from("1"))),
                (OsString::from("__NV_DISABLE_EXPLICIT_SYNC"), Some(OsString::from("1"))),
            ]
        );
    }

    #[test]
    fn reads_this_machine_without_failing() {
        // The result depends on the machine; it must only list known flags.
        for flag in missing_for_this_machine() {
            assert!(NVIDIA_WAYLAND_FLAGS.contains(&flag), "{flag:?}");
        }
    }
}
