"use client";

/*
 * React dev tooling gate (DESIGN.md §6).
 *
 * react-scan runs ONLY in development builds: the NODE_ENV check is a
 * build-time constant for Next.js, so the dynamic import (and the react-scan
 * bundle) is dead-code-eliminated from production output. The QA rubric (G1)
 * fails if any react-scan/react-doctor reference appears without this gate.
 */

import { useEffect } from "react";

export function DevTooling() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      import("react-scan")
        .then(({ scan }) => {
          scan({ enabled: true });
        })
        .catch(() => {
          // Dev-only aid: never break the app if the tool fails to load.
        });
    }
  }, []);

  return null;
}
