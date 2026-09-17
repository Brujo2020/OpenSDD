import { readFile } from 'node:fs/promises';
import path from 'node:path';
export const defaultGovernanceSettings = {
    mode: 'fluid',
    critical_gates_only: true,
    non_blocking_warnings: true,
};
export const loadGovernanceSettings = async (cwd = process.cwd(), sddDir = '.sdd') => {
    const settingsPath = path.join(cwd, sddDir, 'settings', 'governance.json');
    try {
        const content = await readFile(settingsPath, 'utf8');
        const parsed = JSON.parse(content);
        return { ...defaultGovernanceSettings, ...parsed };
    }
    catch {
        return defaultGovernanceSettings;
    }
};
