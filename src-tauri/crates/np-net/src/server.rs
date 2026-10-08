//! Servidor SOCKS5 en 127.0.0.1:<aleatorio>. Su único conector es Tor: si no está listo, responde error.

use std::{
    io,
    net::{Ipv4Addr, SocketAddr},
    sync::Arc,
    time::Duration,
};

use async_trait::async_trait;
use tokio::{
    io::{AsyncRead, AsyncWrite},
    net::{TcpListener, TcpStream},
    sync::watch,
    task::JoinHandle,
};

use crate::{
    socks::{negotiate, read_request, reply, write_reply, SocksError, TargetAddr},
    NetError, TorState,
};

pub trait AsyncStream: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> AsyncStream for T {}
pub type BoxStream = Box<dyn AsyncStream>;

#[derive(Debug, thiserror::Error)]
pub enum ConnectError {
    #[error("tor is not ready")]
    NotReady,
    #[error("unreachable: {0}")]
    Unreachable(String),
    #[error("refused: {0}")]
    Refused(String),
}

impl ConnectError {
    pub fn reply_code(&self) -> u8 {
        match self {
            ConnectError::NotReady => reply::GENERAL_FAILURE,
            ConnectError::Unreachable(_) => reply::HOST_UNREACHABLE,
            ConnectError::Refused(_) => reply::CONNECTION_REFUSED,
        }
    }
}

#[async_trait]
pub trait Connector: Send + Sync {
    async fn connect(&self, target: &TargetAddr) -> Result<BoxStream, ConnectError>;
}

/// Motor Tor intercambiable (Arti real o `FakeTor`).
pub trait TorBackend: Send + Sync {
    fn start(&self);
    fn stop(&self);
    fn subscribe(&self) -> watch::Receiver<TorState>;
    fn set_exit_country(&self, cc: Option<&str>) -> Result<(), NetError>;
    /// Nuevo `IsolationToken`; devuelve el número de circuito nuevo.
    fn new_circuit(&self) -> u64;
    fn circuit(&self) -> u64;
    fn connector(self: Arc<Self>) -> Arc<dyn Connector>;
}

pub struct SocksServer {
    port: u16,
    task: JoinHandle<()>,
}

impl SocksServer {
    pub async fn bind(connector: Arc<dyn Connector>) -> io::Result<Self> {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
        let port = listener.local_addr()?.port();
        let task = tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((sock, peer)) => {
                        if !peer.ip().is_loopback() {
                            continue;
                        }
                        let c = connector.clone();
                        tokio::spawn(async move {
                            if let Err(e) = handle(sock, peer, c).await {
                                tracing::debug!(error = %e, "socks session ended with error");
                            }
                        });
                    }
                    Err(e) => {
                        tracing::warn!(error = %e, "socks accept failed");
                        tokio::time::sleep(Duration::from_millis(100)).await;
                    }
                }
            }
        });
        Ok(Self { port, task })
    }

    pub fn port(&self) -> u16 {
        self.port
    }
}

impl Drop for SocksServer {
    fn drop(&mut self) {
        self.task.abort();
    }
}

async fn handle(mut sock: TcpStream, _peer: SocketAddr, connector: Arc<dyn Connector>) -> Result<(), SocksError> {
    negotiate(&mut sock).await?;
    let target = read_request(&mut sock).await?;
    match connector.connect(&target).await {
        Ok(mut upstream) => {
            write_reply(&mut sock, reply::SUCCEEDED).await?;
            let _ = tokio::io::copy_bidirectional(&mut sock, &mut upstream).await;
            Ok(())
        }
        Err(e) => {
            tracing::debug!(target = %target, error = %e, "connect refused by kill switch or tor");
            write_reply(&mut sock, e.reply_code()).await?;
            Ok(())
        }
    }
}
