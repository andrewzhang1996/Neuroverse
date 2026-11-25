import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const DEFAULT_CAM_POS = new THREE.Vector3(0, 28, 62);
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0);

/**
 * Universe Sandbox style camera controller with smooth fly-to and orbital tethering.
 */
export class CameraRig {
  public readonly controls: OrbitControls;
  public tetheredNodeId: string | null = null;

  private readonly camera: THREE.PerspectiveCamera;
  private prevTetherPos: THREE.Vector3 | null = null;

  private flyActive = false;
  private flyProgress = 0;
  private flyStartTarget = new THREE.Vector3();
  private flyStartDist = 0;
  private flyDesiredDist = 14;
  private userCancelledZoom = false;

  private resetActive = false;
  private resetProgress = 0;
  private resetStartPos = new THREE.Vector3();
  private resetStartTarget = new THREE.Vector3();

  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpDelta = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.camera.position.copy(DEFAULT_CAM_POS);

    this.controls = new OrbitControls(camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.minDistance = 3.5;
    this.controls.maxDistance = 420;
    this.controls.target.copy(DEFAULT_TARGET);
    this.controls.update();

    this.controls.addEventListener("start", this.handleUserInteractStart);
    domElement.addEventListener("wheel", this.handleWheel, { passive: true });
  }

  private handleUserInteractStart = () => {
    this.resetActive = false;
  };

  private handleWheel = () => {
    this.userCancelledZoom = true;
    this.resetActive = false;
  };

  public focusNode(
    nodeId: string,
    nodePos: THREE.Vector3,
    nodeScale: number
  ): void {
    this.tetheredNodeId = nodeId;
    this.prevTetherPos = nodePos.clone();
    this.resetActive = false;

    this.flyActive = true;
    this.flyProgress = 0;
    this.flyStartTarget.copy(this.controls.target);
    this.flyStartDist = this.camera.position.distanceTo(this.controls.target);
    this.flyDesiredDist = Math.max(nodeScale * 9.5, 11);
    this.userCancelledZoom = false;
  }

  public resetOverview(): void {
    this.tetheredNodeId = null;
    this.prevTetherPos = null;
    this.flyActive = false;
    this.userCancelledZoom = false;

    this.resetActive = true;
    this.resetProgress = 0;
    this.resetStartPos.copy(this.camera.position);
    this.resetStartTarget.copy(this.controls.target);
  }

  public update(
    dt: number,
    getNodePos: (id: string) => THREE.Vector3 | undefined
  ): void {
    if (this.tetheredNodeId) {
      const nodePos = getNodePos(this.tetheredNodeId);
      if (nodePos) {
        if (this.prevTetherPos) {
          this.tmpDelta.subVectors(nodePos, this.prevTetherPos);
          this.controls.target.add(this.tmpDelta);
          this.camera.position.add(this.tmpDelta);
          if (this.flyActive) {
            this.flyStartTarget.add(this.tmpDelta);
          }
        }
        this.prevTetherPos = (this.prevTetherPos ?? new THREE.Vector3()).copy(
          nodePos
        );

        if (this.flyActive) {
          this.flyProgress = Math.min(1, this.flyProgress + dt / 0.65);
          const ease = 1 - Math.pow(1 - this.flyProgress, 3);

          this.controls.target.lerpVectors(this.flyStartTarget, nodePos, ease);

          if (!this.userCancelledZoom) {
            this.tmpDir.subVectors(this.camera.position, this.controls.target);
            if (this.tmpDir.lengthSq() < 1e-4) {
              this.tmpDir.set(0, 0.45, 0.89);
            }
            this.tmpDir.normalize();
            const dist = THREE.MathUtils.lerp(
              this.flyStartDist,
              this.flyDesiredDist,
              ease
            );
            this.camera.position
              .copy(this.controls.target)
              .addScaledVector(this.tmpDir, dist);
          }

          if (this.flyProgress >= 1) {
            this.flyActive = false;
          }
        }
      } else {
        this.tetheredNodeId = null;
        this.prevTetherPos = null;
        this.flyActive = false;
      }
    } else if (this.resetActive) {
      this.resetProgress = Math.min(1, this.resetProgress + dt / 0.65);
      const ease = 1 - Math.pow(1 - this.resetProgress, 3);
      this.controls.target.lerpVectors(
        this.resetStartTarget,
        DEFAULT_TARGET,
        ease
      );
      this.camera.position.lerpVectors(
        this.resetStartPos,
        DEFAULT_CAM_POS,
        ease
      );
      if (this.resetProgress >= 1) {
        this.resetActive = false;
      }
    }

    this.controls.update();
  }

  public dispose(domElement: HTMLElement): void {
    this.controls.removeEventListener("start", this.handleUserInteractStart);
    domElement.removeEventListener("wheel", this.handleWheel);
    this.controls.dispose();
  }
}
