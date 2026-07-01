/**
 * PhysicalLabScene — the PHYSICAL laboratory view.
 *
 * Depicts a recognizable magnetic-resonance apparatus in real 3-D space so the
 * experiment reads without a legend:
 *
 *   Magnet poles (±Z)  create B₀ ─────────┐
 *   RF coil around the sample produces B₁(t)│  clear physical flow, left → right
 *   Sample (vial) at the center responds ───┤
 *   Detector (wired to the sample) measures ┘
 *
 * Objects are selectable and highlight on hover/selection (never otherwise).
 * Fields visually originate from their source — B₀ as field lines running pole
 * to pole through the sample, B₁ as a field emitted by the coil acting on the
 * sample — and their strength is driven only by backend values (emphasis
 * weights + field magnitude).  No physics is computed here.
 */

import { useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Line, Text } from "@react-three/drei";
import * as THREE from "three";
import { PHYS, C } from "./theme.js";
import { drivePhase } from "./stageModel.js";

const INITIAL_CAM = [2.5, 2.5, 1.7];

// ── Arrow with opacity (so emphasis can truly fade inactive fields) ──────────
function LabArrow({ origin = [0, 0, 0], direction, length, color, opacity = 1, lineWidth = 4, cone = 0.16 }) {
  const geom = useMemo(() => {
    const [dx, dy, dz] = direction;
    const mag = Math.hypot(dx, dy, dz);
    if (mag < 1e-9 || length < 1e-6) return null;
    const n = [dx / mag, dy / mag, dz / mag];
    const shaftEnd = n.map((c, i) => origin[i] + c * (length - cone));
    const conePos  = n.map((c, i) => origin[i] + c * (length - cone / 2));
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), new THREE.Vector3(...n));
    return { shaftEnd, conePos, quat, o: [...origin] };
  }, [origin, direction, length, cone]);
  if (!geom) return null;
  return (
    <>
      <Line points={[geom.o, geom.shaftEnd]} color={color} lineWidth={lineWidth} transparent opacity={opacity} />
      <mesh position={geom.conePos} quaternion={geom.quat}>
        <coneGeometry args={[cone * 0.34, cone, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} transparent opacity={opacity} />
      </mesh>
    </>
  );
}

// ── Selectable wrapper (pointer events only; highlight handled by children) ──
function Selectable({ id, onSelect, onHover, children }) {
  return (
    <group
      onPointerDown={(e) => { e.stopPropagation(); onSelect?.(id); }}
      onPointerOver={(e) => { e.stopPropagation(); onHover?.(id); }}
      onPointerOut={(e)  => { e.stopPropagation(); onHover?.(null); }}
    >
      {children}
    </group>
  );
}

// ── Magnet: two pole pieces around the sample + B₀ field lines through it ─────
function Magnet({ b0Opacity, highlight }) {
  const poleColor = highlight ? "#6a90d0" : "#2e456e";
  const glow = highlight ? 0.35 : 0.05;
  const zPole = 1.0;
  // B₀ field lines running pole-to-pole through the sample region.
  const fieldLines = [[0, 0], [0.24, 0], [-0.24, 0], [0, 0.24], [0, -0.24]];
  return (
    <group>
      {[zPole, -zPole].map((z) => (
        <mesh key={z} position={[0, 0, z]}>
          {/* Small, flat pole faces — recognizable but not dominating. */}
          <cylinderGeometry args={[0.28, 0.32, 0.12, 40]} />
          <meshStandardMaterial color={poleColor} metalness={0.75} roughness={0.4}
            emissive={PHYS.b0} emissiveIntensity={glow} />
        </mesh>
      ))}
      {/* Pole labels N/S give the magnet immediate meaning. */}
      <Text position={[0, 0, zPole + 0.16]} fontSize={0.12} color="#9fb8e6"
        anchorX="center" anchorY="middle">N</Text>
      <Text position={[0, 0, -zPole - 0.16]} fontSize={0.12} color="#9fb8e6"
        anchorX="center" anchorY="middle">S</Text>
      {fieldLines.map(([x, y], i) => (
        <Line key={i} points={[[x, y, -zPole + 0.1], [x, y, zPole - 0.1]]}
          color={PHYS.b0} lineWidth={1} transparent opacity={0.06 + 0.36 * b0Opacity} />
      ))}
      {/* Direction indicator through the sample (part of the pole-to-pole field). */}
      <LabArrow origin={[0, 0, -0.05]} direction={[0, 0, 1]} length={0.62} color={PHYS.b0}
        opacity={0.12 + 0.6 * b0Opacity} lineWidth={2} cone={0.11} />
    </group>
  );
}

