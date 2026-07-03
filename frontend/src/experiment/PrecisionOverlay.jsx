/**
 * PrecisionOverlay — the single contextual card for the Precision Atomic
 * Structure resolution.  It drives ONLY the usePrecision hook (backend precision
 * endpoints) and never computes physics.  The nonrelativistic orbital density
 * remains the spatial renderer behind it; this overlay adds spin- and
 * energy-correction structure that is NOT literally visible in 3-D space.
 *
 * Sections: correction-stack selector · energy-level explorer · interpretive
 * spin-coupling glyph · magnetic-field (Breit–Rabi) control · transition
 * inspector · correction budget · provenance.  Every spin visual is labeled
 * interpretive; no rotating spin balls and no fabricated distinct orbital shapes.
 */

import { C } from "./theme.js";
import {
  CORRECTIONS, CLASSIFICATION_LABEL, FAMILIES, STACK_VIEWS, MAX_FIELD_TESLA,
  energyAxis, spinCouplingFor,
} from "../domain/precisionModel.js";

const CARD = {
  position: "absolute", bottom: "12px", left: "12px", zIndex: 12,
  width: "300px", maxHeight: "82%", overflowY: "auto",
  background: "rgba(5,9,22,0.95)", border: `1px solid ${C.border}`,
  borderRadius: "10px", padding: "10px 12px", userSelect: "none",
  boxShadow: "0 8px 24px rgba(0,0,0,0.45)", boxSizing: "border-box",
};
const HYDRO = "#9fd0ff";
const CLASS_COLOR = { computed: "#8fe0a8", "reference-data": "#ffcf90", omitted: C.dim };

const chip = (on, color = "rgba(100,160,255,0.55)") => ({
  fontSize: "9px", padding: "4px 7px", borderRadius: "6px", cursor: "pointer",
  textAlign: "center", lineHeight: "1.1", userSelect: "none",
  background: on ? "rgba(40,60,140,0.9)" : "rgba(12,20,44,0.6)",
  border: `1px solid ${on ? color : C.border}`,
  color: on ? C.bright : C.text,
});

const fmtEV = (v) => (Math.abs(v) >= 1e-3 ? v.toFixed(6) : v.toExponential(3));

