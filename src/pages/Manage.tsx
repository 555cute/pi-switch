import { useState } from "react";
import { Providers } from "./manage/Providers";
import { Extensions } from "./manage/Extensions";

type Section = "providers" | "extensions";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "providers", label: "供应商" },
  { id: "extensions", label: "扩展" },
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
            {s.label}
          </button>
        ))}
      </div>
      <div className="manage-body">
        {section === "providers" ? <Providers /> : <Extensions />}
      </div>
    </div>
  );
}
