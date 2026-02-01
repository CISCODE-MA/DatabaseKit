/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
  collectCoverageFrom: ["**/*.(t|j)s", "!**/index.ts", "!**/*.d.ts"],
  coverageDirectory: "../coverage",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@adapters/(.*)$": "<rootDir>/adapters/$1",
    "^@config/(.*)$": "<rootDir>/config/$1",
    "^@contracts/(.*)$": "<rootDir>/contracts/$1",
    "^@filters/(.*)$": "<rootDir>/filters/$1",
    "^@middleware/(.*)$": "<rootDir>/middleware/$1",
    "^@services/(.*)$": "<rootDir>/services/$1",
    "^@utils/(.*)$": "<rootDir>/utils/$1",
  },
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
