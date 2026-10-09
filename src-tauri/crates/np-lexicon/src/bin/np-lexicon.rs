//! np-lexicon import-congreso --text-dir <dir> --deputies <json> --out <speeches.jsonl>
//! np-lexicon build --speeches <jsonl> --parties <json> --lang es --legislature XV --min-count 10 --top 1500 --out <lexicon.json>
use std::{collections::HashMap, fs, io::Write, path::PathBuf};

use np_feeds::text::Lang;
use np_lexicon::{
    congreso::{load_deputies, speeches_from_text},
    schema::{Bloc, BlocsUsed, Lexicon, PartiesFile, Speech},
    slant::{build, count},
    LexError,
};

fn args() -> (String, HashMap<String, String>) {
    let mut it = std::env::args().skip(1);
    let cmd = it.next().unwrap_or_default();
    let mut map = HashMap::new();
    while let Some(k) = it.next() {
        if let Some(name) = k.strip_prefix("--") {
            map.insert(name.to_string(), it.next().unwrap_or_default());
        }
    }
    (cmd, map)
}

fn need<'a>(m: &'a HashMap<String, String>, k: &str) -> Result<&'a str, LexError> {
    m.get(k).map(String::as_str).ok_or_else(|| LexError::Usage(format!("missing --{k}")))
}

fn import(m: &HashMap<String, String>) -> Result<(), LexError> {
    let deputies = load_deputies(&fs::read_to_string(need(m, "deputies")?)?)?;
    let mut out = fs::File::create(need(m, "out")?)?;
    let mut entries: Vec<PathBuf> = fs::read_dir(need(m, "text-dir")?)?.filter_map(|e| e.ok().map(|e| e.path())).filter(|p| p.extension().is_some_and(|x| x == "txt")).collect();
    entries.sort();
    let mut n = 0;
    for p in entries {
        let date = p.file_stem().and_then(|s| s.to_str()).and_then(|s| s.split('_').next()).unwrap_or("unknown").to_string();
        for s in speeches_from_text(&fs::read_to_string(&p)?, &date, &deputies) {
            writeln!(out, "{}", serde_json::to_string(&s)?)?;
            n += 1;
        }
    }
    eprintln!("{n} speeches written");
    Ok(())
}

fn build_cmd(m: &HashMap<String, String>) -> Result<(), LexError> {
    let speeches: Vec<Speech> = fs::read_to_string(need(m, "speeches")?)?.lines().filter(|l| !l.trim().is_empty()).map(serde_json::from_str).collect::<Result<_, _>>()?;
    let parties: PartiesFile = serde_json::from_str(&fs::read_to_string(need(m, "parties")?)?)?;
    let lang_code = need(m, "lang")?;
    let lang = Lang::from_code(lang_code);
    let min: u32 = m.get("min-count").and_then(|v| v.parse().ok()).unwrap_or(10);
    let top: usize = m.get("top").and_then(|v| v.parse().ok()).unwrap_or(1500);
    let phrases = build(&count(&speeches, &parties, lang), min, top);
    let ids = |b: Bloc| parties.parties.iter().filter(|p| p.bloc == Some(b)).map(|p| p.id.clone()).collect();
    let lex = Lexicon {
        version: 1,
        locale: lang_code.to_string(),
        legislature: need(m, "legislature")?.to_string(),
        source: parties.parliament.clone(),
        built_at: chrono::Utc::now().format("%Y-%m-%d").to_string(),
        status: if phrases.is_empty() { "pending".into() } else { "ready".into() },
        blocs: BlocsUsed { left: ids(Bloc::Left), right: ids(Bloc::Right) },
        phrases,
    };
    fs::write(need(m, "out")?, serde_json::to_string_pretty(&lex)?)?;
    eprintln!("{} phrases from {} speeches", lex.phrases.len(), speeches.len());
    Ok(())
}

fn main() {
    let (cmd, m) = args();
    let r = match cmd.as_str() {
        "import-congreso" => import(&m),
        "build" => build_cmd(&m),
        _ => Err(LexError::Usage("expected `import-congreso` or `build`".into())),
    };
    if let Err(e) = r {
        eprintln!("np-lexicon: {e}");
        std::process::exit(2);
    }
}
