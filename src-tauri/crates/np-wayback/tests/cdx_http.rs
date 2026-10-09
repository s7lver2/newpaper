use np_wayback::{cdx::{fetch_capture, fetch_cdx}, repo::{cached_cdx, store_cdx}};
use wiremock::{matchers::{method, path, query_param}, Mock, MockServer, ResponseTemplate};

#[tokio::test]
async fn fetches_cdx_and_raw_capture_and_caches_for_six_hours() {
    let server = MockServer::start().await;
    Mock::given(method("GET")).and(path("/cdx/search/cdx")).and(query_param("url", "https://elpais.com/a"))
        .respond_with(ResponseTemplate::new(200).set_body_string(include_str!("fixtures/cdx.json"))).mount(&server).await;
    Mock::given(method("GET")).and(path("/web/20261006060000id_/https://elpais.com/a"))
        .respond_with(ResponseTemplate::new(200).set_body_string("<html><h1>v1</h1></html>")).mount(&server).await;
    let c = reqwest::Client::new();
    let rows = fetch_cdx(&c, &server.uri(), "https://elpais.com/a").await.unwrap();
    assert_eq!(rows.len(), 3);
    assert!(fetch_capture(&c, &server.uri(), "20261006060000", "https://elpais.com/a").await.unwrap().contains("v1"));

    let store = np_store::Store::open_in_memory().unwrap();
    store.with_conn(|conn| {
        store_cdx(conn, "https://elpais.com/a", &rows, 1_000).unwrap();
        assert_eq!(cached_cdx(conn, "https://elpais.com/a", 1_000 + 3600).unwrap().unwrap().len(), 3);
        assert!(cached_cdx(conn, "https://elpais.com/a", 1_000 + 7 * 3600).unwrap().is_none());
        Ok(())
    }).unwrap();
}
