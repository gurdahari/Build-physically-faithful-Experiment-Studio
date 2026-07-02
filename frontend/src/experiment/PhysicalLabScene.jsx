/**
 * PhysicalLabScene — the PHYSICAL laboratory view, now showing what the pulse
 * does to the system live and how the detector receives a signal.
 *
 * Recognizable apparatus: magnet poles (B₀ source) · glass sample vial with the
 * representative magnetization inside · RF solenoid (B₁ source) wrapped around
 * the sample · wired detector.
 *
 * Everything visible is driven by the backend at the current playIndex:
 *   • B₁ / coil glow      ← normalized transverse drive level (field_trajectory)
 *   • B₁ direction        ← normalize([Ωx, Ωy, 0])
 *   • representative state ← backend Bloch vector (direction) with length ∝ |r|
 *   • B₀ field lines       ← sampled uniform field direction (fieldSampler)
 *   • detector glow/beam   ← backend detector_signal_magnitude (transverse mag)
 *   • close-up camera      ← current stage (pulse) + Advanced preference
 *
 * Only the pulse ENVELOPE is shown (the RF carrier is folded out); no pulse
 * physics is recomputed here.  See docs/EXPERIMENT_STUDIO.md.
 */

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Line, Text } from "@react-three/drei";
import * as THREE from "three";
import { PHYS, C } from "./theme.js";
import { representativeArrow, CAMERA_DIST } from "./signalModel.js";
import { sampleFieldLines } from "./fieldSampler.js";
import { quadratureChannels } from "./pulseModel.js";
import { focusFraming, focusFade, DEFAULT_NEAR } from "./focusModel.js";

const INITIAL_CAM = [2.5, 2.5, 1.7];
const _rigVec = new THREE.Vector3();     // reused each frame — no per-frame allocation
const _rigTarget = new THREE.Vector3();
const _rigDesired = new THREE.Vector3();

// ── Camera rig — smoothly lerps the orbit target, distance, and (optionally) the
// viewing direction toward a goal.  Drives the pulse close-up AND two-level object
// focus; returns to default framing when nothing is active.  Purely a view
// transform; no physics; reuses scratch vectors (no per-frame allocation).
function CameraRig({ targetPos, targetDistance, direction, nearPlane, active, controlsRef }) {
  const engaged = useRef(false);
  useFrame((state) => {
    const camera = state.camera;
    if (active) engaged.current = true;
    if (!engaged.current) return;
    const ctrl = controlsRef.current;
    if (!ctrl) return;

    // Responsive: a narrow (portrait) canvas — dual view / open editor — has a
    // tighter horizontal fov, so pull back to keep the object framed.
    const aspect = state.size.height > 0 ? state.size.width / state.size.height : 1;
    const dist = aspect < 1 ? targetDistance / aspect : targetDistance;

    _rigTarget.set(targetPos[0], targetPos[1], targetPos[2]);
    ctrl.target.lerp(_rigTarget, 0.09);                       // move toward the object

    if (direction) {
      // Explicit viewing direction: lerp camera toward target + dir·dist.
      _rigDesired.set(
        ctrl.target.x + direction[0] * dist,
        ctrl.target.y + direction[1] * dist,
        ctrl.target.z + direction[2] * dist,
      );
      camera.position.lerp(_rigDesired, 0.09);
    } else {
      // Keep the user's current view direction; lerp only the distance.
      _rigVec.set(
        camera.position.x - ctrl.target.x,
        camera.position.y - ctrl.target.y,
        camera.position.z - ctrl.target.z,
      );
      const len = _rigVec.length();
      if (len > 1e-6) {
        const next = THREE.MathUtils.lerp(len, dist, 0.09);
        _rigVec.multiplyScalar(next / len);
        camera.position.set(ctrl.target.x + _rigVec.x, ctrl.target.y + _rigVec.y, ctrl.target.z + _rigVec.z);
      }
    }

    // Near plane — only touched when it actually changes (avoids depth artifacts).
    if (nearPlane && Math.abs(camera.near - nearPlane) > 1e-4) {
      camera.near = nearPlane;
      camera.updateProjectionMatrix();
    }

    ctrl.update();

    // Release control once the default framing has been restored.
    if (!active) {
      const camDist = Math.hypot(
        camera.position.x - ctrl.target.x,
        camera.position.y - ctrl.target.y,
        camera.position.z - ctrl.target.z,
      );
      if (ctrl.target.length() < 0.02 && Math.abs(camDist - dist) < 0.05) engaged.current = false;
    }
  });
  return null;
}

