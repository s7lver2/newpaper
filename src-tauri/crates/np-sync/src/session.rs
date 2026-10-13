//! Emparejamiento y sesión de sincronización sobre cualquier flujo de bytes.
use std::sync::Arc;

use np_store::{secrets::SecretStore, Store};
use serde::Serialize;
use tokio::io::{AsyncRead, AsyncWrite};

use crate::{
    crypto::{ephemeral, pairing_keys, session_keys},
    identity::{decode_pk, encode_pk, Identity},
    pairing::{PairingManager, PairingOffer},
    peers::{self, Peer},
    rows::{apply, changes_after, Scope},
    wire::{recv_hello, send_hello, Channel, Hello, Msg},
    Result, SyncError,
};

pub struct SyncContext {
    pub store: Arc<Store>,
    pub identity: Arc<Identity>,
    pub secrets: Arc<dyn SecretStore>,
    pub pairing: Arc<PairingManager>,
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub peer_id: String,
    pub peer_name: String,
    pub sent: usize,
    pub received: usize,
    pub applied: usize,
    pub keys: usize,
    pub paired: bool,
}

const PAGE: usize = 500;

fn now() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

fn shareable_key(k: &str) -> bool {
    (k.starts_with("ai.") || k.starts_with("search.")) && np_store::secrets::validate_secret_key(k).is_ok()
}

/// Nombres de llavero de las claves de API que este equipo usa: `ai.<proveedor>` (como `np-ai-proxy`) y `search.*`.
fn key_names(store: &Store) -> Vec<String> {
    let connected: Vec<String> = store.get_setting("ai.connected").ok().flatten().unwrap_or_default();
    let mut names: Vec<String> = connected.into_iter().map(|p| format!("ai.{}", p.replace(':', "-"))).collect();
    names.extend(["search.brave", "search.tavily", "search.exa"].map(String::from));
    names
}

async fn send_all<S: AsyncRead + AsyncWrite + Unpin>(ch: &mut Channel<'_, S>, ctx: &SyncContext, peer: &Peer, scopes: &[Scope], keys_ok: bool, rep: &mut SyncReport) -> Result<()> {
    let mut after = peers::sent_seq(&ctx.store, &peer.id)?;
    loop {
        let (rows, last) = changes_after(&ctx.store, scopes, after, PAGE)?;
        if last == after {
            break;
        }
        rep.sent += rows.len();
        if !rows.is_empty() {
            ch.send(&Msg::Changes { rows }).await?;
        }
        after = last;
    }
    if keys_ok {
        let mut entries = Vec::new();
        for k in key_names(&ctx.store) {
            if let Some(v) = ctx.secrets.get(&k)? {
                entries.push((k, v));
            }
        }
        rep.keys += entries.len();
        ch.send(&Msg::Keys { entries }).await?;
    }
    ch.send(&Msg::Done { last_seq: after }).await?;
    match ch.recv().await? {
        Msg::Ack { seq } => peers::set_sent_seq(&ctx.store, &peer.id, seq),
        other => Err(SyncError::Protocol(format!("expected ack, got {other:?}"))),
    }
}

async fn recv_all<S: AsyncRead + AsyncWrite + Unpin>(ch: &mut Channel<'_, S>, ctx: &SyncContext, scopes: &[Scope], keys_ok: bool, rep: &mut SyncReport) -> Result<()> {
    loop {
        match ch.recv().await? {
            Msg::Changes { rows } => {
                rep.received += rows.len();
                rep.applied += apply(&ctx.store, &rows, scopes)?;
            }
            Msg::Keys { entries } if keys_ok => {
                for (k, v) in entries.into_iter().filter(|(k, _)| shareable_key(k)) {
                    ctx.secrets.set(&k, &v)?;
                    rep.keys += 1;
                }
            }
            Msg::Keys { .. } => return Err(SyncError::Protocol("keys not allowed for this device".into())),
            Msg::Done { last_seq } => {
                ch.send(&Msg::Ack { seq: last_seq }).await?;
                return Ok(());
            }
            Msg::Error { message } => return Err(SyncError::Protocol(message)),
            other => return Err(SyncError::Protocol(format!("unexpected {other:?}"))),
        }
    }
}

async fn exchange<S: AsyncRead + AsyncWrite + Unpin>(ch: &mut Channel<'_, S>, ctx: &SyncContext, peer: &Peer, client: bool) -> Result<SyncReport> {
    let mut rep = SyncReport { peer_id: peer.id.clone(), peer_name: peer.name.clone(), ..Default::default() };
    ch.send(&Msg::Scopes { scopes: peer.scopes.clone(), send_keys: peer.send_keys }).await?;
    let (theirs, their_keys) = match ch.recv().await? {
        Msg::Scopes { scopes, send_keys } => (scopes, send_keys),
        other => return Err(SyncError::Protocol(format!("expected scopes, got {other:?}"))),
    };
    let scopes: Vec<Scope> = peer.scopes.iter().copied().filter(|s| theirs.contains(s)).collect();
    let keys_ok = peer.send_keys && their_keys && scopes.contains(&Scope::Keys);
    if client {
        send_all(ch, ctx, peer, &scopes, keys_ok, &mut rep).await?;
        recv_all(ch, ctx, &scopes, keys_ok, &mut rep).await?;
    } else {
        recv_all(ch, ctx, &scopes, keys_ok, &mut rep).await?;
        send_all(ch, ctx, peer, &scopes, keys_ok, &mut rep).await?;
    }
    peers::touch(&ctx.store, &peer.id, now())?;
    Ok(rep)
}

