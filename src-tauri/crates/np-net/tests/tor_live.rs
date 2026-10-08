//! Prueba real contra la red Tor. Ejecutar a mano: cargo test -p np-net --test tor_live -- --ignored
use std::time::Duration;

use np_net::{controller::NetController, tor::ArtiTor, NetMode, NetSettings, TorState, Traffic};

#[tokio::test]
#[ignore = "requires internet access and bootstraps the real Tor network"]
async fn browses_through_tor_and_reports_istor() {
    let dir = tempfile::tempdir().unwrap();
    let tor = ArtiTor::new(dir.path().join("state"), dir.path().join("cache"));
    let net = NetController::start(NetSettings { mode: NetMode::Tor, ..Default::default() }, tor).await.unwrap();
    let mut rx = net.subscribe();
    tokio::time::timeout(Duration::from_secs(180), async {
        while rx.borrow().tor != TorState::Ready {
            rx.changed().await.unwrap();
        }
    })
    .await
    .expect("bootstrap within 3 minutes");
    let body: serde_json::Value = net
        .http_client(Traffic::Web)
        .get("https://check.torproject.org/api/ip")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(body["IsTor"], true);
}
