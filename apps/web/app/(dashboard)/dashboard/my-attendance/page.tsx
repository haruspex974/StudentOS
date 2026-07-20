"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ApiError, AttendanceHistoryItem, MyBatch, getMyBatches, getStudentAttendanceHistory } from "@/lib/api-client";
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

function MyAttendanceContent() {
  const searchParams = useSearchParams();
  const batchFromQuery = searchParams.get("batch");

  const [batches, setBatches] = useState<MyBatch[] | null>(null);
  const [batchesError, setBatchesError] = useState<string | null>(null);
  const [selectedBatchMembershipId, setSelectedBatchMembershipId] = useState<string | null>(null);

  const [history, setHistory] = useState<AttendanceHistoryItem[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyBatches()
      .then((result) => {
        if (cancelled) return;
        setBatches(result);
        const preselected = batchFromQuery ? result.find((b) => b.batchId === batchFromQuery) : null;
        setSelectedBatchMembershipId(preselected?.batchMembershipId ?? result[0]?.batchMembershipId ?? null);
      })
      .catch((error) => {
        if (!cancelled) setBatchesError(error instanceof ApiError ? error.message : "Could not load your batches.");
      });
    return () => {
      cancelled = true;
    };
    // Only run once on mount — batchFromQuery is only used for the initial preselection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedBatchMembershipId) return;
    let cancelled = false;
    setHistory(null);
    setHistoryError(null);
    getStudentAttendanceHistory(selectedBatchMembershipId)
      .then((result) => {
        if (!cancelled) setHistory(result);
      })
      .catch((error) => {
        if (!cancelled) setHistoryError(error instanceof ApiError ? error.message : "Could not load attendance history.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBatchMembershipId]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>My attendance</h1>
          <p className={styles.subtitle}>Your session-by-session attendance history.</p>
        </div>

        {batches && batches.length > 0 ? (
          <select
            className={styles.select}
            value={selectedBatchMembershipId ?? ""}
            onChange={(event) => setSelectedBatchMembershipId(event.target.value)}
          >
            {batches.map((batch) => (
              <option key={batch.batchMembershipId} value={batch.batchMembershipId}>
                {batch.batchName}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {batchesError ? (
        <div className={styles.banner} role="alert">
          {batchesError}
        </div>
      ) : null}

      {!batchesError && batches && batches.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.emptyState}>You&apos;re not enrolled in any batch yet.</p>
        </div>
      ) : null}

      {selectedBatchMembershipId ? (
        <div className={styles.card}>
          {historyError ? (
            <div className={styles.banner} role="alert">
              {historyError}
            </div>
          ) : history === null ? (
            <p className={styles.emptyState}>Loading attendance history…</p>
          ) : history.length === 0 ? (
            <p className={styles.emptyState}>No attendance recorded for this batch yet.</p>
          ) : (
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
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function MyAttendancePage() {
  const isAuthorized = useRequireRole("STUDENT");

  if (!isAuthorized) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <MyAttendanceContent />
    </Suspense>
  );
}
