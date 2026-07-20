"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import {
  CreateSessionPayload,
  SessionSummary,
  SessionType,
  createSession,
  getSession,
  updateSession,
} from "@/lib/api-client";
import { notify } from "@/lib/toast";
import styles from "./modal.module.css";

interface SessionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchId: string;
  /** When provided, the modal edits this session instead of creating a new one. */
  session?: SessionSummary | null;
  onSaved: () => void;
}

interface FormErrors {
  title?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  meetLink?: string;
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function toDateTimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function SessionFormModal({ isOpen, onClose, batchId, session, onSaved }: SessionFormModalProps) {
  const isEditing = Boolean(session);
  // Times can't change once attendance has been opened for this session.
  const timesLocked = isEditing && session?.status !== "SCHEDULED";

  const [title, setTitle] = useState("");
  const [scheduledStart, setScheduledStart] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [meetLink, setMeetLink] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<SessionType>("REGULAR");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(session?.title ?? "");
    setScheduledStart(session ? toDateTimeLocalValue(session.scheduledStart) : "");
    setScheduledEnd(session ? toDateTimeLocalValue(session.scheduledEnd) : "");
    setMeetLink(session?.meetLink ?? "");
    setDescription("");
    setType("REGULAR");
    setIsSubmitting(false);

    // The session list only carries summary fields — fetch the full detail so
    // editing doesn't silently wipe the existing description/type on save.
    if (session) {
      let cancelled = false;
      setIsLoadingDetail(true);
      getSession(session.id)
        .then((detail) => {
          if (cancelled) return;
          setDescription(detail.description ?? "");
          setType(detail.type);
        })
        .catch((error) => {
          if (!cancelled) {
            notify.error(error, "Could not load this session's details.");
          }
        })
        .finally(() => {
          if (!cancelled) setIsLoadingDetail(false);
        });
      return () => {
        cancelled = true;
      };
    }
  }, [isOpen, session]);

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim()) {
      notify.error("Title is required.");
      return;
    }
    if (!timesLocked) {
      if (!scheduledStart) {
        notify.error("Start time is required.");
        return;
      }
      if (!scheduledEnd) {
        notify.error("End time is required.");
        return;
      }
      if (new Date(scheduledEnd) <= new Date(scheduledStart)) {
        notify.error("End time must be after the start time.");
        return;
      }
    }
    if (meetLink.trim() && !isValidUrl(meetLink.trim())) {
      notify.error("Enter a valid URL for the meeting link.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing && session) {
        await updateSession(session.id, {
          title: title.trim(),
          ...(timesLocked
            ? {}
            : {
                scheduledStart: new Date(scheduledStart).toISOString(),
                scheduledEnd: new Date(scheduledEnd).toISOString(),
              }),
          meetLink: meetLink.trim() || null,
          description: description.trim() || null,
          type,
        });
      } else {
        const payload: CreateSessionPayload = {
          title: title.trim(),
          scheduledStart: new Date(scheduledStart).toISOString(),
          scheduledEnd: new Date(scheduledEnd).toISOString(),
          type,
        };
        if (meetLink.trim()) payload.meetLink = meetLink.trim();
        if (description.trim()) payload.description = description.trim();
        await createSession(batchId, payload);
      }
      notify.success(isEditing ? "Session updated successfully." : "Session created successfully.");
      onSaved();
      onClose();
    } catch (error) {
      notify.error(error, "Could not save this session.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-form-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <div>
            <h2 id="session-form-title" className={styles.title}>
              {isEditing ? "Edit session" : "New session"}
            </h2>
            <p className={styles.subtitle}>
              {isEditing ? "Update this session's details." : "Schedule a new session for this batch."}
            </p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close dialog">
            <CloseIcon />
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <TextField label="Title" value={title} onChange={(event) => setTitle(event.target.value)} />

          <div className={styles.fieldRow}>
            <TextField
              label="Start"
              type="datetime-local"
              value={scheduledStart}
              onChange={(event) => setScheduledStart(event.target.value)}
              disabled={timesLocked}
            />
            <TextField
              label="End"
              type="datetime-local"
              value={scheduledEnd}
              onChange={(event) => setScheduledEnd(event.target.value)}
              disabled={timesLocked}
            />
          </div>
          {timesLocked ? (
            <p className={styles.hint}>Times can&apos;t be changed once attendance has been opened for this session.</p>
          ) : null}

          <div className={styles.fieldGroup}>
            <label htmlFor="session-type">Type</label>
            <select
              id="session-type"
              className={styles.select}
              value={type}
              onChange={(event) => setType(event.target.value as SessionType)}
            >
              <option value="REGULAR">Regular</option>
              <option value="MAKEUP">Makeup</option>
              <option value="EXAM">Exam</option>
            </select>
          </div>

          <TextField
            label="Meeting link (optional)"
            type="url"
            placeholder="https://…"
            value={meetLink}
            onChange={(event) => setMeetLink(event.target.value)}
          />

          <div className={styles.fieldGroup}>
            <label htmlFor="session-description">Description (optional)</label>
            <textarea
              id="session-description"
              className={styles.textarea}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting} disabled={isLoadingDetail}>
              {isEditing ? "Save changes" : "Create session"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
