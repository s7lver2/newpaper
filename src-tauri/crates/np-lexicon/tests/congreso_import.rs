use np_lexicon::congreso::{load_deputies, speeches_from_text, split_turns};

#[test]
fn splits_speaker_turns_and_drops_chair_and_stage_directions() {
    let text = include_str!("fixtures/ds_sample.txt");
    let turns = split_turns(text);
    assert_eq!(turns.len(), 5);
    assert!(turns[1].1.contains("proteger los derechos laborales."));
    assert!(!turns[1].1.contains("Aplausos"));

    let deputies = load_deputies(include_str!("fixtures/diputados_sample.json")).unwrap();
    let speeches = speeches_from_text(text, "2026-02-10", &deputies);
    assert_eq!(speeches.len(), 3, "presidency turns are excluded");
    assert_eq!(speeches[0].party, "GS");
    assert_eq!(speeches[1].party, "GP");
    assert!(speeches[1].text.starts_with("La seguridad jurídica"));
    assert_eq!(speeches[2].date, "2026-02-10");
}
