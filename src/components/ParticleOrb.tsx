import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { AudioAnalysis } from "../hooks/useAudioLevel";
import type { AssistantStatus } from "../types/realtime";

interface ParticleOrbProps {
  status: AssistantStatus;
  audioLevel: number;
  audioAnalysis?: AudioAnalysis;
}

function statusIntensity(status: AssistantStatus) {
  if (status === "speaking") return 1.25;
  if (status === "executing_tool") return 1.05;
  if (status === "thinking") return 0.85;
  if (status === "listening") return 0.62;
  if (status === "connecting") return 0.45;
  if (status === "error") return 0.75;
  return 0.24;
}

type ParticleField = {
  positions: Float32Array;
  seeds: Float32Array;
  weights: Float32Array;
};

type ParticleMode = "core" | "lattice" | "corona" | "dust";

const TWO_PI = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSculpturalCore(count: number, radius: number, jitter: number): ParticleField {
  const random = seededRandom(1701);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const weights = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
    const theta = GOLDEN_ANGLE * i;
    const latitudeRib = Math.pow(0.5 + Math.cos(phi * 18) * 0.5, 4.6);
    const meridianRib = Math.pow(0.5 + Math.cos(theta * 11 + phi * 2.4) * 0.5, 5.2);
    const r = radius + latitudeRib * 0.055 + meridianRib * 0.026 + (random() - 0.5) * jitter;

    positions[i * 3] = Math.cos(theta) * Math.sin(phi) * r;
    positions[i * 3 + 1] = Math.sin(theta) * Math.sin(phi) * r;
    positions[i * 3 + 2] = Math.cos(phi) * r;
    seeds[i] = random() * 1000;
    weights[i] = 0.35 + Math.max(latitudeRib, meridianRib * 0.9) * 0.65;
  }

  return { positions, seeds, weights };
}

function makeCoreLattice(count: number, radius: number): ParticleField {
  const random = seededRandom(4077);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const weights = new Float32Array(count);
  const rings = 18;
  const pointsPerRing = Math.ceil(count / rings);

  for (let i = 0; i < count; i += 1) {
    const ring = i % rings;
    const step = Math.floor(i / rings);
    const angle = (step / pointsPerRing) * TWO_PI + ring * 0.043;
    const inclination = -0.78 + ((ring % 7) / 6) * 1.56;
    const azimuth = (ring / rings) * TWO_PI;
    const r = radius + Math.sin(angle * 3 + ring) * 0.026 + (random() - 0.5) * 0.014;
    const x0 = Math.cos(angle) * r;
    const y0 = Math.sin(angle) * r;
    const cosI = Math.cos(inclination);
    const sinI = Math.sin(inclination);
    const y1 = y0 * cosI;
    const z1 = y0 * sinI;
    const cosA = Math.cos(azimuth);
    const sinA = Math.sin(azimuth);

    positions[i * 3] = x0 * cosA - y1 * sinA;
    positions[i * 3 + 1] = x0 * sinA + y1 * cosA;
    positions[i * 3 + 2] = z1;
    seeds[i] = random() * 1000 + ring * 13;
    weights[i] = 0.45 + (ring % 3) * 0.18;
  }

  return { positions, seeds, weights };
}

function makeCorona(count: number, radius: number, depth: number): ParticleField {
  const random = seededRandom(9121);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const weights = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const theta = random() * TWO_PI;
    const u = random() * 2 - 1;
    const phi = Math.acos(u);
    const knot = Math.max(0, Math.sin(theta * 5.5 + u * 7.2));
    const tornEdge = Math.max(0, Math.sin(theta * 9.2 - u * 4.8 + random() * 0.7));
    const r = radius + Math.pow(random(), 1.55) * depth + knot * 0.22 + tornEdge * 0.14;
    const equatorPull = 1 + Math.sin(theta * 3 + u * 2.2) * 0.055;

    positions[i * 3] = Math.cos(theta) * Math.sin(phi) * r * equatorPull;
    positions[i * 3 + 1] = Math.sin(theta) * Math.sin(phi) * r * (1 - u * 0.035);
    positions[i * 3 + 2] = Math.cos(phi) * r * (0.9 + knot * 0.08);
    seeds[i] = random() * 1000;
    weights[i] = 0.25 + Math.max(knot, tornEdge) * 0.75;
  }

  return { positions, seeds, weights };
}

