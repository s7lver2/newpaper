use np_feeds::{
    fetch::{fetch_feed, FetchOutcome, MAX_FEED_BYTES},
    FeedsError,
};
use wiremock::{
    matchers::{header, method, path},
    Mock, MockServer, ResponseTemplate,
};

#[tokio::test]
async fn fetches_body_and_validators() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/rss"))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("ETag", "\"abc\"")
                .insert_header("Last-Modified", "Tue, 06 Oct 2026 06:00:00 GMT")
                .set_body_string("<rss/>"),
        )
        .mount(&server)
        .await;
    let out = fetch_feed(&reqwest::Client::new(), &format!("{}/rss", server.uri()), None, None).await.unwrap();
    assert_eq!(
        out,
        FetchOutcome::Fetched {
            body: b"<rss/>".to_vec(),
            etag: Some("\"abc\"".into()),
            last_modified: Some("Tue, 06 Oct 2026 06:00:00 GMT".into())
        }
    );
}

#[tokio::test]
async fn sends_if_none_match_and_handles_304() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/rss"))
        .and(header("If-None-Match", "\"abc\""))
        .respond_with(ResponseTemplate::new(304))
        .mount(&server)
        .await;
    let out = fetch_feed(&reqwest::Client::new(), &format!("{}/rss", server.uri()), Some("\"abc\""), None).await.unwrap();
    assert_eq!(out, FetchOutcome::NotModified);
}

#[tokio::test]
async fn non_success_and_oversized_bodies_are_errors() {
    let server = MockServer::start().await;
    Mock::given(method("GET")).and(path("/forbidden")).respond_with(ResponseTemplate::new(403)).mount(&server).await;
    Mock::given(method("GET"))
        .and(path("/huge"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(vec![b'x'; MAX_FEED_BYTES + 1]))
        .mount(&server)
        .await;
    let c = reqwest::Client::new();
    assert!(matches!(fetch_feed(&c, &format!("{}/forbidden", server.uri()), None, None).await.unwrap_err(), FeedsError::Status(403)));
    assert!(matches!(fetch_feed(&c, &format!("{}/huge", server.uri()), None, None).await.unwrap_err(), FeedsError::TooLarge(_)));
}