function Section({ label, children, testid }) {
  return (
    <div style={{ marginTop: "9px" }} data-testid={testid}>
      <div style={{ color: "rgba(120,160,210,0.7)", fontSize: "8px", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "4px" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function ClassTag({ classification }) {
  return (
    <span style={{
      fontSize: "7.5px", padding: "1px 5px", borderRadius: "6px", marginLeft: "5px",
      color: CLASS_COLOR[classification] ?? C.dim,
      border: `1px solid ${CLASS_COLOR[classification] ?? C.dim}`,
    }}>{CLASSIFICATION_LABEL[classification] ?? classification}</span>
  );
}

// ── Energy-level explorer ─────────────────────────────────────────────────────
function LevelExplorer({ precision }) {
  const d = precision.levelsData;
  if (!d) return <div style={{ color: C.label, fontSize: "9px" }}>loading levels…</div>;

  // Choose the interesting subset per family.
  let entries, title;
  if (precision.family === "fine_structure") {
    title = "n = 2 manifold (magnified)";
    entries = (d.levels ?? []).filter((lv) => lv.term_symbol.startsWith("2"))
      .map((lv) => ({ label: lv.term_symbol, eV: lv.total_eV, deg: lv.degeneracy }));
  } else if (d.breit_rabi) {
    title = `Breit–Rabi sublevels · ${d.breit_rabi.regime}`;
    entries = d.breit_rabi.sublevels.map((s) => ({
      label: `m_F=${s.m_F}${s.F_label ? ` (F=${s.F_label})` : ""}`, eV: s.total_eV, deg: 1,
    }));
  } else {
    title = "1S hyperfine (zero field)";
    entries = (d.zero_field_levels ?? []).map((lv) => ({
      label: lv.label.replace("1S1/2, ", ""), eV: lv.total_eV, deg: lv.degeneracy,
    }));
  }

  const axis = energyAxis(entries.map((e) => e.eV));
  const H = 96;

  return (
    <div>
      <div style={{ color: C.label, fontSize: "8.5px", marginBottom: "3px" }}>{title}</div>
      {axis.magnified && (
        <div data-testid="precision-magnification" style={{ color: C.warn, fontSize: "8px", marginBottom: "3px" }}>
          ⚠ Energy-axis magnification active (spread {axis.spread.toExponential(2)} eV) — spacing is not to scale.
        </div>
      )}
      <div style={{ position: "relative", height: `${H}px`, background: "rgba(8,14,34,0.5)", borderRadius: "6px", border: `1px solid ${C.border}` }}>
        {entries.map((e, i) => {
          const y = 8 + (H - 16) * (1 - axis.norm(e.eV));
          return (
            <div key={i} data-testid="precision-level" style={{ position: "absolute", left: "6px", right: "6px", top: `${y}px` }}>
              <div style={{ borderTop: `1px solid ${HYDRO}`, opacity: 0.85 }} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1px" }}>
                <span style={{ color: HYDRO, fontSize: "8px" }}>{e.label}{e.deg > 1 ? ` ×${e.deg}` : ""}</span>
                <span style={{ color: C.text, fontSize: "7.5px", fontFamily: "monospace" }}>{fmtEV(e.eV)} eV</span>
              </div>
            </div>
          );
        })}
      </div>
      {precision.family === "fine_structure" && (
        <div data-testid="precision-fine-split" style={{ color: "rgba(150,180,220,0.7)", fontSize: "8px", marginTop: "3px" }}>
          2P₁ᐟ₂ and 2P₃ᐟ₂ are split by fine structure; 2S₁ᐟ₂–2P₁ᐟ₂ separate only with the Lamb correction.
        </div>
      )}
    </div>
  );
}

// ── Breit–Rabi sweep mini-plot ────────────────────────────────────────────────
function BreitRabiPlot({ sweep, field }) {
  if (!sweep) return null;
  const W = 276, H = 84, pad = 4;
  const bs = sweep.B_tesla, branches = sweep.branches_eV;
  const bMax = bs[bs.length - 1] || 1;
  const all = branches.flat();
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const x = (b) => pad + (W - 2 * pad) * (b / bMax);
  const y = (e) => pad + (H - 2 * pad) * (1 - (e - lo) / span);
  const colors = ["#9fd0ff", "#8fe0a8", "#ffcf90", "#ff9fc8"];
  const fx = x(Math.min(field, bMax));
  return (
    <svg data-testid="precision-breit-rabi" width={W} height={H} style={{ background: "rgba(8,14,34,0.5)", borderRadius: "6px", border: `1px solid ${C.border}` }}>
      {branches.map((br, k) => (
        <polyline key={k} fill="none" stroke={colors[k % colors.length]} strokeWidth="1.4"
          points={br.map((e, i) => `${x(bs[i]).toFixed(1)},${y(e).toFixed(1)}`).join(" ")} />
      ))}
      <line x1={fx} y1={pad} x2={fx} y2={H - pad} stroke={C.warn} strokeWidth="1" strokeDasharray="3 2" />
    </svg>
  );
}

// ── Interpretive spin-coupling glyph ──────────────────────────────────────────
function SpinGlyph({ precision }) {
  const d = precision.levelsData;
  if (precision.family !== "ground_hyperfine" || !d) {
    return (
      <div data-testid="precision-spin-glyph" style={{ color: C.label, fontSize: "8.5px", lineHeight: "1.5" }}>
        Electron j = ½ state (interpretive glyph). Coupling to proton spin is shown in the ground-hyperfine family.
      </div>
    );
  }
  const singlet = spinCouplingFor(0), triplet = spinCouplingFor(2);
  return (
    <div data-testid="precision-spin-glyph">
      <div style={{ fontSize: "8px", color: C.dim, marginBottom: "3px" }}>interpretive — NOT rotating classical balls</div>
      <div style={{ display: "flex", gap: "6px" }}>
        {[triplet, singlet].map((g) => (
          <div key={g.kind} style={{ flex: 1, background: "rgba(12,20,44,0.6)", border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 6px" }}>
            <div style={{ color: HYDRO, fontSize: "9px", marginBottom: "2px" }}>{g.label}</div>
            <div style={{ color: "rgba(150,180,220,0.8)", fontSize: "7.5px", lineHeight: "1.4" }}>{g.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Transition inspector ──────────────────────────────────────────────────────
function TransitionInspector({ precision }) {
  const presets = precision.model?.transition_presets ?? [];
  const t = precision.transitionData;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", marginBottom: "5px" }}>
        {presets.map((p) => (
          <div key={p.id} data-testid={p.id === "hyperfine_21cm" ? "precision-21cm" : "precision-transition-preset"}
            onClick={() => precision.selectTransitionPreset(p.id)}
            style={chip(precision.transitionPreset === p.id)} title={p.note}>{p.label}</div>
        ))}
      </div>
      {precision.transitionError && <div style={{ color: C.danger, fontSize: "8.5px" }}>⚠ {precision.transitionError}</div>}
      {t && (
        <div data-testid="precision-transition-result" style={{ background: "rgba(8,14,34,0.55)", border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px 8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
            <span style={{ color: t.allowed ? "#8fe0a8" : C.danger, fontSize: "10px", fontWeight: 700 }}>
              {t.allowed ? "✓ allowed" : "✗ forbidden"}
            </span>
            <span style={{ color: HYDRO, fontSize: "9px" }}>{t.type} · {t.type_name}</span>
            {t.draw_arrow && <span style={{ color: "#8fe0a8", fontSize: "11px" }}>→</span>}
          </div>
          <div style={{ color: "rgba(150,180,220,0.85)", fontSize: "8px", lineHeight: "1.5", marginBottom: "3px" }}>{t.reason}</div>
          <Row k="frequency" v={fmtFreq(t.frequency_Hz)} />
          {t.wavelength_m != null && <Row k="wavelength" v={fmtWavelength(t.wavelength_m)} />}
          <Row k="energy" v={`${t.energy_eV.toExponential(4)} eV`} />
          {t.polarization && <Row k="polarization" v={t.polarization} />}
          {t.preset_note && <div style={{ color: C.warn, fontSize: "7.5px", marginTop: "3px", lineHeight: "1.4" }}>{t.preset_note}</div>}
        </div>
      )}
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
      <span style={{ color: "rgba(120,160,210,0.7)", fontSize: "8px" }}>{k}</span>
      <span style={{ color: C.text, fontSize: "8px", fontFamily: "monospace", textAlign: "right" }}>{v}</span>
    </div>
  );
}

function fmtFreq(hz) {
  if (hz >= 1e12) return `${(hz / 1e12).toFixed(4)} THz`;
  if (hz >= 1e9) return `${(hz / 1e9).toFixed(6)} GHz`;
  return `${(hz / 1e6).toFixed(6)} MHz`;
}
function fmtWavelength(m) {
  if (m < 1e-6) return `${(m * 1e9).toFixed(3)} nm`;
  if (m < 1e-2) return `${(m * 1e3).toFixed(3)} mm`;
  return `${(m * 1e2).toFixed(3)} cm`;
}

// ── Correction budget ─────────────────────────────────────────────────────────
function BudgetTable({ precision }) {
  const d = precision.levelsData;
  if (!d) return null;
  let level, label;
  if (precision.family === "fine_structure") {
    level = (d.levels ?? []).find((lv) => lv.term_symbol === precision.selectedTerm) ?? (d.levels ?? [])[0];
    label = level?.term_symbol ?? "";
  } else {
    const src = d.breit_rabi?.sublevels ?? d.zero_field_levels ?? [];
    level = src.find((lv) => (lv.quantum_numbers?.F ?? lv.F_label) === "1") ?? src[0];
    label = level?.label ?? (level ? `m_F=${level.m_F}` : "");
  }
  if (!level) return null;
  const b = level.budget;
  const rows = [
    ["Coulomb baseline", b.baseline_coulomb_eV, "computed"],
    ["Fine structure", b.fine_structure_eV, "computed"],
    ["Recoil (additional)", b.recoil_eV, "omitted"],
    ["Lamb shift", b.lamb_shift_eV, "reference-data"],
    ["Hyperfine", b.hyperfine_eV, "computed"],
    ["Zeeman", b.zeeman_eV, "computed"],
  ];
  return (
    <div data-testid="precision-budget">
      <div style={{ color: HYDRO, fontSize: "8.5px", marginBottom: "3px" }}>Level: {label}</div>
      {rows.map(([name, val, cls]) => (
        <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", lineHeight: "1.55" }}>
          <span style={{ color: "rgba(120,160,210,0.75)", fontSize: "8px" }}>{name}<ClassTag classification={cls} /></span>
          <span style={{ color: C.text, fontSize: "8px", fontFamily: "monospace" }}>{fmtEV(val)}</span>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${C.border}`, marginTop: "3px", paddingTop: "3px" }}>
        <span style={{ color: C.bright, fontSize: "8.5px" }}>Total</span>
        <span style={{ color: C.bright, fontSize: "8.5px", fontFamily: "monospace" }}>{fmtEV(b.total_eV)} eV</span>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function PrecisionOverlay({ precision, onBack }) {
  const allowed = new Set(FAMILIES.find((f) => f.key === precision.family)?.allowed ?? []);
  const d = precision.levelsData;
  const lambApplied = precision.family === "fine_structure" && precision.corrections.includes("lamb_shift");

  return (
    <div data-testid="precision-overlay" style={CARD}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: HYDRO, flexShrink: 0 }} />
        <span style={{ color: C.bright, fontSize: "11px", fontWeight: 700, flex: 1 }}>Precision Atomic Structure</span>
        <span style={{ fontSize: "8px", color: "#8fe0a8", border: "1px solid rgba(60,180,90,0.4)", borderRadius: "8px", padding: "1px 6px" }}>ACTIVE</span>
        <button data-testid="precision-back" onClick={onBack} title="Back (Esc)" style={{
          background: "rgba(20,28,55,0.85)", border: `1px solid ${C.border}`, borderRadius: "6px",
          color: C.text, fontSize: "10px", padding: "3px 7px", cursor: "pointer",
        }}>← Back</button>
      </div>
      <div style={{ color: "rgba(150,180,220,0.7)", fontSize: "8px", lineHeight: "1.5", marginBottom: "2px" }}>
        Layered effective model — analytic + versioned reference data. NOT a full bound-state QED simulation.
      </div>

      {/* Family + progressive stack views */}
      <Section label="State family" testid="precision-family-section">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
          {FAMILIES.map((f) => (
            <div key={f.key} data-testid="precision-family" onClick={() => precision.setFamily(f.key)}
              style={chip(precision.family === f.key)}>{f.label}</div>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "3px", marginTop: "5px" }}>
          {STACK_VIEWS.map((v) => (
            <div key={v.key} data-testid="precision-stack-view" onClick={() => precision.applyStackView(v)}
              style={{ ...chip(false), fontSize: "8px", padding: "3px 6px" }}>{v.label}</div>
          ))}
        </div>
      </Section>

      {/* Correction toggles */}
      <Section label="Correction stack" testid="precision-corrections">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
          {CORRECTIONS.map((c) => {
            const on = precision.corrections.includes(c.key);
            const usable = allowed.has(c.key);
            return (
              <div key={c.key} data-testid="precision-correction"
                onClick={() => usable && precision.toggleCorrection(c.key)}
                style={{ ...chip(on, CLASS_COLOR[c.classification]), opacity: usable ? 1 : 0.4, cursor: usable ? "pointer" : "not-allowed" }}
                title={usable ? c.classification : "not available for this family"}>
                {c.label}<ClassTag classification={c.classification} />
              </div>
            );
          })}
        </div>
      </Section>

      {/* Energy-level explorer */}
      <Section label="Energy levels" testid="precision-explorer">
        <LevelExplorer precision={precision} />
        {lambApplied && (
          <div data-testid="precision-lamb-ref" style={{ color: CLASS_COLOR["reference-data"], fontSize: "8px", marginTop: "3px", lineHeight: "1.5" }}>
            Lamb shift = reference-data QED correction (2S₁ᐟ₂−2P₁ᐟ₂), not a real-time QED simulation.
          </div>
        )}
      </Section>

      {/* Ground-hyperfine F levels + spin coupling */}
      {precision.family === "ground_hyperfine" && (
        <Section label="Hyperfine levels & spin coupling" testid="precision-hyperfine-levels">
          <div style={{ color: "rgba(150,180,220,0.8)", fontSize: "8px", marginBottom: "4px" }}>
            F = 0 (singlet) and F = 1 (triplet); the 21 cm line is the F=1 ↔ F=0 splitting.
          </div>
          <SpinGlyph precision={precision} />
        </Section>
      )}

      {/* Magnetic field */}
      <Section label="Static magnetic field (precision model)" testid="precision-field-section">
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <input data-testid="precision-field" type="range" min={0} max={precision.family === "ground_hyperfine" ? 0.2 : 5}
            step={precision.family === "ground_hyperfine" ? 0.002 : 0.05} value={precision.field}
            disabled={!allowed.has("zeeman")}
            onChange={(e) => precision.setField(Number(e.target.value))}
            style={{ flex: 1, accentColor: HYDRO }} />
          <span style={{ color: C.text, fontSize: "8.5px", fontFamily: "monospace", minWidth: "58px", textAlign: "right" }}>
            {precision.field.toFixed(3)} T
          </span>
        </div>
        {!allowed.has("zeeman") && <div style={{ color: C.dim, fontSize: "8px" }}>enable the Zeeman correction to apply a field</div>}
        {d?.breit_rabi && (
          <div style={{ marginTop: "5px" }}>
            <div style={{ color: C.label, fontSize: "8px", marginBottom: "3px" }}>
              Breit–Rabi · regime: <span style={{ color: HYDRO }}>{d.breit_rabi.regime}</span>
              {d.breit_rabi.F_good_quantum_number ? " (F good)" : " (F not a good quantum number — showing basis composition)"}
            </div>
            <BreitRabiPlot sweep={d.breit_rabi_sweep} field={precision.field} />
          </div>
        )}
        <div style={{ color: C.dim, fontSize: "7.5px", marginTop: "2px" }}>Precision-model field (0–{MAX_FIELD_TESLA} T), independent of the laboratory B₀.</div>
      </Section>

      {/* Transition inspector */}
      <Section label="Transition inspector" testid="precision-transitions">
        <TransitionInspector precision={precision} />
      </Section>

      {/* Correction budget */}
      <Section label="Correction budget" testid="precision-budget-section">
        <BudgetTable precision={precision} />
      </Section>

      {/* Provenance */}
      <div data-testid="precision-provenance" style={{ marginTop: "9px", paddingTop: "6px", borderTop: `1px solid ${C.border}`, color: "rgba(120,160,210,0.6)", fontSize: "7.5px", lineHeight: "1.5" }}>
        model {precision.model?.model_version ?? d?.model_version ?? "…"} · constants {precision.model?.constants_version ?? "…"} · engine: not QuTiP
        <div style={{ marginTop: "2px" }}>
          <span style={{ color: CLASS_COLOR.computed }}>■</span> computed ·
          <span style={{ color: CLASS_COLOR["reference-data"] }}> ■</span> reference data ·
          <span style={{ color: CLASS_COLOR.omitted }}> ■</span> omitted
        </div>
      </div>
    </div>
  );
}