// ── Arrow with opacity ───────────────────────────────────────────────────────
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

// ── Magnet + B₀ field lines (sampled from the field model) ───────────────────
function Magnet({ b0Opacity, highlight, fade = 1 }) {
  const poleColor = highlight ? "#6a90d0" : "#2e456e";
  const glow = (highlight ? 0.35 : 0.05) * fade;
  const zPole = 1.0;
  const lines = useMemo(() => sampleFieldLines({ direction: [0, 0, 1], uniform: true, zSpan: [-0.9, 0.9] }), []);
  return (
    <group>
      {[zPole, -zPole].map((z) => (
        <mesh key={z} position={[0, 0, z]}>
          <cylinderGeometry args={[0.28, 0.32, 0.12, 40]} />
          <meshStandardMaterial color={poleColor} metalness={0.75} roughness={0.4}
            emissive={PHYS.b0} emissiveIntensity={glow} transparent={fade < 1} opacity={fade} />
        </mesh>
      ))}
      <Text position={[0, 0, zPole + 0.16]} fontSize={0.12} color="#9fb8e6" anchorX="center" anchorY="middle" fillOpacity={fade}>N</Text>
      <Text position={[0, 0, -zPole - 0.16]} fontSize={0.12} color="#9fb8e6" anchorX="center" anchorY="middle" fillOpacity={fade}>S</Text>
      {lines.map((ln, i) => (
        <Line key={i} points={[ln.p0, ln.p1]} color={PHYS.b0} lineWidth={1}
          transparent opacity={(0.06 + 0.36 * b0Opacity) * fade} />
      ))}
      <LabArrow origin={[0, 0, -0.05]} direction={[0, 0, 1]} length={0.62} color={PHYS.b0}
        opacity={(0.12 + 0.6 * b0Opacity) * fade} lineWidth={2} cone={0.11} />
    </group>
  );
}

// ── Sample vial + representative magnetization (from backend Bloch vector) ────
function Sample({ mixedness, stateVec, hasResult, highlight, fade = 1 }) {
  const shell = Math.max(0.05, Math.min(0.9, mixedness));
  const rep = useMemo(() => representativeArrow(stateVec, 0.22), [stateVec]);
  return (
    <group>
      <mesh>
        <cylinderGeometry args={[0.15, 0.15, 0.52, 28, 1, false]} />
        <meshStandardMaterial color="#9fc4ff" transparent opacity={(highlight ? 0.26 : 0.14) * fade}
          metalness={0.1} roughness={0.15} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, -0.26]}>
        <sphereGeometry args={[0.15, 24, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshStandardMaterial color="#9fc4ff" transparent opacity={(highlight ? 0.26 : 0.14) * fade}
          metalness={0.1} roughness={0.15} depthWrite={false} />
      </mesh>
      {/* Decoherence halo — grows with 1−|r|. */}
      <mesh>
        <sphereGeometry args={[0.19, 20, 20]} />
        <meshStandardMaterial color="#ff9060" transparent opacity={(0.04 + 0.2 * shell) * fade} depthWrite={false} />
      </mesh>
      {/* Representative magnetization: direction from backend r, length ∝ |r|. */}
      {hasResult && rep.length > 1e-3 ? (
        <LabArrow origin={[0, 0, 0]} direction={rep.direction} length={rep.length}
          color={PHYS.bloch} opacity={0.95 * fade} lineWidth={3} cone={0.07} />
      ) : (
        <mesh>
          <sphereGeometry args={[0.06, 18, 18]} />
          <meshStandardMaterial color="#ffe0a0" emissive="#ffb060" emissiveIntensity={0.55 * fade}
            transparent={fade < 1} opacity={fade} />
        </mesh>
      )}
      {highlight && (
        <mesh>
          <sphereGeometry args={[0.24, 20, 20]} />
          <meshBasicMaterial color="#ffd090" wireframe transparent opacity={0.3 * fade} />
        </mesh>
      )}
    </group>
  );
}

