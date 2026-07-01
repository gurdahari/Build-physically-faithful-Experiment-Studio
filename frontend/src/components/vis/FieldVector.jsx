/**
 * FieldVector — a labeled 3D arrow for visualizing physical field vectors
 * inside a React Three Fiber Canvas.
 *
 * Props are the normalized visual descriptors produced by visualMappings.js.
 * This component performs NO physics calculations — it only renders what it
 * receives.
 */

import { useMemo } from "react";
import { Line, Text } from "@react-three/drei";
import * as THREE from "three";

const CONE_H     = 0.18;  // arrowhead height
const CONE_R     = 0.046; // arrowhead base radius
const SHAFT_W    = 3.5;   // line width (px)
const LABEL_DIST = 0.24;  // label distance past tip

export default function FieldVector({
  direction     = [0, 0, 1],
  visualLength  = 1.35,
  color         = "#5096ff",
  label         = "",
  origin        = [0, 0, 0],
}) {
  const geom = useMemo(() => {
    const [dx, dy, dz] = direction;
    const mag = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (mag < 1e-9 || visualLength < 1e-9) return null;

    const nx = dx / mag, ny = dy / mag, nz = dz / mag;
    const [ox, oy, oz] = origin;

    // Shaft ends where the cone starts
    const coneStartFrac = Math.max(0, (visualLength - CONE_H)) / visualLength;
    const shaftEnd = [
      ox + nx * visualLength * coneStartFrac,
      oy + ny * visualLength * coneStartFrac,
      oz + nz * visualLength * coneStartFrac,
    ];

    // Cone sits centred at (tip − CONE_H/2) along the direction
    const coneCx = ox + nx * (visualLength - CONE_H / 2);
    const coneCy = oy + ny * (visualLength - CONE_H / 2);
    const coneCz = oz + nz * (visualLength - CONE_H / 2);

    const coneQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(nx, ny, nz),
    );

    const tipX = ox + nx * visualLength;
    const tipY = oy + ny * visualLength;
    const tipZ = oz + nz * visualLength;

    const lblPos = [
      tipX + nx * LABEL_DIST,
      tipY + ny * LABEL_DIST,
      tipZ + nz * LABEL_DIST,
    ];

    return { shaftEnd, conePos: [coneCx, coneCy, coneCz], coneQuat, lblPos, origin: [ox, oy, oz] };
  }, [direction, visualLength, origin]);

  if (!geom) return null;

  return (
    <>
      {/* Shaft */}
      <Line points={[geom.origin, geom.shaftEnd]} color={color} lineWidth={SHAFT_W} />
      {/* Arrowhead cone */}
      <mesh position={geom.conePos} quaternion={geom.coneQuat}>
        <coneGeometry args={[CONE_R, CONE_H, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
      </mesh>
      {/* Label */}
      {label && (
        <Text
          position={geom.lblPos}
          fontSize={0.115}
          color={color}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.012}
          outlineColor="#000"
        >
          {label}
        </Text>
      )}
    </>
  );
}
