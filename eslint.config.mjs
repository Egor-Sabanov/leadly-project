import nextVitals from "eslint-config-next/core-web-vitals";

// Keep this flat config compatible with ESLint 9.21, which does not export
// the newer "eslint/config" helper subpath.
const eslintConfig = [
  ...nextVitals,
  { ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"] },
];

export default eslintConfig;
