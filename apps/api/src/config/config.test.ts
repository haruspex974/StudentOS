import {
  ATTENDANCE_CODE,
  IMPORT,
  PAGINATION,
  RATE_LIMITS,
  SESSION_LIMITS,
} from "./constants";

describe("Configuration constants", () => {
  it("exposes sensible defaults for import and attendance code generation", () => {
    expect(IMPORT.CHUNK_SIZE).toBe(50);
    expect(ATTENDANCE_CODE.MIN).toBe(100000);
    expect(ATTENDANCE_CODE.MAX).toBe(999999);
  });

  it("exposes pagination and rate-limit constants", () => {
    expect(PAGINATION.DEFAULT_PAGE).toBe(1);
    expect(PAGINATION.MAX_LIMIT).toBe(100);
    expect(SESSION_LIMITS.TITLE_MAX_LENGTH).toBe(200);
    expect(RATE_LIMITS.AUTH.REQUESTS).toBe(5);
  });
});
