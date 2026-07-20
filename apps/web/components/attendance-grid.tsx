"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  ApiError,
  AttendanceRosterItem,
  AttendanceStatus,
  getSessionRoster,
  manualMarkAttendance,
} from "@/lib/api-client";
import { notify } from "@/lib/toast";
import styles from "./attendance-grid.module.css";

const STATUS_OPTIONS: AttendanceStatus[] = ["PRESENT", "LATE", "ABSENT", "EXCUSED"];

interface RowState {
  status: AttendanceStatus | "";
  reason: string;
  isSaving: boolean;
}

interface AttendanceGridProps {
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function AttendanceGrid({ sessionId, isOpen, onClose }: AttendanceGridProps) {
  const [roster, setRoster] = useState<AttendanceRosterItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    getSessionRoster(sessionId)
      .then((result) => {
        if (cancelled) return;
        setRoster(result);
        setRows(
          Object.fromEntries(
            result.map((item) => [
              item.studentBatchMembershipId,
              {
                status: item.attendance?.status ?? "",
                reason: "",
                isSaving: false,
              } satisfies RowState,
            ])
          )
        );
      })
      .catch((error) => {
        if (cancelled) return;
        notify.error(error, "Could not load the roster.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, sessionId]);

  if (!isOpen) {
    return null;
  }

  function updateRow(studentBatchMembershipId: string, patch: Partial<RowState>) {
    setRows((current) => ({
      ...current,
      [studentBatchMembershipId]: { ...current[studentBatchMembershipId], ...patch },
    }));
  }

  async function handleSaveRow(studentBatchMembershipId: string) {
    const row = rows[studentBatchMembershipId];
    if (!row || !row.status) {
      notify.error("Choose a status before saving.");
      return;
    }
    if (!row.reason.trim()) {
      notify.error("A reason is required for a manual override.");
      return;
    }

    updateRow(studentBatchMembershipId, { isSaving: true });

    try {
      const record = await manualMarkAttendance(sessionId, {
        studentBatchMembershipId,
        status: row.status,
        manualReason: row.reason.trim(),
      });

      notify.success("Attendance override saved.");
      setRoster((current) =>
        current?.map((item) =>
          item.studentBatchMembershipId === studentBatchMembershipId
            ? {
                ...item,
                attendance: {
                  id: record.id,
                  status: record.status,
                  method: record.method,
                  submittedAt: record.submittedAt ?? null,
                  manualReason: row.reason.trim(),
                  markedBy: item.attendance?.markedBy ?? null,
                },
              }
            : item
        ) ?? current
      );
    } catch (error) {
      notify.error(error, "Could not save this override.");
    } finally {
      updateRow(studentBatchMembershipId, { isSaving: false });
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-grid-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <div>
            <h2 id="attendance-grid-title" className={styles.title}>
              Manual marking
            </h2>
            <p className={styles.subtitle}>Override attendance status and record a reason for each change.</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close dialog">
            <CloseIcon />
          </button>
        </div>

        <div className={styles.body}>
          {isLoading && !roster ? (
            <p className={styles.emptyState}>Loading roster…</p>
          ) : roster && roster.length === 0 ? (
            <p className={styles.emptyState}>No students are enrolled in this batch yet.</p>
          ) : roster ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Current status</th>
                  <th>Override to</th>
                  <th>Reason</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {roster.map((item) => {
                  const row = rows[item.studentBatchMembershipId];
                  if (!row) return null;

                  return (
                    <tr key={item.studentBatchMembershipId} className={styles.row}>
                      <td>
                        <div className={styles.studentName}>{item.name}</div>
                        <div className={styles.studentEmail}>{item.email}</div>
                        {item.isCR ? <span className={styles.crBadge}>CR</span> : null}
                      </td>
                      <td>
                        <span className={styles.statusBadge} data-status={item.attendance?.status ?? "UNMARKED"}>
                          {item.attendance?.status ?? "UNMARKED"}
                        </span>
                      </td>
                      <td>
                        <select
                          className={styles.select}
                          value={row.status}
                          onChange={(event) =>
                            updateRow(item.studentBatchMembershipId, {
                              status: event.target.value as AttendanceStatus,
                            })
                          }
                        >
                          <option value="">Select status</option>
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="text"
                          className={styles.reasonInput}
                          placeholder="Reason for override"
                          value={row.reason}
                          onChange={(event) =>
                            updateRow(item.studentBatchMembershipId, { reason: event.target.value })
                          }
                        />
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <Button
                            type="button"
                            variant="secondary"
                            style={{ width: "auto" }}
                            isLoading={row.isSaving}
                            onClick={() => handleSaveRow(item.studentBatchMembershipId)}
                          >
                            Save
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>
    </div>
  );
}
