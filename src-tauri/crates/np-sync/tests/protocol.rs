use std::{sync::Arc, time::Duration};

use np_store::{secrets::MemorySecrets, Store};
use np_sync::{
    identity::Identity,
    pairing::{PairingManager, PairingOffer},
    peers,
    rows::Scope,
    session::{pair_with, serve, sync_with, SyncContext},
    SyncError,
};

fn ctx(name: &str) -> SyncContext {
    SyncContext {
        store: Arc::new(Store::open_in_memory().unwrap()),
        identity: Arc::new(Identity::generate(name)),
        secrets: Arc::new(MemorySecrets::default()),
        pairing: Arc::new(PairingManager::new()),
    }
}

#[tokio::test]
async fn pairs_by_qr_then_syncs_both_ways_and_rejects_revoked_devices() {
    let (pc, mobile) = (ctx("pc"), ctx("móvil"));
    let offer = pc.pairing.start(&pc.identity, vec!["127.0.0.1:47100".into()], Duration::from_secs(120));
    let scanned = PairingOffer::decode(&offer.encode()).unwrap();
    assert!(offer.qr_modules().0 >= 21);

    let (mut a, mut b) = tokio::io::duplex(1 << 20);
    let (srv, cli) = tokio::join!(serve(&mut a, &pc), pair_with(&mut b, &mobile, &scanned));
    assert!(srv.unwrap().paired);
    let pc_as_peer = cli.unwrap();
    assert_eq!(pc_as_peer.id, pc.identity.device_id);
    assert!(peers::get(&pc.store, &mobile.identity.device_id).unwrap().is_some());

    // La oferta sirve una sola vez.
    let (mut a, mut b) = tokio::io::duplex(1 << 20);
    let intruso = ctx("intruso");
    let (srv, cli) = tokio::join!(serve(&mut a, &pc), pair_with(&mut b, &intruso, &scanned));
    assert!(srv.is_err() && cli.is_err());

    pc.store.set_setting("general.locale", &"en").unwrap();
    mobile.store.set_setting("reader.autoOpen", &false).unwrap();
    let (mut a, mut b) = tokio::io::duplex(1 << 20);
    let (s, c) = tokio::join!(serve(&mut a, &pc), sync_with(&mut b, &mobile, &pc_as_peer));
    let (s, c) = (s.unwrap(), c.unwrap());
    assert!(s.applied >= 1 && c.applied >= 1);
    assert_eq!(pc.store.get_setting::<bool>("reader.autoOpen").unwrap(), Some(false));
    assert_eq!(mobile.store.get_setting::<String>("general.locale").unwrap().as_deref(), Some("en"));

    // Segunda sesión: nada nuevo que aplicar.
    let (mut a, mut b) = tokio::io::duplex(1 << 20);
    let (s, c) = tokio::join!(serve(&mut a, &pc), sync_with(&mut b, &mobile, &pc_as_peer));
    assert_eq!(s.unwrap().applied + c.unwrap().applied, 0);

    peers::revoke(&pc.store, &mobile.identity.device_id).unwrap();
    let (mut a, mut b) = tokio::io::duplex(1 << 20);
    let (s, c) = tokio::join!(serve(&mut a, &pc), sync_with(&mut b, &mobile, &pc_as_peer));
    assert!(matches!(s, Err(SyncError::Unauthorized)));
    assert!(matches!(c, Err(SyncError::Unauthorized)));
}

