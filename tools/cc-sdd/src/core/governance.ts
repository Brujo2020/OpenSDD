import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { GovernanceSettings } from './types.js';

export const defaultGovernanceSettings: GovernanceSettings = {
  mode: 'fluid',
  critical_gates_only: true,
  non_blocking_warnings: true,
};

export const loadGovernanceSettings = async (
  cwd: string = process.cwd(),
  sddDir: string = '.sdd',
): Promise<GovernanceSettings> => {
  const settingsPath = path.join(cwd, sddDir, 'settings', 'governance.json');
  try {
    const content = await readFile(settingsPath, 'utf8');
    const parsed = JSON.parse(content);
    return { ...defaultGovernanceSettings, ...parsed };
  } catch {
    return defaultGovernanceSettings;
  }
};
