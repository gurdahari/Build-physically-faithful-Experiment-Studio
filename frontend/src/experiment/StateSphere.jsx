/**
 * StateSphere — the MATHEMATICAL state-space view (Bloch sphere).
 *
 * This is explicitly NOT a physical object: it is the abstract space of the
 * qubit density matrix.  It shows only state-space quantities:
 *   • Bloch vector r        — strongest element (from backend trajectory)
 *   • trajectory            — faint history (backend trajectory, frame-transformed)
 *   • effective field Ω_eff — medium, shown ONLY while a pulse is active
 *   • measurement axis      — shown only during the measurement stage
 *
 * It performs no physics; it renders backend-derived vectors that the parent
 * has already frame-transformed.  Axes/guides are deliberately subtle and there
 * are no permanent labels floating at the center (labels live in HTML chips).
 */

import { useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Line, Text } from "@react-three/drei";
import * as THREE from "three";
import { PHYS, C } from "./theme.js";

const INITIAL_CAM = [2.2, 2.2, 1.3];
const TWO_PI = 2 * Math.PI;

function SubtleAxis({ dir, label }) {
  const a = 1.28;
  const neg = dir.map(v => -v * a);
  const pos = dir.map(v => v * a);
  const lbl = dir.map(v => v * (a + 0.16));
  return (
    <>
      <Line points={[neg, pos]} color="#2c3f63" lineWidth={1} transparent opacity={0.6} />
      <Text position={lbl} fontSize={0.1} color="#3d5a7a"
        anchorX="center" anchorY="middle" outlineWidth={0.006} outlineColor="#000">
        {label}
      </Text>
    </>
  );
}

// Thin, low-opacity arrow from the origin — used for the effective field so it
// stays visually subordinate to the Bloch vector and fully inside the panel.
function ThinArrow({ direction, length, color, opacity = 0.55 }) {
  const geom = useMemo(() => {
    const [dx, dy, dz] = direction;
    const mag = Math.hypot(dx, dy, dz);
    if (mag < 1e-9 || length < 1e-6) return null;
    const n = [dx / mag, dy / mag, dz / mag];
    const CONE = 0.12;
    const shaftEnd = n.map(c => c * (length - CONE));
    const conePos = n.map(c => c * (length - CONE / 2));
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), new THREE.Vector3(...n));
    return { shaftEnd, conePos, quat };
  }, [direction, length]);
  if (!geom) return null;
  return (
    <>
      <Line points={[[0, 0, 0], geom.shaftEnd]} color={color} lineWidth={2} transparent opacity={opacity} />
      <mesh position={geom.conePos} quaternion={geom.quat}>
        <coneGeometry args={[0.04, 0.12, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} transparent opacity={opacity} />
      </mesh>
    </>
  );
}

function BlochArrow({ vec }) {
  const geom = useMemo(() => {
    const [x, y, z] = vec;
    const mag = Math.hypot(x, y, z);
    if (mag < 1e-9) return null;
    const nx = x / mag, ny = y / mag, nz = z / mag;
    const CONE = 0.2;
    const frac = (mag - CONE) / mag;
    return {
      shaftEnd: [nx * mag * frac, ny * mag * frac, nz * mag * frac],
      conePos:  [nx * (mag - CONE / 2), ny * (mag - CONE / 2), nz * (mag - CONE / 2)],
      coneQuat: new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, ny, nz)),
      tip: [x, y, z],
    };
  }, [vec]);
  if (!geom) return (
    <mesh><sphereGeometry args={[0.03, 12, 12]} />
      <meshStandardMaterial color={PHYS.bloch} emissive={PHYS.bloch} emissiveIntensity={0.6} />
    </mesh>
  );
  return (
    <>
      <Line points={[[0, 0, 0], geom.shaftEnd]} color={PHYS.bloch} lineWidth={6.5} />
      <mesh position={geom.conePos} quaternion={geom.coneQuat}>
        <coneGeometry args={[0.062, 0.22, 22]} />
        <meshStandardMaterial color={PHYS.bloch} emissive={PHYS.bloch} emissiveIntensity={0.45} />
      </mesh>
      <mesh position={geom.tip}>
        <sphereGeometry args={[0.055, 20, 20]} />
        <meshStandardMaterial color="#ffd0d8" emissive={PHYS.bloch} emissiveIntensity={0.55} />
      </mesh>
    </>
  );
}

