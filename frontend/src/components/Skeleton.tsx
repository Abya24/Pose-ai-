import React from "react";
import { View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";

import { BONES, type Person } from "@/src/pose/match";
import { colors } from "@/src/theme";

type Props = {
  persons: Person[];
  width: number;
  height: number;
  color?: string;
  strokeWidth?: number;
  // contain: fit the figures into the box (reference drawings).
  // raw: x/y are already 0..1 of the box (live landmarks mapped to the preview).
  mode?: "contain" | "raw";
  padding?: number;
  boneColors?: Record<string, string>;
  minVisibility?: number;
};

const BONE_KEY: Record<string, string> = { "11-13": "lUA", "13-15": "lFA", "12-14": "rUA", "14-16": "rFA", "23-25": "lTh", "25-27": "lSh", "24-26": "rTh", "26-28": "rSh" };

export function SkeletonView({ persons, width, height, color = colors.onSurface, strokeWidth = 4, mode = "contain", padding = 0.1, boneColors, minVisibility = 0.5 }: Props) {
  let map = (p: [number, number]) => [p[0] * width, p[1] * height];
  let headR = width * 0.03;
  if (mode === "contain") {
    const all = persons.flatMap((p) => Object.values(p));
    const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys) - 0.06, maxY = Math.max(...ys);
    const bw = maxX - minX || 1, bh = maxY - minY || 1;
    const s = Math.min((width * (1 - 2 * padding)) / bw, (height * (1 - 2 * padding)) / bh);
    const ox = (width - bw * s) / 2, oy = (height - bh * s) / 2;
    map = (p) => [ox + (p[0] - minX) * s, oy + (p[1] - minY) * s];
    headR = 0.055 * s;
  }
  return (
    <View style={{ width, height }} pointerEvents="none">
    <Svg width={width} height={height}>
      {persons.map((p, pi) => (
        <React.Fragment key={pi}>
          {BONES.map(([a, b]) => {
            const pa = p[a], pb = p[b];
            if (!pa || !pb || (pa[2] ?? 1) < minVisibility || (pb[2] ?? 1) < minVisibility) return null;
            const [x1, y1] = map([pa[0], pa[1]]);
            const [x2, y2] = map([pb[0], pb[1]]);
            const c = boneColors?.[BONE_KEY[`${a}-${b}`]] ?? color;
            return <Line key={`${a}-${b}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth={strokeWidth} strokeLinecap="round" />;
          })}
          {p[0] && (p[0][2] ?? 1) >= minVisibility ? (
            (() => {
              const [x, y] = map([p[0][0], p[0][1]]);
              return <Circle cx={x} cy={y} r={mode === "contain" ? headR : Math.max(8, strokeWidth * 3)} stroke={boneColors?.head ?? color} strokeWidth={strokeWidth} fill="none" />;
            })()
          ) : null}
          {mode === "raw" &&
            [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].map((i) => {
              const q = p[i];
              if (!q || (q[2] ?? 1) < minVisibility) return null;
              const [x, y] = map([q[0], q[1]]);
              return <Circle key={i} cx={x} cy={y} r={strokeWidth * 1.1} fill={color} />;
            })}
        </React.Fragment>
      ))}
    </Svg>
    </View>
  );
}
