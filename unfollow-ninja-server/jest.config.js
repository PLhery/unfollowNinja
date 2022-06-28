module.exports = {
    clearMocks: true,
    collectCoverage: false,
    collectCoverageFrom: ['src/tasks/*.ts'],
    coverageDirectory: 'test-results/coverage',
    coveragePathIgnorePatterns: ['index.ts'],
    coverageReporters: ['lcov'],
    globals: {
        'ts-jest': {
            tsconfig: 'tsconfig.json',
        },
    },
    moduleFileExtensions: ['js', 'ts', 'tsx'],
    reporters: ['default'],
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.spec.+(ts|tsx|js)'],
    verbose: true,
    preset: 'ts-jest',
};