// Constant cone orientation for glyphs (all point along the coil axis, local +X).
const GLYPH_QUAT = new THREE.Quaternion().setFromUnitVectors(
  new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));

/**
 * B1FieldGlyphs — the PRIMARY representation of the RF field: a small finite set
 * of short field glyphs sampling B₁(r,t) through the coil bore and the sample.
 * For the uniform-drive model every glyph points the same transverse direction
 * (local +X of the coil group, which is rotated to φ). Their opacity is the one
 * documented mapping of the normalized backend magnitude (driveLevel); length is
 * fixed only for visibility. No curvature/gradient is implied.
 */
function B1FieldGlyphs({ strength, fade = 1 }) {
  const glyphs = useMemo(() => {
    const axial = [-0.28, 0, 0.28];                                   // along the bore
    const trans = [[0, 0], [0.14, 0], [-0.14, 0], [0, 0.14], [0, -0.14]]; // across it
    const len = 0.16;
    const out = [];
    for (const ax of axial) for (const [ty, tz] of trans) {
      out.push({ start: [ax - len / 2, ty, tz], end: [ax + len / 2, ty, tz], head: [ax + len / 2, ty, tz] });
    }
    return out;
  }, []);
  if (strength <= 0.02) return null;                // zero drive → no glyphs at all
  const op = (0.12 + 0.85 * strength) * fade;       // single documented mapping
  return (
    <group>
      {glyphs.map((g, i) => (
        <group key={i}>
          <Line points={[g.start, g.end]} color={PHYS.b1} lineWidth={2} transparent opacity={op} />
          <mesh position={g.head} quaternion={GLYPH_QUAT}>
            <coneGeometry args={[0.028, 0.06, 10]} />
            <meshStandardMaterial color={PHYS.b1} emissive={PHYS.b1} emissiveIntensity={0.4} transparent opacity={op} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ── Quadrature RF source — FIXED hardware; two orthogonal drive channels ─────
// The coils never rotate with φ. Instead the X-channel (Ωx = Ω cosφ) and the
// Y-channel (Ωy = Ω sinφ) glow independently, and the field (glyphs) points along
// their vector sum. An X pulse lights only the X channel; a Y pulse only the Y
// channel; an arbitrary phase drives both.
function QuadratureRFSource({ driveLevel, phase, highlight, fade = 1 }) {
  const { x: cx, y: cy } = quadratureChannels(phase);      // signed cosφ, sinφ
  const xLevel = Math.abs(cx) * driveLevel;
  const yLevel = Math.abs(cy) * driveLevel;
  const active = driveLevel > 0.03;
  const chanColor = (lvl) => highlight ? "#8fe6f4" : lvl > 0.02 ? PHYS.b1 : "#2f6b78";
  const chanGlow  = (lvl) => (lvl > 0.02 ? 0.12 + 0.7 * lvl : highlight ? 0.32 : 0.05) * fade;
  return (
    <group>
      {/* X channel: loops whose axis is the lab X (rings in the YZ plane). */}
      {[-0.18, 0.18].map((x) => (
        <mesh key={`x${x}`} position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.3, 0.026, 12, 26]} />
          <meshStandardMaterial color={chanColor(xLevel)} metalness={0.55} roughness={0.35}
            emissive={PHYS.b1} emissiveIntensity={chanGlow(xLevel)} transparent={fade < 1} opacity={fade} />
        </mesh>
      ))}
      {/* Y channel: loops whose axis is the lab Y (rings in the XZ plane). */}
      {[-0.18, 0.18].map((y) => (
        <mesh key={`y${y}`} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.3, 0.026, 12, 26]} />
          <meshStandardMaterial color={chanColor(yLevel)} metalness={0.55} roughness={0.35}
            emissive={PHYS.b1} emissiveIntensity={chanGlow(yLevel)} transparent={fade < 1} opacity={fade} />
        </mesh>
      ))}
      {/* The FIELD (not the hardware) rotates to the resultant direction φ. */}
      <group rotation={[0, 0, phase]}>
        <B1FieldGlyphs strength={driveLevel} fade={fade} />
        {active && (
          <LabArrow origin={[-0.34, 0, 0]} direction={[1, 0, 0]} length={0.6} color={PHYS.b1}
            opacity={(0.08 + 0.4 * driveLevel) * fade} lineWidth={2} cone={0.1} />
        )}
      </group>
    </group>
  );
}

// ── Detector — glow/beam follow the backend detector signal magnitude ────────
function Detector({ signalLevel, measurementActive, highlight, fade = 1 }) {
  const acquiring = signalLevel > 0.02;
  const litColor = measurementActive ? "#c9ff9f" : acquiring ? PHYS.measure : "#2c5343";
  const bodyColor = highlight ? "#9ff0c0" : litColor;
  const intensity = (measurementActive ? 0.6 : acquiring ? 0.1 + 0.6 * signalLevel : highlight ? 0.3 : 0.05) * fade;
  const faceIntensity = (measurementActive ? 0.7 : acquiring ? 0.15 + 0.5 * signalLevel : 0.1) * fade;
  const pos = [0, -1.2, 0];
  return (
    <group>
      <mesh position={pos} rotation={[Math.PI / 2, 0, 0]}>
        <boxGeometry args={[0.5, 0.34, 0.16]} />
        <meshStandardMaterial color={bodyColor} metalness={0.3} roughness={0.6}
          emissive={PHYS.measure} emissiveIntensity={intensity} transparent={fade < 1} opacity={fade} />
      </mesh>
      <mesh position={[0, -1.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.42, 0.26]} />
        <meshStandardMaterial color={litColor} emissive={PHYS.measure}
          emissiveIntensity={faceIntensity} side={THREE.DoubleSide} transparent={fade < 1} opacity={fade} />
      </mesh>
      <Line points={[[0, -1.02, 0], [0, -0.22, 0]]} color="#2c5343" lineWidth={2} transparent opacity={fade} />
      {/* Readout connection is active only when a signal is present. */}
      {measurementActive ? (
        <Line points={[[0, 0, 0], [0, -1.02, 0]]} color={PHYS.measure} lineWidth={2.5} transparent opacity={0.85 * fade} />
      ) : acquiring ? (
        <Line points={[[0, 0, 0], [0, -1.02, 0]]} color={PHYS.measure} lineWidth={2}
          transparent opacity={(0.1 + 0.7 * signalLevel) * fade} dashed dashScale={3} />
      ) : null}
    </group>
  );
}

function HoverLabel({ id }) {
  const map = {
    system:   { text: "Magnet — B₀ source",       pos: [0, 0, 1.35], color: PHYS.b0 },
    sample:   { text: "Sample · magnetization",    pos: [0, 0, 0.42], color: "#ffcf90" },
    drive:    { text: "Quadrature RF source (X+Y)", pos: [0, 0, -0.62], color: PHYS.b1 },
    detector: { text: "Detector",                  pos: [0, -1.2, 0.42], color: PHYS.measure },
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

function Scene({
  emphasis, driveLevel, rfActive, pulsePhase, signalLevel, mixedness, stateVec, hasResult,
  measurementActive, closeup, focusedObject, focusLevel, selected, onSelect, onHover, hovered, controlsRef,
}) {
  const b0Opacity = Math.max(0.10, emphasis.b0);
  const hl = (id) => selected === id || hovered === id;
  // Manual object focus takes priority; otherwise the automatic pulse close-up;
  // otherwise default framing. When focus exits, pulse close-up resumes if active.
  const framing = focusedObject ? focusFraming(focusedObject, focusLevel) : null;
  const camTarget = framing ? framing.target : [0, 0, 0];
  const camDistance = framing ? framing.distance : (closeup ? CAMERA_DIST.near : CAMERA_DIST.far);
  const camDirection = framing ? framing.direction : null;
  const camNear = framing ? framing.near : DEFAULT_NEAR;
  const camActive = !!framing || closeup;
  const minDist = framing ? framing.minDistance : 1.7;   // allow closer inspection while focused
  // Contextual fade of unrelated apparatus (macro fades more than close-up).
  const fade = focusedObject ? focusFade(focusedObject, focusLevel) : null;
  // RF energy is shown ONLY for a real transverse pulse, and never left stale
  // during a projective measurement.
  const rfStrength = rfActive && !measurementActive ? driveLevel : 0;

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 5, 4]} intensity={1.15} />
      <directionalLight position={[-3, -4, -2]} intensity={0.3} color="#7090ff" />

      <Selectable id="system" onSelect={onSelect} onHover={onHover}>
        <Magnet b0Opacity={b0Opacity} highlight={hl("system")} fade={fade?.system ?? 1} />
      </Selectable>
      <Selectable id="drive" onSelect={onSelect} onHover={onHover}>
        <QuadratureRFSource driveLevel={rfStrength} phase={pulsePhase} highlight={hl("drive")} fade={fade?.drive ?? 1} />
      </Selectable>
      <Selectable id="detector" onSelect={onSelect} onHover={onHover}>
        <Detector signalLevel={signalLevel} measurementActive={measurementActive} highlight={hl("detector")} fade={fade?.detector ?? 1} />
      </Selectable>
      <Selectable id="sample" onSelect={onSelect} onHover={onHover}>
        <Sample mixedness={mixedness} stateVec={stateVec} hasResult={hasResult} highlight={hl("sample")} fade={fade?.sample ?? 1} />
      </Selectable>

      <HoverLabel id={hovered ?? selected} />

      <CameraRig targetPos={camTarget} targetDistance={camDistance} direction={camDirection}
        nearPlane={camNear} active={camActive} controlsRef={controlsRef} />
      <OrbitControls ref={controlsRef} enablePan={false} minDistance={minDist} maxDistance={8} makeDefault />
    </>
  );
}

