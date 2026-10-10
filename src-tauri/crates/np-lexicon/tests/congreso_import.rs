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

#[test]
fn government_headers_use_the_surname_in_parentheses_even_when_wrapped() {
    let text = "El señor VICEPRESIDENTE (Rodríguez Gómez de Celis): Gracias.\n\
        La señora VICEPRESIDENTA TERCERA Y MINISTRA PARA LA TRANSICIÓN ECOLÓGICA Y EL\n\
        RETO DEMOGRÁFICO (Aagesen Muñoz): La transición ecológica crea empleo.\n\
        El señor MINISTRO DEL INTERIOR (Grande-Marlaska Gómez): Defendemos la seguridad.\n";
    let deputies = load_deputies(
        r#"[{"apellidos":"AAGESEN MUÑOZ","nombre":"Sara","grupo":"GS"},{"apellidos":"GRANDE-MARLASKA GÓMEZ","nombre":"Fernando","grupo":"GS"},{"apellidos":"RODRÍGUEZ GÓMEZ DE CELIS","nombre":"Alfonso","grupo":"GS"}]"#,
    )
    .unwrap();
    let speeches = speeches_from_text(text, "2026-02-10", &deputies);
    assert_eq!(speeches.len(), 2, "the chair is excluded, wrapped and ministerial headers are kept");
    assert!(speeches[0].text.starts_with("La transición ecológica"));
    assert_eq!(speeches[1].party, "GS");
}
