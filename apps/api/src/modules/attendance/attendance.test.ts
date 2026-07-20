import { AttendanceService } from "./attendance.service";
import { prisma } from "../../lib/prisma";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../common/errors";
import { logger } from "../../lib/logger";

describe("AttendanceService", () => {
  jest.setTimeout(30000);
  let workspaceId: string;
  let batchId: string;
  let studentUserId: string;
  let studentMembershipId: string;
  let studentBatchMembershipId: string;
  let crUserId: string;
  let crMembershipId: string;
  let crBatchMembershipId: string;
  let mentorMembershipId: string;
  let sessionId: string;

  beforeAll(async () => {
    const ws = await prisma.workspace.create({
      data: {
        name: "Test Workspace",
        settings: {
          create: {
            defaultAttendanceDurationMins: 15,
            lateThresholdMins: 10,
          },
        },
      },
    });
    workspaceId = ws.id;

    const mentor = await prisma.user.create({
      data: { email: "test-mentor@example.com", name: "Test Mentor" },
    });
    const mMem = await prisma.membership.create({
      data: {
        userId: mentor.id,
        workspaceId,
        role: "MENTOR",
      },
    });
    mentorMembershipId = mMem.id;

    const batch = await prisma.batch.create({
      data: {
        workspaceId,
        name: "Test Batch 1",
        startDate: new Date(),
      },
    });
    batchId = batch.id;

    const student = await prisma.user.create({
      data: { email: "test-student@example.com", name: "Test Student" },
    });
    studentUserId = student.id;

    const sMem = await prisma.membership.create({
      data: {
        userId: student.id,
        workspaceId,
        role: "STUDENT",
      },
    });
    studentMembershipId = sMem.id;

    const sBatch = await prisma.batchMembership.create({
      data: {
        membershipId: studentMembershipId,
        batchId,
        isCR: false,
      },
    });
    studentBatchMembershipId = sBatch.id;

    const cr = await prisma.user.create({
      data: { email: "test-cr@example.com", name: "Test CR" },
    });
    crUserId = cr.id;

    const cMem = await prisma.membership.create({
      data: {
        userId: cr.id,
        workspaceId,
        role: "STUDENT",
      },
    });
    crMembershipId = cMem.id;

    const cBatch = await prisma.batchMembership.create({
      data: {
        membershipId: crMembershipId,
        batchId,
        isCR: true,
      },
    });
    crBatchMembershipId = cBatch.id;
  });

  afterAll(async () => {
    const idsToDelete = [studentBatchMembershipId, crBatchMembershipId].filter(
      Boolean,
    );
    const mIdsToDelete = [
      studentMembershipId,
      crMembershipId,
      mentorMembershipId,
    ].filter(Boolean);

    await prisma.$transaction([
      prisma.attendance.deleteMany({
        where: {
          studentBatchMembershipId: { in: idsToDelete },
        },
      }),
      prisma.session.deleteMany({
        where: { batchId: batchId || "non-existent" },
      }),
      prisma.batchMembership.deleteMany({
        where: { id: { in: idsToDelete } },
      }),
      prisma.membership.deleteMany({
        where: { id: { in: mIdsToDelete } },
      }),
      prisma.batch.deleteMany({
        where: { id: batchId || "non-existent" },
      }),
      prisma.workspace.deleteMany({
        where: { id: workspaceId || "non-existent" },
      }),
      prisma.user.deleteMany({
        where: {
          email: {
            in: [
              "test-mentor@example.com",
              "test-student@example.com",
              "test-cr@example.com",
            ],
          },
        },
      }),
    ]);
  });

  beforeEach(async () => {
    const session = await prisma.session.create({
      data: {
        batchId,
        title: "Test Session",
        scheduledStart: new Date(),
        scheduledEnd: new Date(),
        status: "STARTED",
        currentCode: "123456",
        attendanceOpenedAt: new Date(),
      },
    });
    sessionId = session.id;
  });

  afterEach(async () => {
    if (sessionId) {
      await prisma.attendance.deleteMany({
        where: { sessionId },
      });
      await prisma.session
        .delete({
          where: { id: sessionId },
        })
        .catch((err) => {
          logger.warn(
            {
              err,
              sessionId,
              operation: "attendance-test-cleanup",
            },
            "Failed to clean up test session",
          );
        })
      sessionId = "";
    }
  });

  describe("submitAttendance", () => {
    it("should submit attendance successfully and mark status PRESENT if within threshold", async () => {
      const result = await AttendanceService.submitAttendanceIntoDB(
        sessionId,
        studentMembershipId,
        "123456",
      );
      expect(result).toBeDefined();
      expect(result.status).toBe("PRESENT");
      expect(result.method).toBe("SELF_SUBMITTED");
    });

    it("should mark status LATE if submission is past the threshold", async () => {
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          attendanceOpenedAt: new Date(Date.now() - 15 * 60 * 1000),
        },
      });

      const result = await AttendanceService.submitAttendanceIntoDB(
        sessionId,
        studentMembershipId,
        "123456",
      );
      expect(result.status).toBe("LATE");
    });

    it("should throw NotFoundError if session does not exist", async () => {
      await expect(
        AttendanceService.submitAttendanceIntoDB(
          "non-existent-session-id",
          studentMembershipId,
          "123456",
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw BadRequestError if session is not started", async () => {
      await prisma.session.update({
        where: { id: sessionId },
        data: { status: "SCHEDULED" },
      });

      await expect(
        AttendanceService.submitAttendanceIntoDB(
          sessionId,
          studentMembershipId,
          "123456",
        ),
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw BadRequestError if check-in code does not match", async () => {
      await expect(
        AttendanceService.submitAttendanceIntoDB(
          sessionId,
          studentMembershipId,
          "wrong-code",
        ),
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw ForbiddenError if student is not enrolled in the batch", async () => {
      const anotherStudent = await prisma.user.create({
        data: { email: "other@example.com", name: "Other User" },
      });
      const anotherMem = await prisma.membership.create({
        data: { userId: anotherStudent.id, workspaceId, role: "STUDENT" },
      });

      await expect(
        AttendanceService.submitAttendanceIntoDB(sessionId, anotherMem.id, "123456"),
      ).rejects.toThrow(ForbiddenError);

      await prisma.membership.delete({ where: { id: anotherMem.id } });
      await prisma.user.delete({ where: { id: anotherStudent.id } });
    });

    it("should throw BadRequestError if student checks in twice", async () => {
      await AttendanceService.submitAttendanceIntoDB(
        sessionId,
        studentMembershipId,
        "123456",
      );
      await expect(
        AttendanceService.submitAttendanceIntoDB(
          sessionId,
          studentMembershipId,
          "123456",
        ),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("manualMarkAttendance", () => {
    it("should allow a MENTOR to manually mark attendance", async () => {
      const record = await AttendanceService.manualMarkAttendanceIntoDB(
        sessionId,
        mentorMembershipId,
        "MENTOR",
        {
          studentBatchMembershipId,
          status: "PRESENT",
          manualReason: "Student was present but phone was dead",
        },
      );

      expect(record).toBeDefined();
      expect(record.status).toBe("PRESENT");
      expect(record.method).toBe("MANUAL");
      expect(record.markedById).toBe(mentorMembershipId);
      expect(record.manualReason).toBe(
        "Student was present but phone was dead",
      );
    });

    it("should allow a STUDENT who is a CR to manually mark attendance", async () => {
      const record = await AttendanceService.manualMarkAttendanceIntoDB(
        sessionId,
        crMembershipId,
        "STUDENT",
        {
          studentBatchMembershipId,
          status: "EXCUSED",
          manualReason: "CR approved student leave",
        },
      );

      expect(record).toBeDefined();
      expect(record.status).toBe("EXCUSED");
      expect(record.method).toBe("MANUAL");
    });

    it("should throw ForbiddenError if a normal student attempts to manually mark attendance", async () => {
      await expect(
        AttendanceService.manualMarkAttendanceIntoDB(
          sessionId,
          studentMembershipId,
          "STUDENT",
          {
            studentBatchMembershipId: crBatchMembershipId,
            status: "PRESENT",
            manualReason: "Hacker student trying to mark someone present",
          },
        ),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("getSessionAttendanceRoster", () => {
    it("should return the full batch roster with attendance mappings", async () => {
      await AttendanceService.submitAttendanceIntoDB(
        sessionId,
        studentMembershipId,
        "123456",
      );
      const roster =
        await AttendanceService.getSessionAttendanceRosterFromDB(sessionId);

      expect(roster.length).toBe(2);
      const studentItem = roster.find(
        (r) => r.studentBatchMembershipId === studentBatchMembershipId,
      );
      expect(studentItem).toBeDefined();
      expect(studentItem?.attendance).not.toBeNull();
      expect(studentItem?.attendance?.status).toBe("PRESENT");

      const crItem = roster.find(
        (r) => r.studentBatchMembershipId === crBatchMembershipId,
      );
      expect(crItem).toBeDefined();
      expect(crItem?.attendance).toBeNull();
    });
  });

  describe("getStudentAttendanceHistory", () => {
    it("should return logs for the student's historical attendance", async () => {
      await AttendanceService.submitAttendanceIntoDB(
        sessionId,
        studentMembershipId,
        "123456",
      );
      const history = await AttendanceService.getStudentAttendanceHistoryFromDB(
        studentBatchMembershipId,
        studentMembershipId,
        "STUDENT",
      );

      expect(history.length).toBe(1);
      expect(history[0].status).toBe("PRESENT");
    });

    it("should allow a mentor to view student history", async () => {
      await AttendanceService.submitAttendanceIntoDB(
        sessionId,
        studentMembershipId,
        "123456",
      );
      const history = await AttendanceService.getStudentAttendanceHistoryFromDB(
        studentBatchMembershipId,
        mentorMembershipId,
        "MENTOR",
      );

      expect(history.length).toBe(1);
    });

    it("should throw ForbiddenError if a student tries to view another student's history", async () => {
      await expect(
        AttendanceService.getStudentAttendanceHistoryFromDB(
          studentBatchMembershipId,
          crMembershipId,
          "STUDENT",
        ),
      ).rejects.toThrow(ForbiddenError);
    });

    it("should handle batch lateThresholdMinsOverride and invalid session error branches", async () => {
      await prisma.batch.update({
        where: { id: batchId },
        data: { lateThresholdMinsOverride: 15 },
      });

      const res = await AttendanceService.submitAttendanceIntoDB(
        sessionId,
        studentMembershipId,
        "123456",
      );
      expect(res.status).toBe("PRESENT");

      await expect(
        AttendanceService.manualMarkAttendanceIntoDB(
          "invalid-session-id",
          mentorMembershipId,
          "MENTOR",
          { studentBatchMembershipId, status: "PRESENT", manualReason: "Reason" },
        ),
      ).rejects.toThrow(NotFoundError);

      await expect(
        AttendanceService.manualMarkAttendanceIntoDB(
          sessionId,
          mentorMembershipId,
          "MENTOR",
          { studentBatchMembershipId: "invalid-bm-id", status: "PRESENT", manualReason: "Reason" },
        ),
      ).rejects.toThrow(BadRequestError);

      await expect(
        AttendanceService.getSessionAttendanceRosterFromDB("invalid-session-id"),
      ).rejects.toThrow(NotFoundError);

      await prisma.batch.update({
        where: { id: batchId },
        data: { lateThresholdMinsOverride: null },
      });
    });
  });
});
