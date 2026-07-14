use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

use crate::models::load_settings;
use crate::paths;
use crate::usage::{load_usage_overview, SkillUsage, ToolUsage};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub path: String,
    pub source: String,
    pub usage_count: u64,
    pub last_used: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageInfo {
    pub spec: String,
    pub name: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub installed_path: Option<String>,
    pub has_skills: bool,
    pub has_extensions: bool,
    pub skill_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsOverview {
    pub skills: Vec<SkillInfo>,
    pub tool_usage: Vec<ToolUsage>,
    pub skill_usage: Vec<SkillUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackagesOverview {
    pub packages: Vec<PackageInfo>,
    pub settings_packages: Vec<String>,
    pub npm_root: String,
}

fn parse_frontmatter(content: &str) -> (String, String) {
    let mut name = String::new();
    let mut description = String::new();
    if !content.starts_with("---") {
        // fallback: first heading
        for line in content.lines() {
            let t = line.trim();
            if let Some(rest) = t.strip_prefix("# ") {
                name = rest.trim().to_string();
                break;
            }
        }
        return (name, description);
    }
    if let Some(end) = content[3..].find("---") {
        let fm = &content[3..3 + end];
        for line in fm.lines() {
            let line = line.trim();
            if let Some(v) = line.strip_prefix("name:") {
                name = v.trim().trim_matches('"').trim_matches('\'').to_string();
            } else if let Some(v) = line.strip_prefix("description:") {
                description = v.trim().trim_matches('"').trim_matches('\'').to_string();
            }
        }
    }
    if name.is_empty() {
        for line in content.lines() {
            let t = line.trim();
            if let Some(rest) = t.strip_prefix("# ") {
                name = rest.trim().to_string();
                break;
            }
        }
    }
    (name, description)
}

fn skill_name_from_path(path: &Path) -> String {
    if path
        .file_name()
        .and_then(|s| s.to_str())
        .map(|s| s.eq_ignore_ascii_case("SKILL.md"))
        .unwrap_or(false)
    {
        path.parent()
            .and_then(|p| p.file_name())
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string()
    } else {
        path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string()
    }
}

fn collect_skills_from_dir(dir: &Path, source: &str, out: &mut Vec<SkillInfo>) {
    if !dir.exists() {
        return;
    }

    // Root .md skills
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file()
                && path
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.eq_ignore_ascii_case("md"))
                    .unwrap_or(false)
            {
                if let Ok(content) = fs::read_to_string(&path) {
                    let (fm_name, description) = parse_frontmatter(&content);
                    let name = if fm_name.is_empty() {
                        skill_name_from_path(&path)
                    } else {
                        fm_name
                    };
                    out.push(SkillInfo {
                        name,
                        description,
                        path: path.to_string_lossy().to_string(),
                        source: source.to_string(),
                        usage_count: 0,
                        last_used: None,
                    });
                }
            }
        }
    }

    // Nested SKILL.md
    for entry in WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path
            .file_name()
            .and_then(|s| s.to_str())
            .map(|s| s.eq_ignore_ascii_case("SKILL.md"))
            .unwrap_or(false)
        {
            // skip if already added as root (shouldn't for nested)
            if path.parent() == Some(dir) {
                continue;
            }
            if let Ok(content) = fs::read_to_string(path) {
                let (fm_name, description) = parse_frontmatter(&content);
                let name = if fm_name.is_empty() {
                    skill_name_from_path(path)
                } else {
                    fm_name
                };
                // de-dupe by path
                if out.iter().any(|s| s.path == path.to_string_lossy()) {
                    continue;
                }
                out.push(SkillInfo {
                    name,
                    description,
                    path: path.to_string_lossy().to_string(),
                    source: source.to_string(),
                    usage_count: 0,
                    last_used: None,
                });
            }
        }
    }
}

fn collect_package_skills(npm_root: &Path, out: &mut Vec<SkillInfo>) {
    let node_modules = npm_root.join("node_modules");
    if !node_modules.exists() {
        return;
    }
    // walk top-level and scoped packages for skills/
    for entry in WalkDir::new(&node_modules)
        .max_depth(3)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_dir()
            && path
                .file_name()
                .and_then(|s| s.to_str())
                .map(|s| s == "skills")
                .unwrap_or(false)
        {
            let pkg = path
                .parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| "package".into());
            collect_skills_from_dir(path, &format!("package:{pkg}"), out);
        }
    }
}

