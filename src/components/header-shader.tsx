import { MeshGradient, Shader, SimplexNoise } from "shaders/react";

// Quiet blues around the board accent. Every stop keeps the muted subtitle at 4.5:1 or more.
const LIGHT_STOPS = [
  { color: "#f5f8ff", position: 0 },
  { color: "#dce7fd", position: 0.4 },
  { color: "#ebe8fb", position: 0.7 },
  { color: "#f2f6fe", position: 1 },
];
const DARK_STOPS = [
  { color: "#0f1115", position: 0 },
  { color: "#16213a", position: 0.4 },
  { color: "#1c2d52", position: 0.7 },
  { color: "#18172b", position: 1 },
];

/**
 * WebGPU mesh gradient behind the app header. Browsers without WebGPU keep the
 * transparent canvas, so the CSS gradient on `.header-band` shows instead.
 */
export default function HeaderShader({ dark, still }: { dark: boolean; still: boolean }) {
  return (
    <Shader className="header-shader" disableTelemetry aria-hidden="true">
      <MeshGradient
        stops={dark ? DARK_STOPS : LIGHT_STOPS}
        colorSpace="oklab"
        count={5}
        smoothness={3}
        drift={0.45}
        swirl={0.15}
        speed={still ? 0 : 0.2}
      />
      <SimplexNoise scale={3} speed={0} opacity={0.06} blendMode="softLight" />
    </Shader>
  );
}
