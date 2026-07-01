import { useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Line, Text } from "@react-three/drei";
import * as THREE from "three";
import { applyRotation } from "./blochPhysics.js";
import { getModeConfig, mapB0ToVisual, mapB1ToVisual, mapOmegaEffToVisual, mapDetuningToVisual, getFrameLabel } from "./visualPhysics/visualMappings.js";
import { toEffectiveFrame, transformTrajectory } from "./visualPhysics/frameTransforms.js";
import { VIS_MODES, FRAMES } from "./visualPhysics/visualizationTypes.js";
import FieldVector from "./components/vis/FieldVector.jsx";
import PhysicalScaleBadge from "./components/vis/PhysicalScaleBadge.jsx";
import VisualizationLegend from "./components/vis/VisualizationLegend.jsx";
import WhyAmISeeingThis from "./components/vis/WhyAmISeeingThis.jsx";

const INITIAL_CAM = [2.2, 2.2, 1.3];
const AXIS_LEN    = 1.38;
const TWO_PI      = 2 * Math.PI;
const N_GUIDE     = 129;

const GUIDE_COLOR = { x: "#ff5050", y: "#3cc83c", z: "#5096ff" };

// ── Labelled axis line ───────────────────────────────────────────────────────
function Axis({ direction, color, label, lineWidth = 2 }) {
  const neg    = direction.map((v) => v * -AXIS_LEN);
  const pos    = direction.map((v) => v * AXIS_LEN);
  const lblPos = direction.map((v) => v * (AXIS_LEN + 0.26));
  return (
    <>
      <Line points={[neg, pos]} color={color} lineWidth={lineWidth} />
      <Text
        position={lblPos}
        fontSize={0.13}
        color={color}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.01}
        outlineColor="#000"
      >
        {label}
      </Text>
    </>
  );
}

