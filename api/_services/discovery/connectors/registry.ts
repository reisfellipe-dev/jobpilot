/**
 * Registro de conectores (§1).
 *
 * O DiscoveryService só conhece este registro — adicionar uma fonte nova é
 * escrever um conector e registrá-lo aqui. Nenhuma linha do motor muda.
 */
import type { JobSourceConnector, SourceKind } from '../../../../shared/discovery/types.js';
import { greenhouseConnector } from './greenhouse.js';
import { leverConnector } from './lever.js';
import { ashbyConnector } from './ashby.js';
import { arbeitnowConnector, remoteOkConnector, remotiveConnector } from './aggregators.js';

const CONNECTORS: Record<SourceKind, JobSourceConnector> = {
  greenhouse: greenhouseConnector,
  lever: leverConnector,
  ashby: ashbyConnector,
  remotive: remotiveConnector,
  remoteok: remoteOkConnector,
  arbeitnow: arbeitnowConnector,
};

export function getConnector(kind: SourceKind): JobSourceConnector {
  return CONNECTORS[kind];
}

export function listConnectors(): JobSourceConnector[] {
  return Object.values(CONNECTORS);
}

export function isKnownConnector(kind: string): kind is SourceKind {
  return kind in CONNECTORS;
}

/**
 * Fontes que o usuário pode ativar sem configurar nada. São quadros abertos,
 * multiempresa — ficam disponíveis desde o primeiro uso.
 */
export const DEFAULT_AGGREGATORS: SourceKind[] = ['remotive', 'remoteok', 'arbeitnow'];