function makeMagneticDust(count: number, radius: number, depth: number): ParticleField {
  const random = seededRandom(21863);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const weights = new Float32Array(count);
  const streams = 9;

  for (let i = 0; i < count; i += 1) {
    const stream = Math.floor(random() * streams);
    const t = random() * TWO_PI;
    const polarity = stream % 2 === 0 ? 1 : -1;
    const theta = t + stream * 0.68 + (random() - 0.5) * 0.34;
    const latitude = clamp(
      Math.sin(t * 1.8 + stream) * 0.46 + polarity * (0.18 + random() * 0.34),
      -0.92,
      0.92
    );
    const phi = Math.acos(latitude);
    const streamGap = Math.pow(Math.max(0, Math.sin(t * 2.4 + stream * 1.7)), 1.8);
    const r = radius + Math.pow(random(), 0.75) * depth + streamGap * 0.38;

    positions[i * 3] = Math.cos(theta) * Math.sin(phi) * r;
    positions[i * 3 + 1] = Math.sin(theta) * Math.sin(phi) * r;
    positions[i * 3 + 2] = Math.cos(phi) * r * (0.82 + random() * 0.18);
    seeds[i] = random() * 1000 + stream * 29;
    weights[i] = 0.18 + streamGap * 0.82;
  }

  return { positions, seeds, weights };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function ParticleOrb({ status, audioLevel, audioAnalysis }: ParticleOrbProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef(status);
  const levelRef = useRef(audioLevel);
  const bandsRef = useRef<AudioAnalysis>({
    level: audioLevel,
    bass: audioLevel,
    mid: audioLevel,
    treble: audioLevel
  });

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    levelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    bandsRef.current = audioAnalysis ?? {
      level: audioLevel,
      bass: audioLevel,
      mid: audioLevel,
      treble: audioLevel
    };
  }, [audioAnalysis, audioLevel]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 9.2;

    const orbGroup = new THREE.Group();
    scene.add(orbGroup);

    const inner = makeSculpturalCore(10800, 2.12, 0.026);
    const lattice = makeCoreLattice(2600, 2.24);
    const corona = makeCorona(12800, 2.42, 1.02);
    const dust = makeMagneticDust(5200, 3.08, 1.46);

    const innerGeometry = new THREE.BufferGeometry();
    innerGeometry.setAttribute("position", new THREE.BufferAttribute(inner.positions.slice(), 3));
    const latticeGeometry = new THREE.BufferGeometry();
    latticeGeometry.setAttribute("position", new THREE.BufferAttribute(lattice.positions.slice(), 3));
    const coronaGeometry = new THREE.BufferGeometry();
    coronaGeometry.setAttribute("position", new THREE.BufferAttribute(corona.positions.slice(), 3));
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute("position", new THREE.BufferAttribute(dust.positions.slice(), 3));

    const innerMaterial = new THREE.PointsMaterial({
      size: 0.015,
      color: 0x3f4856,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    const latticeMaterial = new THREE.PointsMaterial({
      size: 0.012,
      color: 0x667085,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    const coronaMaterial = new THREE.PointsMaterial({
      size: 0.01,
      color: 0x8a94a6,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    const dustMaterial = new THREE.PointsMaterial({
      size: 0.007,
      color: 0x737985,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    const innerPoints = new THREE.Points(innerGeometry, innerMaterial);
    const latticePoints = new THREE.Points(latticeGeometry, latticeMaterial);
    const coronaPoints = new THREE.Points(coronaGeometry, coronaMaterial);
    const dustPoints = new THREE.Points(dustGeometry, dustMaterial);
    orbGroup.add(dustPoints, coronaPoints, innerPoints, latticePoints);

    const glowGeometry = new THREE.RingGeometry(2.31, 2.35, 224);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x64748b,
      transparent: true,
      opacity: 0.055,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending
    });
    const ring = new THREE.Mesh(glowGeometry, glowMaterial);
    orbGroup.add(ring);

    const rimGeometry = new THREE.RingGeometry(2.68, 2.76, 224);
    const rimMaterial = new THREE.MeshBasicMaterial({
      color: 0x525866,
      transparent: true,
      opacity: 0.05,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending
    });
    const rim = new THREE.Mesh(rimGeometry, rimMaterial);
    rim.rotation.x = Math.PI * 0.5;
    orbGroup.add(rim);

    const updatePositions = (
      geometry: THREE.BufferGeometry,
      original: Float32Array,
      seeds: Float32Array,
      weights: Float32Array,
      time: number,
      mode: ParticleMode
    ) => {
      const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
      const array = attribute.array as Float32Array;
      const intensity = statusIntensity(statusRef.current);
      const level = levelRef.current;
      const bands = bandsRef.current;
      const speechBoost = statusRef.current === "speaking" ? 0.94 : 0.2;
      const isOuter = mode === "corona" || mode === "dust";
      const bandMix = isOuter ? bands.treble * 0.58 + bands.mid * 0.42 : bands.bass * 0.66 + bands.mid * 0.34;
      const wave = intensity + Math.max(level, bandMix) * speechBoost;

      for (let i = 0; i < seeds.length; i += 1) {
        const idx = i * 3;
        const x = original[idx];
        const y = original[idx + 1];
        const z = original[idx + 2];
        const seed = seeds[i];
        const weight = weights[i];
        const theta = thetaFromPoint(x, y);
        const distance = Math.sqrt(x * x + y * y + z * z) || 1;
        const nx = x / distance;
        const ny = y / distance;
        const nz = z / distance;
        const harmonic = Math.sin(theta * 8 + z * 1.3 + time * (0.65 + bands.mid) + seed * 0.011);
        const micro = Math.sin(time * (1.9 + bands.bass * 2.1) + seed * 0.053 + y * 2.5);
        const eddy = Math.sin(theta * 5 - time * (1.15 + bands.treble * 1.9) + seed * 0.017);

        let radial = 1;
        let tangent = 0;
        let lift = 0;
        let shear = 0;

        if (mode === "core") {
          radial = 1 + (harmonic * 0.018 + micro * 0.014) * wave * (0.35 + weight);
          tangent = Math.sin(time * 0.8 + seed) * 0.006 * wave;
          lift = Math.cos(time * 1.1 + seed * 0.09) * bands.mid * 0.014;
        } else if (mode === "lattice") {
          radial = 1 + Math.sin(time * 1.55 + seed * 0.04) * 0.016 * wave + bands.bass * 0.025;
          tangent = (0.018 + bands.mid * 0.03) * Math.sin(time * 0.9 + seed * 0.03);
          lift = harmonic * 0.03 * (0.45 + bands.treble);
        } else if (mode === "corona") {
          const flare = Math.max(0, eddy) * (0.08 + bands.treble * 0.18) * (0.45 + weight);
          radial = 1 + (micro * 0.045 + harmonic * 0.026) * wave + flare;
          tangent = (0.04 + bands.mid * 0.07) * Math.sin(time * 1.2 + seed * 0.025) * (0.5 + weight);
          lift = Math.cos(theta * 4 + time * 1.4 + seed * 0.02) * bands.treble * 0.11;
          shear = eddy * 0.075 * wave * weight;
        } else {
          const streamPulse = Math.max(0, Math.sin(time * 0.72 + seed * 0.021));
          radial = 1 + (0.035 + streamPulse * 0.07) * wave * weight + micro * 0.035 * level;
          tangent = (0.09 + bands.treble * 0.12) * Math.sin(time * 0.58 + seed * 0.01) * (0.25 + weight);
          lift = Math.sin(time * 0.42 + theta * 3 + seed * 0.015) * 0.18 * (0.25 + bands.mid) * weight;
          shear = Math.cos(time * 0.5 + z * 1.7 + seed * 0.02) * 0.11 * weight;
        }

        const tx = -ny;
        const ty = nx;

        array[idx] = x * radial + tx * tangent + nx * shear;
        array[idx + 1] = y * radial + ty * tangent + ny * shear;
        array[idx + 2] = z * radial + nz * lift;
      }

      attribute.needsUpdate = true;
    };

    let raf = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      const time = clock.getElapsedTime();
      const intensity = statusIntensity(statusRef.current);
      const level = levelRef.current;
      const bands = bandsRef.current;

      updatePositions(innerGeometry, inner.positions, inner.seeds, inner.weights, time, "core");
      updatePositions(latticeGeometry, lattice.positions, lattice.seeds, lattice.weights, time * 1.08, "lattice");
      updatePositions(coronaGeometry, corona.positions, corona.seeds, corona.weights, time, "corona");
      updatePositions(dustGeometry, dust.positions, dust.seeds, dust.weights, time * 0.78, "dust");

      orbGroup.rotation.y = Math.sin(time * 0.07) * 0.12;
      orbGroup.rotation.x = Math.sin(time * 0.11) * 0.035;
      innerPoints.rotation.y = time * 0.036;
      innerPoints.rotation.x = Math.sin(time * 0.18) * 0.045;
      latticePoints.rotation.y = -time * (0.052 + bands.mid * 0.024);
      latticePoints.rotation.z = time * 0.032;
      coronaPoints.rotation.y = -time * (0.046 + intensity * 0.032 + bands.treble * 0.05);
      coronaPoints.rotation.z = Math.sin(time * 0.16) * 0.068;
      dustPoints.rotation.y = time * (0.022 + bands.treble * 0.025);
      dustPoints.rotation.z = -time * (0.032 + intensity * 0.012);
      ring.rotation.z = time * 0.062;
      rim.rotation.y = time * 0.038;
      ring.scale.setScalar(1 + intensity * 0.024 + level * 0.055);
      rim.scale.setScalar(1 + intensity * 0.035 + bands.treble * 0.08);

      innerMaterial.opacity = 0.58 + intensity * 0.2 + Math.max(level, bands.bass) * 0.14;
      latticeMaterial.opacity = 0.32 + intensity * 0.16 + bands.mid * 0.16;
      coronaMaterial.opacity = 0.16 + intensity * 0.13 + Math.max(level, bands.treble) * 0.16;
      dustMaterial.opacity = 0.09 + intensity * 0.07 + bands.treble * 0.1;
      innerMaterial.size = 0.012 + intensity * 0.004 + bands.mid * 0.006;
      latticeMaterial.size = 0.008 + intensity * 0.004 + Math.max(bands.bass, bands.mid) * 0.006;
      coronaMaterial.size = 0.005 + intensity * 0.006 + bands.treble * 0.014;
      dustMaterial.size = 0.0035 + bands.treble * 0.009 + level * 0.004;
      glowMaterial.opacity = 0.035 + intensity * 0.045 + Math.max(level, bands.bass) * 0.06;
      rimMaterial.opacity = 0.028 + intensity * 0.04 + bands.treble * 0.06;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };

    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.position.z = width < 700 ? 11.8 : width < 1100 ? 10.1 : 9.2;
      orbGroup.scale.setScalar(width < 700 ? 0.84 : width < 1100 ? 0.94 : 1);
      camera.updateProjectionMatrix();
    };

    window.addEventListener("resize", resize);
    resize();
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      innerGeometry.dispose();
      latticeGeometry.dispose();
      coronaGeometry.dispose();
      dustGeometry.dispose();
      glowGeometry.dispose();
      rimGeometry.dispose();
      innerMaterial.dispose();
      latticeMaterial.dispose();
      coronaMaterial.dispose();
      dustMaterial.dispose();
      glowMaterial.dispose();
      rimMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div className="orb-stage" ref={mountRef} aria-hidden="true" />;
}

function thetaFromPoint(x: number, y: number) {
  return Math.atan2(y, x);
}
