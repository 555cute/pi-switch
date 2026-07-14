use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use crate::paths;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api: Option<String>,
    #[serde(default)]
    pub reasoning: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context_window: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cost: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compat: Option<Value>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_header: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub headers: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compat: Option<Value>,
    #[serde(default)]
    pub models: Vec<ModelInfo>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_overrides: Option<Value>,
    /// Whether a credential exists in auth.json for this provider
    #[serde(default)]
    pub has_auth: bool,
    /// Masked key preview from auth.json or models.json
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_preview: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiSettings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_provider: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_thinking_level: Option<String>,
    #[serde(default)]
    pub packages: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,
    #[serde(default)]
    pub raw: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvidersOverview {
    pub providers: Vec<ProviderConfig>,
    pub settings: PiSettings,
    pub agent_home: String,
}

fn read_json_file(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(json!({}));
    }
    let text = fs::read_to_string(path).map_err(|e| format!("read {}: {e}", path.display()))?;
    if text.trim().is_empty() {
        return Ok(json!({}));
    }
    serde_json::from_str(&text).map_err(|e| format!("parse {}: {e}", path.display()))
}

fn write_json_file(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
    }
    let pretty =
        serde_json::to_string_pretty(value).map_err(|e| format!("serialize json: {e}"))?;
    fs::write(path, pretty + "\n").map_err(|e| format!("write {}: {e}", path.display()))
}

fn mask_key(key: &str) -> String {
    let key = key.trim();
    if key.is_empty() {
        return String::new();
    }
    if key.starts_with('$') || key.starts_with('!') {
        return key.to_string();
    }
    let chars: Vec<char> = key.chars().collect();
    if chars.len() <= 8 {
        return format!("{}…", chars.iter().take(2).collect::<String>());
    }
    let head: String = chars.iter().take(4).collect();
    let tail: String = chars.iter().rev().take(4).rev().collect();
    format!("{head}…{tail}")
}

fn parse_model(v: &Value) -> Option<ModelInfo> {
    let id = v.get("id")?.as_str()?.to_string();
    let mut extra = Map::new();
    if let Some(obj) = v.as_object() {
        for (k, val) in obj {
            if !matches!(
                k.as_str(),
                "id" | "name"
                    | "api"
                    | "reasoning"
                    | "input"
                    | "contextWindow"
                    | "maxTokens"
                    | "cost"
                    | "compat"
            ) {
                extra.insert(k.clone(), val.clone());
            }
        }
    }
    Some(ModelInfo {
        id,
        name: v
            .get("name")
            .and_then(|x| x.as_str())
            .map(|s| s.to_string()),
        api: v
            .get("api")
            .and_then(|x| x.as_str())
            .map(|s| s.to_string()),
        reasoning: v
            .get("reasoning")
            .and_then(|x| x.as_bool())
            .unwrap_or(false),
        input: v.get("input").and_then(|x| {
            x.as_array().map(|arr| {
                arr.iter()
                    .filter_map(|i| i.as_str().map(|s| s.to_string()))
                    .collect()
            })
        }),
        context_window: v.get("contextWindow").and_then(|x| x.as_u64()),
        max_tokens: v.get("maxTokens").and_then(|x| x.as_u64()),
        cost: v.get("cost").cloned(),
        compat: v.get("compat").cloned(),
        extra,
    })
}

fn load_auth_map() -> Result<BTreeMap<String, Value>, String> {
    let path = paths::auth_json()?;
    let value = read_json_file(&path)?;
    let mut map = BTreeMap::new();
    if let Some(obj) = value.as_object() {
        for (k, v) in obj {
            map.insert(k.clone(), v.clone());
        }
    }
    Ok(map)
}

fn auth_preview_for(provider: &str, auth: &BTreeMap<String, Value>, api_key: Option<&str>) -> (bool, Option<String>) {
    if let Some(entry) = auth.get(provider) {
        let key = entry
            .get("key")
            .and_then(|k| k.as_str())
            .or_else(|| entry.as_str());
        if let Some(k) = key {
            return (true, Some(mask_key(k)));
        }
        return (true, Some("(configured)".into()));
    }
    if let Some(k) = api_key {
        if !k.is_empty() {
            return (true, Some(mask_key(k)));
        }
    }
    (false, None)
}

