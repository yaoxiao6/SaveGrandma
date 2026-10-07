import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, InstancedMesh, Object3D, RepeatWrapping, SRGBColorSpace } from 'three';
import { OBJECTS } from '../game/config';
import type { SceneFrame } from '../view/presentation';
import type { ToolboxId } from '../game/types';

/**
 * Procedural bathroom inspired by the team mockup: white upper tiles over a blue
 * wainscot, blue tiled floor, tub and shower on the left wall, vanity and toilet on
 * the back wall, a cream porthole door on the right. Simulation anchors in
 * `config.ts` are preserved; this file only changes how they look.
 */
const C = {
  whiteTile: '#f3f1ea', blueTile: '#5ea1d6', floorTile: '#4f93cc', grout: '#c9d6e2', floorGrout: '#3a74a8',
  trim: '#d9e4ee', porcelain: '#fbfbf7', chrome: '#b9c3c8', brass: '#b69055', cream: '#efe3c8', navy: '#3d5a8a', water: '#7cc0e6', redPipe: '#c9412f',
  toolbox: { red_toolbox: '#c9412f', blue_toolbox: '#2f6fc9', green_toolbox: '#3a9a4e' } as Record<ToolboxId, string>,
} as const;
const TILE = 0.3;
const WAINSCOT = 1.15;
const HEIGHT = 3.4;
const ROOM = { minX: -3, maxX: 3, minZ: -0.4, maxZ: 5.4 };
type V3 = [number, number, number];

function useTiles(tile: string, grout: string, repeatX: number, repeatY: number) {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = grout; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = tile; ctx.fillRect(4, 4, 120, 120);
    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }, [tile, grout, repeatX, repeatY]);
}

function Box({ position, size, color, rotation, metal = 0, rough = 0.75, emissive }: { position: V3; size: V3; color: string; rotation?: V3; metal?: number; rough?: number; emissive?: string }) {
  return <mesh position={position} rotation={rotation} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color={color} metalness={metal} roughness={rough} emissive={emissive ?? '#000000'} emissiveIntensity={emissive ? 1.6 : 0} /></mesh>;
}
function Cyl({ position, radius, height, color, rotation, metal = 0, rough = 0.6, segments = 20, top }: { position: V3; radius: number; height: number; color: string; rotation?: V3; metal?: number; rough?: number; segments?: number; top?: number }) {
  return <mesh position={position} rotation={rotation} castShadow receiveShadow><cylinderGeometry args={[top ?? radius, radius, height, segments]} /><meshStandardMaterial color={color} metalness={metal} roughness={rough} /></mesh>;
}

/**
 * Falling water droplets. Each drop leaves `origin` with its own small sideways push, falls
 * under gravity and restarts when it reaches `floorY`. Purely cosmetic; `rate` scales how many
 * drops are in flight so the pipe spray grows with the simulation's leak ratio.
 */
