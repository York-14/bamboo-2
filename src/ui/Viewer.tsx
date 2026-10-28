import { useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, Grid, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { BuildResult, MeshData, PartResult } from '../model/mesh';

export type Layout = 'assembled' | 'print';

export interface ViewOptions {
  layout: Layout;
  /** 断面表示（Y 方向の位置で切る）。null なら無効 */
  sectionY: number | null;
  showEdges: boolean;
  /** フタの開き具合 0〜1（組み立て表示のときだけ使う） */
  lidOpen: number;
  lidTranslucent: boolean;
}

const COLORS: Record<string, string> = {
  body: '#d9a441',
  lid: '#6f9fd8',
};

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

function PartMesh({
  part,
  matrix,
  view,
  translucent,
}: {
  part: PartResult;
  matrix: THREE.Matrix4;
  view: ViewOptions;
  translucent: boolean;
}) {
  const geometry = useBufferGeometry(part.mesh);
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 30), [geometry]);
  useEffect(() => () => edges.dispose(), [edges]);

  // y < sectionY 側（カメラ手前）を切り取り、断面を手前から見られるようにする
  const clippingPlanes = useMemo(
    () => (view.sectionY === null ? [] : [new THREE.Plane(new THREE.Vector3(0, 1, 0), -view.sectionY)]),
    [view.sectionY],
  );

  return (
    <group matrix={matrix} matrixAutoUpdate={false}>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={COLORS[part.name] ?? '#999999'}
          roughness={0.6}
          metalness={0.05}
          flatShading
          side={THREE.DoubleSide}
          clippingPlanes={clippingPlanes}
          transparent={translucent}
          opacity={translucent ? 0.35 : 1}
          depthWrite={!translucent}
        />
      </mesh>
      {view.showEdges && (
        <lineSegments geometry={edges}>
          <lineBasicMaterial color="#2b2b2b" clippingPlanes={clippingPlanes} transparent opacity={translucent ? 0.4 : 1} />
        </lineSegments>
      )}
    </group>
  );
}

/** 表示レイアウトに応じた部品の配置行列 */
function partMatrix(part: PartResult, result: BuildResult, view: ViewOptions): THREE.Matrix4 {
  if (view.layout === 'print') return new THREE.Matrix4().fromArray(part.printMatrix);
  if (part.name === 'lid' && result.lidSlide) {
    const { dir, travel } = result.lidSlide;
    const d = travel * view.lidOpen;
    return new THREE.Matrix4().makeTranslation(dir[0] * d, dir[1] * d, 0);
  }
  return new THREE.Matrix4();
}

export function Viewer({ result, view }: { result: BuildResult | null; view: ViewOptions }) {
  const parts = result?.parts.filter((p) => p.group === 'main') ?? [];
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
      {result &&
        parts.map((part) => (
          <PartMesh
            key={part.name}
            part={part}
            matrix={partMatrix(part, result, view)}
            view={view}
            translucent={part.name === 'lid' && view.lidTranslucent && view.layout === 'assembled'}
          />
        ))}
      <OrbitControls makeDefault target={[0, 0, 15]} />
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport labelColor="white" axisHeadScale={0.9} />
      </GizmoHelper>
    </Canvas>
  );
}
