/**
 * AtomicHydrogenScene — a scientifically grounded visualization of quantities
 * produced by the nonrelativistic Coulomb backend model.  It is a visualization
 * of |ψ(r,t)|², arg(ψ), and j(r,t) sampled by the backend — NOT a photograph of
 * an atom, not a material cloud, and never a classical electron orbit.
 *
 * All positions and values come from the backend `sampling` response; the scene
 * only maps them to opacity/size/hue/arrow-length (declared VisualTruth mappings)
 * and never computes atomic physics.  Geometry is rebuilt per backend frame
 * (bounded cadence), not per render frame; the material and scratch vectors are
 * reused.
 */

import { useMemo, useRef, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { C } from "./theme.js";
import {
  flattenVolumeField, densityVisual, phaseColor, currentArrowsFromResponse, normalizationText,
} from "../domain/atomicVisual.js";

const _dummy = new THREE.Object3D();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

// Density colour ramp (deep blue → cyan → white) by normalized density.
function densityRamp(n, out, o) {
  const a = [0.10, 0.20, 0.55], b = [0.30, 0.85, 1.0], c = [0.95, 0.98, 1.0];
  let r, g, bl;
  if (n < 0.5) { const t = n / 0.5; r = a[0] + (b[0] - a[0]) * t; g = a[1] + (b[1] - a[1]) * t; bl = a[2] + (b[2] - a[2]) * t; }
  else { const t = (n - 0.5) / 0.5; r = b[0] + (c[0] - b[0]) * t; g = b[1] + (c[1] - b[1]) * t; bl = b[2] + (c[2] - b[2]) * t; }
  out[o] = r; out[o + 1] = g; out[o + 2] = bl;
}

// ── Sampled fields → point-cloud attributes (volume or plane) ────────────────
function buildPoints(data, mode) {
  const s = data?.sampling;
  if (!s || !s.fields.abs2) return null;

  let positions, values, phase = null;
  if (s.type === "volume") {
    const f = flattenVolumeField(s.axis_amu, s.fields.abs2);
    positions = f.positions; values = f.values;
    if (mode === "phase" && s.fields.phase) phase = flattenVolumeField(s.axis_amu, s.fields.phase).values;
  } else if (s.type === "plane") {
    const axis = s.axis_amu, res = axis.length, n = res * res;
    positions = new Float32Array(n * 3); values = new Float32Array(n);
    phase = (mode === "phase" || mode === "section") && s.fields.phase ? new Float32Array(n) : null;
    let p = 0;
    for (let i = 0; i < res; i++) for (let j = 0; j < res; j++) {
      // xz plane: U = x, V = z, y = offset (≈0)
      positions[p * 3] = axis[i]; positions[p * 3 + 1] = s.offset_amu ?? 0; positions[p * 3 + 2] = axis[j];
      values[p] = s.fields.abs2[i][j];
      if (phase) phase[p] = s.fields.phase[i][j];
      p++;
    }
  } else return null;

  const { alpha, size } = densityVisual(values);
  const count = values.length;
  const colors = new Float32Array(count * 3);
  const maxV = values.reduce((m, v) => (v > m ? v : m), 0) || 1;
  for (let i = 0; i < count; i++) {
    if (phase) { const rgb = phaseColor(phase[i]); colors[i * 3] = rgb[0]; colors[i * 3 + 1] = rgb[1]; colors[i * 3 + 2] = rgb[2]; }
    else densityRamp(values[i] / maxV, colors, i * 3);
  }
  return { positions, colors, alpha, size };
}

function pointsMaterial(dim) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uDim: { value: dim } },
    vertexShader: `
      attribute float aAlpha; attribute float aSize; attribute vec3 aColor;
      varying float vAlpha; varying vec3 vColor; uniform float uDim;
      void main(){ vAlpha = aAlpha * uDim; vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (320.0 / -mv.z);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      varying float vAlpha; varying vec3 vColor;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d);
        if (r > 0.5) discard; float soft = smoothstep(0.5, 0.08, r);
        gl_FragColor = vec4(vColor, vAlpha * soft); }`,
  });
}

