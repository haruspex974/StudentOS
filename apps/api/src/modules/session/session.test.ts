import { SessionService } from "./session.service";
import { prisma } from "../../lib/prisma";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../../common/errors";

describe("SessionService", () => {
  jest.setTimeout(30000);
  let workspaceId: string;
  let batchId: string;
  let mentorUserId: string;
  let mentorMembershipId: string;
  let studentUserId: string;
  let studentMembershipId: string;
  let studentBatchMembershipId: string;
  let crUserId: string;
  let crMembershipId: string;
  let crBatchMembershipId: string;

  beforeAll(async () => {
    const ws = await prisma.workspace.create({
      data: {
        name: "Session Test Workspace",
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
      data: { email: "session-mentor@example.com", name: "Session Mentor" },
    });
    mentorUserId = mentor.id;

    const mMem = await prisma.membership.create({
      data: {
        userId: mentorUserId,
        workspaceId,
        role: "MENTOR",
        status: "ACTIVE",
      },
    });
    mentorMembershipId = mMem.id;

    const batch = await prisma.batch.create({
      data: {
        workspaceId,
        name: "Session Test Batch",
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    batchId = batch.id;

    const student = await prisma.user.create({
      data: { email: "session-student@example.com", name: "Session Student" },
    });
    studentUserId = student.id;

    const sMem = await prisma.membership.create({
      data: {
        userId: studentUserId,
        workspaceId,
        role: "STUDENT",
        status: "ACTIVE",
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
      data: { email: "session-cr@example.com", name: "Session CR" },
    });
    crUserId = cr.id;

    const cMem = await prisma.membership.create({
      data: {
        userId: crUserId,
        workspaceId,
        role: "STUDENT",
        status: "ACTIVE",
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
    await prisma.$transaction([
      prisma.session.deleteMany({ where: { batchId } }),
      prisma.batchMembership.deleteMany({
        where: { id: { in: [studentBatchMembershipId, crBatchMembershipId] } },
      }),
      prisma.membership.deleteMany({
        where: { id: { in: [mentorMembershipId, studentMembershipId, crMembershipId] } },
      }),
      prisma.batch.deleteMany({ where: { id: batchId } }),
      prisma.workspace.deleteMany({ where: { id: workspaceId } }),
      prisma.user.deleteMany({
        where: {
          email: {
            in: [
              "session-mentor@example.com",
              "session-student@example.com",
              "session-cr@example.com",
            ],
          },
        },
      }),
    ]);
  });

  describe("createSession", () => {
    it("should successfully create a new session", async () => {
      const session = await SessionService.createSessionIntoDB(batchId, workspaceId, {
        title: "Introduction to OS",
        scheduledStart: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        scheduledEnd: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
        meetLink: "https://meet.google.com/abc-defg-hij",
        description: "First session of the batch",
        type: "REGULAR",
      });

      expect(session).toBeDefined();
      expect(session.title).toBe("Introduction to OS");
      expect(session.status).toBe("SCHEDULED");
      expect(session.batchId).toBe(batchId);
    });

    it("should throw NotFoundError if batch does not exist", async () => {
      await expect(
        SessionService.createSessionIntoDB("non-existent-batch", workspaceId, {
          title: "Test Session",
          scheduledStart: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          scheduledEnd: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw ForbiddenError if batch belongs to different workspace", async () => {
      const otherWs = await prisma.workspace.create({
        data: {
          name: "Other Workspace",
          settings: { create: {} },
        },
      });

      await expect(
        SessionService.createSessionIntoDB(batchId, otherWs.id, {
          title: "Test Session",
          scheduledStart: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          scheduledEnd: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
        }),
      ).rejects.toThrow(ForbiddenError);

      await prisma.workspace.delete({ where: { id: otherWs.id } });
    });

    it("should throw BadRequestError if end time is before start time", async () => {
      const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const end = new Date(start.getTime() - 60 * 60 * 1000);

      await expect(
        SessionService.createSessionIntoDB(batchId, workspaceId, {
          title: "Invalid Session",
          scheduledStart: start.toISOString(),
          scheduledEnd: end.toISOString(),
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw BadRequestError if session starts before batch start date", async () => {
      await expect(
        SessionService.createSessionIntoDB(batchId, workspaceId, {
          title: "Early Session",
          scheduledStart: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
          scheduledEnd: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw BadRequestError if batch is archived", async () => {
      const archivedBatch = await prisma.batch.create({
        data: {
          workspaceId,
          name: "Archived Batch",
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          isArchived: true,
        },
      });

      await expect(
        SessionService.createSessionIntoDB(archivedBatch.id, workspaceId, {
          title: "Session in Archived Batch",
          scheduledStart: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          scheduledEnd: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
        }),
      ).rejects.toThrow(BadRequestError);

      await prisma.batch.delete({ where: { id: archivedBatch.id } });
    });
  });

  describe("listSessions", () => {
    let testSessionId: string;

    beforeAll(async () => {
      const session = await prisma.session.create({
        data: {
          batchId,
          title: "List Test Session",
          scheduledStart: new Date(Date.now() + 48 * 60 * 60 * 1000),
          scheduledEnd: new Date(Date.now() + 49 * 60 * 60 * 1000),
          status: "SCHEDULED",
        },
      });
      testSessionId = session.id;
    });

    afterAll(async () => {
      await prisma.session.deleteMany({ where: { id: testSessionId } });
    });

    it("should list sessions for a mentor", async () => {
      const result = await SessionService.getlistSessionsFromDB(
        batchId,
        workspaceId,
        mentorUserId,
        "MENTOR",
      );

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.meta).toBeDefined();
    });

    it("should list sessions for an enrolled student", async () => {
      const result = await SessionService.getlistSessionsFromDB(
        batchId,
        workspaceId,
        studentUserId,
        "STUDENT",
      );

      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });

    it("should filter sessions by status", async () => {
      const result = await SessionService.getlistSessionsFromDB(
        batchId,
        workspaceId,
        mentorUserId,
        "MENTOR",
        1,
        20,
        "SCHEDULED",
      );

      expect(result.data).toBeDefined();
      result.data.forEach((session: any) => {
        expect(session.status).toBe("SCHEDULED");
      });
    });

    it("should throw NotFoundError if batch does not exist", async () => {
      await expect(
        SessionService.getlistSessionsFromDB(
          "non-existent-batch",
          workspaceId,
          mentorUserId,
          "MENTOR",
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw ForbiddenError if student is not enrolled", async () => {
      const otherStudent = await prisma.user.create({
        data: { email: "unenrolled@example.com", name: "Unenrolled Student" },
      });
      const otherMem = await prisma.membership.create({
        data: { userId: otherStudent.id, workspaceId, role: "STUDENT" },
      });

      await expect(
        SessionService.getlistSessionsFromDB(
          batchId,
          workspaceId,
          otherStudent.id,
          "STUDENT",
        ),
      ).rejects.toThrow(ForbiddenError);

      await prisma.membership.delete({ where: { id: otherMem.id } });
      await prisma.user.delete({ where: { id: otherStudent.id } });
    });
  });

  describe("getSession", () => {
    let testSessionId: string;

    beforeAll(async () => {
      const session = await prisma.session.create({
        data: {
          batchId,
          title: "Get Session Test",
          scheduledStart: new Date(Date.now() + 72 * 60 * 60 * 1000),
          scheduledEnd: new Date(Date.now() + 73 * 60 * 60 * 1000),
          status: "SCHEDULED",
          currentCode: "654321",
        },
      });
      testSessionId = session.id;
    });

    afterAll(async () => {
      await prisma.session.deleteMany({ where: { id: testSessionId } });
    });

    it("should return session details for a mentor (including currentCode)", async () => {
      const session = await SessionService.getSessionFromDB(
        testSessionId,
        workspaceId,
        mentorUserId,
        "MENTOR",
      );

      expect(session).toBeDefined();
      expect(session.id).toBe(testSessionId);
      expect(session.currentCode).toBe("654321");
    });

    it("should return session details for a student (excluding currentCode)", async () => {
      const session = await SessionService.getSessionFromDB(
        testSessionId,
        workspaceId,
        studentUserId,
        "STUDENT",
      );

      expect(session).toBeDefined();
      expect(session.id).toBe(testSessionId);
      expect(session.currentCode).toBeUndefined();
    });

    it("should throw NotFoundError if session does not exist", async () => {
      await expect(
        SessionService.getSessionFromDB(
          "non-existent-session",
          workspaceId,
          mentorUserId,
          "MENTOR",
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw ForbiddenError if session belongs to different workspace", async () => {
      const otherWs = await prisma.workspace.create({
        data: {
          name: "Other WS for Session",
          settings: { create: {} },
        },
      });

      await expect(
        SessionService.getSessionFromDB(
          testSessionId,
          otherWs.id,
          mentorUserId,
          "MENTOR",
        ),
      ).rejects.toThrow(ForbiddenError);

      await prisma.workspace.delete({ where: { id: otherWs.id } });
    });
  });

  describe("updateSession", () => {
    let testSessionId: string;

    beforeEach(async () => {
      const session = await prisma.session.create({
        data: {
          batchId,
          title: "Update Test Session",
          scheduledStart: new Date(Date.now() + 96 * 60 * 60 * 1000),
          scheduledEnd: new Date(Date.now() + 97 * 60 * 60 * 1000),
          status: "SCHEDULED",
        },
      });
      testSessionId = session.id;
    });

    afterEach(async () => {
      await prisma.session.deleteMany({ where: { id: testSessionId } });
    });

    it("should update session title successfully", async () => {
      const updated = await SessionService.updateSessionIntoDB(
        testSessionId,
        workspaceId,
        { title: "Updated Title" },
      );

      expect(updated.title).toBe("Updated Title");
    });

    it("should update session times successfully", async () => {
      const newStart = new Date(Date.now() + 100 * 60 * 60 * 1000);
      const newEnd = new Date(Date.now() + 101 * 60 * 60 * 1000);

      const updated = await SessionService.updateSessionIntoDB(
        testSessionId,
        workspaceId,
        {
          scheduledStart: newStart.toISOString(),
          scheduledEnd: newEnd.toISOString(),
        },
      );

      expect(updated.scheduledStart).toBeDefined();
      expect(updated.scheduledEnd).toBeDefined();
    });

    it("should throw NotFoundError if session does not exist", async () => {
      await expect(
        SessionService.updateSessionIntoDB("non-existent", workspaceId, {
          title: "Test",
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw BadRequestError if trying to update cancelled session", async () => {
      await prisma.session.update({
        where: { id: testSessionId },
        data: { status: "CANCELLED" },
      });

      await expect(
        SessionService.updateSessionIntoDB(testSessionId, workspaceId, {
          title: "Cannot Update",
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw BadRequestError if trying to update ended session", async () => {
      await prisma.session.update({
        where: { id: testSessionId },
        data: { status: "ENDED" },
      });

      await expect(
        SessionService.updateSessionIntoDB(testSessionId, workspaceId, {
          title: "Cannot Update",
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw BadRequestError if end time is before start time", async () => {
      const start = new Date(Date.now() + 200 * 60 * 60 * 1000);
      const end = new Date(start.getTime() - 60 * 60 * 1000);

      await expect(
        SessionService.updateSessionIntoDB(testSessionId, workspaceId, {
          scheduledStart: start.toISOString(),
          scheduledEnd: end.toISOString(),
        }),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("cancelSession", () => {
    let testSessionId: string;

    beforeEach(async () => {
      const session = await prisma.session.create({
        data: {
          batchId,
          title: "Cancel Test Session",
          scheduledStart: new Date(Date.now() + 120 * 60 * 60 * 1000),
          scheduledEnd: new Date(Date.now() + 121 * 60 * 60 * 1000),
          status: "SCHEDULED",
        },
      });
      testSessionId = session.id;
    });

    afterEach(async () => {
      await prisma.session.deleteMany({ where: { id: testSessionId } });
    });

    it("should cancel a scheduled session successfully", async () => {
      const result = await SessionService.cancelSessionIntoDB(
        testSessionId,
        workspaceId,
      );

      expect(result.status).toBe("CANCELLED");
    });

    it("should clear currentCode when cancelling session", async () => {
      await prisma.session.update({
        where: { id: testSessionId },
        data: { currentCode: "123456" },
      });

      const result = await SessionService.cancelSessionIntoDB(
        testSessionId,
        workspaceId,
      );

      expect(result.status).toBe("CANCELLED");
    });

    it("should throw NotFoundError if session does not exist", async () => {
      await expect(
        SessionService.cancelSessionIntoDB("non-existent", workspaceId),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw BadRequestError if session is already cancelled", async () => {
      await prisma.session.update({
        where: { id: testSessionId },
        data: { status: "CANCELLED" },
      });

      await expect(
        SessionService.cancelSessionIntoDB(testSessionId, workspaceId),
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw BadRequestError if session has ended", async () => {
      await prisma.session.update({
        where: { id: testSessionId },
        data: { status: "ENDED" },
      });

      await expect(
        SessionService.cancelSessionIntoDB(testSessionId, workspaceId),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("openAttendanceWindow", () => {
    let testSessionId: string;

    beforeEach(async () => {
      const session = await prisma.session.create({
        data: {
          batchId,
          title: "Open Attendance Test",
          scheduledStart: new Date(Date.now() + 144 * 60 * 60 * 1000),
          scheduledEnd: new Date(Date.now() + 145 * 60 * 60 * 1000),
          status: "SCHEDULED",
        },
      });
      testSessionId = session.id;
    });

    afterEach(async () => {
      await prisma.session.deleteMany({ where: { id: testSessionId } });
    });

    it("should open attendance window for a mentor", async () => {
      const result = await SessionService.openAttendanceWindowIntoDB(
        testSessionId,
        workspaceId,
        mentorMembershipId,
        "MENTOR",
        mentorUserId,
      );

      expect(result.status).toBe("STARTED");
      expect(result.currentCode).toBeDefined();
      expect(result.currentCode.length).toBe(6);
    });

    it("should open attendance window for a CR student", async () => {
      const result = await SessionService.openAttendanceWindowIntoDB(
        testSessionId,
        workspaceId,
        crMembershipId,
        "STUDENT",
        crUserId,
      );

      expect(result.status).toBe("STARTED");
      expect(result.currentCode).toBeDefined();
    });

    it("should throw ForbiddenError if non-CR student tries to open attendance", async () => {
      await expect(
        SessionService.openAttendanceWindowIntoDB(
          testSessionId,
          workspaceId,
          studentMembershipId,
          "STUDENT",
          studentUserId,
        ),
      ).rejects.toThrow(ForbiddenError);
    });

    it("should throw BadRequestError if attendance is already open", async () => {
      await SessionService.openAttendanceWindowIntoDB(
        testSessionId,
        workspaceId,
        mentorMembershipId,
        "MENTOR",
        mentorUserId,
      );

      await expect(
        SessionService.openAttendanceWindowIntoDB(
          testSessionId,
          workspaceId,
          mentorMembershipId,
          "MENTOR",
          mentorUserId,
        ),
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw NotFoundError if session does not exist", async () => {
      await expect(
        SessionService.openAttendanceWindowIntoDB(
          "non-existent",
          workspaceId,
          mentorMembershipId,
          "MENTOR",
          mentorUserId,
        ),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("closeAttendanceWindow", () => {
    let testSessionId: string;

    beforeEach(async () => {
      const session = await prisma.session.create({
        data: {
          batchId,
          title: "Close Attendance Test",
          scheduledStart: new Date(Date.now() + 168 * 60 * 60 * 1000),
          scheduledEnd: new Date(Date.now() + 169 * 60 * 60 * 1000),
          status: "STARTED",
          attendanceOpenedAt: new Date(),
          currentCode: "999999",
        },
      });
      testSessionId = session.id;
    });

    afterEach(async () => {
      await prisma.session.deleteMany({ where: { id: testSessionId } });
    });

    it("should close attendance window for a mentor", async () => {
      const result = await SessionService.closeAttendanceWindowIntoDB(
        testSessionId,
        workspaceId,
        mentorMembershipId,
        "MENTOR",
        mentorUserId,
      );

      expect(result.status).toBe("ENDED");
      expect(result.currentCode).toBeNull();
    });

    it("should close attendance window for a CR student", async () => {
      const result = await SessionService.closeAttendanceWindowIntoDB(
        testSessionId,
        workspaceId,
        crMembershipId,
        "STUDENT",
        crUserId,
      );

      expect(result.status).toBe("ENDED");
    });

    it("should throw ForbiddenError if non-CR student tries to close attendance", async () => {
      await expect(
        SessionService.closeAttendanceWindowIntoDB(
          testSessionId,
          workspaceId,
          studentMembershipId,
          "STUDENT",
          studentUserId,
        ),
      ).rejects.toThrow(ForbiddenError);
    });

    it("should throw BadRequestError if attendance is already closed", async () => {
      await SessionService.closeAttendanceWindowIntoDB(
        testSessionId,
        workspaceId,
        mentorMembershipId,
        "MENTOR",
        mentorUserId,
      );

      await expect(
        SessionService.closeAttendanceWindowIntoDB(
          testSessionId,
          workspaceId,
          mentorMembershipId,
          "MENTOR",
          mentorUserId,
        ),
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw BadRequestError if session is not started", async () => {
      await prisma.session.update({
        where: { id: testSessionId },
        data: { status: "SCHEDULED" },
      });

      await expect(
        SessionService.closeAttendanceWindowIntoDB(
          testSessionId,
          workspaceId,
          mentorMembershipId,
          "MENTOR",
          mentorUserId,
        ),
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw NotFoundError if session does not exist", async () => {
      await expect(
        SessionService.closeAttendanceWindowIntoDB(
          "non-existent",
          workspaceId,
          mentorMembershipId,
          "MENTOR",
          mentorUserId,
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it("should handle updateSession edge cases (started session times, empty payload, single field update)", async () => {
      await prisma.session.update({
        where: { id: testSessionId },
        data: { status: "STARTED" },
      });

      await expect(
        SessionService.updateSessionIntoDB(testSessionId, workspaceId, {
          scheduledStart: new Date(Date.now() + 1000).toISOString(),
        }),
      ).rejects.toThrow(BadRequestError);

      await prisma.session.update({
        where: { id: testSessionId },
        data: { status: "SCHEDULED" },
      });

      const noChange = await SessionService.updateSessionIntoDB(testSessionId, workspaceId, {});
      expect(noChange.id).toBe(testSessionId);

      await expect(
        SessionService.updateSessionIntoDB(testSessionId, workspaceId, {
          scheduledStart: new Date(Date.now() + 200 * 60 * 60 * 1000).toISOString(),
        }),
      ).rejects.toThrow(BadRequestError);
    });
  });
});