function Scene({ bloch, trajectory, futureTrajectory, segmentBreaks, trajectoryAlt, field, showEffective, measureAxis, controlsRef }) {
  const equator = useMemo(() => {
    const pts = [];
    for (let i = 0; i <= 96; i++) {
      const t = (i / 96) * TWO_PI;
      pts.push([Math.cos(t), Math.sin(t), 0]);
    }
    return pts;
  }, []);

  // Effective field (rotation axis) — normalized to stay inside the unit sphere
  // so it never extends past the panel and stays subordinate to the Bloch vector.
  const effVisual = useMemo(() => {
    if (!showEffective || !field) return null;
    const [fx, fy, fz] = field;
    const mag = Math.hypot(fx, fy, fz);
    if (mag < 1e-9) return null;
    return { direction: [fx / mag, fy / mag, fz / mag], length: 0.8 };
  }, [showEffective, field]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 3]} intensity={1.1} />
      <directionalLight position={[-2, -3, -2]} intensity={0.25} color="#7090ff" />

      <mesh>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial color="#16336f" transparent opacity={0.14}
          depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <Line points={equator} color="#3a5896" lineWidth={1.2} transparent opacity={0.7} />

      <SubtleAxis dir={[1, 0, 0]} label="x" />
      <SubtleAxis dir={[0, 1, 0]} label="y" />
      <SubtleAxis dir={[0, 0, 1]} label="z" />

      {/* Faint future-path preview (Advanced, optional) — drawn under the past. */}
      {futureTrajectory && futureTrajectory.length > 1 && (
        <Line points={futureTrajectory} color={PHYS.trajectory} lineWidth={1} transparent opacity={0.14} />
      )}
      {/* Trajectory travelled so far — secondary: modest width, never merges with r. */}
      {trajectory && trajectory.length > 1 && (
        <Line points={trajectory} color={PHYS.trajectory} lineWidth={1.8} transparent opacity={0.8} />
      )}
      {trajectoryAlt && trajectoryAlt.length > 1 && (
        <Line points={trajectoryAlt} color={PHYS.trajectoryAlt} lineWidth={1.6} transparent opacity={0.7} />
      )}
      {/* Subtle segment breaks at item boundaries reached so far. */}
      {segmentBreaks && segmentBreaks.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.028, 12, 12]} />
          <meshStandardMaterial color="#cfe0ff" emissive="#88a8e0" emissiveIntensity={0.5} transparent opacity={0.8} />
        </mesh>
      ))}

      {/* Effective field — thin, low-opacity, unlabeled; shown only while a pulse
          drives it. Its name/value appear in the compact HUD chip, not here. */}
      {effVisual && (
        <ThinArrow direction={effVisual.direction} length={effVisual.length} color={PHYS.omegaEff} opacity={0.5} />
      )}

      {/* Measurement axis — subtle guide during readout. */}
      {measureAxis && (
        <Line points={[measureAxis.map(v => -v * 1.15), measureAxis.map(v => v * 1.15)]}
          color={PHYS.measure} lineWidth={2} dashed dashScale={4} transparent opacity={0.85} />
      )}

      <BlochArrow vec={bloch} />

      <OrbitControls ref={controlsRef} enablePan={false} minDistance={1.6} maxDistance={7} makeDefault />
    </>
  );
}

export default function StateSphere({
  bloch = [0, 0, 1],
  trajectory = null,
  futureTrajectory = null,
  segmentBreaks = null,
  trajectoryAlt = null,
  field = null,
  showEffective = false,
  measureAxis = null,
  height = "100%",
  hud = null,
}) {
  const controlsRef = useRef();
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
      <Canvas camera={{ position: INITIAL_CAM, fov: 45, up: [0, 0, 1] }} style={{ background: "#070912" }}>
        <Scene
          bloch={bloch}
          trajectory={trajectory}
          futureTrajectory={futureTrajectory}
          segmentBreaks={segmentBreaks}
          trajectoryAlt={trajectoryAlt}
          field={field}
          showEffective={showEffective}
          measureAxis={measureAxis}
          controlsRef={controlsRef}
        />
      </Canvas>

      {/* "Mathematical space" tag — clarifies this is not a physical object. */}
      <div style={{
        position: "absolute", top: "10px", left: "12px",
        color: "rgba(120,150,200,0.55)", fontSize: "9px", letterSpacing: "0.08em",
        textTransform: "uppercase", userSelect: "none", pointerEvents: "none",
      }}>
        State space · Bloch sphere
      </div>

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