function DensityPoints({ attrs, dim }) {
  // `dim` only toggles between two values (full density vs faint current context),
  // so recreating the material on that change is cheap and keeps it immutable.
  const material = useMemo(() => pointsMaterial(dim), [dim]);
  useEffect(() => () => material.dispose(), [material]);
  const geom = useMemo(() => {
    if (!attrs) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(attrs.positions, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(attrs.colors, 3));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(attrs.alpha, 1));
    g.setAttribute("aSize", new THREE.BufferAttribute(attrs.size, 1));
    return g;
  }, [attrs]);
  useEffect(() => () => geom && geom.dispose(), [geom]);
  if (!geom) return null;
  return <points geometry={geom} material={material} frustumCulled={false} />;
}

function CurrentArrows({ arrows, unit }) {
  const ref = useRef();
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    arrows.forEach((a, i) => {
      _dummy.position.set(a.x, a.y, a.z);
      _dir.set(a.dx, a.dy, a.dz);
      _dummy.quaternion.setFromUnitVectors(_up, _dir);
      const s = unit * (0.5 + 0.7 * a.mag);
      _dummy.scale.set(s * 0.45, s, s * 0.45);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);
    });
    mesh.count = arrows.length;
    mesh.instanceMatrix.needsUpdate = true;
  }, [arrows, unit]);
  if (!arrows.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, arrows.length]} frustumCulled={false}>
      <coneGeometry args={[0.4, 1.0, 8]} />
      <meshStandardMaterial color="#66e0ff" emissive="#3aa0d0" emissiveIntensity={0.6} transparent opacity={0.92} />
    </instancedMesh>
  );
}

function Scene({ data, mode, controlsRef, L }) {
  const attrs = useMemo(() => buildPoints(data, mode), [data, mode]);
  const current = useMemo(
    () => (mode === "current" ? currentArrowsFromResponse(data) : { arrows: [] }),
    [data, mode]
  );
  // In current mode the density is only faint context.
  const dim = mode === "current" ? 0.28 : 1.0;

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 3]} intensity={0.8} />
      {/* Proton localization marker (NOT a resolved proton; no internal structure). */}
      <mesh>
        <sphereGeometry args={[Math.max(0.12, L * 0.02), 20, 20]} />
        <meshStandardMaterial color="#ff6a4a" emissive="#ff5030" emissiveIntensity={0.7} />
      </mesh>
      {attrs && <DensityPoints attrs={attrs} dim={dim} />}
      {mode === "current" && <CurrentArrows arrows={current.arrows} unit={L * 0.09} />}
      <OrbitControls ref={controlsRef} enablePan={false} minDistance={L * 0.35} maxDistance={L * 4} makeDefault />
    </>
  );
}

// ── HTML overlays ─────────────────────────────────────────────────────────────
function ScaleIndicator({ L, norm }) {
  return (
    <div style={{
      position: "absolute", top: "10px", left: "12px", userSelect: "none", pointerEvents: "none",
      color: "rgba(150,180,220,0.7)", fontSize: "9px", lineHeight: "1.6",
    }}>
      <div style={{ letterSpacing: "0.08em", textTransform: "uppercase" }}>
        State space · <span style={{ color: "#9fd0ff" }}>Nonrelativistic Coulomb Hydrogen</span>
      </div>
      <div style={{ fontFamily: "monospace", color: "rgba(120,160,210,0.85)" }}>
        displayed region ±{L} aμ
        {norm && ` · ∫|ψ|² ≈ ${norm.integral.toFixed(3)} within box (tail ${norm.tail.toFixed(3)})`}
      </div>
    </div>
  );
}

