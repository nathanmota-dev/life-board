//! Rust-only: the router still registers every route of the Node API. Routes added
//! after the migration are allowed; removing or renaming a Node route is not.

use std::collections::BTreeSet;

use life_board_api::controllers::all_routes;
use serde::Deserialize;

use crate::common::fixture;

#[derive(Deserialize)]
struct NodeRoute {
    method: String,
    path: String,
}

/// Parameter names don't reach the client, and `matchit` needs one name per
/// segment, so `:goalId` and `{id}` both become `:param`.
fn normalize(path: &str) -> String {
    path.split('/')
        .map(|segment| if segment.starts_with(':') || segment.starts_with('{') { ":param" } else { segment })
        .collect::<Vec<_>>()
        .join("/")
}

#[test]
fn registers_every_node_route() {
    let recorded: Vec<NodeRoute> =
        serde_json::from_str(&std::fs::read_to_string(fixture("node-routes.json")).unwrap()).unwrap();
    let node: BTreeSet<(String, String)> =
        recorded.iter().map(|route| (route.method.clone(), normalize(&route.path))).collect();
    let routes = all_routes();
    let rust: BTreeSet<(String, String)> =
        routes.iter().map(|route| (route.method.to_owned(), normalize(&route.path))).collect();

    assert_eq!(node.len(), recorded.len(), "duplicate Node routes");
    assert_eq!(rust.len(), routes.len(), "duplicate Rust routes");
    let missing: Vec<_> = node.difference(&rust).collect();
    assert!(missing.is_empty(), "Node routes missing in Rust: {missing:?}");
}

#[test]
fn registers_the_routes_added_after_the_node_api() {
    let routes = all_routes();
    let added = [
        ("PUT", "/api/file-items/:param/file"),
        ("GET", "/api/google/status"),
        ("PUT", "/api/google/credentials"),
        ("DELETE", "/api/google/credentials"),
        ("POST", "/api/google/connect"),
        ("DELETE", "/api/google/connect"),
        ("GET", "/api/google/oauth/callback"),
        ("DELETE", "/api/google/disconnect"),
    ];
    for (method, path) in added {
        assert!(
            routes.iter().any(|route| route.method == method && normalize(&route.path) == path),
            "{method} {path} is not registered"
        );
    }
}

#[test]
fn keeps_health_and_the_google_callback_outside_the_auth_layer() {
    let public = life_board_api::controllers::public();
    let paths: Vec<&str> = public.routes().iter().map(|route| route.path.as_str()).collect();
    assert_eq!(paths, ["/api/health", "/api/google/oauth/callback"]);
    assert!(
        life_board_api::controllers::protected().routes().iter().all(|route| !paths.contains(&route.path.as_str()))
    );
}
