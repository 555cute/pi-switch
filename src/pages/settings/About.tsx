import { useEffect, useState } from "react";
import { Tag } from "../../components/UI";

const DEPS = [
  { name: "React 19", license: "MIT" },
  { name: "Vite 7", license: "MIT" },
  { name: "TypeScript 5.8", license: "Apache-2.0" },
  { name: "Electron 37", license: "MIT" },
  { name: "Inter / Inter Tight", license: "OFL" },
  { name: "JetBrains Mono", license: "OFL" },
];

function platformLabel(): string {
  const p = window.piSwitchDesktop?.platform;
  if (!p) return "Web";
  if (typeof p === "string") return p;
  return "Electron";
}

export function About() {
  const [version, setVersion] = useState("0.1.0");

  useEffect(() => {
    void window.piSwitchDesktop?.getVersion?.().then((v) => {
      if (v) setVersion(String(v));
    });
  }, []);

  return (
    <div className="settings-stack">
      <section className="setting-card">
        <div className="setting-card-title">应用</div>
        <div className="setting-card-body">
          <div className="setting-row">
            <div className="setting-row-text">
              <div className="setting-row-label">名称</div>
            </div>
            <div className="setting-row-control">
              <strong>pi-switch</strong>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-row-text">
              <div className="setting-row-label">版本</div>
            </div>
            <div className="setting-row-control">
              <Tag tone="default">v{version}</Tag>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-row-text">
              <div className="setting-row-label">平台</div>
            </div>
            <div className="setting-row-control">
              <Tag tone="info">{platformLabel()}</Tag>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-row-text">
              <div className="setting-row-label">许可</div>
            </div>
            <div className="setting-row-control">
              <Tag tone="ok">MIT</Tag>
            </div>
          </div>
        </div>
      </section>

      <section className="setting-card">
        <div className="setting-card-title">第三方组件</div>
        <div className="setting-card-body">
          {DEPS.map((d) => (
            <div className="setting-row" key={d.name}>
              <div className="setting-row-text">
                <div className="setting-row-label">{d.name}</div>
              </div>
              <div className="setting-row-control">
                <Tag tone="info">{d.license}</Tag>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
