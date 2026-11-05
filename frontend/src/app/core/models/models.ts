export interface ControlledItem {
  name: string;
  status: 'Active' | 'Inactive';
}

export type RoleType = 'employee' | 'manager';
export type EntryState = 'Draft' | 'Submitted';

export interface UserSession {
  token: string;
  role: RoleType;
  userId: number;
  employeeId?: string | null;
  name: string;
  email: string;
  designation: string;
  expiresIn: number;
  expTimestamp?: number;
  csrfToken?: string;
}

export interface Employee {
  id: string;
  name: string;
  team: string;
  designation: string;
  email?: string;
  managerId?: string;
}

export interface TimesheetEntry {
  id: string;
  empId: string;
  date: string;
  month: string;
  project: string;
  module?: string;
  taskType: string;
  details: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  planned: number;
  actual: number;
  aiHours: number;
  tool: string;
  status: 'Not Started' | 'In Progress' | 'Completed' | 'On Hold' | 'Blocked';
  notes?: string;
  state: EntryState;
  submittedAt?: string;
  createdAt: number;
  updatedAt?: string;

  // Calculated properties
  empName?: string;
  team?: string;
  manual?: number;
  saved?: number;
  savingsPct?: number;
  _dup?: boolean;
  _inc?: boolean;
}

export interface FilterState {
  role: RoleType;
  me: string;
  period: string;
  month: string;
  view: string;
  mTeam: string;
  mEmp: string;
  editId?: string | null;
}

export interface AggMetrics {
  tasks: number;
  planned: number;
  actual: number;
  ai: number;
  manual: number;
  saved: number;
  plannedApp: number;
  completed: number;
  aiTasks: number;
  aiSaved: number;
  aiPlannedApp: number;
  toolCounts: Record<string, number>;
  sumPct: number;
  nPct: number;
  avgSavings: number;
  efficiency: number;
  completionRate: number;
  adoption: number;
  topTool: string;
  topCount: number;
  toolsUsed: string[];
  variance: number;
}

export interface SubStatus {
  status: string;
  wd: number;
  covered: number;
  coverage: number;
  entries: number;
  drafts: number;
  excluded: number;
  last: string;
  filled: Set<string>;
  draftDates: Set<string>;
  wdList: string[];
  missing: number;
}

export interface MetricSummary {
  planned: number;
  actual: number;
  manual: number;
  ai: number;
  saved: number;
  efficiency: number;
  adoption: number;
  tasks: number;
  speedup: number;
}

export interface ToolBreakdown {
  tool: string;
  count: number;
  aiHours: number;
  savedHours: number;
  efficiency: number;
}

export interface SubmissionStatus {
  id: string;
  name: string;
  team: string;
  status: 'Submitted' | 'Partially Submitted' | 'Not Submitted';
  wd: number;
  covered: number;
  missing: number;
  coverage: number;
  entries: number;
  drafts: number;
  excluded: number;
  last: string;
}

export interface ExclusionReportItem {
  empName: string;
  date: string;
  project: string;
  taskType: string;
  details: string;
  planned: number;
  actual: number;
  flag: string;
}

/**
 * Dynamic API endpoint resolution.
 * Automatically adapts to active browser hostname or cloud environment variables without static config files.
 */
const dynamicHost = (typeof window !== 'undefined' && window.location && window.location.hostname)
  ? window.location.hostname
  : '127.0.0.1';

export const API_BASE_URL: string = (typeof window !== 'undefined' && (window as any)?.__env?.API_BASE_URL)
  ? (window as any).__env.API_BASE_URL
  : `http://${dynamicHost}:8000/api`;

export const AUTH_BASE_URL: string = (typeof window !== 'undefined' && (window as any)?.__env?.AUTH_BASE_URL)
  ? (window as any).__env.AUTH_BASE_URL
  : `http://${dynamicHost}:8000/api/auth`;

export const CSRF_HEADER_NAME: string = 'X-CSRF-Token';
export const CSRF_COOKIE_NAME: string = 'csrf_token';

