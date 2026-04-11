import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ScenarioEntry {
  scenarioId: string;
  label: string;
  description: string;
  type: string;
  payload: Record<string, unknown>;
  steps?: Array<{ label: string; action: string; payload: Record<string, unknown> }>;
}

interface ScenarioManifest {
  version: string;
  scenarios: ScenarioEntry[];
}

export interface ScenarioRegistryService {
  list(): ScenarioEntry[];
  getById(scenarioId: string): ScenarioEntry | undefined;
}

export function createScenarioRegistry(dataDir: string): ScenarioRegistryService {
  const manifestPath = join(dataDir, 'scenarios', 'manifest.json');
  const raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as ScenarioManifest;
  const scenarioMap = new Map<string, ScenarioEntry>();

  for (const scenario of raw.scenarios) {
    scenarioMap.set(scenario.scenarioId, scenario);
  }

  return {
    list(): ScenarioEntry[] {
      return [...scenarioMap.values()];
    },
    getById(scenarioId: string): ScenarioEntry | undefined {
      return scenarioMap.get(scenarioId);
    },
  };
}