function Drops({ origin, floorY, count, rate = 1, spread = 0.08, push = [0, 0], size = 0.014, gravity = 4.5 }: { origin: V3; floorY: number; count: number; rate?: number; spread?: number; push?: [number, number]; size?: number; gravity?: number }) {
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => ({ phase: (i * 0.618) % 1, dx: ((i * 7) % 11 / 11 - 0.5) * spread, dz: ((i * 5) % 13 / 13 - 0.5) * spread, speed: 0.85 + (i * 3 % 7) / 14 })), [count, spread]);
  const fallTime = Math.sqrt(2 * (origin[1] - floorY) / gravity);
  useFrame(({ clock }) => {
    const m = mesh.current; if (!m) return;
    const t = clock.elapsedTime;
    const active = Math.max(0, Math.min(count, Math.round(count * rate)));
    seeds.forEach((seed, i) => {
      if (i >= active) { dummy.position.set(0, -10, 0); dummy.scale.setScalar(0.0001); }
      else {
        const cycle = fallTime / seed.speed;
        const age = ((t / cycle + seed.phase) % 1) * cycle;
        const y = origin[1] - 0.5 * gravity * age * age;
        dummy.position.set(origin[0] + seed.dx + push[0] * age, Math.max(floorY, y), origin[2] + seed.dz + push[1] * age);
        dummy.scale.set(1, 1.6, 1);
      }
      dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
    <sphereGeometry args={[size, 6, 5]} />
    <meshStandardMaterial color="#bfe6f5" transparent opacity={0.85} roughness={0.1} />
  </instancedMesh>;
}

/** Expanding ripple rings where water lands. */
function Ripples({ position, radius = 0.12, count = 3 }: { position: V3; radius?: number; count?: number }) {
  const rings = useRef<(Object3D | null)[]>([]);
  useFrame(({ clock }) => {
    rings.current.forEach((ring, i) => {
      if (!ring) return;
      const phase = (clock.elapsedTime * 0.9 + i / count) % 1;
      ring.scale.setScalar(0.2 + phase * 1.2);
      (ring as unknown as { material: { opacity: number } }).material.opacity = 0.45 * (1 - phase);
    });
  });
  return <group position={position} rotation={[-Math.PI / 2, 0, 0]}>
    {Array.from({ length: count }, (_, i) => <mesh key={i} ref={el => { rings.current[i] = el; }}><ringGeometry args={[radius * 0.8, radius, 24]} /><meshBasicMaterial color="#e8f7ff" transparent opacity={0.3} depthWrite={false} /></mesh>)}
  </group>;
}

/** One tiled wall: blue wainscot below, white tiles above, a pale trim between. */
function Wall({ position, rotation, width }: { position: V3; rotation: V3; width: number }) {
  const lower = useTiles(C.blueTile, C.grout, width / TILE, WAINSCOT / TILE);
  const upper = useTiles(C.whiteTile, C.grout, width / TILE, (HEIGHT - WAINSCOT) / TILE);
  return <group position={position} rotation={rotation}>
    <mesh position={[0, WAINSCOT / 2, 0]} receiveShadow><planeGeometry args={[width, WAINSCOT]} /><meshStandardMaterial map={lower} roughness={0.35} /></mesh>
    <mesh position={[0, WAINSCOT + (HEIGHT - WAINSCOT) / 2, 0]} receiveShadow><planeGeometry args={[width, HEIGHT - WAINSCOT]} /><meshStandardMaterial map={upper} roughness={0.5} /></mesh>
    <Box position={[0, WAINSCOT, 0.012]} size={[width, 0.05, 0.025]} color={C.trim} rough={0.4} />
  </group>;
}

function Floor() {
  const width = ROOM.maxX - ROOM.minX, depth = ROOM.maxZ - ROOM.minZ;
  const tiles = useTiles(C.floorTile, C.floorGrout, width / TILE, depth / TILE);
  return <>
    <mesh position={[0, 0, (ROOM.minZ + ROOM.maxZ) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[width, depth]} /><meshStandardMaterial map={tiles} roughness={0.3} metalness={0.05} /></mesh>
    {/* Floor drain in the middle of the room */}
    <Cyl position={[0, 0.006, 2.75]} radius={0.13} height={0.012} color="#2f3a40" metal={0.6} rough={0.35} />
    <mesh position={[0, 0.013, 2.75]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.05, 0.11, 20]} /><meshStandardMaterial color="#8c969b" metalness={0.7} roughness={0.3} /></mesh>
    {/* Bath mat in front of the vanity */}
    <Box position={[0.4, 0.012, 3.95]} size={[0.95, 0.024, 0.62]} color={C.navy} rough={1} />
  </>;
}

function Bathtub() {
  // Tub sits outside the walkable area (x < -2.3) along the left wall.
  return <group>
    <Box position={[-2.65, 0.28, 1.25]} size={[0.7, 0.56, 2.3]} color={C.porcelain} rough={0.3} />
    <Box position={[-2.65, 0.44, 1.25]} size={[0.56, 0.3, 2.14]} color={C.water} rough={0.15} />
    <Box position={[-2.65, 0.575, 1.25]} size={[0.74, 0.05, 2.34]} color={C.porcelain} rough={0.3} />
    <Box position={[-2.65, 0.56, 1.25]} size={[0.56, 0.02, 2.14]} color={C.water} rough={0.1} />
    <Box position={[-2.65, 0.05, 1.25]} size={[0.72, 0.1, 2.32]} color={C.blueTile} rough={0.4} />
    {/* Shower riser, arm and head */}
    <Cyl position={[-2.9, 1.5, 0.6]} radius={0.02} height={1.9} color={C.chrome} metal={0.9} rough={0.25} />
    <Cyl position={[-2.75, 2.42, 0.6]} radius={0.018} height={0.35} color={C.chrome} rotation={[0, 0, Math.PI / 2]} metal={0.9} rough={0.25} />
    <Cyl position={[-2.6, 2.37, 0.6]} radius={0.11} top={0.05} height={0.07} color={C.chrome} metal={0.9} rough={0.25} />
    {/* The shower head never quite shut off: a steady stream and drips into the overflowing tub */}
    <mesh position={[-2.6, 1.47, 0.6]}><cylinderGeometry args={[0.012, 0.05, 1.8, 8, 1, true]} /><meshStandardMaterial color="#cfe9f7" transparent opacity={0.45} depthWrite={false} /></mesh>
    <Drops origin={[-2.6, 2.33, 0.6]} floorY={0.58} count={26} spread={0.16} size={0.012} />
    <Ripples position={[-2.6, 0.585, 0.6]} radius={0.16} />
    {/* Water sheeting over the tub rim onto the floor */}
    <Box position={[-2.28, 0.3, 1.25]} size={[0.02, 0.56, 1.6]} color="#9fd4ee" rough={0.1} />
    <Drops origin={[-2.27, 0.58, 1.25]} floorY={0.01} count={18} spread={1.5} size={0.01} gravity={5} />
    {/* Corner shelf with bottles */}
    <Box position={[-2.8, 1.75, 1.0]} size={[0.36, 0.025, 0.24]} color={C.chrome} metal={0.7} rough={0.3} />
    <Cyl position={[-2.85, 1.86, 0.95]} radius={0.035} height={0.2} color="#3b9ad8" rough={0.4} />
    <Cyl position={[-2.75, 1.84, 1.05]} radius={0.03} height={0.16} color="#f1efe6" rough={0.4} />
    <Box position={[-2.7, 1.8, 0.93]} size={[0.07, 0.07, 0.07]} color="#e8b64a" rough={0.9} />
    {/* Small stool for the folded towels; the towel stack itself is a simulation item */}
    <Box position={[-2.15, 0.7, 1.65]} size={[0.44, 0.06, 0.4]} color={C.porcelain} rough={0.5} />
    {[-0.17, 0.17].map(dx => [-0.15, 0.15].map(dz => <Cyl key={`${dx}${dz}`} position={[-2.15 + dx, 0.34, 1.65 + dz]} radius={0.02} height={0.68} color={C.chrome} metal={0.8} rough={0.3} segments={8} />))}
  </group>;
}

function Toilet() {
  // Collision footprint lives in TUNING.obstacles; keep the visual inside it.
  return <group position={[OBJECTS.dry_spot.position.x + 0.4, 0, 0]}>
    <Box position={[0, 0.72, 5.12]} size={[0.5, 0.62, 0.24]} color={C.porcelain} rough={0.3} />
    <Box position={[0, 1.05, 5.12]} size={[0.54, 0.06, 0.28]} color={C.porcelain} rough={0.3} />
    <Cyl position={[0, 1.1, 5.12]} radius={0.03} height={0.04} color={C.chrome} metal={0.9} rough={0.25} />
    <Cyl position={[0, 0.2, 4.7]} radius={0.15} top={0.2} height={0.4} color={C.porcelain} rough={0.3} />
    <mesh position={[0, 0.42, 4.68]} scale={[0.26, 0.11, 0.33]} castShadow><sphereGeometry args={[1, 18, 12]} /><meshStandardMaterial color={C.porcelain} roughness={0.3} /></mesh>
    <mesh position={[0, 0.5, 4.68]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[0.2, 0.045, 10, 24]} /><meshStandardMaterial color={C.porcelain} roughness={0.3} /></mesh>
    <mesh position={[0, 0.51, 4.68]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.16, 20]} /><meshStandardMaterial color="#9fcde8" roughness={0.2} /></mesh>
    <Cyl position={[0, 0.05, 4.7]} radius={0.2} height={0.1} color={C.blueTile} rough={0.4} />
    {/* Toilet brush and paper roll against the back wall */}
    <Cyl position={[-0.55, 0.14, 5.2]} radius={0.07} height={0.28} color={C.chrome} metal={0.8} rough={0.3} segments={12} />
    <Cyl position={[-0.55, 0.42, 5.2]} radius={0.012} height={0.3} color={C.chrome} metal={0.8} rough={0.3} segments={6} />
    <Cyl position={[-0.55, 0.8, 5.33]} radius={0.06} height={0.1} color="#f7f5ee" rotation={[0, 0, Math.PI / 2]} rough={0.9} segments={14} />
    <Cyl position={[-0.55, 0.8, 5.36]} radius={0.012} height={0.16} color={C.chrome} rotation={[0, 0, Math.PI / 2]} metal={0.8} rough={0.3} segments={6} />
  </group>;
}

function Vanity({ frame }: { frame: SceneFrame }) {
  const x = -0.9; // Sink anchor from the creative handoff (-0.9, 1.13, 4.94)
  const joint = frame.anchors.pipe_joint;
  const riserX = -0.3;
  return <group>
    {/* Wall-hung counter keeps the supply pipe and leaking joint in view */}
    <Box position={[x, 1.08, 5.08]} size={[1.8, 0.1, 0.64]} color={C.porcelain} rough={0.3} />
    <Box position={[x, 0.95, 5.1]} size={[1.76, 0.16, 0.6]} color="#eef0f3" rough={0.5} />
    <Box position={[x, 0.96, 4.81]} size={[1.76, 0.14, 0.02]} color={C.blueTile} rough={0.4} />
    <mesh position={[x, 1.12, 5.02]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.24, 24]} /><meshStandardMaterial color="#dfe8ee" roughness={0.2} /></mesh>
    <Cyl position={[x, 1.25, 5.26]} radius={0.022} height={0.24} color={C.chrome} metal={0.9} rough={0.25} segments={10} />
    <Cyl position={[x, 1.36, 5.16]} radius={0.016} height={0.22} color={C.chrome} rotation={[Math.PI / 2, 0, 0]} metal={0.9} rough={0.25} segments={8} />
    <Cyl position={[x - 0.55, 1.2, 5.2]} radius={0.04} height={0.14} color="#f1efe6" rough={0.6} segments={12} />
    <Cyl position={[x + 0.55, 1.19, 5.2]} radius={0.045} height={0.12} color={C.chrome} metal={0.7} rough={0.3} segments={12} />
    {/* Mirror with a warm light bar */}
    <Box position={[x, 2.0, 5.34]} size={[1.3, 1.0, 0.04]} color="#c9b27a" metal={0.5} rough={0.35} />
    <Box position={[x, 2.0, 5.31]} size={[1.18, 0.88, 0.02]} color="#b8d4e8" metal={0.2} rough={0.1} />
    <Box position={[x, 2.72, 5.3]} size={[0.9, 0.08, 0.1]} color="#fff2c8" emissive="#ffd98a" rough={0.6} />
    <pointLight position={[x, 2.6, 4.9]} intensity={2.5} distance={4} decay={2} color="#ffe6b3" />
    {/* Towel ring and towel */}
    <mesh position={[x + 1.05, 1.9, 5.34]} rotation={[0, 0, 0]}><torusGeometry args={[0.09, 0.012, 8, 20]} /><meshStandardMaterial color={C.chrome} metalness={0.9} roughness={0.25} /></mesh>
    <Box position={[x + 1.05, 1.58, 5.31]} size={[0.26, 0.5, 0.05]} color="#3f8fd2" rough={1} />
    {/* The red supply pipe: down from the sink, along the wall, into the leaking joint */}
    <Cyl position={[riserX, 0.72, 4.69]} radius={0.04} height={0.5} color={C.redPipe} metal={0.3} rough={0.45} segments={10} />
    <Cyl position={[(riserX + joint[0]) / 2, 0.48, 4.69]} radius={0.04} height={Math.abs(riserX - joint[0]) + 0.08} color={C.redPipe} rotation={[0, 0, Math.PI / 2]} metal={0.3} rough={0.45} segments={10} />
    <Cyl position={[joint[0], 0.48, (4.69 + 5.4) / 2]} radius={0.035} height={0.7} color={C.redPipe} rotation={[Math.PI / 2, 0, 0]} metal={0.3} rough={0.45} segments={10} />
    {/* Leaking joint: a loose red coupling with a hex nut Grandma can tighten */}
    <Cyl position={[joint[0], 0.48, 4.69]} radius={0.075} height={0.2} color={frame.effects.leakRatio > 0 ? '#8f3426' : C.redPipe} rotation={[0, 0, Math.PI / 2]} metal={0.4} rough={0.4} segments={6} />
    {frame.effects.leakRatio > 0 && <>
      {/* Spray bursting out of the joint toward the room, plus a running stream down to the puddle */}
      <mesh position={[joint[0], 0.24, 4.64]}><cylinderGeometry args={[0.012, 0.08 * frame.effects.leakRatio, 0.48, 8]} /><meshStandardMaterial color="#8ac9d6" transparent opacity={0.7} depthWrite={false} /></mesh>
      <Drops origin={[joint[0], 0.5, 4.6]} floorY={0.01} count={40} rate={Math.min(1, frame.effects.leakRatio)} spread={0.12} push={[-0.35, -1.1]} size={0.016} gravity={4} />
      <Drops origin={[joint[0], 0.5, 4.6]} floorY={0.01} count={24} rate={Math.min(1, frame.effects.leakRatio - 0.5)} spread={0.1} push={[0.4, -0.7]} size={0.014} gravity={3.5} />
      <mesh position={[joint[0], 0.008, 4.55]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.28 + 0.1 * frame.effects.leakRatio, 20]} /><meshStandardMaterial color="#8ac9d6" transparent opacity={0.45} depthWrite={false} /></mesh>
      <Ripples position={[joint[0] - 0.15, 0.012, 4.2]} radius={0.14} />
    </>}
  </group>;
}

