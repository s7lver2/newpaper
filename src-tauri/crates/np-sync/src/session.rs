//! Emparejamiento y sesión de sincronización sobre cualquier flujo de bytes.
use std::sync::Arc;

use np_store::{secrets::SecretStore, Store};
use serde::Serialize;
use tokio::io::{AsyncRead, AsyncWrite};
use zeroize::Zeroize;

use crate::{
    crypto::{ephemeral, pairing_keys, session_keys},
    identity::{clean_name, decode_pk, encode_pk, valid_device_id, Identity},
    pairing::{PairingManager, PairingOffer},
    peers::{self, Peer},
    rows::{apply_report, changes_after, Scope},
    wire::{recv_hello, send_hello, Channel, Hello, Msg, PRE_AUTH_FRAME},
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
/// Límites de lo que se acepta de un par en una sesión (un par comprometido no puede agotar memoria o disco).
const MAX_ROWS_PER_FRAME: usize = 5_000;
const MAX_FRAMES_PER_SESSION: usize = 2_000;
const MAX_KEY_ENTRIES: usize = 64;
const MAX_KEY_BYTES: usize = 8 * 1024;

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

fn unexpected(what: &str, got: &Msg) -> SyncError {
    SyncError::Protocol(format!("expected {what}, got {}", got.kind()))
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
        let msg = Msg::Keys { entries };
        ch.send(&msg).await?;
        if let Msg::Keys { mut entries } = msg {
            for (_, v) in entries.iter_mut() {
                v.zeroize();
            }
        }
    }
    ch.send(&Msg::Done { last_seq: after }).await?;
    match ch.recv().await? {
        Msg::Ack { seq } => peers::set_sent_seq(&ctx.store, &peer.id, seq),
        other => Err(unexpected("ack", &other)),
    }
}

async fn recv_all<S: AsyncRead + AsyncWrite + Unpin>(ch: &mut Channel<'_, S>, ctx: &SyncContext, peer: &Peer, scopes: &[Scope], keys_ok: bool, rep: &mut SyncReport) -> Result<()> {
    let mut frames = 0usize;
    let mut keys_seen = false;
    loop {
        frames += 1;
        if frames > MAX_FRAMES_PER_SESSION {
            return Err(SyncError::Protocol("too many frames".into()));
        }
        let msg = ch.recv().await?;
        // Revocar corta también las sesiones en curso: tras revocar no se aplica nada más de ese par.
        if !matches!(peers::get(&ctx.store, &peer.id)?, Some(p) if !p.revoked) {
            return Err(SyncError::Unauthorized);
        }
        match msg {
            Msg::Changes { rows } => {
                if rows.len() > MAX_ROWS_PER_FRAME {
                    return Err(SyncError::Protocol("too many rows in one frame".into()));
                }
                rep.received += rows.len();
                let r = apply_report(&ctx.store, &rows, scopes)?;
                rep.applied += r.applied;
                for k in r.settings {
                    let _ = ctx.store.notify_setting_changed(&k);
                }
            }
            Msg::Keys { entries } if keys_ok && !keys_seen => {
                keys_seen = true;
                if entries.len() > MAX_KEY_ENTRIES {
                    return Err(SyncError::Protocol("too many keys".into()));
                }
                for (k, mut v) in entries {
                    if shareable_key(&k) && !v.is_empty() && v.len() <= MAX_KEY_BYTES {
                        ctx.secrets.set(&k, &v)?;
                        rep.keys += 1;
                    }
                    v.zeroize();
                }
            }
            Msg::Keys { .. } => return Err(SyncError::Protocol("keys not allowed for this device".into())),
            Msg::Done { last_seq } => {
                ch.send(&Msg::Ack { seq: last_seq }).await?;
                return Ok(());
            }
            Msg::Error { .. } => return Err(SyncError::Protocol("peer reported an error".into())),
            other => return Err(unexpected("changes", &other)),
        }
    }
}

async fn exchange<S: AsyncRead + AsyncWrite + Unpin>(ch: &mut Channel<'_, S>, ctx: &SyncContext, peer: &Peer, client: bool) -> Result<SyncReport> {
    let mut rep = SyncReport { peer_id: peer.id.clone(), peer_name: peer.name.clone(), ..Default::default() };
    ch.send(&Msg::Scopes { scopes: peer.scopes.clone(), send_keys: peer.send_keys }).await?;
    // Primer mensaje cifrado del par: pequeño. Un desconocido que no tiene la clave falla aquí con 64 KiB como mucho.
    let (theirs, their_keys) = match ch.recv_max(PRE_AUTH_FRAME).await? {
        Msg::Scopes { scopes, send_keys } => (scopes, send_keys),
        other => return Err(unexpected("scopes", &other)),
    };
    let scopes: Vec<Scope> = peer.scopes.iter().copied().filter(|s| theirs.contains(s)).collect();
    let keys_ok = peer.send_keys && their_keys && scopes.contains(&Scope::Keys);
    if client {
        send_all(ch, ctx, peer, &scopes, keys_ok, &mut rep).await?;
        recv_all(ch, ctx, peer, &scopes, keys_ok, &mut rep).await?;
    } else {
        recv_all(ch, ctx, peer, &scopes, keys_ok, &mut rep).await?;
        send_all(ch, ctx, peer, &scopes, keys_ok, &mut rep).await?;
    }
    peers::touch(&ctx.store, &peer.id, now())?;
    Ok(rep)
}

