export type SpecPhase =
  | 'initialized'
  | 'requirements-drafted'
  | 'design-drafted'
  | 'tasks-drafted'
  | 'approved'
  | 'in-progress'
  | 'verified'
  | 'completed';

export interface SpecApprovals {
  requirements: boolean;
  design: boolean;
  tasks: boolean;
}

export interface SpecMetadata {
  name: string;
  version?: string;
  phase: SpecPhase;
  approvals: SpecApprovals;
  language?: string;
  created_at?: string;
  updated_at?: string;
  description?: string;
}

export type TaskStatus = 'completed' | 'in_progress' | 'pending';

export interface TaskItem {
  id: string;
  title: string;
  status: TaskStatus;
  boundary?: string[];
  depends?: string[];
  raw: string;
}

export interface RequirementItem {
  id: string;
  title: string;
  type?: 'ubiquitous' | 'event_driven' | 'state_driven' | 'unwanted' | 'optional';
  acceptanceCriteria: string[];
}

export interface SpecStatus {
  name: string;
  phase: SpecPhase;
  exists: boolean;
  files: {
    brief: boolean;
    requirements: boolean;
    design: boolean;
    tasks: boolean;
    auditReport: boolean;
  };
  requirementsCount: number;
  tasks: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    percent: number;
  };
  approvals: SpecApprovals;
  boundaries: string[];
  isApproved: boolean;
}

export interface GitSettings {
  mode: 'strict' | 'assisted' | 'off';
  branch_prefix: string;
  auto_branch: boolean;
  auto_commit: boolean;
  auto_push: boolean;
  require_approved_spec: boolean;
}

export interface AuditIssue {
  severity: 'critical' | 'warning' | 'info';
  code: string;
  message: string;
  file?: string;
}

export interface RtmEntry {
  requirementId: string;
  title: string;
  mappedTasks: string[];
  verified: boolean;
}

export interface AuditResult {
  feature: string;
  inSync: boolean;
  driftDetected: boolean;
  score: number;
  rtm: RtmEntry[];
  issues: AuditIssue[];
  regulatory?: {
    euAiActArt11: boolean;
    euAiActArt12: boolean;
    euAiActArt14: boolean;
    nistAiRmf: boolean;
    compliancePercent: number;
  };
}

export interface GapAnalysis {
  feature: string;
  impactLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  boundaries: {
    file: string;
    exists: boolean;
    status: 'create' | 'modify';
  }[];
  externalDependencies: string[];
  warnings: string[];
}

export interface DiscoveredProject {
  name: string;
  language: string;
  frameworks: string[];
  packageManager?: string;
  buildTool?: string;
  testFramework?: string;
  sourceDirs: string[];
  testDirs: string[];
  modules: string[];
}