// ── Sample: a vial with the spin inside; halo grows with coherence loss ──────
function Sample({ mixedness, highlight }) {
  const shell = Math.max(0.05, Math.min(0.9, mixedness));
  return (
    <group>
      {/* Glass vial (translucent). */}
      <mesh>
        <cylinderGeometry args={[0.15, 0.15, 0.52, 28, 1, false]} />
        <meshStandardMaterial color="#9fc4ff" transparent opacity={highlight ? 0.28 : 0.16}
          metalness={0.1} roughness={0.15} depthWrite={false} />
      </mesh>
      {/* Rounded vial base. */}
      <mesh position={[0, 0, -0.26]}>
        <sphereGeometry args={[0.15, 24, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshStandardMaterial color="#9fc4ff" transparent opacity={highlight ? 0.28 : 0.16}
          metalness={0.1} roughness={0.15} depthWrite={false} />
      </mesh>
      {/* The spin ensemble (shrinks as purity is lost). */}
      <mesh>
        <sphereGeometry args={[0.11 * (1 - 0.45 * shell), 24, 24]} />
        <meshStandardMaterial color="#ffe0a0" emissive="#ffb060" emissiveIntensity={highlight ? 0.95 : 0.6} />
      </mesh>
      {/* Decoherence halo — grows with 1−|r|. */}
      <mesh>
        <sphereGeometry args={[0.2, 20, 20]} />
        <meshStandardMaterial color="#ff9060" transparent opacity={0.05 + 0.22 * shell} depthWrite={false} />
      </mesh>
      {highlight && (
        <mesh>
          <sphereGeometry args={[0.24, 20, 20]} />
          <meshBasicMaterial color="#ffd090" wireframe transparent opacity={0.3} />
        </mesh>
      )}
    </group>
  );
}

// ── RF coil wrapped around the sample; emits B₁ along its axis into the sample ─
function RFCoil({ b1Opacity, phase, highlight }) {
  const active = b1Opacity > 0.4;
  const coilColor = highlight ? "#8fe6f4" : active ? PHYS.b1 : "#2f6b78";
  const glow = active ? 0.6 : highlight ? 0.4 : 0.08;
  const loops = [-0.34, -0.17, 0, 0.17, 0.34]; // solenoid turns along the coil axis
  // The whole coil (and thus its field) is oriented along the drive direction φ.
  return (
    <group rotation={[0, 0, phase]}>
      {loops.map((x) => (
        <mesh key={x} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.3, 0.028, 12, 28]} />
          <meshStandardMaterial color={coilColor} metalness={0.55} roughness={0.35}
            emissive={PHYS.b1} emissiveIntensity={glow} />
        </mesh>
      ))}
      {/* Lead wires so the coil reads as a driven component. */}
      <Line points={[[-0.34, 0, 0.3], [-0.62, 0, 0.62]]} color="#2f6b78" lineWidth={2} />
      <Line points={[[0.34, 0, 0.3], [0.62, 0, 0.62]]} color="#2f6b78" lineWidth={2} />
      {/* B₁(t) emitted by the coil, acting locally along the coil axis through the sample. */}
      <LabArrow origin={[-0.12, 0, 0]} direction={[1, 0, 0]} length={0.62} color={PHYS.b1}
        opacity={b1Opacity} lineWidth={4} cone={0.15} />
    </group>
  );
}

