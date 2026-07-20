import { BadRequestError } from "../common/errors";
import { parseCSV } from "./csv-parser";
import { buildPaginationMeta, parsePagination } from "./pagination";

describe("Utilities", () => {
  it("parsePagination clamps invalid page and limit values", () => {
    expect(parsePagination({ page: "0", limit: "999999" })).toEqual({
      page: 1,
      limit: 100,
    });
    expect(parsePagination({ page: "2", limit: "5" })).toEqual({
      page: 2,
      limit: 5,
    });
  });

  it("buildPaginationMeta returns sensible totals", () => {
    expect(buildPaginationMeta(1, 10, 25)).toEqual({
      page: 1,
      limit: 10,
      total: 25,
      totalPages: 3,
    });
  });

  it("parseCSV throws on empty input and missing headers", () => {
    expect(() => parseCSV(Buffer.from(""))).toThrow(BadRequestError);
    expect(() => parseCSV(Buffer.from("name\nAda\n"))).toThrow(BadRequestError);
  });

  it("parseCSV parses rows with optional columns", () => {
    const csv = Buffer.from(
      [
        "email,name,phone,courseName,specialization,skills",
        "ada@example.com,Ada,123,CS,AI,React,Node",
      ].join("\n"),
    );

    const rows = parseCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: "ada@example.com",
      name: "Ada",
      phone: "123",
      courseName: "CS",
      specialization: "AI",
      skills: ["React"],
    });
  });

  it("parseCSV handles escaped quotes, CRLF line endings, and skips incomplete rows", () => {
    const csv = Buffer.from(
      'email,name,skills\r\n"john@example.com","John ""Johnny"" Doe","JS, TS"\r\n"invalid@example.com",,\r\n\r\n',
    );

    const rows = parseCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      rowNumber: 1,
      email: "john@example.com",
      name: 'John "Johnny" Doe',
      skills: ["JS", "TS"],
    });
  });

  it("parseCSV throws EMPTY_FILE when content contains only whitespace or empty rows", () => {
    expect(() => parseCSV(Buffer.from("   \n\r\n   "))).toThrow(BadRequestError);
    expect(() => parseCSV(Buffer.from(",,\n,,\n"))).toThrow(BadRequestError);
  });
});