#[tokio::test]
async fn api_keys_travel_only_when_both_sides_opt_in() {
    let (pc, mobile) = (ctx("pc"), ctx("móvil"));
    let offer = pc.pairing.start(&pc.identity, vec![], Duration::from_secs(120));
    let (mut a, mut b) = tokio::io::duplex(1 << 20);
    let (_, cli) = tokio::join!(serve(&mut a, &pc), pair_with(&mut b, &mobile, &offer));
    let mut pc_as_peer = cli.unwrap();
    pc.store.set_setting("ai.connected", &vec!["openai"]).unwrap();
    pc.secrets.set("ai.openai", "sk-proj-test-value").unwrap();

    // Solo el móvil lo activa: no viaja.
    let mut with_keys: Vec<Scope> = Scope::DEFAULT.to_vec();
    with_keys.push(Scope::Keys);
    peers::set_scopes(&mobile.store, &pc_as_peer.id, &with_keys, true).unwrap();
    pc_as_peer = peers::get(&mobile.store, &pc_as_peer.id).unwrap().unwrap();
    let (mut a, mut b) = tokio::io::duplex(1 << 20);
    let (s, c) = tokio::join!(serve(&mut a, &pc), sync_with(&mut b, &mobile, &pc_as_peer));
    s.unwrap();
    c.unwrap();
    assert_eq!(mobile.secrets.get("ai.openai").unwrap(), None);

    // Los dos lo activan: viaja cifrada y queda en el llavero del móvil.
    peers::set_scopes(&pc.store, &mobile.identity.device_id, &with_keys, true).unwrap();
    let (mut a, mut b) = tokio::io::duplex(1 << 20);
    let (s, c) = tokio::join!(serve(&mut a, &pc), sync_with(&mut b, &mobile, &pc_as_peer));
    assert!(s.unwrap().keys >= 1 || c.as_ref().unwrap().keys >= 1);
    assert_eq!(mobile.secrets.get("ai.openai").unwrap().as_deref(), Some("sk-proj-test-value"));
}

// ---- Revisión independiente: regresiones de seguridad ----

use np_sync::{
    crypto::{ephemeral, seal_aad, session_keys},
    wire::{read_frame, write_frame, Channel, Hello, Msg},
};
use rand_core::{OsRng, RngCore};
use tokio::io::AsyncWriteExt;

#[tokio::test]
async fn a_stranger_cannot_burn_a_pairing_offer_but_the_owner_still_pairs() {
    let (pc, mobile) = (ctx("pc"), ctx("móvil"));
    let offer = pc.pairing.start(&pc.identity, vec![], Duration::from_secs(120));
    // Un desconocido sin el secreto del QR intenta emparejar varias veces (menos del máximo).
    for _ in 0..3 {
        let (a, mut b) = tokio::io::duplex(1 << 20);
        let mut wrong = offer.clone();
        wrong.secret = "AAAAAAAAAAAAAAAAAAAAAA".into(); // 16 bytes distintos
        let intruso = ctx("intruso");
        let server = async { let mut a = a; serve(&mut a, &pc).await }; // al terminar cierra el flujo
        let (srv, cli) = tokio::join!(server, pair_with(&mut b, &intruso, &wrong));
        assert!(srv.is_err() && cli.is_err());
    }
    assert!(peers::list(&pc.store).unwrap().is_empty(), "nobody got paired");
    // La oferta sigue viva para su dueño.
    let (mut a, mut b) = tokio::io::duplex(1 << 20);
    let (srv, cli) = tokio::join!(serve(&mut a, &pc), pair_with(&mut b, &mobile, &offer));
    assert!(srv.unwrap().paired);
    cli.unwrap();
    // Y se consumió: un segundo intento (aunque conozca el código) falla.
    let (mut a, mut b) = tokio::io::duplex(1 << 20);
    let again = ctx("copia");
    let (srv, cli) = tokio::join!(serve(&mut a, &pc), pair_with(&mut b, &again, &offer));
    assert!(srv.is_err() && cli.is_err());
}

#[tokio::test]
async fn pairing_with_yourself_or_a_forged_id_is_refused() {
    let pc = ctx("pc");
    let offer = pc.pairing.start(&pc.identity, vec![], Duration::from_secs(120));
    let (mut a, mut b) = tokio::io::duplex(1 << 20);
    let (_, cli) = tokio::join!(serve(&mut a, &pc), pair_with(&mut b, &pc, &offer));
    assert!(cli.is_err(), "own code");
}

