import { useState } from "react";
import { Providers } from "./manage/Providers";
import { Packages } from "./manage/Packages";
import { Skills } from "./manage/Skills";

type Section = "providers" | "packages" | "skills";

const SECTIONS: {
  id: Section;
  label: string;
  en: string;
  kicker: string;
}[] = [
  {
    id: "providers",
    label: "供应商",
    en: "Providers",
    kicker: "模型供应商 · 读写 models.json / auth.json · 切换默认模型",
  },
  {
    id: "packages",
    label: "扩展包",
    en: "Packages",
    kicker: "npm 包 · 独立启用 / 禁用 / 命令控制",
  },
  {
    id: "skills",
    label: "技能",
    en: "Skills",
    kicker: "技能列表 · 调用频率 · 来源筛选",
  },
];

export function Manage({ initial = "providers" }: { initial?: Section } = {}) {
  const [section, setSection] = useState<Section>(initial);
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  return (
    <div className="page manage-page">
      <header className="page-header">
        <div>
          <h1>
            管理 <span className="en">Manage</span>
          </h1>
          <p className="muted page-kicker">{current.kicker}</p>
        </div>
      </header>
      <div className="sub-tabs sub-tabs-top" role="tablist">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            className={`sub-tab ${section === s.id ? "active" : ""}`}
            onClick={() => setSection(s.id)}
          >
            {s.label}
            <span className="sub-tab-en">{s.en}</span>
          </button>
        ))}
      </div>
      <div className="manage-body">
        {section === "providers" ? <Providers /> : null}
        {section === "packages" ? <Packages /> : null}
        {section === "skills" ? <Skills /> : null}
      </div>
    </div>
  );
}