/// Lado que escucha (escritorio): atiende un emparejamiento o una sesión de sincronización.
pub async fn serve<S: AsyncRead + AsyncWrite + Unpin>(io: &mut S, ctx: &SyncContext) -> Result<SyncReport> {
    match recv_hello(io).await? {
        Hello::Pair { id, name: _, epk } => {
            let attempt = match ctx.pairing.begin() {
                Ok(a) => a,
                Err(e) => {
                    send_hello(io, &Hello::Reject { reason: "no pairing in progress".into() }).await?;
                    return Err(e);
                }
            };
            let keys = match decode_pk(&epk).and_then(|pk| pairing_keys(&attempt.eph, &pk, &attempt.secret, false)) {
                Ok(k) => k,
                Err(e) => {
                    ctx.pairing.fail(&attempt);
                    return Err(e);
                }
            };
            let mut ch = Channel::new(io, keys);
            // Quien no conoce el secreto del QR no descifra este mensaje: cuenta como intento fallido, no consume la oferta.
            let (cid, cname, cpk) = match ch.recv_max(PRE_AUTH_FRAME).await {
                Ok(Msg::Who { id: cid, name: cname, pk }) if cid == id && valid_device_id(&cid) && cid != ctx.identity.device_id && decode_pk(&pk).is_ok() => (cid, clean_name(&cname), pk),
                _ => {
                    ctx.pairing.fail(&attempt);
                    return Err(SyncError::Unauthorized);
                }
            };
            ctx.pairing.complete(&attempt)?; // un solo uso, también si dos conexiones llegan a la vez
            ch.send(&Msg::Who { id: ctx.identity.device_id.clone(), name: ctx.identity.name(), pk: ctx.identity.public_b64() }).await?;
            peers::upsert(&ctx.store, &Peer { id: cid.clone(), name: cname.clone(), public_key: cpk, addresses: vec![], scopes: Scope::DEFAULT.to_vec(), send_keys: false, paired_at: now(), last_sync_at: None, revoked: false })?;
            Ok(SyncReport { peer_id: cid, peer_name: cname, paired: true, ..Default::default() })
        }
        Hello::Sync { id, epk } => {
            let Some(peer) = valid_device_id(&id).then(|| peers::get(&ctx.store, &id)).transpose()?.flatten().filter(|p| !p.revoked) else {
                send_hello(io, &Hello::Reject { reason: "unknown or revoked device".into() }).await?;
                return Err(SyncError::Unauthorized);
            };
            let (e, ep) = ephemeral();
            let keys = session_keys(&ctx.identity, &e, &decode_pk(&peer.public_key)?, &decode_pk(&epk)?)?;
            send_hello(io, &Hello::Sync { id: ctx.identity.device_id.clone(), epk: encode_pk(&ep) }).await?;
            let mut ch = Channel::new(io, keys);
            exchange(&mut ch, ctx, &peer, false).await
        }
        Hello::Reject { .. } => Err(SyncError::Protocol("unexpected reject".into())),
    }
}

/// Lado que conecta: sincroniza con un par ya emparejado.
pub async fn sync_with<S: AsyncRead + AsyncWrite + Unpin>(io: &mut S, ctx: &SyncContext, peer: &Peer) -> Result<SyncReport> {
    if peer.revoked {
        return Err(SyncError::Unauthorized);
    }
    let peer_pk = decode_pk(&peer.public_key)?;
    let (e, ep) = ephemeral();
    send_hello(io, &Hello::Sync { id: ctx.identity.device_id.clone(), epk: encode_pk(&ep) }).await?;
    let epk = match recv_hello(io).await? {
        Hello::Sync { id, epk } if id == peer.id => epk,
        _ => return Err(SyncError::Unauthorized),
    };
    let keys = session_keys(&ctx.identity, &e, &peer_pk, &decode_pk(&epk)?)?;
    let mut ch = Channel::new(io, keys);
    exchange(&mut ch, ctx, peer, true).await
}

/// Quien escanea el QR (móvil u otro escritorio con el código pegado).
pub async fn pair_with<S: AsyncRead + AsyncWrite + Unpin>(io: &mut S, ctx: &SyncContext, offer: &PairingOffer) -> Result<Peer> {
    if !valid_device_id(&offer.id) || offer.id == ctx.identity.device_id {
        return Err(SyncError::Protocol("invalid pairing code".into()));
    }
    let (e, ep) = ephemeral();
    let keys = pairing_keys(&e, &decode_pk(&offer.epk)?, &offer.secret_bytes()?, true)?;
    send_hello(io, &Hello::Pair { id: ctx.identity.device_id.clone(), name: ctx.identity.name(), epk: encode_pk(&ep) }).await?;
    let mut ch = Channel::new(io, keys);
    ch.send(&Msg::Who { id: ctx.identity.device_id.clone(), name: ctx.identity.name(), pk: ctx.identity.public_b64() }).await?;
    let (id, name, pk) = match ch.recv_max(PRE_AUTH_FRAME).await {
        Ok(Msg::Who { id, name, pk }) => (id, name, pk),
        _ => return Err(SyncError::Unauthorized),
    };
    // Autentica al PC: debe ser exactamente la identidad del QR.
    if id != offer.id || pk != offer.pk {
        return Err(SyncError::Unauthorized);
    }
    let addresses = offer.socket_addrs().iter().map(|a| a.to_string()).collect();
    let peer = Peer { id, name: clean_name(&name), public_key: pk, addresses, scopes: Scope::DEFAULT.to_vec(), send_keys: false, paired_at: now(), last_sync_at: None, revoked: false };
    peers::upsert(&ctx.store, &peer)?;
    Ok(peer)
}
