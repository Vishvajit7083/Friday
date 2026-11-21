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
  standby: 0x38bdf8,
  listening: 0x22d3ee,
  processing: 0x818cf8,
  searching: 0x60a5fa,
  executing: 0x2dd4bf,
  speaking: 0x67e8f9,
  completed: 0x34d399,
  error: 0xfb7185,
};

const _targetColor = new THREE.Color();

const HOLO_SHELL_VERT = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;
  uniform float uTime;
  uniform float uPulse;

  void main() {
    vLocalPos = position;
    vec3 displaced = position * (1.0 + sin(position.y * 5.0 + uTime * 3.0) * 0.018 * uPulse);
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
    float fresnel = pow(1.0 - ndotv, 2.2);
    float scan = 0.5 + 0.5 * sin(vLocalPos.y * 34.0 - uTime * uScanSpeed * 4.0);
    float band = smoothstep(0.35, 0.95, scan);
    float alpha = (fresnel * 0.72 + band * 0.24 * uScanIntensity) * uOpacity;
    vec3 finalCol = mix(uColor, vec3(0.85, 0.98, 1.0), fresnel * 0.45);
    gl_FragColor = vec4(finalCol, clamp(alpha, 0.0, 0.92));
  }
`;

const BEAM_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BEAM_FRAG = `
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;

  void main() {
    float verticalFade = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.45, 1.0, vUv.y));
    float rays = 0.65 + 0.35 * sin(vUv.x * 48.0 + uTime * 1.4);
    float scan = 0.75 + 0.25 * sin(vUv.y * 50.0 - uTime * 4.0);
    float alpha = verticalFade * rays * scan * uOpacity;
    gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 0.55));
  }
