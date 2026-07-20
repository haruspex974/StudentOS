"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  AttendanceHistoryItem,
  Batch,
  BatchStudent,
  getStudentAttendanceHistory,
  listBatchStudents,
  listBatches,
} from "@/lib/api-client";
import { notify } from "@/lib/toast";
import { useRequireRole } from "@/lib/use-require-role";
import styles from "../../shared.module.css";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusTone(status: AttendanceHistoryItem["status"]): "success" | "warning" | "danger" | "neutral" {
  if (status === "PRESENT") return "success";
  if (status === "LATE") return "warning";
  if (status === "ABSENT") return "danger";
  return "neutral";
}

export default function AttendanceOverviewPage() {
  const isAuthorized = useRequireRole("MENTOR");
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const [students, setStudents] = useState<BatchStudent[] | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const [history, setHistory] = useState<AttendanceHistoryItem[] | null>(null);

  useEffect(() => {
    if (!isAuthorized) return;
    let cancelled = false;
    listBatches()
      .then((result) => {
        if (cancelled) return;
        setBatches(result);
        if (result.length > 0) setSelectedBatchId(result[0].id);
      })
      .catch((fetchError) => {
        if (!cancelled) notify.error(fetchError, "Could not load batches.");
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthorized]);

  useEffect(() => {
    if (!selectedBatchId) return;
    let cancelled = false;
    setStudents(null);
    setSelectedStudentId(null);
    listBatchStudents(selectedBatchId)
      .then((result) => {
        if (cancelled) return;
        setStudents(result);
        setSelectedStudentId(result[0]?.batchMembershipId ?? null);
      })
      .catch((fetchError) => {
        if (!cancelled) notify.error(fetchError, "Could not load students.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBatchId]);

  useEffect(() => {
    if (!selectedStudentId) {
      setHistory(null);
      return;
    }
    let cancelled = false;
    getStudentAttendanceHistory(selectedStudentId)
      .then((result) => {
        if (!cancelled) setHistory(result);
      })
      .catch((fetchError) => {
        if (!cancelled) notify.error(fetchError, "Could not load attendance history.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedStudentId]);

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Attendance</h1>
          <p className={styles.subtitle}>Session-by-session history for a student.</p>
        </div>

        <div className={styles.selectGroup}>
          {batches && batches.length > 0 ? (
            <select
              className={styles.select}
              value={selectedBatchId ?? ""}
              onChange={(event) => setSelectedBatchId(event.target.value)}
            >
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.name}
                </option>
              ))}
            </select>
          ) : null}

          {students && students.length > 0 ? (
            <select
              className={styles.select}
              value={selectedStudentId ?? ""}
              onChange={(event) => setSelectedStudentId(event.target.value)}
            >
              {students.map((student) => (
                <option key={student.batchMembershipId} value={student.batchMembershipId}>
                  {student.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      <div className={styles.card}>
        {students === null && batches !== null && batches.length > 0 ? (
          <p className={styles.emptyState}>Loading students...</p>
        ) : students && students.length === 0 ? (
          <p className={styles.emptyState}>No students enrolled in this batch yet.</p>
        ) : history === null && students && students.length > 0 ? (
          <p className={styles.emptyState}>Loading attendance history…</p>
        ) : history && history.length === 0 ? (
          <p className={styles.emptyState}>No attendance recorded for this student yet.</p>
        ) : history ? (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Method</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id}>
                    <td className={styles.primaryCell}>{item.sessionTitle}</td>
                    <td>{formatDateTime(item.sessionDate)}</td>
                    <td>
                      <span className={styles.badge} data-tone={statusTone(item.status)}>
                        {item.status}
                      </span>
                    </td>
                    <td>{item.method === "SELF_SUBMITTED" ? "Self check-in" : "Manual"}</td>
                    <td>{item.manualReason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