pub fn load_settings() -> Result<PiSettings, String> {
    let path = paths::settings_json()?;
    let raw = read_json_file(&path)?;
    Ok(PiSettings {
        default_provider: raw
            .get("defaultProvider")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        default_model: raw
            .get("defaultModel")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        default_thinking_level: raw
            .get("defaultThinkingLevel")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        packages: raw
            .get("packages")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|x| x.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default(),
        theme: raw
            .get("theme")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        raw,
    })
}

pub fn load_providers_overview() -> Result<ProvidersOverview, String> {
    let models_path = paths::models_json()?;
    let models_root = read_json_file(&models_path)?;
    let auth = load_auth_map()?;
    let settings = load_settings()?;

    let mut providers = Vec::new();
    if let Some(obj) = models_root.get("providers").and_then(|v| v.as_object()) {
        for (name, cfg) in obj {
            let api_key = cfg
                .get("apiKey")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let (has_auth, auth_preview) =
                auth_preview_for(name, &auth, api_key.as_deref());
            let models = cfg
                .get("models")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(parse_model).collect())
                .unwrap_or_default();

            providers.push(ProviderConfig {
                name: name.clone(),
                base_url: cfg
                    .get("baseUrl")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                api: cfg
                    .get("api")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                api_key: api_key.map(|k| {
                    // never send raw secrets to frontend — only masked or env refs
                    if k.starts_with('$') || k.starts_with('!') {
                        k
                    } else {
                        mask_key(&k)
                    }
                }),
                auth_header: cfg.get("authHeader").and_then(|v| v.as_bool()),
                headers: cfg.get("headers").cloned(),
                compat: cfg.get("compat").cloned(),
                models,
                model_overrides: cfg.get("modelOverrides").cloned(),
                has_auth,
                auth_preview,
            });
        }
    }

    // Also surface providers that only exist in auth.json
    for (name, entry) in &auth {
        if providers.iter().any(|p| p.name == name) {
            continue;
        }
        let key = entry
            .get("key")
            .and_then(|k| k.as_str())
            .or_else(|| entry.as_str());
        providers.push(ProviderConfig {
            name: name.clone(),
            base_url: None,
            api: None,
            api_key: None,
            auth_header: None,
            headers: None,
            compat: None,
            models: vec![],
            model_overrides: None,
            has_auth: true,
            auth_preview: key.map(mask_key).or(Some("(configured)".into())),
        });
    }

    providers.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(ProvidersOverview {
        providers,
        settings,
        agent_home: paths::pi_agent_home()?
            .to_string_lossy()
            .to_string(),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertProviderInput {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api: Option<String>,
    /// If set and not empty: write to models.json apiKey. Prefer env refs like $MY_KEY.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    /// If set: write credential into auth.json for this provider.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_header: Option<bool>,
    #[serde(default)]
    pub models: Vec<ModelInfo>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub headers: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compat: Option<Value>,
}

pub fn upsert_provider(input: UpsertProviderInput) -> Result<ProvidersOverview, String> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err("provider name is required".into());
    }

    let models_path = paths::models_json()?;
    let mut root = read_json_file(&models_path)?;
    if !root.is_object() {
        root = json!({});
    }
    let providers = root
        .as_object_mut()
        .unwrap()
        .entry("providers")
        .or_insert_with(|| json!({}));
    if !providers.is_object() {
        *providers = json!({});
    }

    let mut provider_obj = Map::new();
    if let Some(url) = input.base_url.filter(|s| !s.trim().is_empty()) {
        provider_obj.insert("baseUrl".into(), Value::String(url));
    }
    if let Some(api) = input.api.filter(|s| !s.trim().is_empty()) {
        provider_obj.insert("api".into(), Value::String(api));
    }
    if let Some(key) = input.api_key.filter(|s| !s.trim().is_empty()) {
        // skip writing if value looks like a mask
        if !key.contains('…') && !key.contains("...") {
            provider_obj.insert("apiKey".into(), Value::String(key));
        } else if let Some(existing) = providers
            .get(&name)
            .and_then(|p| p.get("apiKey"))
            .cloned()
        {
            provider_obj.insert("apiKey".into(), existing);
        }
    } else if let Some(existing) = providers
        .get(&name)
        .and_then(|p| p.get("apiKey"))
        .cloned()
    {
        provider_obj.insert("apiKey".into(), existing);
    }
    if let Some(ah) = input.auth_header {
        provider_obj.insert("authHeader".into(), Value::Bool(ah));
    }
    if let Some(headers) = input.headers {
        provider_obj.insert("headers".into(), headers);
    }
    if let Some(compat) = input.compat {
        provider_obj.insert("compat".into(), compat);
    }

    let models_json: Vec<Value> = input
        .models
        .iter()
        .map(|m| {
            let mut obj = Map::new();
            obj.insert("id".into(), Value::String(m.id.clone()));
            if let Some(n) = &m.name {
                obj.insert("name".into(), Value::String(n.clone()));
            }
            if let Some(a) = &m.api {
                obj.insert("api".into(), Value::String(a.clone()));
            }
            if m.reasoning {
                obj.insert("reasoning".into(), Value::Bool(true));
            }
            if let Some(input_types) = &m.input {
                obj.insert(
                    "input".into(),
                    Value::Array(input_types.iter().cloned().map(Value::String).collect()),
                );
            }
            if let Some(cw) = m.context_window {
                obj.insert("contextWindow".into(), json!(cw));
            }
            if let Some(mt) = m.max_tokens {
                obj.insert("maxTokens".into(), json!(mt));
            }
            if let Some(cost) = &m.cost {
                obj.insert("cost".into(), cost.clone());
            }
            if let Some(compat) = &m.compat {
                obj.insert("compat".into(), compat.clone());
            }
            for (k, v) in &m.extra {
                obj.insert(k.clone(), v.clone());
            }
            Value::Object(obj)
        })
        .collect();
    provider_obj.insert("models".into(), Value::Array(models_json));

    providers
        .as_object_mut()
        .unwrap()
        .insert(name.clone(), Value::Object(provider_obj));

    write_json_file(&models_path, &root)?;

    if let Some(auth_key) = input.auth_key.filter(|s| !s.trim().is_empty()) {
        if !auth_key.contains('…') && !auth_key.contains("...") {
            set_auth_key(&name, &auth_key)?;
        }
    }

    load_providers_overview()
}

