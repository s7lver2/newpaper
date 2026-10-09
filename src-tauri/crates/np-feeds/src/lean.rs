//! Línea editorial medida (§5.2): 0,60·propia + 0,25·audiencia + 0,15·externa, con incertidumbre.

use serde::{Deserialize, Serialize};

pub const W_OWN: f64 = 0.60;
pub const W_AUDIENCE: f64 = 0.25;
pub const W_EXTERNAL: f64 = 0.15;
/// Desviación típica de una uniforme 0–100; se usa cuando n < 2.
pub const SD_UNIFORM_0_100: f64 = 28.867_513_459_481_29;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SampleStats {
    pub mean: f64,
    /// Error estándar de la media.
    pub se: f64,
    pub n: usize,
}

pub fn sample_stats(values: &[f64]) -> Option<SampleStats> {
    let n = values.len();
    if n == 0 {
        return None;
    }
    let mean = values.iter().sum::<f64>() / n as f64;
    let sd = if n < 2 { SD_UNIFORM_0_100 } else { (values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / (n as f64 - 1.0)).sqrt() };
    Some(SampleStats { mean, se: sd / (n as f64).sqrt(), n })
}

#[derive(Debug, Clone, PartialEq)]
pub struct LeanInputs {
    pub own: Option<SampleStats>,
    pub audience: Option<f64>,
    pub external: Vec<f64>,
    pub prior_default_sd: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeanEstimate {
    /// 0 (izquierda) – 100 (derecha).
    pub value: f64,
    /// Semiancho de la franja (se muestra como value ± uncertainty).
    pub uncertainty: f64,
    pub own: Option<f64>,
    pub own_n: usize,
    pub audience: Option<f64>,
    pub external: Option<f64>,
    /// Pesos efectivos tras renormalizar: [propia, audiencia, externa].
    pub weights: [f64; 3],
}

fn pop_sd(values: &[f64]) -> f64 {
    let m = values.iter().sum::<f64>() / values.len() as f64;
    (values.iter().map(|v| (v - m).powi(2)).sum::<f64>() / values.len() as f64).sqrt()
}

/// Si falta algún componente, su peso se reparte proporcionalmente entre los presentes.
/// Incertidumbre = sqrt((w_propia·se_propia)² + ((w_audiencia + w_externa)·D)²), con D la desviación
/// típica poblacional de las priors disponibles (≥ 2) o `prior_default_sd` si solo hay una.
pub fn combine(inp: &LeanInputs) -> Option<LeanEstimate> {
    let external = (!inp.external.is_empty()).then(|| inp.external.iter().sum::<f64>() / inp.external.len() as f64);
    let raw = [
        inp.own.map(|_| W_OWN).unwrap_or(0.0),
        inp.audience.map(|_| W_AUDIENCE).unwrap_or(0.0),
        external.map(|_| W_EXTERNAL).unwrap_or(0.0),
    ];
    let total: f64 = raw.iter().sum();
    if total == 0.0 {
        return None;
    }
    let w = [raw[0] / total, raw[1] / total, raw[2] / total];
    let value = w[0] * inp.own.map_or(0.0, |s| s.mean) + w[1] * inp.audience.unwrap_or(0.0) + w[2] * external.unwrap_or(0.0);
    let mut priors: Vec<f64> = inp.audience.into_iter().collect();
    priors.extend(inp.external.iter().copied());
    let d = match priors.len() {
        0 => 0.0,
        1 => inp.prior_default_sd,
        _ => pop_sd(&priors),
    };
    let uncertainty = ((w[0] * inp.own.map_or(0.0, |s| s.se)).powi(2) + ((w[1] + w[2]) * d).powi(2)).sqrt();
    Some(LeanEstimate { value, uncertainty, own: inp.own.map(|s| s.mean), own_n: inp.own.map_or(0, |s| s.n), audience: inp.audience, external, weights: w })
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reliability {
    /// Proporción 0–1 de afirmaciones comprobables que resultaron `verificado`.
    pub ratio: f64,
    pub n: usize,
}

/// Cuentan verificado, enganoso, falso y falta_contexto; se excluyen opinion y no_verificable.
pub fn reliability(statuses: &[String]) -> Option<Reliability> {
    let counted: Vec<&String> = statuses.iter().filter(|s| matches!(s.as_str(), "verificado" | "enganoso" | "falso" | "falta_contexto")).collect();
    if counted.is_empty() {
        return None;
    }
    let ok = counted.iter().filter(|s| s.as_str() == "verificado").count();
    Some(Reliability { ratio: ok as f64 / counted.len() as f64, n: counted.len() })
}


#[cfg(test)]
mod tests {
    use super::*;

    fn approx(a: f64, b: f64) {
        assert!((a - b).abs() < 1e-6, "{a} != {b}");
    }

    #[test]
    fn spec_weights_with_all_components() {
        let e = combine(&LeanInputs { own: Some(SampleStats { mean: 30.0, se: 5.0, n: 40 }), audience: Some(40.0), external: vec![20.0], prior_default_sd: 10.0 }).unwrap();
        approx(e.value, 0.60 * 30.0 + 0.25 * 40.0 + 0.15 * 20.0);
        approx(e.uncertainty, 5.0); // sqrt((0,6·5)² + (0,4·10)²), D = sd{40,20} = 10
        approx(e.weights[0], 0.60);
        assert_eq!(e.own_n, 40);
    }

    #[test]
    fn missing_components_renormalize_weights() {
        let e = combine(&LeanInputs { own: Some(SampleStats { mean: 70.0, se: 4.0, n: 10 }), audience: Some(60.0), external: vec![], prior_default_sd: 10.0 }).unwrap();
        approx(e.weights[0], 0.60 / 0.85);
        approx(e.value, (0.60 * 70.0 + 0.25 * 60.0) / 0.85);
        approx(e.uncertainty, ((0.60 / 0.85 * 4.0f64).powi(2) + (0.25 / 0.85 * 10.0f64).powi(2)).sqrt());
        assert!(combine(&LeanInputs { own: None, audience: None, external: vec![], prior_default_sd: 10.0 }).is_none());
    }

    #[test]
    fn sample_stats_uses_n_minus_one_and_uniform_sd_for_single_values() {
        let s = sample_stats(&[20.0, 30.0, 40.0]).unwrap();
        approx(s.mean, 30.0);
        approx(s.se, 10.0 / 3f64.sqrt());
        approx(sample_stats(&[50.0]).unwrap().se, SD_UNIFORM_0_100);
        assert!(sample_stats(&[]).is_none());
    }

    #[test]
    fn reliability_excludes_opinion_and_unverifiable() {
        let st: Vec<String> = ["verificado", "verificado", "falso", "opinion", "no_verificable", "falta_contexto"].iter().map(|s| s.to_string()).collect();
        let r = reliability(&st).unwrap();
        assert_eq!(r.n, 4);
        approx(r.ratio, 0.5);
        assert!(reliability(&["opinion".to_string()]).is_none());
    }
}