/// Lado que escucha (escritorio): atiende un emparejamiento o una sesión de sincronización.
pub async fn serve<S: AsyncRead + AsyncWrite + Unpin>(io: &mut S, ctx: &SyncContext) -> Result<SyncReport> {
    match recv_hello(io).await? {
        Hello::Pair { id, name, epk } => {
            let active = match ctx.pairing.take_valid() {
                Ok(a) => a,
                Err(e) => {
                    send_hello(io, &Hello::Reject { reason: "no pairing in progress".into() }).await?;
                    return Err(e);
                }
            };
            let keys = pairing_keys(&active.eph, &decode_pk(&epk)?, &active.secret, false);
            let mut ch = Channel::new(io, keys);
            let (cid, cname, cpk) = match ch.recv().await? {
                Msg::Who { id: cid, name: cname, pk } if cid == id => (cid, cname, pk),
                _ => return Err(SyncError::Unauthorized),
            };
            ch.send(&Msg::Who { id: ctx.identity.device_id.clone(), name: ctx.identity.name.clone(), pk: ctx.identity.public_b64() }).await?;
            let _ = name;
            peers::upsert(&ctx.store, &Peer { id: cid.clone(), name: cname.clone(), public_key: cpk, addresses: vec![], scopes: Scope::DEFAULT.to_vec(), send_keys: false, paired_at: now(), last_sync_at: None, revoked: false })?;
            Ok(SyncReport { peer_id: cid, peer_name: cname, paired: true, ..Default::default() })
        }
        Hello::Sync { id, epk } => {
            let Some(peer) = peers::get(&ctx.store, &id)?.filter(|p| !p.revoked) else {
                send_hello(io, &Hello::Reject { reason: "unknown or revoked device".into() }).await?;
                return Err(SyncError::Unauthorized);
            };
            let (e, ep) = ephemeral();
            send_hello(io, &Hello::Sync { id: ctx.identity.device_id.clone(), epk: encode_pk(&ep) }).await?;
            let keys = session_keys(&ctx.identity, &e, &decode_pk(&peer.public_key)?, &decode_pk(&epk)?, &peer.id);
            let mut ch = Channel::new(io, keys);
            exchange(&mut ch, ctx, &peer, false).await
        }
        Hello::Reject { .. } => Err(SyncError::Protocol("unexpected reject".into())),
    }
}

/// Lado que conecta: sincroniza con un par ya emparejado.
pub async fn sync_with<S: AsyncRead + AsyncWrite + Unpin>(io: &mut S, ctx: &SyncContext, peer: &Peer) -> Result<SyncReport> {
    let (e, ep) = ephemeral();
    send_hello(io, &Hello::Sync { id: ctx.identity.device_id.clone(), epk: encode_pk(&ep) }).await?;
    let epk = match recv_hello(io).await? {
        Hello::Sync { id, epk } if id == peer.id => epk,
        Hello::Reject { .. } => return Err(SyncError::Unauthorized),
        _ => return Err(SyncError::Unauthorized),
    };
    let keys = session_keys(&ctx.identity, &e, &decode_pk(&peer.public_key)?, &decode_pk(&epk)?, &peer.id);
    let mut ch = Channel::new(io, keys);
    exchange(&mut ch, ctx, peer, true).await
}

/// Quien escanea el QR (móvil u otro escritorio con el código pegado).
pub async fn pair_with<S: AsyncRead + AsyncWrite + Unpin>(io: &mut S, ctx: &SyncContext, offer: &PairingOffer) -> Result<Peer> {
    let (e, ep) = ephemeral();
    send_hello(io, &Hello::Pair { id: ctx.identity.device_id.clone(), name: ctx.identity.name.clone(), epk: encode_pk(&ep) }).await?;
    let keys = pairing_keys(&e, &decode_pk(&offer.epk)?, &offer.secret_bytes()?, true);
    let mut ch = Channel::new(io, keys);
    ch.send(&Msg::Who { id: ctx.identity.device_id.clone(), name: ctx.identity.name.clone(), pk: ctx.identity.public_b64() }).await?;
    let (id, name, pk) = match ch.recv().await {
        Ok(Msg::Who { id, name, pk }) => (id, name, pk),
        _ => return Err(SyncError::Unauthorized),
    };
    // Autentica al PC: debe ser exactamente la identidad del QR.
    if id != offer.id || pk != offer.pk {
        return Err(SyncError::Unauthorized);
    }
    let peer = Peer { id, name, public_key: pk, addresses: offer.addrs.clone(), scopes: Scope::DEFAULT.to_vec(), send_keys: false, paired_at: now(), last_sync_at: None, revoked: false };
    peers::upsert(&ctx.store, &peer)?;
    Ok(peer)
}
