import { useEffect, useRef, useState } from "react";

export interface AudioAnalysis {
  level: number;
  bass: number;
  mid: number;
  treble: number;
}

const silentAnalysis: AudioAnalysis = {
  level: 0,
  bass: 0,
  mid: 0,
  treble: 0
};

function average(data: Uint8Array, start: number, end: number) {
  let sum = 0;
  let count = 0;
  for (let i = start; i < end && i < data.length; i += 1) {
    sum += data[i];
    count += 1;
  }
  return count ? Math.min(1, sum / count / 180) : 0;
}

export function useAudioLevel(stream: MediaStream | null) {
  const [analysis, setAnalysis] = useState<AudioAnalysis>(silentAnalysis);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!stream) {
      setAnalysis(silentAnalysis);
      return;
    }

    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.78;
    source.connect(analyser);
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const bass = average(data, 2, 18);
      const mid = average(data, 18, 82);
      const treble = average(data, 82, data.length);
      const level = Math.min(1, bass * 0.48 + mid * 0.34 + treble * 0.18);
      setAnalysis({ level, bass, mid, treble });
      raf = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      void context.close();
      analyserRef.current = null;
    };
  }, [stream]);

  return analysis;
}
