import { useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, Grid, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { BuildResult, MeshData } from '../model/mesh';

export interface ViewOptions {
  /** 断面表示（Y 方向の位置で切る）。null なら無効 */
  sectionY: number | null;
  showEdges: boolean;
}

function useBufferGeometry(mesh: MeshData): THREE.BufferGeometry {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    g.computeBoundingBox();
    return g;
  }, [mesh]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

function PartMesh({ mesh, view }: { mesh: MeshData; view: ViewOptions }) {
  const geometry = useBufferGeometry(mesh);
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 30), [geometry]);
  useEffect(() => () => edges.dispose(), [edges]);

  // y < sectionY 側（カメラ手前）を切り取り、断面を手前から見られるようにする
  const clippingPlanes = useMemo(
    () => (view.sectionY === null ? [] : [new THREE.Plane(new THREE.Vector3(0, 1, 0), -view.sectionY)]),
    [view.sectionY],
  );

  return (
    <group>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color="#d9a441"
          roughness={0.6}
          metalness={0.05}
          flatShading
          side={THREE.DoubleSide}
          clippingPlanes={clippingPlanes}
        />
      </mesh>
      {view.showEdges && (
        <lineSegments geometry={edges}>
          <lineBasicMaterial color="#3b2a0b" clippingPlanes={clippingPlanes} />
        </lineSegments>
      )}
    </group>
  );
}

export function Viewer({ result, view }: { result: BuildResult | null; view: ViewOptions }) {
  return (
    <Canvas
      camera={{ position: [140, -180, 140], up: [0, 0, 1], fov: 35, near: 1, far: 5000 }}
      gl={{ localClippingEnabled: true }}
    >
      <color attach="background" args={['#eef0f3']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[100, -150, 200]} intensity={1.6} />
      <directionalLight position={[-120, 100, 80]} intensity={0.6} />
      <Grid
        rotation={[Math.PI / 2, 0, 0]}
        cellSize={10}
        sectionSize={50}
        cellColor="#c4c8d0"
        sectionColor="#9aa1ad"
        infiniteGrid
        fadeDistance={800}
      />
      {result?.parts.map((part) => (
        <PartMesh key={part.name} mesh={part.mesh} view={view} />
      ))}
      <OrbitControls makeDefault target={[0, 0, 15]} />
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport labelColor="white" axisHeadScale={0.9} />
      </GizmoHelper>
    </Canvas>
  );
}
