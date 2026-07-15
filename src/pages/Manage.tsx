import { useState } from "react";
import { Providers } from "./manage/Providers";
import { Extensions } from "./manage/Extensions";

type Section = "providers" | "extensions";

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: "providers", label: "供应商", icon: "◇" },
  { id: "extensions", label: "扩展", icon: "▣" },
];

export function Manage({ initial = "providers" }: { initial?: Section } = {}) {
  const [section, setSection] = useState<Section>(initial);

  return (
    <div className="page manage-page">
      <div className="sub-tabs sub-tabs-top">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`sub-tab ${section === s.id ? "active" : ""}`}
            onClick={() => setSection(s.id)}
          >
            <span className="sub-tab-icon">{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>
      <div className="manage-body">
        {section === "providers" ? <Providers /> : <Extensions />}
      </div>
    </div>
  );
}
