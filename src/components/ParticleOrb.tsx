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

function makeSphere(count: number, radius: number, jitter: number) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const r = radius + (Math.random() - 0.5) * jitter;
    positions[i * 3] = Math.cos(theta) * Math.sin(phi) * r;
    positions[i * 3 + 1] = Math.sin(theta) * Math.sin(phi) * r;
    positions[i * 3 + 2] = Math.cos(phi) * r;
    seeds[i] = Math.random() * 1000;
  }

  return { positions, seeds };
}

function makeCloud(count: number, radius: number) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = radius + Math.random() * 1.1;
    positions[i * 3] = Math.cos(theta) * Math.sin(phi) * r;
    positions[i * 3 + 1] = Math.sin(theta) * Math.sin(phi) * r;
    positions[i * 3 + 2] = Math.cos(phi) * r;
    seeds[i] = Math.random() * 1000;
  }

  return { positions, seeds };
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
    const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 8.4;

    const inner = makeSphere(4200, 2.25, 0.05);
    const cloud = makeCloud(3600, 2.55);

    const innerGeometry = new THREE.BufferGeometry();
    innerGeometry.setAttribute("position", new THREE.BufferAttribute(inner.positions.slice(), 3));
    const cloudGeometry = new THREE.BufferGeometry();
    cloudGeometry.setAttribute("position", new THREE.BufferAttribute(cloud.positions.slice(), 3));

    const innerMaterial = new THREE.PointsMaterial({
      size: 0.018,
      color: 0x8fe8ff,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const cloudMaterial = new THREE.PointsMaterial({
      size: 0.012,
      color: 0x58f0d2,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const innerPoints = new THREE.Points(innerGeometry, innerMaterial);
    const cloudPoints = new THREE.Points(cloudGeometry, cloudMaterial);
    scene.add(innerPoints, cloudPoints);

    const glowGeometry = new THREE.RingGeometry(2.35, 2.39, 192);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x58e6ff,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const ring = new THREE.Mesh(glowGeometry, glowMaterial);
    scene.add(ring);

    const updatePositions = (
      geometry: THREE.BufferGeometry,
      original: Float32Array,
      seeds: Float32Array,
      time: number,
      cloudLayer: boolean
    ) => {
      const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
      const array = attribute.array as Float32Array;
      const intensity = statusIntensity(statusRef.current);
      const level = levelRef.current;
      const bands = bandsRef.current;
      const speechBoost = statusRef.current === "speaking" ? 0.65 : 0.12;
      const bandMix = cloudLayer ? bands.treble * 0.7 + bands.mid * 0.3 : bands.bass * 0.62 + bands.mid * 0.38;
      const wave = intensity + Math.max(level, bandMix) * speechBoost;

      for (let i = 0; i < seeds.length; i += 1) {
        const idx = i * 3;
        const x = original[idx];
        const y = original[idx + 1];
        const z = original[idx + 2];
        const seed = seeds[i];
        const noise = Math.sin(time * (cloudLayer ? 1.4 + bands.treble : 1.9 + bands.mid) + seed) * 0.12;
        const ripple = Math.sin(time * (2.4 + bands.bass * 2.1) + seed * 0.07 + y * 2.2) * 0.08;
        const scale = 1 + noise * wave + ripple * level;
        const radialPop = 1 + (cloudLayer ? bands.treble : bands.bass) * 0.16;
        const swirl = Math.sin(time * 0.9 + seed) * 0.018 * wave * (1 + bands.mid);

        array[idx] = x * scale * radialPop + y * swirl;
        array[idx + 1] = y * scale * radialPop - x * swirl;
        array[idx + 2] = z * (1 + noise * wave * 0.72 + bands.treble * 0.07);
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

      updatePositions(innerGeometry, inner.positions, inner.seeds, time, false);
      updatePositions(cloudGeometry, cloud.positions, cloud.seeds, time, true);

      innerPoints.rotation.y = time * 0.08;
      innerPoints.rotation.x = Math.sin(time * 0.2) * 0.08;
      cloudPoints.rotation.y = -time * (0.045 + intensity * 0.035 + bands.treble * 0.05);
      cloudPoints.rotation.z = Math.sin(time * 0.18) * 0.05;
      ring.rotation.z = time * 0.08;
      ring.scale.setScalar(1 + intensity * 0.02 + level * 0.04);

      innerMaterial.opacity = 0.42 + intensity * 0.28 + Math.max(level, bands.bass) * 0.16;
      cloudMaterial.opacity = 0.14 + intensity * 0.24 + Math.max(level, bands.treble) * 0.2;
      innerMaterial.size = 0.014 + intensity * 0.006 + bands.mid * 0.008;
      cloudMaterial.size = 0.008 + intensity * 0.008 + bands.treble * 0.014;
      glowMaterial.opacity = 0.07 + intensity * 0.13 + Math.max(level, bands.bass) * 0.12;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };

    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.position.z = width < 700 ? 9.6 : 8.4;
      camera.updateProjectionMatrix();
    };

    window.addEventListener("resize", resize);
    resize();
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      innerGeometry.dispose();
      cloudGeometry.dispose();
      glowGeometry.dispose();
      innerMaterial.dispose();
      cloudMaterial.dispose();
      glowMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div className="orb-stage" ref={mountRef} aria-hidden="true" />;
}
