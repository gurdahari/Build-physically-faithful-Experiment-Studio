/**
 * PhysicalLabScene — the PHYSICAL laboratory view.
 *
 * Unlike the Bloch sphere (an abstract mathematical space), this scene depicts
 * the real experimental apparatus in 3-D lab space:
 *
 *   • Sample      — the spin/qubit under study            (→ Environment editor)
 *   • Magnet      — static field source, B₀ along +Z      (→ System editor)
 *   • RF source   — drive coil emitting B₁(t)             (→ Fields & Pulses editor)
 *   • Detector    — reads the state during measurement    (→ Measurement editor)
 *
 * Objects are selectable (click) and hover-labeled — this is how contextual
 * editing is triggered.  Field arrows are context-aware: only the physically
 * active field is prominent (emphasis weights from stageModel), so B₀ and B₁
 * are never shown with equal weight at the same time.
 *
 * All quantities come from backend data:
 *   B₀ direction  — physical-system definition (static +Z)
 *   B₁(t)         — field_trajectory transverse part [Ωx,Ωy] (direction=φ)
 *   mixedness     — 1−|r| from the backend Bloch vector (relaxation cue)
 * No physics is computed here.
 */

import { useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Line, Text } from "@react-three/drei";
import * as THREE from "three";
import { PHYS, C } from "./theme.js";
import { drivePhase } from "./stageModel.js";

const INITIAL_CAM = [3.2, 3.2, 2.0];

// ── Arrow with opacity (so emphasis can truly fade inactive fields) ──────────
function LabArrow({ origin = [0, 0, 0], direction, length, color, opacity = 1 }) {
  const geom = useMemo(() => {
    const [dx, dy, dz] = direction;
    const mag = Math.hypot(dx, dy, dz);
    if (mag < 1e-9 || length < 1e-6) return null;
    const n = [dx / mag, dy / mag, dz / mag];
    const CONE = 0.22;
    const [ox, oy, oz] = origin;
    const shaftEnd = n.map((c, i) => origin[i] + c * (length - CONE));
    const conePos  = n.map((c, i) => origin[i] + c * (length - CONE / 2));
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), new THREE.Vector3(...n));
    return { shaftEnd, conePos, quat, o: [ox, oy, oz] };
  }, [origin, direction, length]);
  if (!geom) return null;
  return (
    <>
      <Line points={[geom.o, geom.shaftEnd]} color={color} lineWidth={4} transparent opacity={opacity} />
      <mesh position={geom.conePos} quaternion={geom.quat}>
        <coneGeometry args={[0.07, 0.22, 18]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3}
          transparent opacity={opacity} />
      </mesh>
    </>
  );
}