`;

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
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));

    const width = container.clientWidth || 300;
    const height = container.clientHeight || 300;
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglFailed(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0.25, 6.7);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const hemiLight = new THREE.HemisphereLight(0x7dd3fc, 0x0f172a, 1.1);
    scene.add(hemiLight);
    const keyLight = new THREE.DirectionalLight(0xe0f2fe, 2.2);
    keyLight.position.set(4, 5, 5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x6366f1, 1.4);
    rimLight.position.set(-5, -3, -4);
    scene.add(rimLight);

    // Master Holographic Projection Assembly
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    const coreGroup = new THREE.Group();
    coreGroup.position.y = 0.12;
    rootGroup.add(coreGroup);

    // 1. Inner crystalline plasma core
    const innerGeo = new THREE.IcosahedronGeometry(0.74, 2);
    const innerMat = new THREE.MeshPhysicalMaterial({
      color: 0x0284c7,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.85,
      roughness: 0.18,
      metalness: 0.3,
      clearcoat: 1.0,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    coreGroup.add(innerMesh);

    // 2. Volumetric Fresnel + Scanline Hologram Shell
    const holoShellGeo = new THREE.SphereGeometry(1.16, 36, 28);
    const holoShellMat = new THREE.ShaderMaterial({
      vertexShader: HOLO_SHELL_VERT,
      fragmentShader: HOLO_SHELL_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0.3 },
        uColor: { value: new THREE.Color(0x22d3ee) },
        uScanSpeed: { value: 1.4 },
        uScanIntensity: { value: 0.65 },
        uOpacity: { value: 0.85 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const holoShellMesh = new THREE.Mesh(holoShellGeo, holoShellMat);
    coreGroup.add(holoShellMesh);

    // 3. Outer faceted wireframe neural lattice
    const cageGeo = new THREE.IcosahedronGeometry(1.34, 1);
    const cageMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.45,
      wireframe: true,
      roughness: 0.3,
      metalness: 0.85,
      transparent: true,
      opacity: 0.5,
    });
    const cageMesh = new THREE.Mesh(cageGeo, cageMat);
    coreGroup.add(cageMesh);

    // 4. Telemetry Globe Meridian Grid (visible in telemetry-sphere & neural-matrix)
    const gridGeo = new THREE.SphereGeometry(1.52, 18, 12);
    const gridMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.16,
    });
    const telemetryGrid = new THREE.Mesh(gridGeo, gridMat);
    coreGroup.add(telemetryGrid);

    // 5. Three precision orbital gyroscopic rings
    const ringMatPrimary = new THREE.MeshPhysicalMaterial({
      color: 0x94a3b8,
      emissive: 0x0369a1,
      emissiveIntensity: 0.3,
      metalness: 0.92,
      roughness: 0.18,
      clearcoat: 0.8,
    });
    const ringMatAccent = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x22d3ee,
      emissiveIntensity: 0.85,
      metalness: 0.65,
      roughness: 0.25,
    });

    const ring1Geo = new THREE.TorusGeometry(1.62, 0.024, 14, 96);
    const ring1 = new THREE.Mesh(ring1Geo, ringMatPrimary);
    ring1.rotation.x = Math.PI * 0.36;
    coreGroup.add(ring1);

    const ring2Geo = new THREE.TorusGeometry(1.86, 0.02, 14, 96);
    const ring2 = new THREE.Mesh(ring2Geo, ringMatAccent);
    ring2.rotation.y = Math.PI * 0.3;
    ring2.rotation.x = -Math.PI * 0.22;
    coreGroup.add(ring2);

    const ring3Geo = new THREE.TorusGeometry(2.12, 0.015, 12, 96);
    const ring3 = new THREE.Mesh(ring3Geo, ringMatPrimary);
    ring3.rotation.z = Math.PI * 0.4;
    coreGroup.add(ring3);

    // 6. Neural Particle Cloud
    const pCount = 520;
    const pPositions = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / pCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const radius = 1.4 + (i % 5) * 0.07;
      pPositions[i * 3] = Math.sin(phi) * Math.cos(theta) * radius;
      pPositions[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * radius;
      pPositions[i * 3 + 2] = Math.cos(phi) * radius;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x67e8f9,
      size: 0.042,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
    });
    const particlePoints = new THREE.Points(particleGeo, particleMat);
    coreGroup.add(particlePoints);

    // 7. 11 Orbiting Specialist Agent Hologram Nodes
    const nodeGeo = new THREE.OctahedronGeometry(0.068, 0);
    const nodeIdleMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.65,
    });
    const nodeActiveMat = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 1.0,
    });
    const agentNodes = SPECIALIST_AGENTS.map((agent) => {
      const mesh = new THREE.Mesh(nodeGeo, nodeIdleMat);
      mesh.userData.agentId = agent.id;
      coreGroup.add(mesh);
      return mesh;
    });

    // 8. Holographic Emitter Base & Volumetric Projection Beam
    const emitterGroup = new THREE.Group();
    emitterGroup.position.y = -2.25;
    rootGroup.add(emitterGroup);

    const emitterRingGeo = new THREE.TorusGeometry(0.72, 0.038, 12, 64);
    const emitterRing = new THREE.Mesh(emitterRingGeo, ringMatPrimary);
    emitterRing.rotation.x = Math.PI / 2;
    emitterGroup.add(emitterRing);

    const emitterInnerGeo = new THREE.TorusGeometry(0.46, 0.024, 12, 48);
    const emitterInner = new THREE.Mesh(emitterInnerGeo, ringMatAccent);
    emitterInner.rotation.x = Math.PI / 2;
    emitterGroup.add(emitterInner);

    const beamGeo = new THREE.CylinderGeometry(1.75, 0.44, 2.3, 40, 1, true);
    const beamMat = new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0x22d3ee) },
        uOpacity: { value: 0.24 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.position.y = 1.15;
    emitterGroup.add(beamMesh);

    // 9. Dynamic Voice Activity Waveform Ring
    const waveSegments = 64;
    const wavePositions = new Float32Array((waveSegments + 1) * 3);
    for (let i = 0; i <= waveSegments; i++) {
      const angle = (i / waveSegments) * Math.PI * 2;
      wavePositions[i * 3] = Math.cos(angle) * 2.34;
      wavePositions[i * 3 + 1] = Math.sin(angle) * 2.34;
      wavePositions[i * 3 + 2] = 0;
    }
    const waveGeo = new THREE.BufferGeometry();
    waveGeo.setAttribute('position', new THREE.BufferAttribute(wavePositions, 3));
    const waveMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
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
      pointerTiltRef.current.x = THREE.MathUtils.clamp(ny * 0.28, -0.35, 0.35);
      pointerTiltRef.current.y = THREE.MathUtils.clamp(nx * 0.42, -0.45, 0.45);
    };
    const onPointerLeave = () => {
      pointerTiltRef.current.x = 0;
      pointerTiltRef.current.y = 0;
    };
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerleave', onPointerLeave);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(120, entry.contentRect.width);
        const h = Math.max(120, entry.contentRect.height);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
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

      const targetPulse = 1.0 + Math.abs(Math.sin(elapsed * 4.5)) * profile.pulseAmplitude;
      currentPulse = THREE.MathUtils.damp(currentPulse, targetPulse, 7, dt);

      _targetColor.setHex(STATE_COLOR_MAP[st]);
      innerMat.emissive.lerp(_targetColor, Math.min(1, dt * 5));
      cageMat.color.lerp(_targetColor, Math.min(1, dt * 5));
      ringMatAccent.color.lerp(_targetColor, Math.min(1, dt * 5));
      ringMatAccent.emissive.lerp(_targetColor, Math.min(1, dt * 5));
      particleMat.color.lerp(_targetColor, Math.min(1, dt * 5));
      waveMat.color.lerp(_targetColor, Math.min(1, dt * 5));
      holoShellMat.uniforms.uColor.value.lerp(_targetColor, Math.min(1, dt * 5));
      beamMat.uniforms.uColor.value.lerp(_targetColor, Math.min(1, dt * 5));

      // Update hologram shader uniforms
      holoShellMat.uniforms.uTime.value = elapsed;
      holoShellMat.uniforms.uPulse.value = profile.pulseAmplitude * 8.0;
      holoShellMat.uniforms.uScanSpeed.value = profile.scanlineSpeed;
      holoShellMat.uniforms.uScanIntensity.value = holo.scanlineIntensity;
      holoShellMat.uniforms.uOpacity.value = holo.holoOpacity;

      beamMat.uniforms.uTime.value = elapsed;
      beamMat.uniforms.uOpacity.value = holo.projectionBeam ? profile.beamOpacity * holo.holoOpacity : 0;
      beamMesh.visible = holo.projectionBeam;

      // Mode-specific geometry visibility & exploded spread
      holoShellMesh.scale.setScalar(currentPulse * (0.95 + (currentSpread - 1) * 0.25));
      cageMesh.scale.setScalar(holo.mode === 'neural-matrix' ? 1.15 * currentSpread : currentSpread);
      telemetryGrid.visible = holo.mode === 'telemetry-sphere' || holo.mode === 'neural-matrix';
      telemetryGrid.scale.setScalar(currentSpread * 1.05);
      ring1.scale.setScalar(currentSpread);
      ring2.scale.setScalar(currentSpread * 1.04);
      ring3.scale.setScalar(currentSpread * 1.08);
      ring1.visible = holo.mode !== 'neural-matrix';
      ring2.visible = holo.mode !== 'neural-matrix';

      // Interactive pointer parallax
      rootGroup.rotation.x = THREE.MathUtils.damp(rootGroup.rotation.x, pointerTiltRef.current.x, 5, dt);
      rootGroup.rotation.y = THREE.MathUtils.damp(rootGroup.rotation.y, pointerTiltRef.current.y, 5, dt);

      innerMesh.scale.setScalar(currentPulse);
      innerMesh.rotation.y += dt * 0.45 * currentSpeed;
      innerMesh.rotation.x += dt * 0.2 * currentSpeed;

      cageMesh.rotation.y -= dt * 0.34 * currentSpeed;
      cageMesh.rotation.z += dt * 0.18 * currentSpeed;
      telemetryGrid.rotation.y += dt * 0.2 * currentSpeed;

      ring1.rotation.z += dt * 0.55 * currentSpeed;
      ring1.rotation.y += dt * 0.22 * currentSpeed;
      ring2.rotation.x += dt * 0.72 * currentSpeed;
      ring2.rotation.z -= dt * 0.35 * currentSpeed;
      ring3.rotation.y -= dt * 0.48 * currentSpeed;
      ring3.rotation.x += dt * 0.28 * currentSpeed;

      particlePoints.rotation.y += dt * 0.16 * currentSpeed;
      particlePoints.rotation.x = Math.sin(elapsed * 0.4) * 0.14;

      // Orbiting 11 specialist agent hologram nodes
      const activeSet = activeAgentsRef.current;
      for (let i = 0; i < agentNodes.length; i++) {
        const node = agentNodes[i];
        const [ox, oy, oz] = computeAgentOrbitPosition(i, agentNodes.length, 2.08 * currentSpread, elapsed * (0.6 + currentSpeed * 0.4));
        node.position.set(ox, oy, oz);
        const isActive = activeSet.includes(node.userData.agentId as AgentId);
        node.material = isActive ? nodeActiveMat : nodeIdleMat;
        node.scale.setScalar(isActive ? 1.55 + Math.sin(elapsed * 8) * 0.25 : 0.9);
        node.rotation.y += dt * 1.4;
      }

      // Dynamic waveform ring
      const waveAmp =
        st === 'speaking'
          ? 0.16 + audio * 0.28
          : st === 'listening'
          ? 0.1 + audio * 0.22
          : st === 'processing' || st === 'searching'
          ? 0.08
          : 0.025;

      const waveAttr = waveGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i <= waveSegments; i++) {
        const angle = (i / waveSegments) * Math.PI * 2;
        const ripple =
          Math.sin(angle * 8 + elapsed * 6) * waveAmp * 0.6 +
          Math.cos(angle * 4 - elapsed * 4) * waveAmp * 0.4;
        const radius = 2.34 + ripple;
        waveAttr.setXYZ(
          i,
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          Math.sin(angle * 6 + elapsed * 3) * waveAmp * 0.5
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
      innerGeo.dispose();
      innerMat.dispose();
      holoShellGeo.dispose();
      holoShellMat.dispose();
      cageGeo.dispose();
      cageMat.dispose();
      gridGeo.dispose();
      gridMat.dispose();
      ring1Geo.dispose();
      ring2Geo.dispose();
      ring3Geo.dispose();
      ringMatPrimary.dispose();
      ringMatAccent.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      nodeGeo.dispose();
      nodeIdleMat.dispose();
      nodeActiveMat.dispose();
      emitterRingGeo.dispose();
      emitterInnerGeo.dispose();
      beamGeo.dispose();
      beamMat.dispose();
      waveGeo.dispose();
      waveMat.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, []);

  const meta = VOICE_STATE_META[voiceState];

  return (
    <div
      className="relative flex flex-col items-center justify-center select-none"
      data-testid="friday-core-container"
      data-voice-state={voiceState}
      data-hologram-mode={hologram.mode}
    >
      {webglFailed ? (
        <div className="flex flex-col items-center justify-center w-48 h-48 rounded-full border border-cyan-400/30 bg-slate-900/80 text-center p-4">
          <div className="w-20 h-20 rounded-full border-2 border-cyan-400/60 flex items-center justify-center mb-3">
            <span className="font-display text-sm font-semibold text-cyan-300">HOLO</span>
          </div>
          <span className="text-xs text-slate-300">2D Fallback Mode</span>
        </div>
      ) : (
        <div
          ref={mountRef}
          data-testid="friday-core-canvas"
          className={compact ? 'h-44 w-44 cursor-grab' : 'h-[218px] w-[218px] sm:h-[272px] sm:w-[272px] cursor-grab'}
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
