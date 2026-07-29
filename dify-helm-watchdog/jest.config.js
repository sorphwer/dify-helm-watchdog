const nextJest = require("next/jest");

const createJestConfig = nextJest({
  dir: "./",
});

// sanitize-html and its parser chain ship ESM only. next/jest leaves all of
// node_modules untransformed, so importing them throws at parse time.
const ESM_ONLY_DEPENDENCIES = [
  "sanitize-html",
  "htmlparser2",
  "domhandler",
  "domutils",
  "dom-serializer",
  "domelementtype",
  "entities",
  "parse-srcset",
  "is-plain-object",
  "deepmerge",
];

// pnpm stores packages as node_modules/.pnpm/<name>@<version>/node_modules/<name>.
const PNPM_ESM_PATTERN = `/node_modules/\\.pnpm/(?!(${ESM_ONLY_DEPENDENCIES.join("|")})@)`;
const NPM_ESM_PATTERN = `/node_modules/(?!\\.pnpm/)(?!(${ESM_ONLY_DEPENDENCIES.join("|")})/)`;

const customJestConfig = {
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

// next/jest replaces transformIgnorePatterns wholesale, so patch the resolved
// config instead of passing it through customJestConfig.
module.exports = async () => {
  const config = await createJestConfig(customJestConfig)();
  config.transformIgnorePatterns = [
    PNPM_ESM_PATTERN,
    NPM_ESM_PATTERN,
    ...config.transformIgnorePatterns.filter(
      (pattern) => !pattern.startsWith("/node_modules/"),
    ),
  ];
  return config;
};
