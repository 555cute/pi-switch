import { useState } from "react";
import { Providers } from "./manage/Providers";
import { Packages } from "./manage/Packages";
import { Skills } from "./manage/Skills";

type Section = "providers" | "packages" | "skills";

const SECTIONS: { id: Section; label: string; en: string }[] = [
  { id: "providers", label: "供应商", en: "Providers" },
  { id: "packages", label: "扩展包", en: "Packages" },
  { id: "skills", label: "技能", en: "Skills" },
];

export function Manage({ initial = "providers" }: { initial?: Section } = {}) {
  const [section, setSection] = useState<Section>(initial);

  return (
    <div className="page manage-page">
      <header className="page-header">
        <div>
          <h1>
            管理 <span className="en">Manage</span>
          </h1>
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
