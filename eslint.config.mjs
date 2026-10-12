import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 기본틀 키트 원본 — 고치지 않는다(게이트 S2 가 정본 해시와 비교). 키트 쪽에서 고친다.
    "src/gb/**",
    "hub/**",
    ".wrangler/**",
    // 반응(주스) 키트 원본 그대로 복사(게이트 = check-juice.mjs) — @ts-nocheck 1줄만 허용(브리프 명시), 그 외 린트 대상 아님.
    "src/lib/juice-kit.js",
  ]),
]);

export default eslintConfig;
