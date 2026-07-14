use std::path::PathBuf;

/// Resolve the pi agent home directory: `~/.pi/agent`
pub fn pi_agent_home() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "cannot resolve home directory".to_string())?;
    Ok(home.join(".pi").join("agent"))
}

pub fn models_json() -> Result<PathBuf, String> {
    Ok(pi_agent_home()?.join("models.json"))
}

pub fn auth_json() -> Result<PathBuf, String> {
    Ok(pi_agent_home()?.join("auth.json"))
}

pub fn settings_json() -> Result<PathBuf, String> {
    Ok(pi_agent_home()?.join("settings.json"))
}

pub fn sessions_dir() -> Result<PathBuf, String> {
    Ok(pi_agent_home()?.join("sessions"))
}

pub fn skills_dir() -> Result<PathBuf, String> {
    Ok(pi_agent_home()?.join("skills"))
}

pub fn agents_skills_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "cannot resolve home directory".to_string())?;
    Ok(home.join(".agents").join("skills"))
}

pub fn npm_dir() -> Result<PathBuf, String> {
    Ok(pi_agent_home()?.join("npm"))
}

pub fn usage_log_path() -> Result<PathBuf, String> {
    Ok(pi_agent_home()?.join("pi-switch").join("usage-events.jsonl"))
}