// ── Selectable wrapper ───────────────────────────────────────────────────────
function Selectable({ id, selected, onSelect, onHover, children }) {
  return (
    <group
      onPointerDown={(e) => { e.stopPropagation(); onSelect?.(id); }}
      onPointerOver={(e) => { e.stopPropagation(); onHover?.(id); }}
      onPointerOut={(e)  => { e.stopPropagation(); onHover?.(null); }}
    >
      {children}
      {selected && (
        <mesh>
          <sphereGeometry args={[0.001, 4, 4]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      )}
    </group>
  );
}

// ── Apparatus pieces ─────────────────────────────────────────────────────────
function Magnet({ b0Opacity, selected }) {
  const glow = selected ? 0.5 : 0.15;
  const poleColor = selected ? "#6ea0ff" : "#3a5896";
  return (
    <group>
      {[1.75, -1.75].map((z) => (
        <mesh key={z} position={[0, 0, z]}>
          <cylinderGeometry args={[0.55, 0.55, 0.32, 32]} />
          <meshStandardMaterial color={poleColor} metalness={0.6} roughness={0.45}
            emissive={PHYS.b0} emissiveIntensity={glow} />
        </mesh>
      ))}
      {/* B₀ static field arrow along +Z (from sample toward north pole). */}
      <LabArrow direction={[0, 0, 1]} length={1.45} color={PHYS.b0} opacity={b0Opacity} />
    </group>
  );
}

function Sample({ mixedness, selected }) {
  const shell = Math.max(0.05, Math.min(0.9, mixedness));
  return (
    <group>
      {/* Coherent core (shrinks as the state loses purity). */}
      <mesh>
        <sphereGeometry args={[0.16 * (1 - 0.5 * shell), 24, 24]} />
        <meshStandardMaterial color="#ffe0a0" emissive="#ffb060"
          emissiveIntensity={selected ? 0.9 : 0.55} />
      </mesh>
      {/* Decoherence halo — grows with 1−|r| (relaxation / dephasing). */}
      <mesh>
        <sphereGeometry args={[0.28, 24, 24]} />
        <meshStandardMaterial color="#ff9060" transparent
          opacity={0.06 + 0.22 * shell} depthWrite={false} />
      </mesh>
      {selected && (
        <mesh>
          <sphereGeometry args={[0.33, 24, 24]} />
          <meshBasicMaterial color="#ffd090" wireframe transparent opacity={0.35} />
        </mesh>
      )}
    </group>
  );
}

function RFSource({ b1Opacity, phase, selected }) {
  const pos = [2.1, 0, 0];
  const active = b1Opacity > 0.4;
  const coilColor = selected ? "#7fe0f0" : active ? PHYS.b1 : "#2b6472";
  const dir = [Math.cos(phase), Math.sin(phase), 0];
  return (
    <group>
      {/* Drive coil (axis pointing at the sample). */}
      <mesh position={pos} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.28, 0.06, 16, 32]} />
        <meshStandardMaterial color={coilColor} metalness={0.5} roughness={0.4}
          emissive={PHYS.b1} emissiveIntensity={active ? 0.6 : selected ? 0.4 : 0.08} />
      </mesh>
      {/* Stand */}
      <Line points={[[2.1, 0, -1.9], pos]} color="#25405f" lineWidth={2} />
      {/* Beam from coil to sample — brightens while driving. */}
      <Line points={[pos, [0, 0, 0]]} color={PHYS.b1} lineWidth={1.5}
        transparent opacity={0.08 + 0.5 * b1Opacity} dashed dashScale={3} />
      {/* B₁(t) drive arrow at the sample, along the pulse phase direction. */}
      <LabArrow direction={dir} length={0.95} color={PHYS.b1} opacity={b1Opacity} />
    </group>
  );
}

function Detector({ measureOpacity, measureAxis, selected }) {
  const pos = [0, -2.1, 0];
  const active = measureOpacity > 0.4;
  const color = selected ? "#9ff0c0" : active ? PHYS.measure : "#2f5f48";
  return (
    <group>
      <mesh position={pos} rotation={[Math.PI / 2, 0, 0]}>
        <boxGeometry args={[0.7, 0.5, 0.12]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.6}
          emissive={PHYS.measure} emissiveIntensity={active ? 0.5 : selected ? 0.35 : 0.06} />
      </mesh>
      <Line points={[[0, -1.9, 0], pos]} color="#274a3a" lineWidth={2} />
      {/* Readout beam along the measurement axis while measuring. */}
      {measureAxis && (
        <Line points={[[0, 0, 0], pos]} color={PHYS.measure} lineWidth={2}
          transparent opacity={0.1 + 0.6 * measureOpacity} />
      )}
    </group>
  );
}

function HoverLabel({ id }) {
  const map = {
    system:   { text: "Magnet · B₀ (System)",      pos: [0, 0, 2.35], color: PHYS.b0 },
    sample:   { text: "Sample · T₁/T₂ (Environment)", pos: [0, 0, 0.55], color: "#ffcf90" },
    drive:    { text: "RF source · B₁(t) (Pulse)",  pos: [2.1, 0, 0.55], color: PHYS.b1 },
    detector: { text: "Detector (Measurement)",     pos: [0, -2.1, 0.55], color: PHYS.measure },
  };
  const m = map[id];
  if (!m) return null;
  return (
    <Text position={m.pos} fontSize={0.15} color={m.color} anchorX="center" anchorY="middle"
      outlineWidth={0.012} outlineColor="#000">
      {m.text}
    </Text>
  );
}