// ── 3-D scene ────────────────────────────────────────────────────────────────
function BlochScene({
  state, axis, initialVec, controlsRef,
  suppressGuide = false, trajectory = null, trajectoryAlt = null,
  // Visualization extensions
  visMode = VIS_MODES.CONCEPT, currentField = null, visFrame = FRAMES.ROTATING,
}) {
  const [sx, sy, sz] = state;
  const [ivx, ivy, ivz] = initialVec;

  // ── Frame transform: effective-field frame rotates display state/trajectory ─
  const displayState = useMemo(() => {
    if (visFrame === FRAMES.EFFECTIVE && currentField) {
      return toEffectiveFrame([sx, sy, sz], currentField);
    }
    return [sx, sy, sz];
  }, [sx, sy, sz, visFrame, currentField]);

  const [dsx, dsy, dsz] = displayState;

  const displayTrajectory = useMemo(() => {
    if (visFrame === FRAMES.EFFECTIVE && currentField && trajectory?.length) {
      return trajectory.map(p => toEffectiveFrame(p, currentField));
    }
    return trajectory;
  }, [trajectory, visFrame, currentField]);

  const displayTrajectoryAlt = useMemo(() => {
    if (visFrame === FRAMES.EFFECTIVE && currentField && trajectoryAlt?.length) {
      return trajectoryAlt.map(p => toEffectiveFrame(p, currentField));
    }
    return trajectoryAlt;
  }, [trajectoryAlt, visFrame, currentField]);

  const equatorPoints = useMemo(() => {
    const pts = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * TWO_PI;
      pts.push([Math.cos(a), Math.sin(a), 0]);
    }
    return pts;
  }, []);

  const guidePoints = useMemo(() => {
    const initVec = [ivx, ivy, ivz];
    return Array.from({ length: N_GUIDE }, (_, i) => {
      const a = (i / (N_GUIDE - 1)) * TWO_PI;
      return applyRotation(axis, a, initVec);
    });
  }, [axis, ivx, ivy, ivz]);

  const showGuide = useMemo(() => {
    if (suppressGuide) return false;
    const [p0x, p0y, p0z] = guidePoints[0];
    return !guidePoints.every(([px, py, pz]) =>
      Math.abs(px - p0x) < 1e-6 &&
      Math.abs(py - p0y) < 1e-6 &&
      Math.abs(pz - p0z) < 1e-6
    );
  }, [suppressGuide, guidePoints]);

  // Arrow geometry uses displayState (frame-transformed)
  const arrow = useMemo(() => {
    const mag = Math.hypot(dsx, dsy, dsz);
    if (mag < 1e-9) {
      return { shaftEnd: [0, 0, 0], conePos: [0, 0, 0], coneQuat: new THREE.Quaternion() };
    }
    const nx = dsx / mag, ny = dsy / mag, nz = dsz / mag;
    const CONE_LEN = 0.22;
    const frac = (mag - CONE_LEN) / mag;
    return {
      shaftEnd: [nx * mag * frac, ny * mag * frac, nz * mag * frac],
      conePos:  [nx * (mag - CONE_LEN / 2), ny * (mag - CONE_LEN / 2), nz * (mag - CONE_LEN / 2)],
      coneQuat: new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(nx, ny, nz)
      ),
    };
  }, [dsx, dsy, dsz]);

  // ── Physics-mode field-vector visuals ─────────────────────────────────────
  const modeConfig = useMemo(() => getModeConfig(visMode), [visMode]);

  const b0Visual = useMemo(() =>
    modeConfig.showB0 ? mapB0ToVisual(visFrame) : null,
    [modeConfig.showB0, visFrame]
  );

  const b1Visual = useMemo(() =>
    modeConfig.showB1 && currentField ? mapB1ToVisual(currentField, visFrame) : null,
    [modeConfig.showB1, currentField, visFrame]
  );

  // In effective-field frame Ω_eff IS the Z axis — hide it to avoid confusion.
  const omegaEffVisual = useMemo(() =>
    modeConfig.showOmegaEff && currentField && visFrame !== FRAMES.EFFECTIVE
      ? mapOmegaEffToVisual(currentField)
      : null,
    [modeConfig.showOmegaEff, currentField, visFrame]
  );

  const detuningVisual = useMemo(() =>
    modeConfig.showDetuning && currentField ? mapDetuningToVisual(currentField) : null,
    [modeConfig.showDetuning, currentField]
  );

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 4, 3]} intensity={1.2} />
      <directionalLight position={[-2, -3, -2]} intensity={0.25} color="#7090ff" />

      {/* Semi-transparent unit sphere */}
      <mesh>
        <sphereGeometry args={[1, 64, 64]} />
        <meshStandardMaterial
          color="#1a3a8f"
          transparent
          opacity={0.18}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Equator ring */}
      <Line points={equatorPoints} color="#4a72b8" lineWidth={1.5} />

      {/* Trajectory guide */}
      {showGuide && (
        <Line points={guidePoints} color={GUIDE_COLOR[axis]} lineWidth={1} />
      )}

      {/* Primary trajectory — gold */}
      {displayTrajectory && displayTrajectory.length > 1 && (
        <Line points={displayTrajectory} color="#ffb700" lineWidth={2.2} />
      )}
      {/* Alt trajectory — magenta */}
      {displayTrajectoryAlt && displayTrajectoryAlt.length > 1 && (
        <Line points={displayTrajectoryAlt} color="#ff70c8" lineWidth={2.0} />
      )}

      {/* Axes */}
      <Axis direction={[1, 0, 0]} color="#ff5050" label="X" />
      <Axis direction={[0, 1, 0]} color="#3cc83c" label="Y" />
      <Axis direction={[0, 0, 1]} color="#5096ff" label="Z" lineWidth={3} />

      {/* Pole labels */}
      <Text position={[0, 0, 1.78]} fontSize={0.17} color="white"
        anchorX="center" anchorY="middle" outlineWidth={0.015} outlineColor="#000">
        |0⟩
      </Text>
      <Text position={[0, 0, -1.78]} fontSize={0.17} color="white"
        anchorX="center" anchorY="middle" outlineWidth={0.015} outlineColor="#000">
        |1⟩
      </Text>

      {/* ── Physics-mode field vectors ── */}
      {b0Visual?.available && (
        <FieldVector
          direction={b0Visual.direction}
          visualLength={b0Visual.visualLength}
          color={b0Visual.color}
          label={b0Visual.label}
        />
      )}
      {b1Visual?.available && (
        <FieldVector
          direction={b1Visual.direction}
          visualLength={b1Visual.visualLength}
          color={b1Visual.color}
          label={b1Visual.label}
        />
      )}
      {omegaEffVisual?.available && (
        <FieldVector
          direction={omegaEffVisual.direction}
          visualLength={omegaEffVisual.visualLength}
          color={omegaEffVisual.color}
          label={omegaEffVisual.label}
        />
      )}
      {detuningVisual?.available && (
        <FieldVector
          direction={detuningVisual.direction}
          visualLength={detuningVisual.visualLength}
          color={detuningVisual.color}
          label={detuningVisual.label}
        />
      )}

      {/* Reference frame label in 3D scene */}
      {visMode !== VIS_MODES.CONCEPT && (
        <Text
          position={[-1.55, -1.25, -0.95]}
          fontSize={0.075}
          color="rgba(90,130,200,0.45)"
          anchorX="left"
          anchorY="middle"
          outlineWidth={0.008}
          outlineColor="#000"
        >
          {getFrameLabel(visFrame)}
        </Text>
      )}

      {/* Bloch vector */}
      <mesh>
        <sphereGeometry args={[0.026, 14, 14]} />
        <meshStandardMaterial color="#dc143c" emissive="#dc143c" emissiveIntensity={0.7} />
      </mesh>
      <Line points={[[0, 0, 0], arrow.shaftEnd]} color="#dc143c" lineWidth={5} />
      <mesh position={arrow.conePos} quaternion={arrow.coneQuat}>
        <coneGeometry args={[0.058, 0.22, 20]} />
        <meshStandardMaterial color="#dc143c" emissive="#dc143c" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[dsx, dsy, dsz]}>
        <sphereGeometry args={[0.052, 20, 20]} />
        <meshStandardMaterial color="white" emissive="white" emissiveIntensity={0.5} />
      </mesh>

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        minDistance={1.5}
        maxDistance={7}
        makeDefault
      />
    </>
  );
}

