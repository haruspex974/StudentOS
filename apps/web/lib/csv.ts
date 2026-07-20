import { isValidEmail } from "./validation";

/**
 * RFC-4180-ish CSV parser: handles quoted fields (with embedded commas and
 * escaped `""`), and both CRLF and LF line endings. Runs entirely
 * client-side — no file ever leaves the browser until we call the
 * per-student API endpoints below. Returns every non-blank row — header
 * detection happens in `parseStudentCsvFile` below, since real-world
 * spreadsheet exports often have a title/banner row before the actual
 * column headers.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      currentRow.push(currentVal);
      currentVal = "";
    } else if (char === "\n" && !inQuotes) {
      currentRow.push(currentVal);
      rows.push(currentRow);
      currentRow = [];
      currentVal = "";
    } else if (char === "\r" && !inQuotes) {
      if (nextChar === "\n") i++;
      currentRow.push(currentVal);
      rows.push(currentRow);
      currentRow = [];
      currentVal = "";
    } else {
      currentVal += char;
    }
  }
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0));
}

export interface StudentCsvRow {
  rowNumber: number;
  email: string;
  name: string;
  phone?: string;
  courseName?: string;
  specialization?: string;
  skills?: string[];
  /** Set when the row itself is malformed — never sent to the API. */
  validationError?: string;
}

export const STUDENT_CSV_REQUIRED_HEADERS = ["email", "name"] as const;
export const STUDENT_CSV_OPTIONAL_HEADERS = ["phone", "coursename", "specialization", "skills"] as const;

/** Parses a student-roster CSV file and validates every row — every row in
 * the file gets a result (never silently dropped), so the caller can report
 * an accurate total and a reason for every row that doesn't succeed. */
export async function parseStudentCsvFile(file: File): Promise<StudentCsvRow[]> {
  const text = await file.text();
  const cleanRows = parseCsv(text);

  if (cleanRows.length === 0) {
    throw new Error("This CSV file has no data.");
  }

  // The real header row isn't always the first line — spreadsheet exports
  // (like an attendance sheet with a title banner on row 1) often have
  // extra rows above the actual columns. Scan for the row that actually
  // contains an email-like column instead of assuming it's row one.
  const findEmailCol = (row: string[]) =>
    row.findIndex((cell) => /email/.test(cell.trim().toLowerCase()));
  const headerRowIndex = cleanRows.findIndex((row) => findEmailCol(row) !== -1);
  if (headerRowIndex === -1) {
    throw new Error("CSV is missing required headers: email, name.");
  }

  const headers = cleanRows[headerRowIndex].map((h) => h.trim().toLowerCase());
  // Real-world exports rarely use the exact column names "email"/"name" —
  // Google Forms roster/attendance sheets commonly say "Your Name", "Email
  // Address", etc. Match exactly first, then fall back to any column whose
  // header contains the word.
  const emailIdx = headers.indexOf("email") !== -1 ? headers.indexOf("email") : findEmailCol(cleanRows[headerRowIndex]);
  const nameIdx = headers.indexOf("name") !== -1 ? headers.indexOf("name") : headers.findIndex((h) => h.includes("name"));
  if (nameIdx === -1) {
    throw new Error("CSV is missing required headers: email, name.");
  }

  const phoneIdx = headers.indexOf("phone");
  const courseIdx = headers.indexOf("coursename");
  const specIdx = headers.indexOf("specialization");
  const skillsIdx = headers.indexOf("skills");

  const seenEmails = new Set<string>();
  const rows = cleanRows.slice(headerRowIndex + 1);

  return rows.map((values, index) => {
    const rowNumber = index + 1;
    const email = (values[emailIdx] ?? "").trim();
    const name = (values[nameIdx] ?? "").trim();
    const row: StudentCsvRow = { rowNumber, email, name };

    if (phoneIdx !== -1 && values[phoneIdx]?.trim()) row.phone = values[phoneIdx].trim();
    if (courseIdx !== -1 && values[courseIdx]?.trim()) row.courseName = values[courseIdx].trim();
    if (specIdx !== -1 && values[specIdx]?.trim()) row.specialization = values[specIdx].trim();
    if (skillsIdx !== -1 && values[skillsIdx]?.trim()) {
      row.skills = values[skillsIdx]
        .trim()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }

    if (!email) {
      row.validationError = "Email is required.";
    } else if (!isValidEmail(email)) {
      row.validationError = "Invalid email address format.";
    } else if (!name) {
      row.validationError = "Name is required.";
    } else if (seenEmails.has(email.toLowerCase())) {
      row.validationError = "Duplicate row in the uploaded file.";
    }

    if (!row.validationError) {
      seenEmails.add(email.toLowerCase());
    }

    return row;
  });
}

/** A minimal, correctly-quoted example CSV, offered as a downloadable
 * starting point from the import modal. */
export function buildStudentCsvTemplate(): string {
  const header = "email,name,phone,courseName,specialization,skills";
  const example =
    'jane@example.com,Jane Student,+1 555 000 0000,Full Stack Web Development,Frontend,"JavaScript, React, TypeScript"';
  return `${header}\n${example}\n`;
}
