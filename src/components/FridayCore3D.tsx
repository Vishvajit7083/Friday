import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { computeAgentOrbitPosition, computeHologramProfile } from '../core/hologramMath';
import { SPECIALIST_AGENTS, VOICE_STATE_META } from '../core/agentRegistry';
import type { AgentId, HologramSettings, VoiceState } from '../core/types';

interface FridayCore3DProps {
  voiceState: VoiceState;
  audioLevel: number;
  animationQuality: 'high' | 'balanced' | 'low';
  activeAgents?: AgentId[];
  hologram?: HologramSettings;
  compact?: boolean;
}

const DEFAULT_HOLOGRAM: HologramSettings = {
  mode: 'orbital',
  projectionBeam: true,
  scanlineIntensity: 0.65,
  holoOpacity: 0.85,
  autoRotate: true,
};

const STATE_COLOR_MAP: Record<VoiceState, number> = {
  standby: 0xc084fc,
  wake_word_detected: 0xf472b6,
  listening: 0xd946ef,
  transcribing: 0xa78bfa,
  processing: 0xa855f7,
  searching: 0xe879f9,
  executing: 0xc026d3,
  speaking: 0xf0abfc,
  interrupted: 0xf59e0b,
  completed: 0xc084fc,
  error: 0xfb7185,
};

const _targetColor = new THREE.Color();
const _dummyMatrix = new THREE.Matrix4();
const _dummyPos = new THREE.Vector3();
const _dummyQuat = new THREE.Quaternion();
const _dummyScale = new THREE.Vector3();
const _euler = new THREE.Euler();

const HOLO_SHELL_VERT = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;
  uniform float uTime;
  uniform float uPulse;

  void main() {
    vLocalPos = position;
    vec3 displaced = position * (1.0 + sin(position.y * 5.0 + uTime * 3.0) * 0.014 * uPulse);
    vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const HOLO_SHELL_FRAG = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uScanSpeed;
  uniform float uScanIntensity;
  uniform float uOpacity;

  void main() {
    float ndotv = abs(dot(normalize(vNormal), normalize(vViewDir)));
    float fresnel = pow(1.0 - ndotv, 2.35);
    float rimGlow = smoothstep(0.58, 0.98, 1.0 - ndotv);
    float scan = 0.5 + 0.5 * sin(vLocalPos.y * 38.0 - uTime * uScanSpeed * 3.5);
    float band = smoothstep(0.45, 0.96, scan);
    float alpha = (fresnel * 0.85 + rimGlow * 0.45 + band * 0.14 * uScanIntensity) * uOpacity;
    vec3 innerCol = mix(uColor * 0.72, vec3(0.95, 0.72, 1.0), fresnel * 0.65);
    vec3 finalCol = mix(innerCol, vec3(1.0, 0.92, 1.0), rimGlow * 0.55);
    gl_FragColor = vec4(finalCol, clamp(alpha, 0.0, 0.92));
  }
`;

const INNER_GLOW_VERT = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const INNER_GLOW_FRAG = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  uniform vec3 uColor;
  void main() {
    float ndotv = clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0);
    float core = pow(ndotv, 2.35);
    vec3 col = mix(uColor, vec3(0.96, 0.80, 1.0), core * 0.35);
    gl_FragColor = vec4(col, core * 0.28);
  }
`;

const BEAM_VERT = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const BEAM_FRAG = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;

  void main() {
    float ndotv = abs(dot(normalize(vNormal), normalize(vViewDir)));
    float edgeSoft = pow(ndotv, 1.15);
    float verticalFade = smoothstep(0.0, 0.14, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
    float filaments = 0.58 + 0.42 * sin(vUv.x * 56.0 + uTime * 1.1) * cos(vUv.x * 24.0 - uTime * 0.7);
    float upwardPulse = 0.72 + 0.28 * sin(vUv.y * 38.0 - uTime * 3.8);
    float alpha = edgeSoft * verticalFade * filaments * upwardPulse * uOpacity;
    vec3 col = mix(uColor, vec3(0.98, 0.86, 1.0), (1.0 - vUv.y) * 0.45);
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.65));
  }