// ── Public component ─────────────────────────────────────────────────────────
export default function BlochSphere({
  state          = [0, 0, 1],
  time           = null,
  theta          = null,
  axis           = "x",
  initKey        = "|0⟩",
  initialVec     = [0, 0, 1],
  suppressGuide  = false,
  trajectory     = null,
  trajectoryAlt  = null,
  height         = "600px",
  // Visualization extensions
  visMode        = VIS_MODES.CONCEPT,
  currentField   = null,
  visFrame       = FRAMES.ROTATING,
  scaleMeta      = null,
  // Slot for VisControlPanel or other overlay nodes (rendered at top-left)
  visControls    = null,
}) {
  const controlsRef = useRef();
  const [sx, sy, sz] = state;

  const stateLabel   = sz > 0.999 ? "|0⟩" : sz < -0.999 ? "|1⟩" : "|ψ⟩";
  const vecStr       = `(${sx.toFixed(2)}, ${sy.toFixed(2)}, ${sz.toFixed(2)})`;
  const thetaReduced = theta !== null ? theta % TWO_PI : null;
  const rotations    = theta !== null ? Math.floor(theta / TWO_PI) : 0;

  const showPhysicsOverlays = visMode !== VIS_MODES.CONCEPT;
  const showTrajectories    = !!(trajectory || trajectoryAlt);

  const resetCamera = () => {
    if (!controlsRef.current) return;
    const ctrl = controlsRef.current;
    ctrl.object.position.set(...INITIAL_CAM);
    ctrl.object.up.set(0, 0, 1);
    ctrl.target.set(0, 0, 0);
    ctrl.update();
  };

  return (
    <div style={{ position: "relative", width: "100%", height, borderRadius: "10px", overflow: "hidden" }}>
      <Canvas
        camera={{ position: INITIAL_CAM, fov: 45, up: [0, 0, 1] }}
        style={{ background: "#080a16" }}
      >
        <BlochScene
          state={state}
          axis={axis}
          initialVec={initialVec}
          controlsRef={controlsRef}
          suppressGuide={suppressGuide}
          trajectory={trajectory}
          trajectoryAlt={trajectoryAlt}
          visMode={visMode}
          currentField={currentField}
          visFrame={visFrame}
        />
      </Canvas>

      {/* ── Vis controls slot (VisControlPanel, top-left) ── */}
      {visControls}

      {/* ── Reset camera button (top-right) ── */}
      <button
        onClick={resetCamera}
        style={{
          position: "absolute",
          top: "12px",
          right: "12px",
          background: "rgba(20, 28, 55, 0.88)",
          border: "1px solid rgba(90, 130, 200, 0.45)",
          borderRadius: "6px",
          color: "#aac0ff",
          padding: "6px 14px",
          cursor: "pointer",
          fontSize: "12px",
          lineHeight: "1",
          userSelect: "none",
        }}
      >
        ↩ Reset camera
      </button>

      {/* ── Physics-mode HTML overlays ── */}
      {showPhysicsOverlays && (
        <PhysicalScaleBadge scaleMeta={scaleMeta} />
      )}
      {showPhysicsOverlays && (
        <VisualizationLegend
          visMode={visMode}
          showTrajectories={showTrajectories}
        />
      )}
      {showPhysicsOverlays && (
        <WhyAmISeeingThis visMode={visMode} visFrame={visFrame} />
      )}

      {/* ── Info panel (bottom-left) ── */}
      <div
        style={{
          position: "absolute",
          bottom: "16px",
          left: "16px",
          background: "rgba(8, 12, 30, 0.85)",
          border: "1px solid rgba(90, 130, 200, 0.28)",
          borderRadius: "8px",
          padding: "10px 16px",
          lineHeight: "1.75",
          userSelect: "none",
        }}
      >
        {time !== null ? (
          <>
            <div style={{ color: "#e0e8ff", fontWeight: "600", fontSize: "14px" }}>
              {`${initKey}  ·  θ = ${thetaReduced.toFixed(3)} rad`}
            </div>
            <div style={{ fontFamily: "monospace", fontSize: "12px", color: "#7a9fd4" }}>
              {`${rotations} rot  ·  t = ${time.toFixed(3)} s`}
            </div>
            <div style={{ fontFamily: "monospace", fontSize: "12px", color: "#7a9fd4" }}>
              {`r = ${vecStr}`}
            </div>
          </>
        ) : (
          <>
            <div style={{ color: "#e0e8ff", fontWeight: "600", fontSize: "14px", marginBottom: "2px" }}>
              State: {stateLabel}
            </div>
            <div style={{ fontFamily: "monospace", fontSize: "12px", color: "#7a9fd4" }}>
              {`r = ${vecStr}`}
            </div>
          </>
        )}
      </div>

      {/* ── Interaction hints (bottom-right) ── */}
      <div
        style={{
          position: "absolute",
          bottom: "16px",
          right: "16px",
          color: "rgba(130, 150, 190, 0.50)",
          fontSize: "11px",
          userSelect: "none",
          textAlign: "right",
          lineHeight: "1.75",
        }}
      >
        Drag to rotate
        <br />
        Scroll to zoom
      </div>
    </div>
  );
}
