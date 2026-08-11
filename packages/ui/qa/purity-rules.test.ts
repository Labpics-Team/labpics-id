/*
 * Committed RED counterexamples for every purity rule.
 *
 * Closes the Oracle finding "scan exists but sensitivity unproven": each rule
 * is exercised with a fixture that MUST be flagged and a legitimate fixture
 * that MUST pass. If a regex regresses (stops biting), these tests go red —
 * the proof lives in the repo, not in a transient sabotage run.
 */

import { describe, expect, it } from "bun:test";
import {
  findArbitraryValues,
  findDefaultNamespaceUsage,
  findDefaultPaletteUsage,
  findEmoji,
  findForbiddenHues,
  findForeignIconImports,
  findTransitionAll,
  findUngatedDevTooling,
} from "./purity-rules";
import { resolveColor, resolveToken } from "./resolve-color";

describe("arbitrary-value scan sensitivity", () => {
  it("flags bracketed utility values (the token-bypass class)", () => {
    expect(findArbitraryValues(`<div className="bg-[#ff0000] p-4" />`)).toEqual(["bg-[#ff0000]"]);
    expect(findArbitraryValues(`className="p-[5px]"`)).toEqual(["p-[5px]"]);
    expect(findArbitraryValues(`className="text-[17px] font-bold"`)).toEqual(["text-[17px]"]);
    expect(findArbitraryValues("className={`duration-[120ms]`}")).toEqual(["duration-[120ms]"]);
    expect(findArbitraryValues(`class="tracking-[.2em]"`)).toEqual(["tracking-[.2em]"]);
  });

  it("passes token-backed utilities and CSS-variable shorthands", () => {
    expect(
      findArbitraryValues(
        `className="bg-accent-strong text-on-accent min-h-11 duration-(--lab-motion-instant)"`,
      ),
    ).toEqual([]);
    // Plain array indexing in TS code is not a utility class.
    expect(findArbitraryValues(`const x = rows[0]; map[key] = 1;`)).toEqual([]);
  });
});

describe("default-palette scan sensitivity", () => {
  it("flags default Tailwind palette classes (silent no-ops after @theme wipe)", () => {
    expect(findDefaultPaletteUsage(`className="text-neutral-500"`)).toEqual(["text-neutral-500"]);
    expect(findDefaultPaletteUsage(`className="bg-red-600 p-2"`)).toEqual(["bg-red-600"]);
    expect(findDefaultPaletteUsage(`className="border-teal-300"`)).toEqual(["border-teal-300"]);
  });

  it("passes semantic token utilities", () => {
    expect(
      findDefaultPaletteUsage(`className="text-label-s bg-surface-2 border-hairline text-error"`),
    ).toEqual([]);
  });
});

describe("default-namespace scan sensitivity", () => {
  it("flags numeric spacing utilities (the wiped --spacing scale)", () => {
    expect(findDefaultNamespaceUsage(`<div className="px-4 py-2" />`)).toHaveLength(2);
    expect(findDefaultNamespaceUsage(`className="gap-6 mt-8"`)).toHaveLength(2);
    expect(findDefaultNamespaceUsage(`className="h-9 w-64 min-h-11"`)).toHaveLength(3);
  });

  it("flags default type-scale, weight and tracking utilities", () => {
    expect(findDefaultNamespaceUsage(`className="text-sm"`)).toHaveLength(1);
    expect(findDefaultNamespaceUsage(`className="text-2xl font-light"`)).toHaveLength(2);
    expect(findDefaultNamespaceUsage(`className="tracking-widest"`)).toHaveLength(1);
    expect(findDefaultNamespaceUsage(`className="max-w-sm max-w-xl"`)).toHaveLength(2);
  });

  it("flags default transition/duration/opacity/ring utilities (the button.tsx drift class)", () => {
    expect(findDefaultNamespaceUsage(`className="transition-colors"`)).toHaveLength(1);
    expect(findDefaultNamespaceUsage(`className="transition-all duration-150"`)).toHaveLength(2);
    expect(findDefaultNamespaceUsage(`className="opacity-50"`)).toHaveLength(1);
    expect(findDefaultNamespaceUsage(`className="ring-2 ring-offset-2"`)).toHaveLength(2);
    expect(findDefaultNamespaceUsage(`className="rounded-full shadow-lg"`)).toHaveLength(2);
    expect(findDefaultNamespaceUsage(`className="animate-pulse ease-in"`)).toHaveLength(2);
  });

  it("passes the lab-traced utility vocabulary", () => {
    expect(
      findDefaultNamespaceUsage(
        `className="px-lab-16 gap-lab-24 min-h-touch max-w-auth max-w-measure text-label text-body font-medium rounded-md shadow-focus transition-controls scale-press opacity-disabled duration-(--lab-motion-instant) ease-out outline-2 outline-offset-2"`,
      ),
    ).toEqual([]);
    // Prose outside string literals is never scanned.
    expect(findDefaultNamespaceUsage(`// the transition was smooth, top-3 result`)).toEqual([]);
  });
});