// ── Detector readout chip (HTML; continuous vs projective distinguished) ─────
function DetectorChip({ signalLevel, signalPhase, measurementActive, measurementOutcome }) {
  const acquiring = signalLevel > 0.02;
  return (
    <div style={{
      position: "absolute", bottom: "12px", right: "12px",
      background: "rgba(6,10,26,0.85)", border: `1px solid ${C.border}`,
      borderRadius: "8px", padding: "7px 11px", fontFamily: "monospace",
      fontSize: "10px", lineHeight: "1.6", userSelect: "none", minWidth: "120px",
    }}>
      <div style={{ color: "rgba(90,130,200,0.6)", fontSize: "8px", letterSpacing: "0.08em", marginBottom: "3px" }}>
        DETECTOR
      </div>
      {measurementActive && measurementOutcome ? (
        <>
          <div style={{ color: PHYS.measure }}>projective · {measurementOutcome.basis?.toUpperCase() ?? "Z"}</div>
          <div style={{ color: "#c9ff9f", fontSize: "12px" }}>→ {measurementOutcome.label}</div>
          <div style={{ color: C.label }}>p = {measurementOutcome.p?.toFixed(3) ?? "—"}{measurementOutcome.derived ? " (derived)" : ""}</div>
        </>
      ) : acquiring ? (
        <>
          <div style={{ color: PHYS.measure }}>acquiring · S = {signalLevel.toFixed(3)}</div>
          <div style={{ color: C.label }}>φ = {signalPhase.toFixed(2)} rad</div>
          <div style={{ height: "3px", background: "rgba(60,120,90,0.25)", borderRadius: "2px", marginTop: "3px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.round(signalLevel * 100)}%`, background: PHYS.measure }} />
          </div>
        </>
      ) : (
        <div style={{ color: C.dim }}>idle · S = 0.000</div>
      )}
    </div>
  );
}

export default function PhysicalLabScene({
  emphasis = { b0: 0.5, measure: 0 },   // lab view uses B₀ emphasis only (effective field is state-space only)
  driveLevel = 0,
  rfActive = false,
  pulsePhase = 0,
  signalLevel = 0,
  signalPhase = 0,
  mixedness = 0,
  stateVec = null,
  hasResult = false,
  measurementActive = false,
  measurementOutcome = null,
  closeup = false,
  focusedObject = null,
  focusLevel = 1,
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
          driveLevel={driveLevel}
          rfActive={rfActive}
          pulsePhase={pulsePhase}
          signalLevel={signalLevel}
          mixedness={mixedness}
          stateVec={stateVec}
          hasResult={hasResult}
          measurementActive={measurementActive}
          closeup={closeup}
          focusedObject={focusedObject}
          focusLevel={focusLevel}
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
        Physical lab · real space · <span style={{ color: PHYS.b1 }}>envelope view</span>
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

      <DetectorChip signalLevel={signalLevel} signalPhase={signalPhase}
        measurementActive={measurementActive} measurementOutcome={measurementOutcome} />

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
