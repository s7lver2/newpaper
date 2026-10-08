use std::sync::Arc;

use np_net::{fake::FakeTor, server::{SocksServer, TorBackend}};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};

async fn echo_server() -> std::net::SocketAddr {
    let l = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = l.local_addr().unwrap();
    tokio::spawn(async move {
        while let Ok((mut s, _)) = l.accept().await {
            tokio::spawn(async move {
                let mut buf = [0u8; 64];
                let n = s.read(&mut buf).await.unwrap();
                s.write_all(&buf[..n]).await.unwrap();
            });
        }
    });
    addr
}

async fn socks_connect(port: u16, host: &str, target_port: u16) -> (TcpStream, u8) {
    let mut s = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    s.write_all(&[5, 1, 0]).await.unwrap();
    let mut hello = [0u8; 2];
    s.read_exact(&mut hello).await.unwrap();
    let mut req = vec![5, 1, 0, 3, host.len() as u8];
    req.extend_from_slice(host.as_bytes());
    req.extend_from_slice(&target_port.to_be_bytes());
    s.write_all(&req).await.unwrap();
    let mut rep = [0u8; 10];
    s.read_exact(&mut rep).await.unwrap();
    (s, rep[1])
}

#[tokio::test]
async fn relays_traffic_through_the_connector_with_remote_names() {
    let echo = echo_server().await;
    let tor = FakeTor::new(true).with_host("news.test", echo);
    let server = SocksServer::bind(tor.clone().connector()).await.unwrap();
    let (mut s, code) = socks_connect(server.port(), "news.test", echo.port()).await;
    assert_eq!(code, 0);
    s.write_all(b"hola").await.unwrap();
    let mut buf = [0u8; 4];
    s.read_exact(&mut buf).await.unwrap();
    assert_eq!(&buf, b"hola");
    assert_eq!(tor.seen_targets(), vec![format!("news.test:{}", echo.port())]);
}

#[tokio::test]
async fn kill_switch_refuses_when_tor_is_not_ready() {
    let echo = echo_server().await;
    let tor = FakeTor::new(false).with_host("news.test", echo);
    let server = SocksServer::bind(tor.clone().connector()).await.unwrap();
    let (_s, code) = socks_connect(server.port(), "news.test", echo.port()).await;
    assert_eq!(code, np_net::socks::reply::GENERAL_FAILURE);
    assert!(tor.seen_targets().is_empty(), "nothing leaves when not ready");
}

#[tokio::test]
async fn unreachable_targets_report_host_unreachable() {
    let tor = FakeTor::new(true);
    let server = SocksServer::bind(tor.clone().connector()).await.unwrap();
    let (_s, code) = socks_connect(server.port(), "no-such-host.test", 9).await;
    assert_eq!(code, np_net::socks::reply::HOST_UNREACHABLE);
}

#[tokio::test]
async fn binds_only_on_loopback_with_a_random_port() {
    let tor = FakeTor::new(true);
    let a = SocksServer::bind(tor.clone().connector()).await.unwrap();
    let b = SocksServer::bind(tor.connector()).await.unwrap();
    assert_ne!(a.port(), 0);
    assert_ne!(a.port(), b.port());
    assert!(TcpStream::connect(("127.0.0.1", a.port())).await.is_ok());
    let _ = Arc::new(a);
}
