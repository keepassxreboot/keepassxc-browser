const { devices } = require('@playwright/test');

const config = {
    testDir: './tests',
    timeout: 30 * 1000,
    expect: {
        timeout: 5000
    },
    forbidOnly: !!process.env.CI,
    globalSetup: require.resolve('./tests/global-setup'),
    globalTeardown: require.resolve('./tests/global-teardown'),
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'list',
    use: {
        actionTimeout: 0,
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
            },
        },
        {
            name: 'firefox',
            use: {
                ...devices['Desktop Firefox'],
            },
        },
    ],
    testMatch: 'content-script-tests.mjs',
};

module.exports = config;
