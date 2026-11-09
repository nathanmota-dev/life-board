//! Rust-only: the `life-board-api` binary follows the sidecar contract (one
//! key line on stdin, one ready line on stdout, exit when stdin closes).

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use life_board_api::server::{ReadyMessage, SidecarEnv};
use serde_json::{Value, json};

use crate::common::{TEST_DIR_PREFIX, list_dir, temp_dir};

fn sidecar(vars: &[(&str, &str)]) -> Child {
    let mut command = Command::new(env!("CARGO_BIN_EXE_life-board-api"));
    command.env_remove("LIFE_BOARD_DATA_DIR").env_remove("LIFE_BOARD_HOST").env_remove("LIFE_BOARD_PORT");
    for (key, value) in vars {
        command.env(key, value);
    }
    command.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().unwrap()
}

fn key_line(key: &[u8]) -> String {
    format!("{}\n", json!({ "type": "secret-key", "key": STANDARD.encode(key), "resetSecrets": false }))
}

/// Waits for the process to exit by itself, killing it after `timeout`.
fn wait_for_exit(child: &mut Child, timeout: Duration) -> std::process::ExitStatus {
    let started = Instant::now();
    loop {
        if let Some(status) = child.try_wait().unwrap() {
            return status;
        }
        if started.elapsed() > timeout {
            child.kill().unwrap();
            panic!("the sidecar did not exit within {timeout:?}");
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

#[tokio::test]
async fn reads_the_key_on_stdin_prints_the_ready_line_and_exits_when_stdin_closes() {
    let root = temp_dir(TEST_DIR_PREFIX);
    let data_dir = root.path().join("data");
    let mut child = sidecar(&[("LIFE_BOARD_DATA_DIR", data_dir.to_str().unwrap())]);
    let mut stdin = child.stdin.take().unwrap();
    stdin.write_all(key_line(&[9; 32]).as_bytes()).unwrap();
    stdin.flush().unwrap();

    let stdout = child.stdout.take().unwrap();
    let line = tokio::task::spawn_blocking(move || {
        let mut line = String::new();
        BufReader::new(stdout).read_line(&mut line).unwrap();
        line
    })
    .await
    .unwrap();
    let ready: ReadyMessage = serde_json::from_str(line.trim()).unwrap();
    assert!(ready.url.starts_with("http://127.0.0.1:"), "{}", ready.url);
    assert_eq!(serde_json::from_str::<Value>(line.trim()).unwrap()["type"], "ready");

    let health: Value = reqwest::get(format!("{}/api/health", ready.url)).await.unwrap().json().await.unwrap();
    assert_eq!(health["ok"], true);
    assert!(list_dir(&data_dir).contains(&"life-board.db".to_owned()));

    drop(stdin);
    let status = tokio::task::spawn_blocking(move || wait_for_exit(&mut child, Duration::from_secs(10))).await.unwrap();
    assert!(status.success(), "{status}");
}

#[test]
fn exits_with_an_error_without_a_data_dir_or_a_valid_key() {
    let root = temp_dir(TEST_DIR_PREFIX);
    let data_dir = root.path().join("data");
    let cases: [(&[(&str, &str)], String); 3] = [
        (&[], key_line(&[9; 32])),
        (&[("LIFE_BOARD_DATA_DIR", data_dir.to_str().unwrap())], key_line(&[9; 31])),
        (&[("LIFE_BOARD_DATA_DIR", data_dir.to_str().unwrap())], "not json\n".to_owned()),
    ];
    for (vars, line) in cases {
        let mut child = sidecar(vars);
        let mut stdin = child.stdin.take().unwrap();
        let _ = stdin.write_all(line.as_bytes());
        drop(stdin);
        let status = wait_for_exit(&mut child, Duration::from_secs(10));
        assert!(!status.success(), "{vars:?} {line:?} exited with {status}");
    }
}

#[test]
fn reads_the_data_dir_host_and_port_from_the_environment() {
    let vars =
        |pairs: &[(&str, &str)]| pairs.iter().map(|(k, v)| ((*k).to_owned(), (*v).to_owned())).collect::<Vec<_>>();

    let env = SidecarEnv::from_vars(vars(&[
        ("LIFE_BOARD_DATA_DIR", "/tmp/profile"),
        ("LIFE_BOARD_HOST", "0.0.0.0"),
        ("LIFE_BOARD_PORT", "4321"),
    ]))
    .unwrap();
    assert_eq!(env.data_dir, std::path::PathBuf::from("/tmp/profile"));
    assert_eq!((env.host.as_deref(), env.port), (Some("0.0.0.0"), Some(4321)));

    let defaults =
        SidecarEnv::from_vars(vars(&[("LIFE_BOARD_DATA_DIR", "/tmp/profile"), ("LIFE_BOARD_PORT", "")])).unwrap();
    assert_eq!((defaults.host, defaults.port), (None, None));
    assert!(SidecarEnv::from_vars(vars(&[])).is_err());
    assert!(SidecarEnv::from_vars(vars(&[("LIFE_BOARD_DATA_DIR", "/p"), ("LIFE_BOARD_PORT", "99999")])).is_err());
}