function EnergyInset({ data }) {
  if (!data) return null;
  const levels = data.participating_states ?? [];
  const pops = data.state?.populations ?? {};
  const beat = data.beat_frequencies_rad_s ?? [];
  return (
    <div data-testid="energy-inset" style={{
      position: "absolute", top: "10px", right: "12px", userSelect: "none",
      background: "rgba(6,10,26,0.85)", border: `1px solid ${C.border}`, borderRadius: "8px",
      padding: "7px 10px", fontFamily: "monospace", fontSize: "9px", lineHeight: "1.6", minWidth: "150px",
    }}>
      <div style={{ color: "rgba(90,130,200,0.6)", fontSize: "8px", letterSpacing: "0.08em", marginBottom: "3px" }}>
        ENERGY LEVELS
      </div>
      {[...new Map(levels.map((s) => [s.energy_ev, s])).values()].map((s) => (
        <div key={s.energy_ev} style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
          <span style={{ color: "#9fd0ff" }}>n={s.n}</span>
          <span style={{ color: C.text }}>{s.energy_ev.toFixed(3)} eV</span>
        </div>
      ))}
      {levels.length > 1 && (
        <div style={{ color: C.label, marginTop: "3px" }}>
          {Object.entries(pops).map(([k, v]) => {
            const lab = levels.find((s) => s.key === k)?.label ?? k;
            return <div key={k}>P({lab}) = {v.toFixed(2)}</div>;
          })}
        </div>
      )}
      {beat.length > 0
        ? <div style={{ color: "#ffcf90", marginTop: "3px" }}>ω_beat = {beat[0].toExponential(2)} rad/s</div>
        : <div style={{ color: "#8fe0a8", marginTop: "3px" }}>stationary density</div>}
    </div>
  );
}

export default function AtomicHydrogenScene({ atomic, hud, height = "100%", spatialContext = false }) {
  const controlsRef = useRef();
  const data = atomic.data;
  const L = data?.sampling?.bound_amu ?? 12;
  const norm = normalizationText(data);
  const initialCam = useMemo(() => [2.0 * L, 1.4 * L, 1.4 * L], [L]);

  const resetView = () => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    ctrl.object.position.set(...initialCam);
    ctrl.target.set(0, 0, 0);
    ctrl.update();
  };

  return (
    <div style={{ position: "relative", width: "100%", height, borderRadius: "10px", overflow: "hidden" }}>
      <Canvas
        camera={{ position: initialCam, fov: 45, up: [0, 0, 1], near: 0.01, far: 100 * L }}
        style={{ background: "radial-gradient(circle at 50% 45%, #0a1024 0%, #05070f 72%)" }}
      >
        <Scene data={data} mode={atomic.mode} controlsRef={controlsRef} L={L} />
      </Canvas>

      <ScaleIndicator L={L} norm={norm} />
      {spatialContext ? (
        <div data-testid="precision-spatial-source" style={{
          position: "absolute", top: "10px", right: "12px", userSelect: "none", pointerEvents: "none",
          background: "rgba(6,10,26,0.85)", border: `1px solid ${C.border}`, borderRadius: "8px",
          padding: "6px 10px", fontSize: "9px", lineHeight: "1.6", maxWidth: "230px", textAlign: "right",
        }}>
          <div style={{ color: "#9fd0ff" }}>Spatial density source: nonrelativistic orbital model</div>
          <div style={{ color: "rgba(150,180,220,0.7)" }}>
            Precision overlay: spin &amp; energy corrections only — the spatial cloud is not deformed.
          </div>
        </div>
      ) : (
        <EnergyInset data={data} />
      )}

      {atomic.loading && (
        <div data-testid="atomic-loading" style={{
          position: "absolute", bottom: "12px", left: "50%", transform: "translateX(-50%)",
          background: "rgba(6,10,26,0.85)", border: `1px solid ${C.border}`, borderRadius: "14px",
          padding: "4px 12px", color: "rgba(150,180,220,0.8)", fontSize: "10px", pointerEvents: "none",
        }}>evaluating…</div>
      )}
      {atomic.error && (
        <div style={{
          position: "absolute", bottom: "12px", left: "50%", transform: "translateX(-50%)",
          background: "rgba(40,10,10,0.9)", border: "1px solid rgba(180,60,60,0.5)", borderRadius: "10px",
          padding: "5px 12px", color: C.danger, fontSize: "10px", maxWidth: "60%", textAlign: "center",
        }}>⚠ {atomic.error}</div>
      )}

      <button onClick={resetView} title="Reset view" style={{
        position: "absolute", top: "8px", right: "175px",
        background: "rgba(20,28,55,0.85)", border: `1px solid ${C.border}`, borderRadius: "6px",
        color: C.text, padding: "4px 9px", cursor: "pointer", fontSize: "11px",
      }}>↩</button>

      {hud}
    </div>
  );
}
