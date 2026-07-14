use chrono::{DateTime, Datelike, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use crate::paths;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenTotals {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    pub total_tokens: u64,
    pub cost: f64,
    pub messages: u64,
    pub errors: u64,
}

impl TokenTotals {
    fn add_usage(&mut self, usage: &Value) {
        self.input += usage.get("input").and_then(|v| v.as_u64()).unwrap_or(0);
        self.output += usage.get("output").and_then(|v| v.as_u64()).unwrap_or(0);
        self.cache_read += usage
            .get("cacheRead")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        self.cache_write += usage
            .get("cacheWrite")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        self.total_tokens += usage
            .get("totalTokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        if let Some(cost) = usage.get("cost") {
            self.cost += cost.get("total").and_then(|v| v.as_f64()).unwrap_or(0.0);
        }
        self.messages += 1;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderUsage {
    pub provider: String,
    pub model: String,
    pub totals: TokenTotals,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyUsage {
    pub date: String,
    pub totals: TokenTotals,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolUsage {
    pub name: String,
    pub count: u64,
    pub errors: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillUsage {
    pub name: String,
    pub count: u64,
    pub last_used: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub path: String,
    pub cwd: Option<String>,
    pub started_at: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub totals: TokenTotals,
    pub message_count: u64,
    pub tool_calls: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageOverview {
    pub totals: TokenTotals,
    pub by_provider_model: Vec<ProviderUsage>,
    pub by_day: Vec<DailyUsage>,
    pub tools: Vec<ToolUsage>,
    pub skills: Vec<SkillUsage>,
    pub sessions: Vec<SessionSummary>,
    pub session_files: u64,
    pub scanned_lines: u64,
    pub extension_events: u64,
}

fn parse_day(ts: &str) -> Option<String> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(ts) {
        return Some(dt.with_timezone(&Utc).format("%Y-%m-%d").to_string());
    }
    // filename style 2026-07-12T15-44-18-294Z
    if ts.len() >= 10 {
        let d = &ts[..10];
        if NaiveDate::parse_from_str(d, "%Y-%m-%d").is_ok() {
            return Some(d.to_string());
        }
    }
    None
}

fn session_id_from_path(path: &Path) -> String {
    path.file_stem()
        .and_then(|s| s.to_str())
        .map(|s| {
            // 2026-07-12T15-44-18-294Z_uuid
            s.split('_').nth(1).unwrap_or(s).to_string()
        })
        .unwrap_or_else(|| path.display().to_string())
}

fn extract_skill_name(text: &str) -> Option<String> {
    // /skill:name or skill invocation patterns
    if let Some(rest) = text.strip_prefix("/skill:") {
        let name = rest.split_whitespace().next().unwrap_or("").trim();
        if !name.is_empty() {
            return Some(name.to_string());
        }
    }
    // <skill name="...">
    if let Some(idx) = text.find("skill name=\"") {
        let start = idx + "skill name=\"".len();
        if let Some(end) = text[start..].find('"') {
            let name = &text[start..start + end];
            if !name.is_empty() {
                return Some(name.to_string());
            }
        }
    }
    None
}

fn message_text(message: &Value) -> String {
    match message.get("content") {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(parts)) => parts
            .iter()
            .filter_map(|p| {
                if p.get("type").and_then(|t| t.as_str()) == Some("text") {
                    p.get("text").and_then(|t| t.as_str()).map(|s| s.to_string())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

struct Acc {
    totals: TokenTotals,
    by_pm: BTreeMap<(String, String), TokenTotals>,
    by_day: BTreeMap<String, TokenTotals>,
    tools: BTreeMap<String, (u64, u64)>,
    skills: BTreeMap<String, (u64, Option<String>)>,
    sessions: Vec<SessionSummary>,
    session_files: u64,
    scanned_lines: u64,
    extension_events: u64,
}

impl Acc {
    fn new() -> Self {
        Self {
            totals: TokenTotals::default(),
            by_pm: BTreeMap::new(),
            by_day: BTreeMap::new(),
            tools: BTreeMap::new(),
            skills: BTreeMap::new(),
            sessions: Vec::new(),
            session_files: 0,
            scanned_lines: 0,
            extension_events: 0,
        }
    }

    fn add_assistant(
        &mut self,
        provider: &str,
        model: &str,
        usage: &Value,
        day: Option<&str>,
        stop_reason: Option<&str>,
    ) {
        self.totals.add_usage(usage);
        if stop_reason == Some("error") {
            self.totals.errors += 1;
        }
        let entry = self
            .by_pm
            .entry((provider.to_string(), model.to_string()))
            .or_default();
        entry.add_usage(usage);
        if stop_reason == Some("error") {
            entry.errors += 1;
        }
        if let Some(d) = day {
            let day_entry = self.by_day.entry(d.to_string()).or_default();
            day_entry.add_usage(usage);
            if stop_reason == Some("error") {
                day_entry.errors += 1;
            }
        }
    }

    fn into_overview(mut self) -> UsageOverview {
        let mut by_provider_model: Vec<ProviderUsage> = self
            .by_pm
            .into_iter()
            .map(|((provider, model), totals)| ProviderUsage {
                provider,
                model,
                totals,
            })
            .collect();
        by_provider_model.sort_by(|a, b| {
            b.totals
                .total_tokens
                .cmp(&a.totals.total_tokens)
                .then(a.provider.cmp(&b.provider))
        });

        let mut by_day: Vec<DailyUsage> = self
            .by_day
            .into_iter()
            .map(|(date, totals)| DailyUsage { date, totals })
            .collect();
        by_day.sort_by(|a, b| a.date.cmp(&b.date));

        let mut tools: Vec<ToolUsage> = self
            .tools
            .into_iter()
            .map(|(name, (count, errors))| ToolUsage {
                name,
                count,
                errors,
            })
            .collect();
        tools.sort_by(|a, b| b.count.cmp(&a.count).then(a.name.cmp(&b.name)));

        let mut skills: Vec<SkillUsage> = self
            .skills
            .into_iter()
            .map(|(name, (count, last_used))| SkillUsage {
                name,
                count,
                last_used,
            })
            .collect();
        skills.sort_by(|a, b| b.count.cmp(&a.count).then(a.name.cmp(&b.name)));

        self.sessions
            .sort_by(|a, b| b.started_at.cmp(&a.started_at));
        // keep top 100 recent sessions for UI
        self.sessions.truncate(100);

        UsageOverview {
            totals: self.totals,
            by_provider_model,
            by_day,
            tools,
            skills,
            sessions: self.sessions,
            session_files: self.session_files,
            scanned_lines: self.scanned_lines,
            extension_events: self.extension_events,
        }
    }
}

fn scan_session_file(path: &Path, acc: &mut Acc) {
    let file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return,
    };
    acc.session_files += 1;
    let reader = BufReader::new(file);

    let mut session_id = session_id_from_path(path);
    let mut cwd: Option<String> = None;
    let mut started_at: Option<String> = None;
    let mut current_provider: Option<String> = None;
    let mut current_model: Option<String> = None;
    let mut session_totals = TokenTotals::default();
    let mut message_count = 0u64;
    let mut tool_calls = 0u64;

    for line in reader.lines().flatten() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        acc.scanned_lines += 1;
        let entry: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let etype = entry.get("type").and_then(|v| v.as_str()).unwrap_or("");
        match etype {
            "session" => {
                if let Some(id) = entry.get("id").and_then(|v| v.as_str()) {
                    session_id = id.to_string();
                }
                cwd = entry
                    .get("cwd")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                started_at = entry
                    .get("timestamp")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
            }
            "model_change" => {
                current_provider = entry
                    .get("provider")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                current_model = entry
                    .get("modelId")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
            }
            "message" => {
                let ts = entry
                    .get("timestamp")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let day = ts.as_deref().and_then(parse_day);
                if let Some(message) = entry.get("message") {
                    let role = message.get("role").and_then(|v| v.as_str()).unwrap_or("");
                    match role {
                        "assistant" => {
                            message_count += 1;
                            let provider = message
                                .get("provider")
                                .and_then(|v| v.as_str())
                                .or(current_provider.as_deref())
                                .unwrap_or("unknown");
                            let model = message
                                .get("model")
                                .and_then(|v| v.as_str())
                                .or(current_model.as_deref())
                                .unwrap_or("unknown");
                            current_provider = Some(provider.to_string());
                            current_model = Some(model.to_string());
                            let stop = message.get("stopReason").and_then(|v| v.as_str());
                            if let Some(usage) = message.get("usage") {
                                session_totals.add_usage(usage);
                                if stop == Some("error") {
                                    session_totals.errors += 1;
                                }
                                acc.add_assistant(provider, model, usage, day.as_deref(), stop);
                            }
                            // tool calls inside assistant content
                            if let Some(Value::Array(parts)) = message.get("content") {
                                for p in parts {
                                    if p.get("type").and_then(|t| t.as_str()) == Some("toolCall") {
                                        tool_calls += 1;
                                        let name = p
                                            .get("name")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("unknown")
                                            .to_string();
                                        let e = acc.tools.entry(name).or_insert((0, 0));
                                        e.0 += 1;
                                    }
                                }
                            }
                        }
                        "toolResult" => {
                            let name = message
                                .get("toolName")
                                .and_then(|v| v.as_str())
                                .unwrap_or("unknown")
                                .to_string();
                            let is_error = message
                                .get("isError")
                                .and_then(|v| v.as_bool())
                                .unwrap_or(false);
                            let e = acc.tools.entry(name).or_insert((0, 0));
                            // count only errors here if call already counted from toolCall
                            if is_error {
                                e.1 += 1;
                            }
                        }
                        "user" => {
                            message_count += 1;
                            let text = message_text(message);
                            if let Some(skill) = extract_skill_name(&text) {
                                let e = acc.skills.entry(skill).or_insert((0, None));
                                e.0 += 1;
                                if let Some(t) = &ts {
                                    e.1 = Some(t.clone());
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }

    acc.sessions.push(SessionSummary {
        id: session_id,
        path: path.to_string_lossy().to_string(),
        cwd,
        started_at,
        provider: current_provider,
        model: current_model,
        totals: session_totals,
        message_count,
        tool_calls,
    });
}

fn scan_extension_events(acc: &mut Acc) {
    let path = match paths::usage_log_path() {
        Ok(p) => p,
        Err(_) => return,
    };
    if !path.exists() {
        return;
    }
    let file = match File::open(&path) {
        Ok(f) => f,
        Err(_) => return,
    };
    for line in BufReader::new(file).lines().flatten() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let event: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        acc.extension_events += 1;
        let etype = event.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let day = event
            .get("timestamp")
            .and_then(|v| v.as_str())
            .and_then(parse_day);
        match etype {
            "usage" => {
                let provider = event
                    .get("provider")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                let model = event
                    .get("model")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                if let Some(usage) = event.get("usage") {
                    acc.add_assistant(provider, model, usage, day.as_deref(), None);
                }
            }
            "skill" => {
                if let Some(name) = event.get("name").and_then(|v| v.as_str()) {
                    let e = acc.skills.entry(name.to_string()).or_insert((0, None));
                    e.0 += 1;
                    if let Some(ts) = event.get("timestamp").and_then(|v| v.as_str()) {
                        e.1 = Some(ts.to_string());
                    }
                }
            }
            "tool" => {
                if let Some(name) = event.get("name").and_then(|v| v.as_str()) {
                    let e = acc.tools.entry(name.to_string()).or_insert((0, 0));
                    e.0 += 1;
                    if event.get("isError").and_then(|v| v.as_bool()) == Some(true) {
                        e.1 += 1;
                    }
                }
            }
            _ => {}
        }
    }
}

pub fn load_usage_overview() -> Result<UsageOverview, String> {
    let sessions = paths::sessions_dir()?;
    let mut acc = Acc::new();

    if sessions.exists() {
        for entry in WalkDir::new(&sessions)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path()
                    .extension()
                    .and_then(|x| x.to_str())
                    .map(|x| x.eq_ignore_ascii_case("jsonl"))
                    .unwrap_or(false)
            })
        {
            scan_session_file(entry.path(), &mut acc);
        }
    }

    scan_extension_events(&mut acc);
    Ok(acc.into_overview())
}

/// Lightweight recent-days filter used by frontend charts if needed later
#[allow(dead_code)]
pub fn filter_days(overview: &UsageOverview, days: i64) -> Vec<DailyUsage> {
    if days <= 0 {
        return overview.by_day.clone();
    }
    let cutoff = Utc::now().date_naive() - chrono::Duration::days(days - 1);
    overview
        .by_day
        .iter()
        .filter(|d| {
            NaiveDate::parse_from_str(&d.date, "%Y-%m-%d")
                .map(|nd| nd >= cutoff)
                .unwrap_or(true)
        })
        .cloned()
        .collect()
}

pub fn ensure_usage_log_dir() -> Result<PathBuf, String> {
    let path = paths::usage_log_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir {}: {e}", parent.display()))?;
    }
    Ok(path)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStats {
    pub agent_home: String,
    pub default_provider: Option<String>,
    pub default_model: Option<String>,
    pub provider_count: usize,
    pub package_count: usize,
    pub skill_count: usize,
    pub session_files: u64,
    pub totals: TokenTotals,
    pub today: TokenTotals,
    pub top_tools: Vec<ToolUsage>,
    pub top_skills: Vec<SkillUsage>,
}
