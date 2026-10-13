//! Tramas `u32 BE ‖ cuerpo`. El saludo va en claro; todo lo demás, cifrado con la clave de sesión.
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

use crate::{
    crypto::{open, seal, SessionKeys},
    rows::{Row, Scope},
    Result, SyncError,
};

pub const MAX_FRAME: usize = 16 * 1024 * 1024;

pub async fn write_frame<W: AsyncWrite + Unpin>(w: &mut W, body: &[u8]) -> Result<()> {
    if body.len() > MAX_FRAME {
        return Err(SyncError::Protocol("frame too large".into()));
    }
    w.write_all(&(body.len() as u32).to_be_bytes()).await?;
    w.write_all(body).await?;
    w.flush().await?;
    Ok(())
}

pub async fn read_frame<R: AsyncRead + Unpin>(r: &mut R) -> Result<Vec<u8>> {
    let mut len = [0u8; 4];
    r.read_exact(&mut len).await?;
    let len = u32::from_be_bytes(len) as usize;
    if len > MAX_FRAME {
        return Err(SyncError::Protocol("frame too large".into()));
    }
    let mut buf = vec![0u8; len];
    r.read_exact(&mut buf).await?;
    Ok(buf)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "camelCase")]
pub enum Hello {
    Sync { id: String, epk: String },
    Pair { id: String, name: String, epk: String },
    Reject { reason: String },
}

#[derive(Debug, Serialize, Deserialize)]
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

pub async fn send_hello<W: AsyncWrite + Unpin>(w: &mut W, h: &Hello) -> Result<()> {
    write_frame(w, &serde_json::to_vec(h)?).await
}

pub async fn recv_hello<R: AsyncRead + Unpin>(r: &mut R) -> Result<Hello> {
    Ok(serde_json::from_slice(&read_frame(r).await?)?)
}

pub struct Channel<'a, S> {
    io: &'a mut S,
    keys: SessionKeys,
}

impl<'a, S: AsyncRead + AsyncWrite + Unpin> Channel<'a, S> {
    pub fn new(io: &'a mut S, keys: SessionKeys) -> Self {
        Self { io, keys }
    }
    pub async fn send(&mut self, m: &Msg) -> Result<()> {
        write_frame(self.io, &seal(&self.keys.send, &serde_json::to_vec(m)?)).await
    }
    pub async fn recv(&mut self) -> Result<Msg> {
        let frame = read_frame(self.io).await?;
        Ok(serde_json::from_slice(&open(&self.keys.recv, &frame)?)?)
    }
}
