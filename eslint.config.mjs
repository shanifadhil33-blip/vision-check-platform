import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Purity boundary for the calculation layer.
 *
 * See AGENTS.md rule 1. Everything under /lib/acuity and /lib/calibration is
 * plain TypeScript that takes numbers and returns numbers, so it can be unit
 * tested with no browser and no React renderer. These rules make that a lint
 * failure rather than a convention.
 */
const pureModuleRules = {
  files: ["lib/acuity/**/*.ts", "lib/calibration/**/*.ts"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [
              "react",
              "react/*",
              "react-dom",
              "react-dom/*",
              "next",
              "next/*",
              "server-only",
              "client-only",
              "@supabase/*",
              "@supabase/supabase-js",
              "@/lib/db",
              "@/lib/db/*",
            ],
            message:
              "AGENTS.md rule 1: /lib/acuity and /lib/calibration are pure TypeScript. No React, no Next, no runtime-environment imports.",
          },
        ],
      },
    ],
    "no-restricted-globals": [
      "error",
      ...[
        "window",
        "document",
        "navigator",
        "screen",
        "location",
        "localStorage",
        "sessionStorage",
        "history",
      ].map((name) => ({
        name,
        message:
          "AGENTS.md rule 1: /lib/acuity and /lib/calibration must not touch the DOM or any browser API. Pass the value in as a number instead.",
      })),
    ],
  },
};

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "next-env.d.ts",
      "supabase/.temp/**",
      "supabase/.branches/**",
    ],
  },
  ...coreWebVitals,
  ...nextTypescript,
  pureModuleRules,
];

export default eslintConfig;