// ── Detector: wired to the sample; readout beam brightens during measurement ──
function Detector({ measureOpacity, showBeam, highlight }) {
  const active = measureOpacity > 0.4;
  const bodyColor = highlight ? "#9ff0c0" : active ? "#3f8f68" : "#2c5343";
  const faceColor = active ? PHYS.measure : "#3a6f56";
  const pos = [0, -1.2, 0];
  return (
    <group>
      {/* Detector body. */}
      <mesh position={pos} rotation={[Math.PI / 2, 0, 0]}>
        <boxGeometry args={[0.5, 0.34, 0.16]} />
        <meshStandardMaterial color={bodyColor} metalness={0.3} roughness={0.6}
          emissive={PHYS.measure} emissiveIntensity={active ? 0.4 : highlight ? 0.3 : 0.05} />
      </mesh>
      {/* Sensor face pointing at the sample. */}
      <mesh position={[0, -1.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.42, 0.26]} />
        <meshStandardMaterial color={faceColor} emissive={PHYS.measure}
          emissiveIntensity={active ? 0.6 : 0.15} side={THREE.DoubleSide} />
      </mesh>
      {/* Lead connecting the detector to the sample region. */}
      <Line points={[[0, -1.02, 0], [0, -0.22, 0]]} color="#2c5343" lineWidth={2} />
      {/* Readout beam (only during measurement). */}
      {showBeam && (
        <Line points={[[0, 0, 0], [0, -1.02, 0]]} color={PHYS.measure} lineWidth={2}
          transparent opacity={0.12 + 0.6 * measureOpacity} dashed dashScale={3} />
      )}
    </group>
  );
}

function HoverLabel({ id }) {
  const map = {
    system:   { text: "Magnet — B₀ source",     pos: [0, 0, 1.35], color: PHYS.b0 },
    sample:   { text: "Sample (spin ensemble)",  pos: [0, 0, 0.42], color: "#ffcf90" },
    drive:    { text: "RF coil — B₁(t) source",  pos: [0, 0, -0.62], color: PHYS.b1 },
    detector: { text: "Detector",                pos: [0, -1.2, 0.42], color: PHYS.measure },
  };
  const m = map[id];
  if (!m) return null;
  return (
    <Text position={m.pos} fontSize={0.12} color={m.color} anchorX="center" anchorY="middle"
      outlineWidth={0.01} outlineColor="#000">
      {m.text}
    </Text>
  );
}

function Scene({ emphasis, field, mixedness, selected, onSelect, onHover, hovered, controlsRef }) {
  const phase = drivePhase(field);
  const b1Opacity      = Math.max(0.08, emphasis.b1);
  const b0Opacity      = Math.max(0.10, emphasis.b0);
  const measureOpacity = Math.max(0.05, emphasis.measure);
  const hl = (id) => selected === id || hovered === id;

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 5, 4]} intensity={1.15} />
      <directionalLight position={[-3, -4, -2]} intensity={0.3} color="#7090ff" />

      <Selectable id="system" onSelect={onSelect} onHover={onHover}>
        <Magnet b0Opacity={b0Opacity} highlight={hl("system")} />
      </Selectable>
      <Selectable id="drive" onSelect={onSelect} onHover={onHover}>
        <RFCoil b1Opacity={b1Opacity} phase={phase} highlight={hl("drive")} />
      </Selectable>
      <Selectable id="detector" onSelect={onSelect} onHover={onHover}>
        <Detector measureOpacity={measureOpacity} showBeam={emphasis.measure > 0.4} highlight={hl("detector")} />
      </Selectable>
      <Selectable id="sample" onSelect={onSelect} onHover={onHover}>
        <Sample mixedness={mixedness} highlight={hl("sample")} />
      </Selectable>

      <HoverLabel id={hovered ?? selected} />

      <OrbitControls ref={controlsRef} enablePan={false} minDistance={1.8} maxDistance={8} makeDefault />
    </>
  );
}

export default function PhysicalLabScene({
  emphasis = { b0: 0.5, b1: 0, omegaEff: 0, measure: 0 },
  field = null,
  mixedness = 0,
  selected = null,
  onSelect,
  caption = "",
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
        style={{ background: "radial-gradient(circle at 50% 40%, #0b1428 0%, #060810 72%)", cursor: hovered ? "pointer" : "default" }}
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

      {caption && (
        <div style={{
          position: "absolute", bottom: "12px", left: "50%", transform: "translateX(-50%)",
          background: "rgba(6,10,26,0.82)", border: `1px solid ${C.border}`, borderRadius: "18px",
          padding: "5px 15px", color: "rgba(190,210,245,0.92)", fontSize: "12px",
          userSelect: "none", pointerEvents: "none", whiteSpace: "nowrap",
        }}>
          {caption}
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