function Door() {
  // Cream door with a porthole on the right wall, behind Grandma's starting position.
  return <group position={[ROOM.maxX - 0.06, 0, 1.6]}>
    <Box position={[0, 1.08, 0]} size={[0.08, 2.16, 0.98]} color="#d7cdb2" rough={0.7} />
    <Box position={[-0.01, 1.05, 0]} size={[0.07, 2.1, 0.88]} color={C.cream} rough={0.6} />
    <mesh position={[-0.05, 1.55, 0]} rotation={[0, Math.PI / 2, 0]}><torusGeometry args={[0.2, 0.03, 10, 28]} /><meshStandardMaterial color={C.chrome} metalness={0.9} roughness={0.25} /></mesh>
    <mesh position={[-0.045, 1.55, 0]} rotation={[0, -Math.PI / 2, 0]}><circleGeometry args={[0.18, 28]} /><meshStandardMaterial color="#ffe9b8" emissive="#ffd27a" emissiveIntensity={0.8} roughness={0.3} /></mesh>
    <Cyl position={[-0.08, 1.0, -0.33]} radius={0.015} height={0.16} color={C.chrome} rotation={[Math.PI / 2, 0, 0]} metal={0.9} rough={0.25} segments={8} />
    <Cyl position={[-0.1, 1.0, -0.26]} radius={0.015} height={0.06} color={C.chrome} rotation={[0, 0, Math.PI / 2]} metal={0.9} rough={0.25} segments={8} />
  </group>;
}

