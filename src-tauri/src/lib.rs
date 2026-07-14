mod inventory;
mod models;
mod paths;
mod usage;

use inventory::{load_packages_overview, load_skills_overview, PackagesOverview, SkillsOverview};
use models::{
    delete_auth_key, delete_provider, load_providers_overview, load_settings, set_default_model,
    upsert_provider, PiSettings, ProvidersOverview, UpsertProviderInput,
};
use usage::{ensure_usage_log_dir, load_usage_overview, DashboardStats, UsageOverview};

#[tauri::command]
fn get_dashboard() -> Result<DashboardStats, String> {
    inventory::load_dashboard()
}

#[tauri::command]
fn get_providers() -> Result<ProvidersOverview, String> {
    load_providers_overview()
}

#[tauri::command]
fn save_provider(input: UpsertProviderInput) -> Result<ProvidersOverview, String> {
    upsert_provider(input)
}

#[tauri::command]
fn remove_provider(name: String) -> Result<ProvidersOverview, String> {
    delete_provider(name)
}

#[tauri::command]
fn remove_auth(provider: String) -> Result<ProvidersOverview, String> {
    delete_auth_key(provider)
}

#[tauri::command]
fn switch_default_model(provider: String, model: String) -> Result<PiSettings, String> {
    set_default_model(provider, model)
}

#[tauri::command]
fn get_settings() -> Result<PiSettings, String> {
    load_settings()
}

#[tauri::command]
fn get_usage() -> Result<UsageOverview, String> {
    load_usage_overview()
}

#[tauri::command]
fn get_skills() -> Result<SkillsOverview, String> {
    load_skills_overview()
}

#[tauri::command]
fn get_packages() -> Result<PackagesOverview, String> {
    load_packages_overview()
}

#[tauri::command]
fn get_agent_home() -> Result<String, String> {
    Ok(paths::pi_agent_home()?.to_string_lossy().to_string())
}

#[tauri::command]
fn ensure_extension_log() -> Result<String, String> {
    Ok(ensure_usage_log_dir()?.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_dashboard,
            get_providers,
            save_provider,
            remove_provider,
            remove_auth,
            switch_default_model,
            get_settings,
            get_usage,
            get_skills,
            get_packages,
            get_agent_home,
            ensure_extension_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
