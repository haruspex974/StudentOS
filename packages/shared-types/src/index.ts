export type PermissionAction =
  | "workspace.view"
  | "workspace.update_settings"
  | "membership.invite"
  | "membership.view"
  | "membership.remove"
  | "batch.create"
  | "batch.view"
  | "batch.update"
  | "batch.archive"
  | "batch.assign_cr"
  | "session.create"
  | "session.update"
  | "session.view"
  | "session.attendance.open"
  | "session.attendance.close"
  | "attendance.submit_self"
  | "attendance.manual_mark"
  | "attendance.view_session_roster"
  | "attendance.view_history"
  | "*";

export * from "./interfaces/auth.interface";
export * from "./interfaces/batch.interface";
export * from "./interfaces/session.interface";
export * from "./interfaces/workspace.interface";
export * from "./interfaces/student.interface";
export * from "./interfaces/import.interface";