# Creative handoff

All current meshes are authored procedural placeholders. No downloaded or generated assets are required to run. Replace the render layer in `src/view/Scene.tsx`; preserve simulation object IDs, interaction anchors and timings in `src/game/config.ts`.

## Coordinate and scale contract

One Three.js unit = one meter. +Y is up, floor Y=0, character origin is at the feet, character forward is +Z. Yaw zero faces the pipe wall. Positive yaw turns toward +X (Grandma’s left when facing +Z). Bathroom visual envelope: X -3…3, Z -0.4…5.4, height 3.4 m. Grandma stands approximately 1.65 m tall.

Export glTF/GLB with applied transforms and units in meters. Keep scale/orientation corrections inside the visual wrapper, never by moving the simulation anchor. The room’s walkable boundaries and toilet obstacle live in `TUNING`. Other fixtures currently have visual geometry only; review collision footprints before final environment integration. `move_to` only follows straight paths, so keep primary routes open or coordinate new pathfinding with the game owner.

## Asset slots

| Slot / ID | Anchor X, Y, Z (meters) | Notes |
| --- | --- | --- |
| `grandma_root` | dynamic, feet on ground | Skinned character replaces the primitive Grandma component |
| `bathroom_shell` | 0, 0, 0 | Floor, walls, door; preserve open navigation |
| `sink` | -0.9, 1.13, 4.94 | Leave the pipe and valve accessible below |
| `pipe_joint` | -1.3, 0.45, 4.6 | Low brass leaking joint; patch overlay shares anchor |
| `supply_valve` | -0.65, 0.95, 4.6 | Red hand-operated wheel, standing reach |
| `wrench` | -0.5, 0.85, 2.5 | Portable; tool on trolley |
| `patch` | 0.25, 0.85, 2.5 | Portable rubber strip; consumed on application |
| `clamp` | 0.95, 0.85, 2.5 | Portable metal clamp; consumed on final repair |
| `towels` | -2.15, 0.8, 1.65 | Portable; one-use absorbent stack |
| `bucket` | -2.1, 0.25, 3.1 | Floor pickup requires bending |
| `dry_spot` | 1.8, 1.15, 3.5 | Safe shelf for phone and placed tools |
| `puddle` | -1.3, 0, 4 | Interaction point for bucket/towels |
| `toilet` | 2.2, 0, 4.75 | Keep within the existing collision footprint |
| `phone` | held or shelf | Both lens views originate from the same phone position |

Portable positions change at runtime after placing. Always render from `world.items`, not from initial anchors. Held objects attach to the hand slots; consumed objects must disappear from their old location. Used towels/bucket remain visually near the leak; patch appears on the joint. Shelf item overlap is a placeholder limitation; the final visual layer can arrange multiple items around the shared interaction anchor.

## Attachments

Preserve or map these names in the character wrapper: `grandma_root`, `hand_left` (phone by convention), `hand_right` (first held tool), `head`, and `phone_mount`. The primitive rig supplies root and hand groups; add head/phone bones when replacing it. With phone placed, up to two items can be held; repair steps need one tool plus a free stabilizing hand. Map held items to available hand slots, not a permanently fixed phone hand.

Phone camera pose is engine-owned. Selfie and rear share a position and opposite optical headings. Placed on the shelf, rear points toward the leak and stays there when Grandma walks away; selfie points the other way. Do not replace it with an orbit/follow camera. The dry shelf is intentionally above flood height. The current model’s arm/phone attachment is schematic; final rig IK should follow the same lens pose.

## Requested animation names (new asset contract)

These are names for the creative teammate to author, **not claims about an existing asset pack**:

| Clip | Driver |
| --- | --- |
| `Idle_Standing`, `Idle_Bent` | posture and no active action |
| `Walk` | active `move` / `move_to`, in-place loop; simulation owns translation |
| `Look`, `Turn` | active look/turn and controller yaw/pitch |
| `Bend_Down`, `Stand_Up` | posture actions, 1 s each |
| `Pick_Up`, `Put_Down` | grab/place, 1.5 s each |
| `Phone_Place`, `Phone_Retrieve` | 1.5 s each |
| `Rotate_Valve`, `Tighten_Joint` | rotate target, 4 s |
| `Apply_Patch` | 6 s |
| `Secure_Clamp` | 5 s |
| `Relief`, `Flooded` | terminal won/lost |

Durations are defaults in `TUNING.durations`; they are authoritative. Time-scale clips to active progress. Animation events must never award a win or consume tools. Those effects commit only on successful simulation completion. Cancellation returns to the appropriate idle without performing an unfinished interaction. Current procedural motion covers walking and bending; the remaining clips are intentional handoff slots.

Suggested optional effect hooks: water stream width from leak rate, water surface from flood level, drip/splash while flowing, cloth darkening as towel capacity depletes, bucket fill, stress expression from observation band. Sound and final styling belong to creative; dialogue audio belongs to voice. None are required to keep the controller working.

## Asset provenance

For each imported model, texture, image, font, or sound, add a neighboring `LICENSE.txt` recording filename, author, license and source URL. Follow required attribution in a credits surface. The hackathon starter’s bundled KayKit/Quaternius packs are an optional CC0 source; inspect its actual asset catalog before choosing paths or animation names. No starter models or code were copied into this project. See [hackathon notes](HACKATHON.md) for source links.