function Scene({ emphasis, field, mixedness, selected, onSelect, onHover, hovered, measureAxis, controlsRef }) {
  const phase = drivePhase(field);
  const b1Opacity      = Math.max(0.1, emphasis.b1);
  const b0Opacity      = Math.max(0.12, emphasis.b0);
  const measureOpacity = Math.max(0.05, emphasis.measure);

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 5, 4]} intensity={1.15} />
      <directionalLight position={[-3, -4, -2]} intensity={0.3} color="#7090ff" />

      {/* Faint lab-bench ring for spatial grounding. */}
      <mesh position={[0, 0, -1.95]} rotation={[0, 0, 0]}>
        <ringGeometry args={[0.4, 2.6, 48]} />
        <meshBasicMaterial color="#12203c" transparent opacity={0.25} side={THREE.DoubleSide} />
      </mesh>

      <Selectable id="system" selected={selected === "system"} onSelect={onSelect} onHover={onHover}>
        <Magnet b0Opacity={b0Opacity} selected={selected === "system"} />
      </Selectable>
      <Selectable id="drive" selected={selected === "drive"} onSelect={onSelect} onHover={onHover}>
        <RFSource b1Opacity={b1Opacity} phase={phase} selected={selected === "drive"} />
      </Selectable>
      <Selectable id="detector" selected={selected === "detector"} onSelect={onSelect} onHover={onHover}>
        <Detector measureOpacity={measureOpacity} measureAxis={measureAxis} selected={selected === "detector"} />
      </Selectable>
      <Selectable id="sample" selected={selected === "sample"} onSelect={onSelect} onHover={onHover}>
        <Sample mixedness={mixedness} selected={selected === "sample"} />
      </Selectable>

      <HoverLabel id={hovered ?? selected} />

      <OrbitControls ref={controlsRef} enablePan={false} minDistance={2.2} maxDistance={11} makeDefault />
    </>
  );
}

export default function PhysicalLabScene({
  emphasis = { b0: 0.5, b1: 0, omegaEff: 0, measure: 0 },
  field = null,
  mixedness = 0,
  selected = null,
  onSelect,
  measureAxis = null,
  stageLabel = "",
  height = "100%",
  hud = null,
}) {
  const controlsRef = useRef();
  const [hovered, setHovered] = useState(null);

  const resetCamera = () => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    ctrl.object.position.set(...INITIAL_CAM);
    ctrl.object.up.set(0, 0, 1);
    ctrl.target.set(0, 0, 0);
    ctrl.update();
  };

  return (
    <div style={{ position: "relative", width: "100%", height, borderRadius: "10px", overflow: "hidden" }}>
      <Canvas
        camera={{ position: INITIAL_CAM, fov: 45, up: [0, 0, 1] }}
        style={{ background: "radial-gradient(circle at 50% 35%, #0a1226 0%, #060810 70%)", cursor: hovered ? "pointer" : "default" }}
        onPointerMissed={() => onSelect?.(null)}
      >
        <Scene
          emphasis={emphasis}
          field={field}
          mixedness={mixedness}
          selected={selected}
          onSelect={onSelect}
          onHover={setHovered}
          hovered={hovered}
          measureAxis={measureAxis}
          controlsRef={controlsRef}
        />
      </Canvas>

      <div style={{
        position: "absolute", top: "10px", left: "12px",
        color: "rgba(120,150,200,0.55)", fontSize: "9px", letterSpacing: "0.08em",
        textTransform: "uppercase", userSelect: "none", pointerEvents: "none",
      }}>
        Physical lab · real space
      </div>

      {stageLabel && (
        <div style={{
          position: "absolute", bottom: "12px", left: "50%", transform: "translateX(-50%)",
          color: "rgba(160,190,240,0.75)", fontSize: "11px", letterSpacing: "0.04em",
          userSelect: "none", pointerEvents: "none",
        }}>
          {stageLabel}
        </div>
      )}

      <button onClick={resetCamera} title="Reset camera" style={{
        position: "absolute", top: "8px", right: "8px",
        background: "rgba(20,28,55,0.85)", border: `1px solid ${C.border}`,
        borderRadius: "6px", color: C.text, padding: "4px 9px", cursor: "pointer",
        fontSize: "11px", userSelect: "none",
      }}>↩</button>

      {hud}
    </div>
  );
}
