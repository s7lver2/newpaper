import { spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { startFixtureServer } from './fixtures/server';

const APP = fileURLToPath(new URL('../src-tauri/target/debug/np-app.exe', import.meta.url));
const EDGE_DRIVER = fileURLToPath(new URL('./.tmp/msedgedriver.exe', import.meta.url));
let driver: ChildProcess | undefined;
let fixtures: Server | undefined;

export const config: WebdriverIO.Config = {
  runner: 'local',
  hostname: '127.0.0.1',
  port: 4444,
  specs: ['./specs/**/*.e2e.ts'],
  maxInstances: 1,
  capabilities: [{ 'tauri:options': { application: APP } } as WebdriverIO.Capabilities],
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { timeout: 120_000 },
  onPrepare: async () => {
    fixtures = await startFixtureServer();
  },
  beforeSession: () => {
    driver = spawn('tauri-driver', ['--native-driver', EDGE_DRIVER], {
      stdio: 'inherit',
      env: {
        ...process.env,
        NP_FAKE_TOR: '1',
        // localhost es "tercero" para una página servida en 127.0.0.1; el cosmético oculta .np-test-ad
        NP_TEST_EXTRA_RULES: '||localhost^$third-party\n127.0.0.1##.np-test-ad',
      },
    });
  },
  afterSession: () => driver?.kill(),
  onComplete: () => fixtures?.close(),
};
