use np_feeds::{config::Sources, priors::OutletPriors, text::Lang, topics::Topics};

fn read(name: &str) -> String {
    std::fs::read_to_string(format!("{}/../../../config/{name}", env!("CARGO_MANIFEST_DIR"))).unwrap()
}

#[test]
fn shipped_config_files_are_valid() {
    let es = Sources::from_json(&read("sources-es.json")).unwrap();
    assert_eq!(es.outlets.len(), 34);
    Sources::from_json(&read("sources-en.json")).unwrap();
    Sources::from_json(&read("sources-de.json")).unwrap();
    for (f, l) in [("topics-es.json", Lang::Es), ("topics-en.json", Lang::En), ("topics-de.json", Lang::De)] {
        Topics::from_json(&read(f), l).unwrap();
    }
    OutletPriors::from_json(&read("outlet-priors.json")).unwrap();
}
