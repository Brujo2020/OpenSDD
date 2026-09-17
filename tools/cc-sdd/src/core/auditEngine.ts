import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { AuditIssue, AuditResult, GovernanceMode, RtmEntry } from './types.js';
import {
  getSpecStatus,
  listSpecs,
  parseRequirementsMarkdown,
  parseTasksMarkdown,
  readSpecMetadata,
  resolveSddDir,
} from './specManager.js';
import { getModifiedFiles, isGitRepo } from './git.js';
import { loadGovernanceSettings } from './governance.js';

export const auditFeature = async (
  cwd: string,
  feature: string,
  options: { regulatory?: boolean; sddDir?: string; mode?: GovernanceMode } = {},
): Promise<AuditResult> => {
  const sddDir = options.sddDir ?? (await resolveSddDir(cwd));
  const govSettings = await loadGovernanceSettings(cwd, sddDir);
  const effectiveMode = options.mode ?? govSettings.mode;
  const specDir = path.join(cwd, sddDir, 'specs', feature);
  const issues: AuditIssue[] = [];

  const status = await getSpecStatus(cwd, feature, sddDir);
  if (!status.exists) {
    return {
      feature,
      inSync: false,
      driftDetected: true,
      score: 0,
      rtm: [],
      issues: [
        {
          severity: 'critical',
          code: 'SPEC_NOT_FOUND',
          message: `Specification "${feature}" does not exist in ${sddDir}/specs/`,
        },
      ],
    };
  }

  // 1. Check Documentary Triad files
  if (!status.files.requirements) {
    issues.push({
      severity: 'critical',
      code: 'MISSING_REQUIREMENTS',
      message: 'requirements.md is missing',
      file: 'requirements.md',
    });
  }
  if (!status.files.design) {
    issues.push({
      severity: 'warning',
      code: 'MISSING_DESIGN',
      message: 'design.md is missing',
      file: 'design.md',
    });
  }
  if (!status.files.tasks) {
    issues.push({
      severity: 'warning',
      code: 'MISSING_TASKS',
      message: 'tasks.md is missing',
      file: 'tasks.md',
    });
  }

  // 2. Requirements Traceability Matrix (RTM)
  const rtm: RtmEntry[] = [];
  let reqsList: ReturnType<typeof parseRequirementsMarkdown> = [];
  let tasksList: ReturnType<typeof parseTasksMarkdown> = [];

  if (status.files.requirements) {
    try {
      const reqContent = await readFile(path.join(specDir, 'requirements.md'), 'utf8');
      reqsList = parseRequirementsMarkdown(reqContent);
    } catch {
      // ignore
    }
  }

  if (status.files.tasks) {
    try {
      const taskContent = await readFile(path.join(specDir, 'tasks.md'), 'utf8');
      tasksList = parseTasksMarkdown(taskContent);
    } catch {
      // ignore
    }
  }

  for (const req of reqsList) {
    const matchingTasks = tasksList
      .filter((t) => t.raw.toLowerCase().includes(req.id.toLowerCase()) || t.raw.includes(req.title))
      .map((t) => t.id);

    const isVerified = matchingTasks.length > 0 && matchingTasks.every((tid) => {
      const t = tasksList.find((task) => task.id === tid);
      return t?.status === 'completed';
    });

    rtm.push({
      requirementId: req.id,
      title: req.title,
      mappedTasks: matchingTasks,
      verified: isVerified,
    });

    if (matchingTasks.length === 0 && tasksList.length > 0) {
      issues.push({
        severity: 'warning',
        code: 'UNMAPPED_REQUIREMENT',
        message: `Requirement ${req.id} ("${req.title}") is not mapped to any task in tasks.md`,
        file: 'requirements.md',
      });
    }
  }

  // 3. Check for phantom tasks (tasks that do not map to any requirement)
  if (reqsList.length > 0) {
    for (const task of tasksList) {
      const mapsToAny = reqsList.some(
        (r) => task.raw.toLowerCase().includes(r.id.toLowerCase()) || task.raw.includes(r.title),
      );
      if (!mapsToAny && task.status === 'completed') {
        issues.push({
          severity: 'info',
          code: 'PHANTOM_TASK',
          message: `Task ${task.id} ("${task.title}") has no explicit requirement mapping`,
          file: 'tasks.md',
        });
      }
    }
  }

  // 4. Ambient Code Drift Check
  let driftDetected = false;
  if (isGitRepo(cwd) && status.boundaries.length > 0) {
    const modified = getModifiedFiles(cwd);
    const boundarySet = new Set(status.boundaries.map((b) => path.normalize(b)));
    for (const file of modified) {
      const normalized = path.normalize(file);
      if (!boundarySet.has(normalized) && !normalized.startsWith(sddDir)) {
        driftDetected = true;
        issues.push({
          severity: 'warning',
          code: 'AMBIENT_CODE_DRIFT',
          message: `File "${file}" was modified outside declared boundaries for feature "${feature}"`,
          file,
        });
      }
    }
  }

  // 5. Approvals check
  const meta = await readSpecMetadata(cwd, feature, sddDir);
  if (meta && tasksList.some((t) => t.status !== 'pending') && !status.isApproved) {
    issues.push({
      severity: 'critical',
      code: 'UNAPPROVED_IMPLEMENTATION',
      message: `Implementation started before Documentary Triad approval (Gate 0 violation)`,
      file: 'spec.json',
    });
  }

  // Compute compliance score
  const totalChecks = 4 + (reqsList.length > 0 ? reqsList.length : 1);
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const deductions = criticalCount * 30 + warningCount * 10;
  const score = Math.max(0, Math.min(100, 100 - deductions));

  // 6. Regulatory Framework Checks (EU AI Act & NIST AI RMF)
  let regulatory: AuditResult['regulatory'] = undefined;
  if (options.regulatory) {
    const art11 = status.files.requirements && status.files.design && status.files.tasks;
    const art12 = isGitRepo(cwd);
    const art14 = Boolean(meta?.approvals.requirements && meta?.approvals.design);
    const nist = score >= 70 && criticalCount === 0;

    const checksPassed = [art11, art12, art14, nist].filter(Boolean).length;
    const compliancePercent = Math.round((checksPassed / 4) * 100);

    regulatory = {
      euAiActArt11: art11,
      euAiActArt12: art12,
      euAiActArt14: art14,
      nistAiRmf: nist,
      compliancePercent,
    };
  }

  const inSync =
    effectiveMode === 'fluid'
      ? criticalCount === 0
      : !driftDetected && criticalCount === 0;

  return {
    feature,
    inSync,
    driftDetected,
    score,
    rtm,
    issues,
    regulatory,
  };
};

export const auditAll = async (
  cwd: string,
  options: { regulatory?: boolean; sddDir?: string; mode?: GovernanceMode } = {},
): Promise<{ features: AuditResult[]; overallScore: number; projectInSync: boolean }> => {
  const sddDir = options.sddDir ?? (await resolveSddDir(cwd));
  const specs = await listSpecs(cwd, sddDir);

  if (specs.length === 0) {
    return {
      features: [],
      overallScore: 100,
      projectInSync: true,
    };
  }

  const results = await Promise.all(
    specs.map((spec) => auditFeature(cwd, spec, { ...options, sddDir })),
  );

  const totalScore = results.reduce((acc, r) => acc + r.score, 0);
  const overallScore = Math.round(totalScore / results.length);
  const projectInSync = results.every((r) => r.inSync);

  return {
    features: results,
    overallScore,
    projectInSync,
  };
};
