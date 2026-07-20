import { randomUUID } from "crypto";
import { StudentService } from "./student.service";
import { prisma } from "../../lib/prisma";
import { BadRequestError } from "../../common/errors";

describe("StudentService", () => {
  jest.setTimeout(30000);
  let workspaceId: string;
  let studentUserId: string;
  let studentMembershipId: string;
  let batchId: string;
  let batchMembershipId: string;

  beforeAll(async () => {
    const suffix = randomUUID().slice(0, 8);
    const ws = await prisma.workspace.create({
      data: {
        name: `Student Service Test Workspace ${suffix}`,
        settings: {
          create: {
            defaultAttendanceDurationMins: 15,
            lateThresholdMins: 10,
          },
        },
      },
    });
    workspaceId = ws.id;

    const student = await prisma.user.create({
      data: { email: `student-service-test-${suffix}@example.com`, name: "Sam Enrollee" },
    });
    studentUserId = student.id;

    const membership = await prisma.membership.create({
      data: {
        userId: studentUserId,
        workspaceId,
        role: "STUDENT",
        status: "ACTIVE",
      },
    });
    studentMembershipId = membership.id;

    const batch = await prisma.batch.create({
      data: {
        workspaceId,
        name: "Enrollment Test Batch",
        startDate: new Date(),
      },
    });
    batchId = batch.id;
  });

  afterAll(async () => {
    await prisma.$transaction([
      prisma.batchMembership.deleteMany({ where: { batchId } }),
      prisma.batch.deleteMany({ where: { workspaceId } }),
      prisma.membership.deleteMany({ where: { id: studentMembershipId } }),
      prisma.workspace.deleteMany({ where: { id: workspaceId } }),
      prisma.user.deleteMany({ where: { id: studentUserId } }),
    ]);
  });

  describe("enrollStudentIntoDB", () => {
    it("returns the flat enrollment shape the frontend expects, with real user info", async () => {
      const enrollment = await StudentService.enrollStudentIntoDB(batchId, studentMembershipId, true);

      expect(enrollment.batchMembershipId).toBeDefined();
      expect(enrollment.membershipId).toBe(studentMembershipId);
      expect(enrollment.userId).toBe(studentUserId);
      expect(enrollment.name).toBe("Sam Enrollee");
      expect(enrollment.email).toMatch(/student-service-test-/);
      expect(enrollment.isCR).toBe(true);

      batchMembershipId = enrollment.batchMembershipId;
    });

    it("throws BadRequestError when the student is already actively enrolled", async () => {
      await expect(StudentService.enrollStudentIntoDB(batchId, studentMembershipId)).rejects.toThrow(
        BadRequestError
      );
    });

    it("re-enrolls a previously revoked student and refreshes their CR flag", async () => {
      await StudentService.revokeEnrollmentIntoDB(batchId, batchMembershipId);

      const reEnrolled = await StudentService.enrollStudentIntoDB(batchId, studentMembershipId, false);
      expect(reEnrolled.membershipId).toBe(studentMembershipId);
      expect(reEnrolled.isCR).toBe(false);
      expect(reEnrolled.name).toBe("Sam Enrollee");
    });
  });

  describe("getEnrolledStudentsFromDB", () => {
    it("returns the roster with real name/email at the top level, not nested under membership", async () => {
      const result = await StudentService.getEnrolledStudentsFromDB(batchId);

      expect(result.data.length).toBe(1);
      const [row] = result.data;
      expect(row.batchMembershipId).toBeDefined();
      expect(row.name).toBe("Sam Enrollee");
      expect(row.email).toMatch(/student-service-test-/);
      expect((row as any).membership).toBeUndefined();
    });
  });

  describe("Student Profile & Edge Cases", () => {
    it("enrollStudentIntoDB throws NotFoundError for invalid batchId or membershipId", async () => {
      await expect(StudentService.enrollStudentIntoDB("invalid-batch-id", studentMembershipId)).rejects.toThrow();
      await expect(StudentService.enrollStudentIntoDB(batchId, "invalid-membership-id")).rejects.toThrow();
    });

    it("revokeEnrollmentIntoDB throws errors for non-existent or already revoked enrollments", async () => {
      await expect(StudentService.revokeEnrollmentIntoDB(batchId, "invalid-bm-id")).rejects.toThrow();

      await StudentService.revokeEnrollmentIntoDB(batchId, batchMembershipId);
      await expect(StudentService.revokeEnrollmentIntoDB(batchId, batchMembershipId)).rejects.toThrow(BadRequestError);
    });

    it("getStudentProfileFromDB and updateStudentProfileIntoDB manage profile details", async () => {
      const initial = await StudentService.getStudentProfileFromDB(studentMembershipId);
      expect(initial.membershipId).toBe(studentMembershipId);
      expect(initial.name).toBe("Sam Enrollee");

      const updated = await StudentService.updateStudentProfileIntoDB(studentMembershipId, {
        phone: "555-0199",
        courseName: "Computer Science",
      });
      expect(updated.phone).toBe("555-0199");

      const fetched = await StudentService.getStudentProfileFromDB(studentMembershipId);
      expect(fetched.phone).toBe("555-0199");
      expect(fetched.courseName).toBe("Computer Science");
    });

    it("profile operations throw NotFoundError when membershipId does not exist", async () => {
      await expect(StudentService.getStudentProfileFromDB("invalid-membership-id")).rejects.toThrow();
      await expect(StudentService.updateStudentProfileIntoDB("invalid-membership-id", { phone: "123" })).rejects.toThrow();
    });
  });
});
