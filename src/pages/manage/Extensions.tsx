import { useState } from "react";
import { Packages } from "./Packages";
import { Skills } from "./Skills";

export function Extensions() {
  const [view, setView] = useState<"packages" | "skills">("packages");
  return (
    <div className="sub-page">
      <div className="sub-tabs">
        <button
          type="button"
          className={`sub-tab ${view === "packages" ? "active" : ""}`}
          onClick={() => setView("packages")}
        >
          扩展包
        </button>
        <button
          type="button"
          className={`sub-tab ${view === "skills" ? "active" : ""}`}
          onClick={() => setView("skills")}
        >
          技能
        </button>
      </div>
      {view === "packages" ? <Packages /> : <Skills />}
    </div>
  );
}