pub fn delete_provider(name: String) -> Result<ProvidersOverview, String> {
    let models_path = paths::models_json()?;
    let mut root = read_json_file(&models_path)?;
    if let Some(providers) = root.get_mut("providers").and_then(|v| v.as_object_mut()) {
        providers.remove(&name);
    }
    write_json_file(&models_path, &root)?;
    load_providers_overview()
}

pub fn set_auth_key(provider: &str, key: &str) -> Result<(), String> {
    let path = paths::auth_json()?;
    let mut root = read_json_file(&path)?;
    if !root.is_object() {
        root = json!({});
    }
    root.as_object_mut().unwrap().insert(
        provider.to_string(),
        json!({ "type": "api_key", "key": key }),
    );
    write_json_file(&path, &root)
}

pub fn delete_auth_key(provider: String) -> Result<ProvidersOverview, String> {
    let path = paths::auth_json()?;
    let mut root = read_json_file(&path)?;
    if let Some(obj) = root.as_object_mut() {
        obj.remove(&provider);
    }
    write_json_file(&path, &root)?;
    load_providers_overview()
}

pub fn set_default_model(provider: String, model: String) -> Result<PiSettings, String> {
    let path = paths::settings_json()?;
    let mut root = read_json_file(&path)?;
    if !root.is_object() {
        root = json!({});
    }
    let obj = root.as_object_mut().unwrap();
    obj.insert("defaultProvider".into(), Value::String(provider));
    obj.insert("defaultModel".into(), Value::String(model));
    write_json_file(&path, &root)?;
    load_settings()
}