pub fn load_skills_overview() -> Result<SkillsOverview, String> {
    let mut skills = Vec::new();
    collect_skills_from_dir(&paths::skills_dir()?, "global:~/.pi/agent/skills", &mut skills);
    collect_skills_from_dir(
        &paths::agents_skills_dir()?,
        "global:~/.agents/skills",
        &mut skills,
    );
    if let Ok(npm) = paths::npm_dir() {
        collect_package_skills(&npm, &mut skills);
    }

    // usage merge
    let usage = load_usage_overview().unwrap_or_else(|_| crate::usage::UsageOverview {
        totals: Default::default(),
        by_provider_model: vec![],
        by_day: vec![],
        tools: vec![],
        skills: vec![],
        sessions: vec![],
        session_files: 0,
        scanned_lines: 0,
        extension_events: 0,
    });

    for skill in &mut skills {
        if let Some(u) = usage.skills.iter().find(|u| u.name == skill.name) {
            skill.usage_count = u.count;
            skill.last_used = u.last_used.clone();
        }
    }

    // include skills seen in usage but not discovered on disk
    for u in &usage.skills {
        if !skills.iter().any(|s| s.name == u.name) {
            skills.push(SkillInfo {
                name: u.name.clone(),
                description: "(seen in session history)".into(),
                path: String::new(),
                source: "session-history".into(),
                usage_count: u.count,
                last_used: u.last_used.clone(),
            });
        }
    }

    skills.sort_by(|a, b| {
        b.usage_count
            .cmp(&a.usage_count)
            .then(a.name.cmp(&b.name))
    });

    Ok(SkillsOverview {
        skills,
        tool_usage: usage.tools,
        skill_usage: usage.skills,
    })
}

fn read_pkg_json(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn resolve_installed_package(npm_root: &Path, spec: &str) -> PackageInfo {
    // npm:@scope/name@version or npm:name@version or npm:name
    let bare = spec.strip_prefix("npm:").unwrap_or(spec);
    let name = if bare.starts_with('@') {
        // @scope/pkg@version
        let parts: Vec<&str> = bare.split('@').collect();
        // ["", "scope/pkg", "version?"] after split on @ for scoped is messy
        if let Some(idx) = bare.rfind('@') {
            if idx > 0 {
                bare[..idx].to_string()
            } else {
                bare.to_string()
            }
        } else {
            bare.to_string()
        }
    } else {
        bare.split('@').next().unwrap_or(bare).to_string()
    };

    let installed_path = npm_root.join("node_modules").join(&name);
    let pkg_json_path = installed_path.join("package.json");
    let mut info = PackageInfo {
        spec: spec.to_string(),
        name: Some(name.clone()),
        version: None,
        description: None,
        installed_path: if installed_path.exists() {
            Some(installed_path.to_string_lossy().to_string())
        } else {
            None
        },
        has_skills: installed_path.join("skills").exists(),
        has_extensions: installed_path.join("extensions").exists()
            || installed_path.join("dist").join("index.js").exists(),
        skill_names: vec![],
    };

    if let Some(pkg) = read_pkg_json(&pkg_json_path) {
        info.name = pkg
            .get("name")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or(info.name);
        info.version = pkg
            .get("version")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        info.description = pkg
            .get("description")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        // pi key
        if let Some(pi) = pkg.get("pi") {
            if pi.get("skills").is_some() {
                info.has_skills = true;
            }
            if pi.get("extensions").is_some() {
                info.has_extensions = true;
            }
        }
    }

    let skills_dir = installed_path.join("skills");
    if skills_dir.exists() {
        for entry in WalkDir::new(&skills_dir).into_iter().filter_map(|e| e.ok()) {
            let p = entry.path();
            if p.file_name()
                .and_then(|s| s.to_str())
                .map(|s| s.eq_ignore_ascii_case("SKILL.md"))
                .unwrap_or(false)
            {
                info.skill_names.push(skill_name_from_path(p));
            }
        }
        if !info.skill_names.is_empty() {
            info.has_skills = true;
        }
    }

    info
}

pub fn load_packages_overview() -> Result<PackagesOverview, String> {
    let settings = load_settings()?;
    let npm_root = paths::npm_dir()?;
    let packages: Vec<PackageInfo> = settings
        .packages
        .iter()
        .map(|spec| resolve_installed_package(&npm_root, spec))
        .collect();

    Ok(PackagesOverview {
        packages,
        settings_packages: settings.packages,
        npm_root: npm_root.to_string_lossy().to_string(),
    })
}

pub fn load_dashboard() -> Result<crate::usage::DashboardStats, String> {
    let overview = crate::models::load_providers_overview()?;
    let skills = load_skills_overview()?;
    let usage = load_usage_overview()?;
    let today_str = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let today = usage
        .by_day
        .iter()
        .find(|d| d.date == today_str)
        .map(|d| d.totals.clone())
        .unwrap_or_default();

    Ok(crate::usage::DashboardStats {
        agent_home: overview.agent_home,
        default_provider: overview.settings.default_provider,
        default_model: overview.settings.default_model,
        provider_count: overview.providers.len(),
        package_count: overview.settings.packages.len(),
        skill_count: skills.skills.len(),
        session_files: usage.session_files,
        totals: usage.totals,
        today,
        top_tools: usage.tools.into_iter().take(8).collect(),
        top_skills: usage.skills.into_iter().take(8).collect(),
    })
}

// silence unused import if PathBuf only used in signatures indirectly
#[allow(dead_code)]
fn _pathbuf_marker() -> PathBuf {
    PathBuf::new()
}
