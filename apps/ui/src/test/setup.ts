import '@newpaper/ui-kit/test/setup';
import { cleanup } from '@testing-library/react';
import { clearMocks } from '@tauri-apps/api/mocks';
import { afterEach } from 'vitest';

// Las bajas de listen() se resuelven con promesas: se desmonta, se deja que terminen y solo después se limpian los mocks.
afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 0));
  clearMocks();
});
