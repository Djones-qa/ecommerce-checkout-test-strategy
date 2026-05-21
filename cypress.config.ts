import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:3000',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    fixturesFolder: 'cypress/fixtures',
    screenshotsFolder: 'cypress/screenshots',
    videosFolder: 'cypress/videos',

    // Retry failed tests: 2 retries in CI, 0 locally
    retries: {
      runMode: 2,
      openMode: 0,
    },

    // Viewport defaults — mobile tests override per-spec
    viewportWidth: 1280,
    viewportHeight: 800,

    // Timeouts
    defaultCommandTimeout: 8000,
    requestTimeout: 10000,
    responseTimeout: 10000,
    pageLoadTimeout: 30000,

    // Video recording in CI only
    video: process.env.CI === 'true',
    screenshotOnRunFailure: true,

    env: {
      // Payment gateway sandbox — override via CI secrets
      STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder',
      API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:3001',
    },

    setupNodeEvents(on, config) {
      // Log test results for CI reporting
      on('after:run', (results) => {
        if (results && 'totalFailed' in results) {
          console.log(`\nTotal tests: ${results.totalTests}`);
          console.log(`Passed: ${results.totalPassed}`);
          console.log(`Failed: ${results.totalFailed}`);
          console.log(`Skipped: ${results.totalSkipped}`);
        }
      });

      return config;
    },
  },
});
