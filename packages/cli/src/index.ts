#!/usr/bin/env node

/**
 * @autix/cli
 *
 * En sprints futuros este paquete contendrá los comandos reales de
 * administración de Autix Core (registrar Connectors, inspeccionar el
 * Registry, etc. — RFC-000 §13). Sprint 1 solo prueba que un paquete
 * ejecutable (bin) se construye con `tsup`, conserva su shebang, se marca
 * como ejecutable, y resuelve sus dependencias de workspace en runtime.
 */

import { CORE_PACKAGE_NAME, CORE_PACKAGE_VERSION } from '@autix/core';
import { SDK_PACKAGE_NAME, SDK_PACKAGE_VERSION } from '@autix/sdk';

export function renderStatusLine(): string {
  return `${CORE_PACKAGE_NAME}@${CORE_PACKAGE_VERSION} · ${SDK_PACKAGE_NAME}@${SDK_PACKAGE_VERSION}`;
}

const isDirectExecution = import.meta.url === `file://${process.argv[1]}`;

if (isDirectExecution) {
  console.log(`autix-core foundation ok — ${renderStatusLine()}`);
}
