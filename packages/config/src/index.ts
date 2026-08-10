import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PRESET_FILES = [
  "tsconfig/base.json",
  "tsconfig/bun.json",
  "tsconfig/nextjs.json",
  // Named biome.preset.json (not biome.json) so Biome does not treat the
  // nested preset as a root configuration.
  "biome.preset.json",
] as const;

export type PresetFile = (typeof PRESET_FILES)[number];

const packageRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");

/** Loads one of the shared presets and parses it as JSON. */
export function loadPreset(name: PresetFile): unknown {
  return JSON.parse(readFileSync(join(packageRoot, name), "utf8")) as unknown;
}
