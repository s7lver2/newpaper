//! Consumo mensual por proveedor y modelo (§6.2 "Contabilidad real con usage").
use np_store::{Store, StoreError};
use rusqlite::params;
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelUsage {
    pub provider: String,
    pub model: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cost: f64,
    pub requests: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthUsage {
    pub month: String,
    pub cost: f64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub by_model: Vec<ModelUsage>,
}

pub fn record(store: &Store, month: &str, provider: &str, model: &str, input: i64, output: i64, cost: f64) -> Result<(), StoreError> {
    store.with_conn(|c| {
        c.execute(
            "INSERT INTO usage(month, provider, model, input_tokens, output_tokens, cost, requests) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)
             ON CONFLICT(month, provider, model) DO UPDATE SET input_tokens = input_tokens + excluded.input_tokens,
               output_tokens = output_tokens + excluded.output_tokens, cost = cost + excluded.cost, requests = requests + 1",
            params![month, provider, model, input, output, cost],
        )
    })?;
    Ok(())
}

pub fn month_total(store: &Store, month: &str) -> Result<MonthUsage, StoreError> {
    let by_model: Vec<ModelUsage> = store.with_conn(|c| {
        let mut st = c.prepare("SELECT provider, model, input_tokens, output_tokens, cost, requests FROM usage WHERE month = ?1 ORDER BY cost DESC, provider, model")?;
        let rows = st.query_map([month], |r| Ok(ModelUsage { provider: r.get(0)?, model: r.get(1)?, input_tokens: r.get(2)?, output_tokens: r.get(3)?, cost: r.get(4)?, requests: r.get(5)? }))?;
        rows.collect()
    })?;
    Ok(MonthUsage {
        month: month.to_string(),
        cost: by_model.iter().map(|m| m.cost).sum(),
        input_tokens: by_model.iter().map(|m| m.input_tokens).sum(),
        output_tokens: by_model.iter().map(|m| m.output_tokens).sum(),
        by_model,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accumulates_per_month_and_model() {
        let s = Store::open_in_memory().unwrap();
        record(&s, "2026-10", "openai", "gpt-5-mini", 1000, 200, 0.0007).unwrap();
        record(&s, "2026-10", "openai", "gpt-5-mini", 500, 100, 0.0003).unwrap();
        record(&s, "2026-10", "ollama", "qwen3:8b", 900, 90, 0.0).unwrap();
        record(&s, "2026-09", "openai", "gpt-5-mini", 1, 1, 5.0).unwrap();
        let m = month_total(&s, "2026-10").unwrap();
        assert!((m.cost - 0.001).abs() < 1e-9);
        assert_eq!(m.input_tokens, 2400);
        assert_eq!(m.by_model.len(), 2);
        assert_eq!(m.by_model[0].requests, 2);
    }
}
