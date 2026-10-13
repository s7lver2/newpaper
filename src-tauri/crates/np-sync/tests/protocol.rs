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
