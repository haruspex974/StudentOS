import { clearStoredToken, getStoredToken } from "./session";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthWorkspace {
  id: string;
  name: string;
}

export interface AuthResult {
  user: AuthUser;
  workspace?: AuthWorkspace;
  accessToken: string;
  refreshToken: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface SignupPayload {
  email: string;
  password: string;
  name: string;
  workspaceName: string;
}

export interface CRBatchSummary {
  batchId: string;
  batchName: string;
}

export interface MembershipSummary {
  membershipId: string;
  workspaceId: string;
  workspaceName: string;
  role: "MENTOR" | "STUDENT";
  isCR: boolean;
  crBatches: CRBatchSummary[];
}

export interface CurrentUserResult {
  user: AuthUser;
  activeWorkspaceId: string | null;
  memberships: MembershipSummary[];
}

/**
 * A 401 only means "your session is no longer valid" when we actually sent a token —
 * a fresh login attempt with the wrong password also 401s, and that's a normal, local
 * form error, not a session expiry. This is the shared trigger for both cases below.
 */
function handleSessionExpired(hadToken: boolean) {
  if (!hadToken || typeof window === "undefined") {
    return;
  }
  clearStoredToken();
  if (!window.location.pathname.startsWith("/login")) {
    window.location.href = "/login?reason=session-expired";
  }
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const token = getStoredToken();
  let response: Response;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    response = await fetch(`${API_BASE_URL}/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0);
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401) {
      handleSessionExpired(Boolean(token));
    }
    throw new ApiError(
      payload?.error?.message ?? "Something went wrong. Please try again.",
      response.status,
      payload?.error?.code
    );
  }

  return payload?.data as T;
}

function getJson<T>(path: string): Promise<T> {
  return request<T>("GET", path);
}

function postJson<T>(path: string, body?: unknown): Promise<T> {
  return request<T>("POST", path, body);
}

function patchJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>("PATCH", path, body);
}

function deleteJson<T>(path: string): Promise<T> {
  return request<T>("DELETE", path);
}

export function login(payload: LoginPayload): Promise<AuthResult> {
  return postJson<AuthResult>("/auth/login", payload);
}

export function signup(payload: SignupPayload): Promise<AuthResult> {
  return postJson<AuthResult>("/auth/signup", payload);
}

export function logout(): Promise<void> {
  return postJson<void>("/auth/logout");
}

export function getCurrentUser(): Promise<CurrentUserResult> {
  return getJson<CurrentUserResult>("/auth/me");
}

export function forgotPassword(email: string): Promise<{ message: string }> {
  return postJson<{ message: string }>("/auth/forgot-password", { email });
}

export function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  return postJson<{ message: string }>("/auth/reset-password", { token, newPassword });
}

export interface Batch {
  id: string;
  name: string;
  startDate: string;
  endDate: string | null;
  isArchived: boolean;
  lateThresholdMinsOverride: number | null;
  attendanceDurationMinsOverride: number | null;
}

export type SessionStatus = "SCHEDULED" | "STARTED" | "ENDED" | "CANCELLED";

export interface SessionSummary {
  id: string;
  batchId: string;
  title: string;
  scheduledStart: string;
  scheduledEnd: string;
  meetLink: string | null;
  status: SessionStatus;
  attendanceOpenedAt: string | null;
  attendanceClosedAt: string | null;
  currentCode: string | null;
}

export type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";
export type AttendanceMethod = "SELF_SUBMITTED" | "MANUAL";

export interface AttendanceRosterItem {
  studentBatchMembershipId: string;
  userId: string;
  name: string;
  email: string;
  isCR: boolean;
  attendance: {
    id: string;
    status: AttendanceStatus;
    method: AttendanceMethod;
    submittedAt: string | null;
    manualReason: string | null;
    markedBy: { id: string; name: string } | null;
  } | null;
}

export type BatchStatusFilter = "active" | "archived" | "all";

export function listBatches(status: BatchStatusFilter = "active"): Promise<Batch[]> {
  return getJson<Batch[]>(`/batches?status=${status}`);
}

export interface BatchPayload {
  name: string;
  startDate: string;
  endDate?: string | null;
  lateThresholdMinsOverride?: number | null;
  attendanceDurationMinsOverride?: number | null;
}

export function createBatch(payload: BatchPayload): Promise<Batch> {
  return postJson<Batch>("/batches", payload);
}

export function updateBatch(batchId: string, payload: Partial<BatchPayload>): Promise<Batch> {
  return patchJson<Batch>(`/batches/${batchId}`, payload);
}

export function listSessions(batchId: string): Promise<SessionSummary[]> {
  return getJson<SessionSummary[]>(`/batches/${batchId}/sessions`);
}

export type SessionType = "REGULAR" | "MAKEUP" | "EXAM";

export interface CreateSessionPayload {
  title: string;
  scheduledStart: string;
  scheduledEnd: string;
  meetLink?: string;
  description?: string;
  type?: SessionType;
}

export interface UpdateSessionPayload {
  title?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  meetLink?: string | null;
  description?: string | null;
  type?: SessionType;
}

// These two endpoints only return the fields they touched, not a full SessionSummary —
// callers should re-fetch listSessions() afterwards rather than trust this as complete.
export interface CreateSessionResult {
  id: string;
  batchId: string;
  title: string;
  status: SessionStatus;
  scheduledStart: string;
  scheduledEnd: string;
}

export interface UpdateSessionResult {
  id: string;
  title: string;
  scheduledStart: string;
  scheduledEnd: string;
  meetLink: string | null;
  description: string | null;
  type: SessionType;
}

export function createSession(batchId: string, payload: CreateSessionPayload): Promise<CreateSessionResult> {
  return postJson<CreateSessionResult>(`/batches/${batchId}/sessions`, payload);
}

export function updateSession(sessionId: string, payload: UpdateSessionPayload): Promise<UpdateSessionResult> {
  return patchJson<UpdateSessionResult>(`/sessions/${sessionId}`, payload);
}

export function cancelSession(sessionId: string): Promise<{ id: string; status: SessionStatus }> {
  return postJson<{ id: string; status: SessionStatus }>(`/sessions/${sessionId}/cancel`, {});
}

export interface SessionDetail {
  id: string;
  batchId: string;
  title: string;
  description: string | null;
  status: SessionStatus;
  scheduledStart: string;
  scheduledEnd: string;
  meetLink: string | null;
  type: SessionType;
  attendanceOpenedAt: string | null;
  attendanceClosedAt: string | null;
  /** Only present for MENTOR — the backend omits this field entirely for STUDENT. */
  currentCode?: string | null;
}

export function getSession(sessionId: string): Promise<SessionDetail> {
  return getJson<SessionDetail>(`/sessions/${sessionId}`);
}

// The open/close endpoints only return the fields they touched, keyed by `sessionId`
// (not `id`) — callers must merge these into the existing session, not replace it.
export interface AttendanceWindowResult {
  sessionId: string;
  status: SessionStatus;
  attendanceOpenedAt?: string;
  attendanceClosedAt?: string;
  currentCode: string | null;
}

export function openAttendanceWindow(sessionId: string): Promise<AttendanceWindowResult> {
  return postJson<AttendanceWindowResult>(`/sessions/${sessionId}/attendance/open`, {});
}

export function closeAttendanceWindow(sessionId: string): Promise<AttendanceWindowResult> {
  return postJson<AttendanceWindowResult>(`/sessions/${sessionId}/attendance/close`, {});
}

export function getSessionRoster(sessionId: string): Promise<AttendanceRosterItem[]> {
  return getJson<AttendanceRosterItem[]>(`/sessions/${sessionId}/attendance`);
}

export interface ManualMarkPayload {
  studentBatchMembershipId: string;
  status: AttendanceStatus;
  manualReason: string;
}

export interface AttendanceRecord {
  id: string;
  status: AttendanceStatus;
  method: AttendanceMethod;
  submittedAt?: string;
}

export function manualMarkAttendance(sessionId: string, payload: ManualMarkPayload): Promise<AttendanceRecord> {
  return postJson<AttendanceRecord>(`/sessions/${sessionId}/attendance/manual`, payload);
}

export function submitAttendance(sessionId: string, code: string): Promise<AttendanceRecord> {
  return postJson<AttendanceRecord>(`/sessions/${sessionId}/attendance/submit`, { code });
}

export type MembershipRole = "MENTOR" | "STUDENT";

export interface InviteMemberPayload {
  email: string;
  name: string;
  role: MembershipRole;
}

export interface InviteMemberResult {
  id: string;
  role: MembershipRole;
  user: AuthUser;
}

export function inviteMember(payload: InviteMemberPayload): Promise<InviteMemberResult> {
  return postJson<InviteMemberResult>("/workspace/members/invite", payload);
}

export type MembershipStatus = "ACTIVE" | "INACTIVE" | "INVITED";

export interface Member {
  id: string;
  role: MembershipRole;
  status: MembershipStatus;
  user: AuthUser;
}

export function listMembers(): Promise<Member[]> {
  return getJson<Member[]>("/workspace/members?page=1&limit=100");
}

export function removeMember(membershipId: string): Promise<null> {
  return deleteJson<null>(`/workspace/members/${membershipId}`);
}

export interface Workspace {
  id: string;
  name: string;
  timezone: string;
  settings: {
    defaultAttendanceDurationMins: number;
    lateThresholdMins: number;
  };
}

export function getWorkspace(): Promise<Workspace> {
  return getJson<Workspace>("/workspace");
}

export interface UpdateWorkspaceSettingsPayload {
  timezone?: string;
  defaultAttendanceDurationMins?: number;
  lateThresholdMins?: number;
}

export function updateWorkspaceSettings(payload: UpdateWorkspaceSettingsPayload): Promise<Workspace> {
  return patchJson<Workspace>("/workspace/settings", payload);
}

export interface BatchDetails extends Batch {
  metrics: {
    totalStudents: number;
    totalCRs: number;
    totalSessions: number;
  };
}

export function getBatch(batchId: string): Promise<BatchDetails> {
  return getJson<BatchDetails>(`/batches/${batchId}`);
}

export function archiveBatch(batchId: string): Promise<Batch> {
  return postJson<Batch>(`/batches/${batchId}/archive`);
}

export interface BatchStudent {
  batchMembershipId: string;
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  isCR: boolean;
}

export function listBatchStudents(batchId: string): Promise<BatchStudent[]> {
  return getJson<BatchStudent[]>(`/batches/${batchId}/students?page=1&limit=100`);
}

export function enrollStudent(batchId: string, membershipId: string, isCR = false): Promise<BatchStudent> {
  return postJson<BatchStudent>(`/batches/${batchId}/students`, { membershipId, isCR });
}

export function removeStudent(batchId: string, batchMembershipId: string): Promise<null> {
  return deleteJson<null>(`/batches/${batchId}/students/${batchMembershipId}`);
}

export interface BatchMembershipUpdateResult {
  id: string;
  batchId: string;
  membershipId: string;
  isCR: boolean;
  revokedAt: string | null;
}

/** Promote or demote a student to/from Class Representative for a batch. */
export function setBatchMemberCR(
  batchId: string,
  batchMembershipId: string,
  isCR: boolean
): Promise<BatchMembershipUpdateResult> {
  return patchJson<BatchMembershipUpdateResult>(`/batches/${batchId}/members/${batchMembershipId}`, { isCR });
}

export interface MyBatch {
  batchMembershipId: string;
  batchId: string;
  batchName: string;
  isCR: boolean;
  startDate: string;
  endDate: string | null;
  isArchived: boolean;
}

/** The current user's own batch enrollments — used by student-facing pages. */
export function getMyBatches(): Promise<MyBatch[]> {
  return getJson<MyBatch[]>("/workspace/my-batches");
}

export interface AttendanceHistoryItem {
  id: string;
  sessionId: string;
  sessionTitle: string;
  sessionDate: string;
  status: AttendanceStatus;
  method: AttendanceMethod;
  submittedAt: string | null;
  manualReason: string | null;
}

export function getStudentAttendanceHistory(batchMembershipId: string): Promise<AttendanceHistoryItem[]> {
  return getJson<AttendanceHistoryItem[]>(`/students/${batchMembershipId}/attendance`);
}

export type HireStatus = "EMPLOYED" | "JOB_SEEKING" | "FREELANCING" | "STUDENT_ONLY";
export type JobType = "FULL_TIME" | "PART_TIME" | "INTERNSHIP" | "FREELANCE" | "NOT_LOOKING";
export type WorkplacePreference = "REMOTE" | "ONSITE" | "HYBRID" | "NO_PREFERENCE";

export interface StudentProfile {
  membershipId: string;
  phone: string | null;
  address: string | null;
  avatarUrl: string | null;
  courseName: string | null;
  specialization: string | null;
  skills: string[];
  hireStatus: HireStatus;
  jobType: JobType;
  workplacePreference: WorkplacePreference;
  currentEmployer: string | null;
  currentPosition: string | null;
  portfolioUrl: string | null;
  linkedinUrl: string | null;
}

export function getStudentProfile(membershipId: string): Promise<StudentProfile> {
  return getJson<StudentProfile>(`/students/${membershipId}/profile`);
}

export type UpdateStudentProfilePayload = Partial<Omit<StudentProfile, "membershipId">>;

export function updateStudentProfile(
  membershipId: string,
  payload: UpdateStudentProfilePayload
): Promise<StudentProfile> {
  return patchJson<StudentProfile>(`/students/${membershipId}/profile`, payload);
}
