//! Rust-only: the router registers exactly the routes of the Node API.

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
fn registers_every_node_route_and_nothing_else() {
    let recorded: Vec<NodeRoute> =
        serde_json::from_str(&std::fs::read_to_string(fixture("node-routes.json")).unwrap()).unwrap();
    let node: BTreeSet<(String, String)> =
        recorded.iter().map(|route| (route.method.clone(), normalize(&route.path))).collect();
    let routes = all_routes();
    let rust: BTreeSet<(String, String)> =
        routes.iter().map(|route| (route.method.to_owned(), normalize(&route.path))).collect();

    assert_eq!(recorded.len(), 68, "node-routes.json should hold the 68 Node routes");
    assert_eq!(node.len(), recorded.len(), "duplicate Node routes");
    assert_eq!(rust.len(), routes.len(), "duplicate Rust routes");
    let missing: Vec<_> = node.difference(&rust).collect();
    let extra: Vec<_> = rust.difference(&node).collect();
    assert!(missing.is_empty() && extra.is_empty(), "missing in Rust: {missing:?}\nnot in Node: {extra:?}");
}

#[test]
fn keeps_health_outside_the_auth_layer() {
    let public = life_board_api::controllers::public();
    let paths: Vec<&str> = public.routes().iter().map(|route| route.path.as_str()).collect();
    assert_eq!(paths, ["/api/health"]);
    assert!(life_board_api::controllers::protected().routes().iter().all(|route| route.path != "/api/health"));
}