`;

function createHudReticleTexture(renderer: THREE.WebGLRenderer, variant: 'outer' | 'inner'): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  if (variant === 'outer') {
    // Segmented outer concentric HUD telemetry rings
    const rings = [
      { r: 472, w: 2.5, dash: [38, 18, 10, 18], color: 'rgba(192, 132, 252, 0.62)' },
      { r: 446, w: 4, dash: [95, 28, 22, 24], color: 'rgba(217, 70, 239, 0.72)' },
      { r: 416, w: 1.8, dash: [], color: 'rgba(168, 85, 247, 0.36)' },
      { r: 386, w: 2.5, dash: [14, 10], color: 'rgba(232, 121, 249, 0.52)' },
    ];
    for (const ring of rings) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = ring.w;
      ctx.setLineDash(ring.dash);
      ctx.stroke();
      ctx.restore();
    }

    // Precision degree ticks around perimeter
    ctx.save();
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const major = i % 10 === 0;
      const r0 = major ? 426 : 434;
      const r1 = 444;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.strokeStyle = major ? 'rgba(245, 208, 254, 0.85)' : 'rgba(192, 132, 252, 0.42)';
      ctx.lineWidth = major ? 2.8 : 1.3;
      ctx.stroke();
    }
    ctx.restore();

    // Glowing cardinal accent brackets
    for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 460, angle - 0.14, angle + 0.14);
      ctx.strokeStyle = 'rgba(245, 208, 254, 0.95)';
      ctx.lineWidth = 5;
      ctx.shadowColor = '#e879f9';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.restore();
    }
  } else {
    // Inner emblem calibration ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 455, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(245, 208, 254, 0.82)';
    ctx.lineWidth = 6;
    ctx.setLineDash([70, 26, 20, 26]);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 412, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(232, 121, 249, 0.88)';
    ctx.lineWidth = 4;
    ctx.setLineDash([]);
    ctx.stroke();

    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const r0 = i % 4 === 0 ? 378 : 392;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * 408, cy + Math.sin(a) * 408);
      ctx.strokeStyle = i % 4 === 0 ? 'rgba(255, 255, 255, 0.9)' : 'rgba(216, 180, 254, 0.5)';
      ctx.lineWidth = i % 4 === 0 ? 3 : 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function createPlatformCircuitTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  // Dark metallic core background
  const bgGrad = ctx.createRadialGradient(cx, cy, 30, cx, cy, 490);
  bgGrad.addColorStop(0, '#f5d0fe');
  bgGrad.addColorStop(0.14, '#d946ef');
  bgGrad.addColorStop(0.32, '#4c1d95');
  bgGrad.addColorStop(0.62, '#1e0938');
  bgGrad.addColorStop(1, '#090214');
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 490, 0, Math.PI * 2);
  ctx.fill();

  // Concentric emitter circuit rings
  const ringSpecs = [
    { r: 120, w: 6, dash: [], col: 'rgba(255, 240, 255, 0.95)' },
    { r: 195, w: 4, dash: [42, 16], col: 'rgba(240, 171, 252, 0.85)' },
    { r: 275, w: 5, dash: [64, 20, 16, 20], col: 'rgba(217, 70, 239, 0.9)' },
    { r: 355, w: 6, dash: [24, 14], col: 'rgba(192, 132, 252, 0.82)' },
    { r: 435, w: 8, dash: [46, 18], col: 'rgba(232, 121, 249, 0.92)' },
  ];
  for (const r of ringSpecs) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r.r, 0, Math.PI * 2);
    ctx.strokeStyle = r.col;
    ctx.lineWidth = r.w;
    ctx.setLineDash(r.dash);
    ctx.stroke();
    ctx.restore();
  }

  // Radial power conduits
  ctx.save();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 125, cy + Math.sin(a) * 125);
    ctx.lineTo(cx + Math.cos(a) * 465, cy + Math.sin(a) * 465);
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(232, 121, 249, 0.45)' : 'rgba(168, 85, 247, 0.28)';
    ctx.lineWidth = i % 2 === 0 ? 3 : 1.5;
    ctx.stroke();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function createFloorHaloTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(256, 256, 8, 256, 256, 250);
  grad.addColorStop(0, 'rgba(240, 171, 252, 0.82)');
  grad.addColorStop(0.24, 'rgba(217, 70, 239, 0.46)');
  grad.addColorStop(0.54, 'rgba(147, 51, 234, 0.18)');
  grad.addColorStop(0.84, 'rgba(88, 28, 135, 0.04)');
  grad.addColorStop(1, 'rgba(59, 7, 100, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

export function FridayCore3D({
  voiceState,
  audioLevel,
  animationQuality,
  activeAgents = [],
  hologram = DEFAULT_HOLOGRAM,
  compact = false,
}: FridayCore3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<VoiceState>(voiceState);
  const audioRef = useRef<number>(audioLevel);
  const qualityRef = useRef(animationQuality);
  const holoRef = useRef<HologramSettings>(hologram);
  const activeAgentsRef = useRef<AgentId[]>(activeAgents);
  const pointerTiltRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    stateRef.current = voiceState;
  }, [voiceState]);

  useEffect(() => {
    audioRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    qualityRef.current = animationQuality;
  }, [animationQuality]);

  useEffect(() => {
    holoRef.current = hologram;
  }, [hologram]);

  useEffect(() => {
    activeAgentsRef.current = activeAgents;
  }, [activeAgents]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: isSoftwareGl,
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.24;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));

    let curWidth = container.clientWidth || 420;
    let curHeight = container.clientHeight || 430;
    const width = curWidth;
    const height = curHeight;
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglFailed(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, compact ? 0.25 : 0.3, compact ? 9.1 : 7.2);
    camera.lookAt(0, compact ? -0.18 : -0.18, 0);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const hemiLight = new THREE.HemisphereLight(0xf0abfc, 0x18052e, 1.45);
    scene.add(hemiLight);
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(4, 6, 6);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xd946ef, 2.1);
    rimLight.position.set(-5, -2, -4);
    scene.add(rimLight);
    const corePointLight = new THREE.PointLight(0xe879f9, 3.0, 8);
    corePointLight.position.set(0, 0.55, 1.2);
    scene.add(corePointLight);

    // Master Holographic Reactor Assembly
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // Compact elevated sphere in upper-center zone; F.R.I.D.A.Y. title sits cleanly underneath with clear gap
    const coreGroup = new THREE.Group();
    coreGroup.position.y = compact ? 1.34 : 0.44;
    if (compact) {
      coreGroup.scale.setScalar(0.71);
    }
    rootGroup.add(coreGroup);

    // 1. Soft Inner Volumetric Plasma Aura
    const innerGlowGeo = new THREE.SphereGeometry(0.92, 28, 22);
    const innerGlowMat = new THREE.ShaderMaterial({
      vertexShader: INNER_GLOW_VERT,
      fragmentShader: INNER_GLOW_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(0xd946ef) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const innerGlowMesh = new THREE.Mesh(innerGlowGeo, innerGlowMat);
    innerGlowMesh.renderOrder = 2;
    coreGroup.add(innerGlowMesh);

    // 2. True 3D Beveled Triangular F.R.I.D.A.Y. Emblem + Inner Delta Core + Calibration Ring
    const emblemGroup = new THREE.Group();
    coreGroup.add(emblemGroup);

    // Outer beveled inverted triangle frame with crisp open center window
    const outerTriShape = new THREE.Shape();
    outerTriShape.moveTo(0, -0.56);
    outerTriShape.lineTo(0.52, 0.36);
    outerTriShape.lineTo(-0.52, 0.36);
    outerTriShape.closePath();

    const holeTriPath = new THREE.Path();
    holeTriPath.moveTo(0, -0.37);
    holeTriPath.lineTo(-0.34, 0.24);
    holeTriPath.lineTo(0.34, 0.24);
    holeTriPath.closePath();
    outerTriShape.holes.push(holeTriPath);

    const outerEmblemGeo = new THREE.ExtrudeGeometry(outerTriShape, {
      depth: 0.05,
      bevelEnabled: true,
      bevelThickness: 0.016,
      bevelSize: 0.014,
      bevelSegments: 2,
    });
    outerEmblemGeo.center();
    const outerEmblemMat = new THREE.MeshPhysicalMaterial({
      color: 0xe879f9,
      emissive: 0xa855f7,
      emissiveIntensity: 0.78,
      metalness: 0.55,
      roughness: 0.22,
      clearcoat: 0.7,
    });
    const outerEmblemMesh = new THREE.Mesh(outerEmblemGeo, outerEmblemMat);
    emblemGroup.add(outerEmblemMesh);

    // Inner bright inverted delta core
    const innerTriShape = new THREE.Shape();
    innerTriShape.moveTo(0, -0.19);
    innerTriShape.lineTo(0.18, 0.13);
    innerTriShape.lineTo(-0.18, 0.13);
    innerTriShape.closePath();
    const innerEmblemGeo = new THREE.ExtrudeGeometry(innerTriShape, {
      depth: 0.07,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.01,
      bevelSegments: 2,
    });
    innerEmblemGeo.center();
    innerEmblemGeo.translate(0, 0.025, 0);
    const innerEmblemMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xf5d0fe,
      emissiveIntensity: 1.35,
      roughness: 0.12,
      metalness: 0.15,
    });
    const innerEmblemMesh = new THREE.Mesh(innerEmblemGeo, innerEmblemMat);
    emblemGroup.add(innerEmblemMesh);

    // Precision HUD Calibration Ring surrounding the 3D Delta Emblem
    const innerHudTex = createHudReticleTexture(renderer, 'inner');
    const emblemRingGeo = new THREE.RingGeometry(0.54, 0.78, 64);
    const emblemRingMat = new THREE.MeshBasicMaterial({
      map: innerHudTex,
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const emblemRingMesh = new THREE.Mesh(emblemRingGeo, emblemRingMat);
    emblemRingMesh.renderOrder = 4;
    emblemGroup.add(emblemRingMesh);

    // 3. Detailed Geodesic Neural Constellation Lattice + Node Points + Telemetry Meridians
    const constRadius = 1.32;
    const nodeCount = 156;
    const nodePointsArr: THREE.Vector3[] = [];
    const nodePosBuf = new Float32Array(nodeCount * 3);
    for (let i = 0; i < nodeCount; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / nodeCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const x = Math.sin(phi) * Math.cos(theta) * constRadius;
      const y = Math.sin(phi) * Math.sin(theta) * constRadius;
      const z = Math.cos(phi) * constRadius;
      nodePointsArr.push(new THREE.Vector3(x, y, z));
      nodePosBuf[i * 3] = x;
      nodePosBuf[i * 3 + 1] = y;
      nodePosBuf[i * 3 + 2] = z;
    }

    const edgeCoords: number[] = [];
    const maxChordSq = 0.62 * 0.62;
    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        if (nodePointsArr[i].distanceToSquared(nodePointsArr[j]) < maxChordSq) {
          edgeCoords.push(
            nodePointsArr[i].x,
            nodePointsArr[i].y,
            nodePointsArr[i].z,
            nodePointsArr[j].x,
            nodePointsArr[j].y,
            nodePointsArr[j].z
          );
        }
      }
    }
    const constellationGeo = new THREE.BufferGeometry();
    constellationGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgeCoords, 3));
    const constellationMat = new THREE.LineBasicMaterial({
      color: 0xd946ef,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const constellationLines = new THREE.LineSegments(constellationGeo, constellationMat);
    coreGroup.add(constellationLines);

    const latticeNodesGeo = new THREE.BufferGeometry();
    latticeNodesGeo.setAttribute('position', new THREE.BufferAttribute(nodePosBuf, 3));
    const latticeNodesMat = new THREE.PointsMaterial({
      color: 0xf5d0fe,
      size: 0.048,
      transparent: true,
      opacity: 0.88,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const latticeNodes = new THREE.Points(latticeNodesGeo, latticeNodesMat);
    coreGroup.add(latticeNodes);

    // Subtle Spherical Telemetry Meridian Grid
    const gridGeo = new THREE.SphereGeometry(1.37, 24, 16);
    const gridMat = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      wireframe: true,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    });
    const telemetryGrid = new THREE.Mesh(gridGeo, gridMat);
    coreGroup.add(telemetryGrid);

    // 4. Transparent Optical Holographic Glass Sphere + Fresnel Energy Rim Shell
    const glassGeo = new THREE.SphereGeometry(1.41, 40, 32);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x6b21a8,
      roughness: 0.06,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      ior: 1.5,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
    });
    const glassSphere = new THREE.Mesh(glassGeo, glassMat);
    glassSphere.renderOrder = 5;
    coreGroup.add(glassSphere);

    const holoShellGeo = new THREE.SphereGeometry(1.425, 40, 32);
    const holoShellMat = new THREE.ShaderMaterial({
      vertexShader: HOLO_SHELL_VERT,
      fragmentShader: HOLO_SHELL_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0.3 },
        uColor: { value: new THREE.Color(0xc084fc) },
        uScanSpeed: { value: 1.4 },
        uScanIntensity: { value: 0.65 },
        uOpacity: { value: 0.88 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
    });
    const holoShellMesh = new THREE.Mesh(holoShellGeo, holoShellMat);
    holoShellMesh.renderOrder = 6;
    coreGroup.add(holoShellMesh);

    // 5. Compact Proportional Concentric HUD Reticle & Slim Gyroscopic Orbital Rings
    const outerHudTex = createHudReticleTexture(renderer, 'outer');

    const hudPlaneFrontGeo = new THREE.RingGeometry(1.42, 1.72, 72);
    const hudPlaneMat = new THREE.MeshBasicMaterial({
      map: outerHudTex,
      transparent: true,
      opacity: compact ? 0.42 : 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const hudPlaneFront = new THREE.Mesh(hudPlaneFrontGeo, hudPlaneMat);
    hudPlaneFront.position.z = -0.08;
    hudPlaneFront.renderOrder = 4;
    coreGroup.add(hudPlaneFront);

    // Cardinal horizontal lock ticks (visible in standalone AI Core mode; hidden in compact Image 2 view)
    const tickGeo = new THREE.BoxGeometry(0.24, 0.02, 0.02);
    const tickMat = new THREE.MeshBasicMaterial({
      color: 0xf0abfc,
      transparent: true,
      opacity: compact ? 0.0 : 0.82,
    });
    const leftTick = new THREE.Mesh(tickGeo, tickMat);
    leftTick.position.set(-1.92, 0, -0.05);
    leftTick.visible = !compact;
    coreGroup.add(leftTick);
    const rightTick = new THREE.Mesh(tickGeo, tickMat);
    rightTick.position.set(1.92, 0, -0.05);
    rightTick.visible = !compact;
    coreGroup.add(rightTick);

    // Compact tilted HUD telemetry ring around sphere
    const hudPlaneTiltGeo = new THREE.RingGeometry(1.44, 1.74, 64);
    const hudPlaneTiltMat = new THREE.MeshBasicMaterial({
      map: outerHudTex,
      transparent: true,
      opacity: compact ? 0.36 : 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const hudPlaneTilt = new THREE.Mesh(hudPlaneTiltGeo, hudPlaneTiltMat);
    hudPlaneTilt.rotation.x = Math.PI * 0.42;
    hudPlaneTilt.rotation.y = Math.PI * 0.14;
    hudPlaneTilt.renderOrder = 4;
    coreGroup.add(hudPlaneTilt);

    // Slim proportional glowing neon gyroscopic orbital rings
    const ringMatPrimary = new THREE.MeshPhysicalMaterial({
      color: 0xc084fc,
      emissive: 0x9333ea,
      emissiveIntensity: 0.72,
      metalness: 0.85,
      roughness: 0.2,
      clearcoat: 0.85,
    });
    const ringMatAccent = new THREE.MeshStandardMaterial({
      color: 0xf5d0fe,
      emissive: 0xd946ef,
      emissiveIntensity: 1.25,
      metalness: 0.5,
      roughness: 0.2,
    });

    const ring1Geo = new THREE.TorusGeometry(compact ? 1.52 : 1.58, compact ? 0.015 : 0.022, 12, 96);
    const ring1 = new THREE.Mesh(ring1Geo, ringMatPrimary);
    ring1.rotation.x = Math.PI * 0.36;
    ring1.rotation.y = Math.PI * 0.22;
    coreGroup.add(ring1);

    const ring2Geo = new THREE.TorusGeometry(compact ? 1.66 : 1.76, compact ? 0.013 : 0.018, 12, 96);
    const ring2 = new THREE.Mesh(ring2Geo, ringMatAccent);
    ring2.rotation.y = -Math.PI * 0.34;
    ring2.rotation.x = -Math.PI * 0.26;
    coreGroup.add(ring2);

    const ring3Geo = new THREE.TorusGeometry(compact ? 1.78 : 1.94, compact ? 0.01 : 0.014, 10, 96);
    const ring3 = new THREE.Mesh(ring3Geo, ringMatPrimary);
    ring3.rotation.z = Math.PI * 0.36;
    ring3.rotation.x = Math.PI * 0.18;
    coreGroup.add(ring3);

    // 6. Orbiting Neural Particle Halo + Rising Projection Beam Particles
    const pCount = compact ? 320 : 420;
    const pPositions = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / pCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const radius = compact ? 1.36 + (i % 6) * 0.055 : 1.46 + (i % 7) * 0.085;
      pPositions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
      pPositions[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * radius;
      pPositions[i * 3 + 2] = Math.cos(phi) * radius;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xf5d0fe,
      size: compact ? 0.04 : 0.052,
      transparent: true,
      opacity: compact ? 0.85 : 0.9,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particlePoints = new THREE.Points(particleGeo, particleMat);
    coreGroup.add(particlePoints);

    // Rising vertical energy particles along the beam
    const beamPCount = 90;
    const beamPPositions = new Float32Array(beamPCount * 3);
    const beamPMeta = new Float32Array(beamPCount * 3); // [angle, radius, phase]
    for (let i = 0; i < beamPCount; i++) {
      const a = (i * 2.39996) % (Math.PI * 2);
      const r = 0.22 + ((i * 37) % 100) / 100 * 1.15;
      const ph = ((i * 73) % 100) / 100;
      beamPMeta[i * 3] = a;
      beamPMeta[i * 3 + 1] = r;
      beamPMeta[i * 3 + 2] = ph;
      beamPPositions[i * 3] = Math.cos(a) * r;
      beamPPositions[i * 3 + 1] = -2.0 + ph * 2.6;
      beamPPositions[i * 3 + 2] = Math.sin(a) * r;
    }
    const beamPGeo = new THREE.BufferGeometry();
    beamPGeo.setAttribute('position', new THREE.BufferAttribute(beamPPositions, 3));
    const beamPMat = new THREE.PointsMaterial({
      color: 0xf0abfc,
      size: 0.055,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const beamParticles = new THREE.Points(beamPGeo, beamPMat);
    rootGroup.add(beamParticles);

    // 7. 11 Orbiting Specialist Agent Nodes
    const nodeGeo = new THREE.OctahedronGeometry(0.062, 0);
    const nodeIdleMat = new THREE.MeshBasicMaterial({
      color: 0xc084fc,
      transparent: true,
      opacity: 0.72,
    });
    const nodeActiveMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 1.0,
    });
    const agentNodes = SPECIALIST_AGENTS.map((agent) => {
      const mesh = new THREE.Mesh(nodeGeo, nodeIdleMat);
      mesh.userData.agentId = agent.id;
      coreGroup.add(mesh);
      return mesh;
    });

    // 8. Glowing Circular Reactor Emitter & Subtle Vertical Energy Beam
    const emitterGroup = new THREE.Group();
    emitterGroup.position.y = compact ? -2.24 : -1.96;
    emitterGroup.rotation.x = compact ? 0.16 : 0.21;
    rootGroup.add(emitterGroup);

    // 8a. Stepped metallic chassis base (full standalone chassis in AI Core view)
    const baseProfile = [
      new THREE.Vector2(0.0, -0.24),
      new THREE.Vector2(1.88, -0.24),
      new THREE.Vector2(1.82, -0.13),
      new THREE.Vector2(1.60, -0.10),
      new THREE.Vector2(1.52, -0.02),
      new THREE.Vector2(1.26, 0.02),
      new THREE.Vector2(1.16, 0.08),
      new THREE.Vector2(0.0, 0.08),
    ];
    const baseLatheGeo = new THREE.LatheGeometry(baseProfile, 64);
    const baseLatheMat = new THREE.MeshPhysicalMaterial({
      color: 0x090314,
      emissive: 0x1b0734,
      emissiveIntensity: 0.24,
      metalness: 0.86,
      roughness: 0.36,
      clearcoat: 0.22,
    });
    const baseChassisMesh = new THREE.Mesh(baseLatheGeo, baseLatheMat);
    baseChassisMesh.visible = !compact;
    emitterGroup.add(baseChassisMesh);

    // 8b. Procedural Top Emitter Circuit Disc (standalone view; hidden in compact so photo's platform stays clean)
    const circuitTex = createPlatformCircuitTexture(renderer);
    const emitterDiscGeo = new THREE.CircleGeometry(1.48, 64);
    const emitterDiscMat = new THREE.MeshBasicMaterial({
      map: circuitTex,
      transparent: true,
      opacity: 0.96,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const emitterDisc = new THREE.Mesh(emitterDiscGeo, emitterDiscMat);
    emitterDisc.rotation.x = -Math.PI / 2;
    emitterDisc.position.y = 0.095;
    emitterDisc.visible = !compact;
    emitterGroup.add(emitterDisc);

    // 8c. Stepped glowing neon-purple & magenta energy rings
    const emitterOuterGeo = new THREE.TorusGeometry(1.74, 0.032, 12, 72);
    const emitterOuter = new THREE.Mesh(emitterOuterGeo, ringMatPrimary);
    emitterOuter.rotation.x = Math.PI / 2;
    emitterOuter.position.y = -0.07;
    emitterOuter.visible = !compact;
    emitterGroup.add(emitterOuter);

    const emitterMidGeo = new THREE.TorusGeometry(1.38, 0.026, 12, 64);
    const emitterMid = new THREE.Mesh(emitterMidGeo, ringMatAccent);
    emitterMid.rotation.x = Math.PI / 2;
    emitterMid.position.y = 0.04;
    emitterMid.visible = !compact;
    emitterGroup.add(emitterMid);

    const emitterCoreGeo = new THREE.TorusGeometry(compact ? 0.38 : 0.66, compact ? 0.02 : 0.028, 12, 48);
    const emitterCoreMat = new THREE.MeshBasicMaterial({
      color: 0xf5d0fe,
      transparent: true,
      opacity: compact ? 0.55 : 0.95,
    });
    const emitterCore = new THREE.Mesh(emitterCoreGeo, emitterCoreMat);
    emitterCore.rotation.x = Math.PI / 2;
    emitterCore.position.y = 0.105;
    emitterGroup.add(emitterCore);

    // 8d. 24 Radial Illuminated Emitter Fins via InstancedMesh
    const finCount = 24;
    const finGeo = new THREE.BoxGeometry(0.055, 0.09, 0.24);
    const finMat = new THREE.MeshStandardMaterial({
      color: 0xe879f9,
      emissive: 0xc026d3,
      emissiveIntensity: 1.25,
      metalness: 0.5,
      roughness: 0.2,
    });
    const finMesh = new THREE.InstancedMesh(finGeo, finMat, finCount);
    for (let i = 0; i < finCount; i++) {
      const a = (i / finCount) * Math.PI * 2;
      _dummyPos.set(Math.cos(a) * 1.56, -0.01, Math.sin(a) * 1.56);
      _euler.set(0, -a + Math.PI / 2, 0);
      _dummyQuat.setFromEuler(_euler);
      _dummyScale.set(1, 1, 1);
      _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
      finMesh.setMatrixAt(i, _dummyMatrix);
    }
    finMesh.instanceMatrix.needsUpdate = true;
    finMesh.computeBoundingSphere();
    finMesh.visible = !compact;
    emitterGroup.add(finMesh);

    // 8e. Soft Floor Glow Halo aligned over the center reactor pad
    const floorHaloTex = createFloorHaloTexture(renderer);
    const floorHaloGeo = new THREE.PlaneGeometry(compact ? 3.8 : 5.2, compact ? 3.8 : 5.2);
    const floorHaloMat = new THREE.MeshBasicMaterial({
      map: floorHaloTex,
      transparent: true,
      opacity: compact ? 0.45 : 0.52,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const floorHalo = new THREE.Mesh(floorHaloGeo, floorHaloMat);
    floorHalo.rotation.x = -Math.PI / 2;
    floorHalo.position.y = -0.08;
    emitterGroup.add(floorHalo);

    // 9. Subtle Dual-Layer Vertical Volumetric Holographic Energy Beam connecting platform & sphere
    const beamOuterGeo = new THREE.CylinderGeometry(compact ? 0.78 : 1.68, compact ? 0.34 : 0.62, compact ? 3.65 : 3.35, 40, 1, true);
    const beamMat = new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xd946ef) },
        uOpacity: { value: compact ? 0.22 : 0.46 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const beamOuterMesh = new THREE.Mesh(beamOuterGeo, beamMat);
    beamOuterMesh.position.y = compact ? 1.88 : 1.68;
    beamOuterMesh.renderOrder = 3;
    emitterGroup.add(beamOuterMesh);

    const beamInnerGeo = new THREE.CylinderGeometry(compact ? 0.34 : 0.72, compact ? 0.14 : 0.26, compact ? 3.45 : 3.15, 32, 1, true);
    const beamInnerMat = beamMat.clone();
    beamInnerMat.uniforms.uColor.value = new THREE.Color(0xf5d0fe);
    beamInnerMat.uniforms.uOpacity.value = compact ? 0.32 : 0.62;
    const beamInnerMesh = new THREE.Mesh(beamInnerGeo, beamInnerMat);
    beamInnerMesh.position.y = compact ? 1.78 : 1.58;
    beamInnerMesh.renderOrder = 3;
    emitterGroup.add(beamInnerMesh);

    // 10. Dynamic Voice Activity Waveform Ring around globe
    const waveSegments = 72;
    const wavePositions = new Float32Array((waveSegments + 1) * 3);
    for (let i = 0; i <= waveSegments; i++) {
      const angle = (i / waveSegments) * Math.PI * 2;
      wavePositions[i * 3] = Math.cos(angle) * 2.08;
      wavePositions[i * 3 + 1] = Math.sin(angle) * 2.08;
      wavePositions[i * 3 + 2] = 0;
    }
    const waveGeo = new THREE.BufferGeometry();
    waveGeo.setAttribute('position', new THREE.BufferAttribute(wavePositions, 3));
    const waveMat = new THREE.LineBasicMaterial({
      color: 0xe879f9,
      transparent: true,
      opacity: 0.72,
    });
    const waveLine = new THREE.Line(waveGeo, waveMat);
    coreGroup.add(waveLine);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      pointerTiltRef.current.x = THREE.MathUtils.clamp(ny * 0.2, -0.25, 0.25);
      pointerTiltRef.current.y = THREE.MathUtils.clamp(nx * 0.34, -0.38, 0.38);
    };
    const onPointerLeave = () => {
      pointerTiltRef.current.x = 0;
      pointerTiltRef.current.y = 0;
    };
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerleave', onPointerLeave);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(160, Math.round(entry.contentRect.width));
        const h = Math.max(160, Math.round(entry.contentRect.height));
        if (w === curWidth && h === curHeight) continue;
        curWidth = w;
        curHeight = h;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        renderer.render(scene, camera);
      }
    });
    resizeObserver.observe(container);

    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();
    const startTime = lastTime;
    let currentPulse = 1;
    let currentSpeed = 0.4;
    let currentSpread = 1;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      const elapsed = (now - startTime) / 1000;

      const st = stateRef.current;
      const audio = audioRef.current;
      const holo = holoRef.current;
      const profile = computeHologramProfile(st, holo.mode, audio, qualityRef.current);

      const speedMul = holo.autoRotate ? profile.ringSpeed : 0.08;
      currentSpeed = THREE.MathUtils.damp(currentSpeed, speedMul, 4, dt);
      currentSpread = THREE.MathUtils.damp(currentSpread, profile.explodedSpread, 5, dt);

      const targetPulse = 1.0 + Math.abs(Math.sin(elapsed * 4.2)) * profile.pulseAmplitude;
      currentPulse = THREE.MathUtils.damp(currentPulse, targetPulse, 7, dt);

      _targetColor.setHex(STATE_COLOR_MAP[st]);
      const colorLerp = Math.min(1, dt * 5);
      innerGlowMat.uniforms.uColor.value.lerp(_targetColor, colorLerp);
      constellationMat.color.lerp(_targetColor, colorLerp);
      ringMatAccent.color.lerp(_targetColor, colorLerp);
      ringMatAccent.emissive.lerp(_targetColor, colorLerp);
      particleMat.color.lerp(_targetColor, colorLerp);
      waveMat.color.lerp(_targetColor, colorLerp);
      holoShellMat.uniforms.uColor.value.lerp(_targetColor, colorLerp);
      beamMat.uniforms.uColor.value.lerp(_targetColor, colorLerp);
      corePointLight.color.lerp(_targetColor, colorLerp);

      holoShellMat.uniforms.uTime.value = elapsed;
      holoShellMat.uniforms.uPulse.value = profile.pulseAmplitude * 8.0;
      holoShellMat.uniforms.uScanSpeed.value = profile.scanlineSpeed;
      holoShellMat.uniforms.uScanIntensity.value = holo.scanlineIntensity;
      holoShellMat.uniforms.uOpacity.value = holo.holoOpacity;

      beamMat.uniforms.uTime.value = elapsed;
      beamInnerMat.uniforms.uTime.value = elapsed * 1.2;
      const beamScale = compact ? 0.58 : 1.15;
      const beamAlpha = holo.projectionBeam ? Math.max(0.22, profile.beamOpacity * beamScale) * holo.holoOpacity : 0;
      beamMat.uniforms.uOpacity.value = beamAlpha;
      beamInnerMat.uniforms.uOpacity.value = beamAlpha * 1.28;
      beamOuterMesh.visible = holo.projectionBeam;
      beamInnerMesh.visible = holo.projectionBeam;
      beamParticles.visible = holo.projectionBeam;

      // Keep proportional waveform radius compact in dashboard view
      waveLine.visible = !compact;

      // Exploded & mode scaling
      holoShellMesh.scale.setScalar(currentPulse * (0.98 + (currentSpread - 1) * 0.2));
      glassSphere.scale.setScalar(currentPulse * (0.98 + (currentSpread - 1) * 0.2));
      constellationLines.scale.setScalar(currentSpread);
      latticeNodes.scale.setScalar(currentSpread);
      telemetryGrid.visible = holo.mode === 'telemetry-sphere' || holo.mode === 'neural-matrix';
      telemetryGrid.scale.setScalar(currentSpread * 1.01);
      ring1.scale.setScalar(currentSpread);
      ring2.scale.setScalar(currentSpread * 1.03);
      ring3.scale.setScalar(currentSpread * 1.06);
      ring1.visible = holo.mode !== 'neural-matrix';
      ring2.visible = holo.mode !== 'neural-matrix';

      // Smooth pointer tilt
      rootGroup.rotation.x = THREE.MathUtils.damp(rootGroup.rotation.x, pointerTiltRef.current.x, 5, dt);
      rootGroup.rotation.y = THREE.MathUtils.damp(rootGroup.rotation.y, pointerTiltRef.current.y, 5, dt);

      // Gentle emblem breathing & HUD ring counter-rotation
      emblemGroup.scale.setScalar(0.96 + (currentPulse - 1.0) * 0.6);
      emblemRingMesh.rotation.z -= dt * 0.25 * currentSpeed;
      outerEmblemMesh.rotation.y = Math.sin(elapsed * 0.7) * 0.14;
      innerEmblemMesh.rotation.y = Math.sin(elapsed * 0.7) * 0.14;

      constellationLines.rotation.y += dt * 0.16 * currentSpeed;
      constellationLines.rotation.x += dt * 0.06 * currentSpeed;
      latticeNodes.rotation.copy(constellationLines.rotation);
      telemetryGrid.rotation.y -= dt * 0.12 * currentSpeed;

      hudPlaneFront.rotation.z += dt * 0.12 * currentSpeed;
      hudPlaneTilt.rotation.z -= dt * 0.35 * currentSpeed;
      emitterDisc.rotation.z += dt * 0.22 * currentSpeed;

      ring1.rotation.z += dt * 0.48 * currentSpeed;
      ring1.rotation.y += dt * 0.18 * currentSpeed;
      ring2.rotation.x += dt * 0.62 * currentSpeed;
      ring2.rotation.z -= dt * 0.28 * currentSpeed;
      ring3.rotation.y -= dt * 0.42 * currentSpeed;
      ring3.rotation.x += dt * 0.22 * currentSpeed;

      particlePoints.rotation.y += dt * 0.14 * currentSpeed;
      particlePoints.rotation.x = Math.sin(elapsed * 0.35) * 0.12;

      // Animate upward rising beam particles
      if (beamParticles.visible) {
        const bpAttr = beamPGeo.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < beamPCount; i++) {
          const a = beamPMeta[i * 3] + elapsed * 0.55;
          const baseR = beamPMeta[i * 3 + 1];
          const phase = (beamPMeta[i * 3 + 2] + elapsed * (0.28 + currentSpeed * 0.15)) % 1.0;
          const yPos = -2.0 + phase * 2.7;
          const funnelScale = 0.42 + phase * 0.72;
          bpAttr.setXYZ(
            i,
            Math.cos(a) * baseR * funnelScale,
            yPos,
            Math.sin(a) * baseR * funnelScale
          );
        }
        bpAttr.needsUpdate = true;
      }

      // Orbiting 11 specialist agent hologram nodes
      const activeSet = activeAgentsRef.current;
      for (let i = 0; i < agentNodes.length; i++) {
        const node = agentNodes[i];
        const [ox, oy, oz] = computeAgentOrbitPosition(
          i,
          agentNodes.length,
          1.98 * currentSpread,
          elapsed * (0.55 + currentSpeed * 0.35)
        );
        node.position.set(ox, oy, oz);
        const isActive = activeSet.includes(node.userData.agentId as AgentId);
        node.material = isActive ? nodeActiveMat : nodeIdleMat;
        node.scale.setScalar(isActive ? 1.55 + Math.sin(elapsed * 8) * 0.25 : 0.9);
        node.rotation.y += dt * 1.4;
      }

      // Dynamic voice activity waveform ring
      const waveAmp =
        st === 'speaking'
          ? 0.14 + audio * 0.24
          : st === 'listening'
          ? 0.08 + audio * 0.18
          : st === 'processing' || st === 'searching'
          ? 0.06
          : 0.02;

      const waveAttr = waveGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i <= waveSegments; i++) {
        const angle = (i / waveSegments) * Math.PI * 2;
        const ripple =
          Math.sin(angle * 8 + elapsed * 5.5) * waveAmp * 0.6 +
          Math.cos(angle * 4 - elapsed * 3.8) * waveAmp * 0.4;
        const radius = 2.08 + ripple;
        waveAttr.setXYZ(
          i,
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          Math.sin(angle * 6 + elapsed * 3) * waveAmp * 0.45
        );
      }
      waveAttr.needsUpdate = true;

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerleave', onPointerLeave);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      innerGlowGeo.dispose();
      innerGlowMat.dispose();
      outerEmblemGeo.dispose();
      outerEmblemMat.dispose();
      innerEmblemGeo.dispose();
      innerEmblemMat.dispose();
      innerHudTex.dispose();
      emblemRingGeo.dispose();
      emblemRingMat.dispose();
      constellationGeo.dispose();
      constellationMat.dispose();
      latticeNodesGeo.dispose();
      latticeNodesMat.dispose();
      gridGeo.dispose();
      gridMat.dispose();
      glassGeo.dispose();
      glassMat.dispose();
      holoShellGeo.dispose();
      holoShellMat.dispose();
      outerHudTex.dispose();
      hudPlaneFrontGeo.dispose();
      hudPlaneMat.dispose();
      tickGeo.dispose();
      tickMat.dispose();
      hudPlaneTiltGeo.dispose();
      hudPlaneTiltMat.dispose();
      ring1Geo.dispose();
      ring2Geo.dispose();
      ring3Geo.dispose();
      ringMatPrimary.dispose();
      ringMatAccent.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      beamPGeo.dispose();
      beamPMat.dispose();
      nodeGeo.dispose();
      nodeIdleMat.dispose();
      nodeActiveMat.dispose();
      baseLatheGeo.dispose();
      baseLatheMat.dispose();
      circuitTex.dispose();
      emitterDiscGeo.dispose();
      emitterDiscMat.dispose();
      emitterOuterGeo.dispose();
      emitterMidGeo.dispose();
      emitterCoreGeo.dispose();
      emitterCoreMat.dispose();
      finGeo.dispose();
      finMat.dispose();
      floorHaloTex.dispose();
      floorHaloGeo.dispose();
      floorHaloMat.dispose();
      beamOuterGeo.dispose();
      beamInnerGeo.dispose();
      beamMat.dispose();
      beamInnerMat.dispose();
      waveGeo.dispose();
      waveMat.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, [compact]);

  const meta = VOICE_STATE_META[voiceState];

  return (
    <div
      className="relative flex flex-col items-center justify-center select-none w-full"
      data-testid="friday-core-container"
      data-voice-state={voiceState}
      data-hologram-mode={hologram.mode}
    >
      {webglFailed ? (
        <div className="flex flex-col items-center justify-center w-64 h-64 rounded-full border border-purple-400/40 bg-[#120624]/80 text-center p-4">
          <div className="w-24 h-24 rounded-full border-2 border-fuchsia-400/70 flex items-center justify-center mb-3">
            <span className="font-display text-sm font-semibold text-purple-200">HOLO</span>
          </div>
          <span className="text-xs text-purple-200">2D Fallback Mode</span>
        </div>
      ) : (
        <div
          ref={mountRef}
          data-testid="friday-core-canvas"
          className={
            compact
              ? 'w-full max-w-[540px] h-[470px] sm:h-[505px] cursor-grab'
              : 'h-[320px] w-[320px] sm:h-[380px] sm:w-[380px] cursor-grab'
          }
        />
      )}

      {!compact && (
        <div className="mt-1 mb-1 flex flex-col items-center text-center pointer-events-none px-2">
          <div className="font-display text-lg font-semibold tracking-[0.22em] text-slate-100">
            F.R.I.D.A.Y.
          </div>
          <div className="mt-0.5 flex flex-wrap sm:flex-nowrap items-center justify-center gap-x-2 gap-y-0.5 text-xs font-mono-tabular">
            <span className={meta.color}>{meta.label}</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="text-slate-400">{meta.description}</span>
          </div>
        </div>
      )}
    </div>
  );
}
