use np_net::{controller::NetController, fake::FakeTor, NetMode, NetSettings, TorState, Traffic};
use tokio::{io::{AsyncReadExt, AsyncWriteExt}, net::TcpListener};

async fn http_ok() -> std::net::SocketAddr {
    let l = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = l.local_addr().unwrap();
    tokio::spawn(async move {
        while let Ok((mut s, _)) = l.accept().await {
            tokio::spawn(async move {
                let mut buf = [0u8; 1024];
                let _ = s.read(&mut buf).await;
                let _ = s.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok").await;
            });
        }
    });
    addr
}

fn tor_mode() -> NetSettings {
    NetSettings { mode: NetMode::Tor, ..Default::default() }
}

#[tokio::test]
async fn web_traffic_goes_through_tor_with_remote_dns() {
    let site = http_ok().await;
    let tor = FakeTor::new(true).with_host("news.test", site);
    let net = NetController::start(tor_mode(), tor.clone()).await.unwrap();
    let url = format!("http://news.test:{}/", site.port());
    let body = net.http_client(Traffic::Web).get(&url).send().await.unwrap().text().await.unwrap();
    assert_eq!(body, "ok");
    assert_eq!(tor.seen_targets(), vec![format!("news.test:{}", site.port())]);
}

#[tokio::test]
async fn kill_switch_fails_requests_instead_of_going_direct() {
    let site = http_ok().await;
    let tor = FakeTor::new(false).with_host("news.test", site);
    let net = NetController::start(tor_mode(), tor.clone()).await.unwrap();
    assert!(net.status().kill_switch_active);
    let url = format!("http://news.test:{}/", site.port());
    assert!(net.http_client(Traffic::Web).get(&url).send().await.is_err());
    assert!(net.http_client(Traffic::Feeds).get(&url).send().await.is_err());
}

#[tokio::test]
async fn loopback_is_never_proxied() {
    let site = http_ok().await;
    let tor = FakeTor::new(false);
    let net = NetController::start(tor_mode(), tor.clone()).await.unwrap();
    let body = net.http_client(Traffic::Web).get(format!("http://127.0.0.1:{}/", site.port())).send().await.unwrap().text().await.unwrap();
    assert_eq!(body, "ok");
    assert!(tor.seen_targets().is_empty());
}

#[tokio::test]
async fn mode_country_and_circuit_changes_update_status() {
    let tor = FakeTor::new(true);
    let net = NetController::start(NetSettings::default(), tor.clone()).await.unwrap();
    assert_eq!(tor.starts(), 0);
    assert!(net.set_mode(NetMode::Tor));
    assert!(!net.set_mode(NetMode::Tor));
    assert_eq!(tor.starts(), 1);
    assert!(net.set_exit_country(Some("de".into())).unwrap());
    assert_eq!(tor.exit_country().as_deref(), Some("DE"));
    assert!(net.set_exit_country(Some("xyz".into())).is_err());
    let before = net.status().circuit;
    assert_eq!(net.new_circuit(), before + 1);
    tokio::task::yield_now().await;
    let s = net.status();
    assert_eq!(s.exit_country.as_deref(), Some("DE"));
    assert_eq!(s.tor, TorState::Ready);
    assert_eq!(s.circuit, before + 1);
    assert!(net.set_mode(NetMode::Direct));
    assert_eq!(tor.stops(), 1);
}

#[test]
fn tor_browser_args_force_remote_dns_and_block_webrtc_leaks() {
    let a = np_net::controller::tor_browser_args(50123);
    assert!(a.contains("--proxy-server=socks5://127.0.0.1:50123"));
    assert!(a.contains("--host-resolver-rules=\"MAP * ~NOTFOUND , EXCLUDE 127.0.0.1\""));
    assert!(a.contains("--force-webrtc-ip-handling-policy=disable_non_proxied_udp"));
}
