//! Pares emparejados y su registro (`sync_peers`, `sync_log`).
use np_store::Store;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::{rows::Scope, Result};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Peer {
    pub id: String,
    pub name: String,
    pub public_key: String,
    pub addresses: Vec<String>,
    pub scopes: Vec<Scope>,
    pub send_keys: bool,
    pub paired_at: i64,
    pub last_sync_at: Option<i64>,
    pub revoked: bool,
}

const COLS: &str = "id, name, public_key, addresses, scopes, send_keys, paired_at, last_sync_at, revoked";

fn from_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Peer> {
    let addresses: String = r.get(3)?;
    let scopes: String = r.get(4)?;
    Ok(Peer {
        id: r.get(0)?,
        name: r.get(1)?,
        public_key: r.get(2)?,
        addresses: serde_json::from_str(&addresses).unwrap_or_default(),
        scopes: serde_json::from_str(&scopes).unwrap_or_default(),
        send_keys: r.get::<_, i64>(5)? != 0,
        paired_at: r.get(6)?,
        last_sync_at: r.get(7)?,
        revoked: r.get::<_, i64>(8)? != 0,
    })
}

pub fn upsert(store: &Store, p: &Peer) -> Result<()> {
    let addresses = serde_json::to_string(&p.addresses)?;
    let scopes = serde_json::to_string(&p.scopes)?;
    store.with_tx(|tx| {
        tx.execute(
            &format!(
                "INSERT INTO sync_peers({COLS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
              ON CONFLICT(id) DO UPDATE SET name = excluded.name, public_key = excluded.public_key, addresses = excluded.addresses,
                scopes = excluded.scopes, send_keys = excluded.send_keys, revoked = excluded.revoked"
            ),
            params![p.id, p.name, p.public_key, addresses, scopes, p.send_keys as i64, p.paired_at, p.last_sync_at, p.revoked as i64],
        )?;
        tx.execute("INSERT OR IGNORE INTO sync_log(peer_id) VALUES (?1)", [&p.id])?;
        Ok(())
    })?;
    Ok(())
}

pub fn get(store: &Store, id: &str) -> Result<Option<Peer>> {
    Ok(store.with_conn(|c| c.query_row(&format!("SELECT {COLS} FROM sync_peers WHERE id = ?1"), [id], from_row).optional())?)
}

pub fn list(store: &Store) -> Result<Vec<Peer>> {
    Ok(store.with_conn(|c| {
        let mut st = c.prepare(&format!("SELECT {COLS} FROM sync_peers ORDER BY revoked, paired_at DESC"))?;
        let rows = st.query_map([], from_row)?;
        rows.collect()
    })?)
}

pub fn set_scopes(store: &Store, id: &str, scopes: &[Scope], send_keys: bool) -> Result<()> {
    let s = serde_json::to_string(scopes)?;
    store.with_conn(|c| c.execute("UPDATE sync_peers SET scopes = ?2, send_keys = ?3 WHERE id = ?1", params![id, s, send_keys as i64]))?;
    Ok(())
}

pub fn set_addresses(store: &Store, id: &str, addresses: &[String]) -> Result<()> {
    let a = serde_json::to_string(addresses)?;
    store.with_conn(|c| c.execute("UPDATE sync_peers SET addresses = ?2 WHERE id = ?1", params![id, a]))?;
    Ok(())
}

/// Revocar: el par deja de ser aceptado; se olvidan sus direcciones y su marca.
pub fn revoke(store: &Store, id: &str) -> Result<()> {
    store.with_tx(|tx| {
        tx.execute("UPDATE sync_peers SET revoked = 1, addresses = '[]', send_keys = 0 WHERE id = ?1", [id])?;
        tx.execute("UPDATE sync_log SET sent_seq = 0 WHERE peer_id = ?1", [id])?;
        Ok(())
    })?;
    Ok(())
}

pub fn sent_seq(store: &Store, id: &str) -> Result<i64> {
    Ok(store.with_conn(|c| c.query_row("SELECT sent_seq FROM sync_log WHERE peer_id = ?1", [id], |r| r.get(0)).optional())?.unwrap_or(0))
}

pub fn set_sent_seq(store: &Store, id: &str, seq: i64) -> Result<()> {
    store.with_conn(|c| c.execute("UPDATE sync_log SET sent_seq = max(sent_seq, ?2), last_error = NULL WHERE peer_id = ?1", params![id, seq]))?;
    Ok(())
}

pub fn set_error(store: &Store, id: &str, error: Option<&str>) -> Result<()> {
    store.with_conn(|c| c.execute("UPDATE sync_log SET last_error = ?2 WHERE peer_id = ?1", params![id, error]))?;
    Ok(())
}

pub fn touch(store: &Store, id: &str, at: i64) -> Result<()> {
    store.with_conn(|c| c.execute("UPDATE sync_peers SET last_sync_at = ?2 WHERE id = ?1", params![id, at]))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rows::Scope;

    #[test]
    fn migration_7_journals_changes_and_peers_can_be_revoked() {
        let store = np_store::Store::open_in_memory().unwrap();
        store.set_setting("general.locale", &"es").unwrap();
        let n: i64 = store.with_conn(|c| c.query_row("SELECT count(*) FROM sync_journal WHERE tbl = 'settings'", [], |r| r.get(0))).unwrap();
        assert_eq!(n, 1);
        store.set_setting("general.locale", &"en").unwrap();
        let (n, seq): (i64, i64) = store.with_conn(|c| c.query_row("SELECT count(*), max(seq) FROM sync_journal WHERE tbl = 'settings'", [], |r| Ok((r.get(0)?, r.get(1)?)))).unwrap();
        assert_eq!(n, 1, "one journal entry per row");
        assert!(seq >= 2);

        let p = Peer { id: "m1".into(), name: "Pixel".into(), public_key: "pk".into(), addresses: vec!["192.168.1.9:47100".into()], scopes: vec![Scope::Settings, Scope::Saved], send_keys: false, paired_at: 1, last_sync_at: None, revoked: false };
        upsert(&store, &p).unwrap();
        assert_eq!(get(&store, "m1").unwrap().unwrap().scopes, vec![Scope::Settings, Scope::Saved]);
        assert_eq!(sent_seq(&store, "m1").unwrap(), 0);
        set_sent_seq(&store, "m1", 42).unwrap();
        assert_eq!(sent_seq(&store, "m1").unwrap(), 42);
        revoke(&store, "m1").unwrap();
        let r = get(&store, "m1").unwrap().unwrap();
        assert!(r.revoked);
        assert!(r.addresses.is_empty());
        assert!(list(&store).unwrap().iter().all(|x| x.id != "m1" || x.revoked));
    }
}