describe("transition-all CSS scan sensitivity", () => {
  it("flags transition: all and transition-property: all", () => {
    expect(findTransitionAll(`.btn { transition: all 150ms ease; }`)).toHaveLength(1);
    expect(findTransitionAll(`.x { transition-property: all; }`)).toHaveLength(1);
  });

  it("passes explicit property lists and comments", () => {
    expect(
      findTransitionAll(`.btn { transition: background-color 80ms linear, opacity 80ms; }`),
    ).toEqual([]);
    expect(findTransitionAll(`/* never use transition: all */`)).toEqual([]);
  });
});

describe("forbidden-hue scan sensitivity", () => {
  it("flags teal in TSX classes, CSS values and token names", () => {
    expect(findForbiddenHues(`<p className="text-teal-500" />`)).toHaveLength(1);
    expect(findForbiddenHues(`color: teal;`)).toHaveLength(1);
    expect(findForbiddenHues(`--lab-accent-teal: #0d9488;`)).toHaveLength(1);
  });

  it("passes hue-free source", () => {
    expect(findForbiddenHues(`className="bg-accent-strong text-on-accent"`)).toEqual([]);
  });
});

describe("color resolver correctness (the oracle the contrast checks depend on)", () => {
  it("resolves raw hex, var() chains and color-mix()", () => {
    const tokens = {
      "--base": "#0062cc",
      "--alias": "var(--base)",
      "--hover": "color-mix(in srgb, var(--base) 88%, #000000)",
      "--tint": "color-mix(in srgb, #166534 10%, #ffffff)",
    };
    expect(resolveToken("--base", tokens)).toBe("#0062cc");
    expect(resolveToken("--alias", tokens)).toBe("#0062cc");
    // 0x00·.88=0, 0x62·.88=86=0x56, 0xcc·.88=179≈0xb4
    expect(resolveToken("--hover", tokens)).toBe("#0056b4");
    expect(resolveToken("--tint", tokens)).toBe("#e8f0eb");
  });

  it("throws on unknown tokens, circular references and unsupported syntax", () => {
    expect(() => resolveToken("--nope", {})).toThrow();
    expect(() => resolveToken("--a", { "--a": "var(--b)", "--b": "var(--a)" })).toThrow();
    expect(() => resolveColor("linear-gradient(red, blue)", {})).toThrow();
    expect(() => resolveColor("color-mix(in oklch, #fff 50%, #000)", {})).toThrow();
  });
});

describe("dev-tooling gate — structural, not co-location", () => {
  it("flags an ungated call even when a gate exists elsewhere in the file (the old blind spot)", () => {
    const source = [
      `if (process.env.NODE_ENV === "development") {`,
      `  console.log("gated part");`,
      `}`,
      `import("react-scan").then(({ scan }) => scan({ enabled: true }));`,
    ].join("\n");
    expect(findUngatedDevTooling(source)).not.toEqual([]);
  });

  it("flags a static top-level import regardless of runtime checks", () => {
    const source = [
      `import { scan } from "react-scan";`,
      `if (process.env.NODE_ENV === "development") { scan({ enabled: true }); }`,
    ].join("\n");
    expect(findUngatedDevTooling(source)).toContain(
      "static top-level import of dev tooling (ships unconditionally)",
    );
  });

  it("passes the committed instrumentation-client pattern (dynamic import inside gate)", () => {
    const source = [
      `if (process.env.NODE_ENV === "development") {`,
      `  import("react-scan")`,
      `    .then(({ scan }) => {`,
      `      scan({ enabled: true });`,
      `    })`,
      `    .catch(() => {});`,
      `}`,
    ].join("\n");
    expect(findUngatedDevTooling(source)).toEqual([]);
  });

  it("passes files that only mention the tool in comments", () => {
    const source = [
      `// react-scan is initialized in instrumentation-client.ts`,
      `export const nothing = 1;`,
    ].join("\n");
    expect(findUngatedDevTooling(source)).toEqual([]);
  });
});

describe("icon family purity", () => {
  it("flags every foreign icon family", () => {
    expect(
      findForeignIconImports(`import { GearIcon } from "@radix-ui/react-icons";`),
    ).toHaveLength(1);
    expect(findForeignIconImports(`import { Gear } from "phosphor-react";`)).toHaveLength(1);
    expect(findForeignIconImports(`import { Settings } from "lucide-react";`)).toHaveLength(1);
    expect(findForeignIconImports(`import { CogIcon } from "@heroicons/react";`)).toHaveLength(1);
    expect(findForeignIconImports(`import { FiSettings } from "react-icons/fi";`)).toHaveLength(1);
  });

  it("passes the adopted family and non-icon Radix primitives", () => {
    expect(findForeignIconImports(`import { Flask } from "@labpics/icons";`)).toEqual([]);
    expect(findForeignIconImports(`import { Slot } from "@radix-ui/react-slot";`)).toEqual([]);
  });
});

describe("emoji-as-icon scan", () => {
  it("flags emoji characters in component source", () => {
    expect(findEmoji(`<span>\u{1F512}</span>`)).toHaveLength(1); // lock emoji
    expect(findEmoji(`label: "\u2705 Done"`)).toHaveLength(1); // check mark
  });

  it("passes plain text, arrows and typography", () => {
    expect(findEmoji(`const s = "Sign in — Labpics ID · 4px -> grid";`)).toEqual([]);
  });
});
