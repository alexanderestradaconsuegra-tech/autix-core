import { describe, expect, it } from 'vitest';
import { toConnectorId } from '@autix/contracts';

import { InMemoryConnectorDirectory } from './in-memory-connector-directory.js';
import type { ConnectorPort } from './connector-port.js';

function fakePort(): ConnectorPort {
  return {
    healthCheck: () => Promise.resolve({ status: 'ok' }),
    invoke: () => Promise.resolve({ success: true, output: {} }),
  };
}

describe('InMemoryConnectorDirectory', () => {
  it('returns undefined for a connectorId nothing was registered for', () => {
    const directory = new InMemoryConnectorDirectory();

    expect(directory.resolve(toConnectorId('campolac'))).toBeUndefined();
  });

  it('resolves the exact port that was registered for a connectorId', () => {
    const directory = new InMemoryConnectorDirectory();
    const port = fakePort();

    directory.register(toConnectorId('campolac'), port);

    expect(directory.resolve(toConnectorId('campolac'))).toBe(port);
  });

  it('registering again for the same connectorId replaces the previous port', () => {
    const directory = new InMemoryConnectorDirectory();
    const first = fakePort();
    const second = fakePort();

    directory.register(toConnectorId('campolac'), first);
    directory.register(toConnectorId('campolac'), second);

    expect(directory.resolve(toConnectorId('campolac'))).toBe(second);
  });
});