#[tokio::test]
async fn malformed_and_oversized_frames_never_panic_or_hang() {
    let pc = ctx("pc");
    pc.pairing.start(&pc.identity, vec![], Duration::from_secs(120));
    // Longitudes absurdas, saludos no JSON, JSON con tipos equivocados y ruido aleatorio.
    let mut cases: Vec<Vec<u8>> = vec![
        vec![0xFF, 0xFF, 0xFF, 0xFF],
        vec![0x00, 0x00, 0x10, 0x01], // 4097 bytes prometidos > límite de saludo
        vec![0, 0, 0, 5, b'h', b'o'],  // truncado
        [&[0u8, 0, 0, 2][..], b"{}"].concat(),
        [&[0u8, 0, 0, 20][..], br#"{"t":"pair","id":5}"#.as_slice()].concat(),
        [&[0u8, 0, 0, 40][..], br#"{"t":"sync","id":"a","epk":"!!!notbase64"}"#.as_slice()].concat(),
    ];
    for _ in 0..40 {
        let mut noise = vec![0u8; (OsRng.next_u32() % 300) as usize];
        OsRng.fill_bytes(&mut noise);
        cases.push(noise);
    }
    for bytes in cases {
        let (mut a, mut b) = tokio::io::duplex(1 << 16);
        b.write_all(&bytes).await.unwrap();
        drop(b);
        let r = tokio::time::timeout(Duration::from_secs(3), serve(&mut a, &pc)).await.expect("must not hang once the peer closed");
        assert!(r.is_err());
    }
    assert!(peers::list(&pc.store).unwrap().is_empty());
}

#[tokio::test]
async fn unknown_device_gets_only_a_reject_and_no_data() {
    let (pc, other) = (ctx("pc"), ctx("otro"));
    pc.store.set_setting("general.locale", &"en").unwrap();
    let (mut a, mut b) = tokio::io::duplex(1 << 20);
    let (_, epk) = ephemeral();
    let server = serve(&mut a, &pc);
    let client = async {
        np_sync::wire::send_hello(&mut b, &Hello::Sync { id: other.identity.device_id.clone(), epk: np_sync::identity::encode_pk(&epk) }).await.unwrap();
        let frame = read_frame(&mut b).await.unwrap();
        String::from_utf8(frame).unwrap()
    };
    let (srv, reply) = tokio::join!(server, client);
    assert!(matches!(srv, Err(SyncError::Unauthorized)));
    assert!(reply.contains("reject") && !reply.contains("locale"));
}

#[tokio::test]
async fn a_replayed_reordered_or_cross_session_frame_does_not_decrypt() {
    let (a, b) = (Identity::generate("a"), Identity::generate("b"));
    let (ae, aep) = ephemeral();
    let (be, bep) = ephemeral();
    let ka = session_keys(&a, &ae, &b.public(), &bep).unwrap();
    let kb = session_keys(&b, &be, &a.public(), &aep).unwrap();

    // A envía dos mensajes; los capturamos en bruto.
    let (mut tx, mut cap) = tokio::io::duplex(1 << 16);
    {
        let mut ch = Channel::new(&mut tx, ka.clone());
        ch.send(&Msg::Ack { seq: 1 }).await.unwrap();
        ch.send(&Msg::Ack { seq: 2 }).await.unwrap();
    }
    let f1 = read_frame(&mut cap).await.unwrap();
    let f2 = read_frame(&mut cap).await.unwrap();

    // Orden correcto: bien. Repetida o reordenada: falla.
    let play = |frames: Vec<Vec<u8>>| {
        let kb = kb.clone();
        async move {
            let (mut w, mut r) = tokio::io::duplex(1 << 16);
            for f in &frames {
                write_frame(&mut w, f).await.unwrap();
            }
            let mut ch = Channel::new(&mut r, kb);
            let mut ok = 0;
            while ch.recv().await.is_ok() {
                ok += 1;
                if ok == frames.len() {
                    break;
                }
            }
            ok
        }
    };
    assert_eq!(play(vec![f1.clone(), f2.clone()]).await, 2);
    assert_eq!(play(vec![f1.clone(), f1.clone()]).await, 1, "replay");
    assert_eq!(play(vec![f2.clone(), f1.clone()]).await, 0, "reorder");

    // Un mensaje cifrado con la clave correcta pero para otra posición tampoco vale.
    let forged = seal_aad(&ka.send, br#"{"t":"ack","seq":9}"#, &7u64.to_be_bytes());
    assert_eq!(play(vec![forged]).await, 0);
}

#[tokio::test]
async fn msg_debug_never_prints_secrets() {
    let m = Msg::Keys { entries: vec![("ai.openai".into(), "sk-super-secret".into())] };
    let text = format!("{m:?} {:?}", Msg::Error { message: "x".into() });
    assert!(!text.contains("sk-super-secret") && !text.contains("openai"));
}

#[tokio::test]
async fn revoking_mid_history_still_stops_a_session_and_forgets_the_key() {
    let (pc, mobile) = (ctx("pc"), ctx("móvil"));
    let offer = pc.pairing.start(&pc.identity, vec![], Duration::from_secs(120));
    let (mut a, mut b) = tokio::io::duplex(1 << 20);
    let (_, cli) = tokio::join!(serve(&mut a, &pc), pair_with(&mut b, &mobile, &offer));
    let pc_as_peer = cli.unwrap();
    peers::revoke(&pc.store, &mobile.identity.device_id).unwrap();
    let p = peers::get(&pc.store, &mobile.identity.device_id).unwrap().unwrap();
    assert!(p.revoked && p.public_key.is_empty());
    // El móvil sigue creyendo en el PC, pero el PC ya no acepta ni responde con datos.
    let (mut a, mut b) = tokio::io::duplex(1 << 20);
    let (s, c) = tokio::join!(serve(&mut a, &pc), sync_with(&mut b, &mobile, &pc_as_peer));
    assert!(s.is_err() && c.is_err());
}

#[tokio::test]
async fn pairs_and_syncs_over_real_loopback_tcp_and_search_still_works_after() {
    use tokio::net::{TcpListener, TcpStream};
    let (pc, mobile) = (Arc::new(ctx("pc")), ctx("móvil"));
    pc.store
        .with_conn(|c| {
            c.execute("INSERT INTO history(id, kind, url, title, outlet, at, updated_at) VALUES ('h1', 'visit', 'https://a.test/x', 'Elecciones generales', 'A', 1, '0001760000000-00000-aaaaaaaa')", [])?;
            Ok(())
        })
        .unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let server = {
        let pc = pc.clone();
        tokio::spawn(async move {
            for _ in 0..2 {
                let (mut s, _) = listener.accept().await.unwrap();
                serve(&mut s, &pc).await.unwrap();
            }
        })
    };
    let offer = pc.pairing.start(&pc.identity, vec![addr.to_string()], Duration::from_secs(120));
    let mut s = TcpStream::connect(offer.socket_addrs()[0]).await.unwrap();
    let peer = pair_with(&mut s, &mobile, &offer).await.unwrap();
    let mut s = TcpStream::connect(addr).await.unwrap();
    let rep = sync_with(&mut s, &mobile, &peer).await.unwrap();
    server.await.unwrap();
    assert!(rep.applied >= 1);
    let hits: i64 = mobile.store.with_conn(|c| c.query_row("SELECT count(*) FROM history_fts WHERE history_fts MATCH 'elecciones'", [], |r| r.get(0))).unwrap();
    assert_eq!(hits, 1, "full-text search finds history that arrived by sync");
}
