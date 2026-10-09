use np_feeds::text::Lang;
use np_lexicon::{
    schema::{Bloc, PartiesFile, Party, Speech},
    slant::{build, count},
};

fn parties(left: &str, right: &str) -> PartiesFile {
    let p = |id: &str, bloc| Party { id: id.into(), name: id.into(), short: id.into(), color: "#000000".into(), order: 50, bloc };
    PartiesFile { version: 1, parliament: "test".into(), parties: vec![p(left, Some(Bloc::Left)), p(right, Some(Bloc::Right)), p("CENTRO", None)] }
}

fn speeches() -> Vec<Speech> {
    let s = |party: &str, text: &str| Speech { date: "2026-01-01".into(), speaker: "x".into(), party: party.into(), text: text.into() };
    let mut v = Vec::new();
    for _ in 0..20 {
        v.push(s("IZQ", "Defendemos la justicia social y los derechos laborales frente a la patronal."));
        v.push(s("DER", "Defendemos la libertad económica y la seguridad jurídica frente a la presión fiscal."));
        v.push(s("CENTRO", "Defendemos la patronal y la presión fiscal en igual medida."));
        v.push(s("IZQ", "El salario mínimo protege a las familias trabajadoras."));
        v.push(s("DER", "El salario mínimo destruye empleo en el campo."));
    }
    v
}

#[test]
fn phrases_used_by_one_bloc_get_that_sign_and_centre_is_ignored() {
    let counts = count(&speeches(), &parties("IZQ", "DER"), Lang::Es);
    let lex = build(&counts, 5, 50);
    let w = |p: &str| lex.iter().find(|e| e.phrase == p).map(|e| e.weight);
    assert!(w("justicia social").unwrap() < 0.0);
    assert!(w("libertad economica").unwrap() > 0.0);
    assert!(lex.iter().all(|e| e.weight.abs() <= 1.0 + 1e-9));
    assert!(lex.iter().any(|e| (e.weight.abs() - 1.0).abs() < 1e-9));
    assert!(w("salario minimo").is_none(), "used equally by both blocs");
}

#[test]
fn mirror_test_swapping_blocs_inverts_every_weight() {
    let a = build(&count(&speeches(), &parties("IZQ", "DER"), Lang::Es), 5, 50);
    let b = build(&count(&speeches(), &parties("DER", "IZQ"), Lang::Es), 5, 50);
    assert_eq!(a.len(), b.len());
    for e in &a {
        let m = b.iter().find(|x| x.phrase == e.phrase).expect("same phrases");
        assert!((e.weight + m.weight).abs() < 1e-9, "{}: {} vs {}", e.phrase, e.weight, m.weight);
        assert!((e.chi2 - m.chi2).abs() < 1e-9);
    }
}
