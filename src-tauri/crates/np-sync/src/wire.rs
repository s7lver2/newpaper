//! Tramas `u32 BE ‖ cuerpo`. El saludo va en claro; todo lo demás, cifrado con la clave de sesión.
use std::{fmt, time::Duration};

use serde::{Deserialize, Serialize};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
    time::timeout,
};

use crate::{
    crypto::{open_aad, seal_aad, SessionKeys},
    rows::{Row, Scope},
    Result, SyncError,
};

pub const MAX_FRAME: usize = 16 * 1024 * 1024;
/// Antes de autenticar al otro lado solo se aceptan tramas pequeñas (saludo y primer mensaje).
pub const PRE_AUTH_FRAME: usize = 64 * 1024;
/// Tiempo máximo para recibir el saludo de un desconocido.
pub const HELLO_TIMEOUT: Duration = Duration::from_secs(5);
/// Tiempo máximo entre dos mensajes de una sesión.
pub const IO_TIMEOUT: Duration = Duration::from_secs(60);

pub async fn write_frame<W: AsyncWrite + Unpin>(w: &mut W, body: &[u8]) -> Result<()> {
    if body.len() > MAX_FRAME {
        return Err(SyncError::Protocol("frame too large".into()));
    }
    w.write_all(&(body.len() as u32).to_be_bytes()).await?;
    w.write_all(body).await?;
    w.flush().await?;
    Ok(())
}

pub async fn read_frame_max<R: AsyncRead + Unpin>(r: &mut R, max: usize) -> Result<Vec<u8>> {
    let mut len = [0u8; 4];
    r.read_exact(&mut len).await?;
    let len = u32::from_be_bytes(len) as usize;
    if len > max.min(MAX_FRAME) {
        return Err(SyncError::Protocol("frame too large".into()));
    }
    // No se reserva `len` de golpe: un cliente que promete 16 MiB y no envía nada no consume memoria.
    let mut buf = Vec::new();
    let got = r.take(len as u64).read_to_end(&mut buf).await?;
    if got != len {
        return Err(SyncError::Io(std::io::ErrorKind::UnexpectedEof.into()));
    }
    Ok(buf)
}

pub async fn read_frame<R: AsyncRead + Unpin>(r: &mut R) -> Result<Vec<u8>> {
    read_frame_max(r, MAX_FRAME).await
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "camelCase")]
pub enum Hello {
    Sync { id: String, epk: String },
    Pair { id: String, name: String, epk: String },
    Reject { reason: String },
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "camelCase")]
pub enum Msg {
    Who { id: String, name: String, pk: String },
    Scopes { scopes: Vec<Scope>, send_keys: bool },
    Changes { rows: Vec<Row> },
    Done { last_seq: i64 },
    Ack { seq: i64 },
    Keys { entries: Vec<(String, String)> },
    Error { message: String },
}

impl Msg {
    pub fn kind(&self) -> &'static str {
        match self {
            Msg::Who { .. } => "who",
            Msg::Scopes { .. } => "scopes",
            Msg::Changes { .. } => "changes",
            Msg::Done { .. } => "done",
            Msg::Ack { .. } => "ack",
            Msg::Keys { .. } => "keys",
            Msg::Error { .. } => "error",
        }
    }
}

/// `Debug` solo muestra el tipo: un mensaje puede llevar claves de API o filas del usuario y los errores acaban en registros y en la UI.
impl fmt::Debug for Msg {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Msg::{}", self.kind())
    }
}

pub async fn send_hello<W: AsyncWrite + Unpin>(w: &mut W, h: &Hello) -> Result<()> {
    write_frame(w, &serde_json::to_vec(h)?).await
}

/// El saludo lo envía alguien sin autenticar: trama pequeña y plazo corto.
pub async fn recv_hello<R: AsyncRead + Unpin>(r: &mut R) -> Result<Hello> {
    let frame = timeout(HELLO_TIMEOUT, read_frame_max(r, 4096)).await.map_err(|_| SyncError::Protocol("hello timeout".into()))??;
    Ok(serde_json::from_slice(&frame)?)
}

/// Canal cifrado. Cada mensaje lleva su número de orden como dato asociado: una trama repetida, reordenada
/// o descartada por quien está en medio del camino no descifra.
pub struct Channel<'a, S> {
    io: &'a mut S,
    keys: SessionKeys,
    sent: u64,
    received: u64,
}

impl<'a, S: AsyncRead + AsyncWrite + Unpin> Channel<'a, S> {
    pub fn new(io: &'a mut S, keys: SessionKeys) -> Self {
        Self { io, keys, sent: 0, received: 0 }
    }
    pub async fn send(&mut self, m: &Msg) -> Result<()> {
        let sealed = seal_aad(&self.keys.send, &serde_json::to_vec(m)?, &self.sent.to_be_bytes());
        self.sent += 1;
        write_frame(self.io, &sealed).await
    }
    pub async fn recv(&mut self) -> Result<Msg> {
        self.recv_max(MAX_FRAME).await
    }
    /// Recibe con un límite de tamaño (para los mensajes anteriores a conocer al otro lado).
    pub async fn recv_max(&mut self, max: usize) -> Result<Msg> {
        let frame = timeout(IO_TIMEOUT, read_frame_max(self.io, max)).await.map_err(|_| SyncError::Protocol("read timeout".into()))??;
        let plain = open_aad(&self.keys.recv, &frame, &self.received.to_be_bytes())?;
        self.received += 1;
        Ok(serde_json::from_slice(&plain)?)
    }
}