function Furniture({ frame }: { frame: SceneFrame }) {
  const shelf = OBJECTS.dry_spot.position;
  return <group>
    {/* Work table against the right wall with three toolboxes; the tools inside render from simulation state once a lid is open */}
    <Box position={[1.95, 0.72, 2.4]} size={[0.7, 0.05, 1.5]} color="#d8b98a" rough={0.7} />
    <Box position={[1.95, 0.66, 2.4]} size={[0.64, 0.07, 1.44]} color="#b8945f" rough={0.8} />
    {[1.68, 2.22].map(x => [1.75, 3.05].map(z => <Cyl key={`${x}${z}`} position={[x, 0.33, z]} radius={0.025} height={0.66} color="#8a6a3e" rough={0.8} segments={8} />))}
    {(Object.keys(C.toolbox) as ToolboxId[]).map(id => {
      const box = OBJECTS[id].position; const open = frame.effects.openToolboxes.includes(id);
      return <group key={id} name={id}>
        <Box position={[box.x, 0.81, box.z]} size={[0.42, 0.13, 0.3]} color={C.toolbox[id]} rough={0.5} metal={0.2} />
        <Box position={[box.x, 0.81, box.z]} size={[0.36, 0.1, 0.24]} color="#2b2f33" rough={0.9} />
        <group position={[box.x + 0.21, 0.885, box.z]} rotation={[0, 0, open ? 1.9 : 0]}>
          <Box position={[-0.21, 0.02, 0]} size={[0.42, 0.04, 0.3]} color={C.toolbox[id]} rough={0.5} metal={0.2} />
          <Cyl position={[-0.21, 0.06, 0]} radius={0.012} height={0.12} color="#2b2f33" rotation={[Math.PI / 2, 0, 0]} rough={0.8} segments={8} />
        </group>
      </group>;
    })}
    {/* Dry shelf for the phone: a tall stand with a green accent so it reads as the safe spot */}
    <Box position={[shelf.x, 1.11, shelf.z]} size={[0.6, 0.07, 0.5]} color="#6f9a7f" rough={0.5} />
    <Box position={[shelf.x, 1.15, shelf.z]} size={[0.56, 0.015, 0.46]} color="#8cb89a" rough={0.6} />
    <Cyl position={[shelf.x, 0.54, shelf.z]} radius={0.05} height={1.08} color={C.chrome} metal={0.8} rough={0.3} segments={12} />
    <Cyl position={[shelf.x, 0.02, shelf.z]} radius={0.22} height={0.04} color={C.chrome} metal={0.8} rough={0.3} />
    {frame.phone.placement === 'dry_spot' && <Box position={[shelf.x, 1.25, shelf.z]} size={[0.09, 0.18, 0.018]} color="#2b3935" rough={0.3} />}
  </group>;
}

export default function Bathroom({ frame }: { frame: SceneFrame }) {
  const width = ROOM.maxX - ROOM.minX, depth = ROOM.maxZ - ROOM.minZ;
  const midZ = (ROOM.minZ + ROOM.maxZ) / 2;
  return <group name="bathroom_shell">
    <Floor />
    <Wall position={[0, 0, ROOM.maxZ]} rotation={[0, Math.PI, 0]} width={width} />
    <Wall position={[0, 0, ROOM.minZ]} rotation={[0, 0, 0]} width={width} />
    <Wall position={[ROOM.minX, 0, midZ]} rotation={[0, Math.PI / 2, 0]} width={depth} />
    <Wall position={[ROOM.maxX, 0, midZ]} rotation={[0, -Math.PI / 2, 0]} width={depth} />
    <Bathtub />
    <Toilet />
    <Vanity frame={frame} />
    <Door />
    <Furniture frame={frame} />
  </group>;
}
