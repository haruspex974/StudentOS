import { randomUUID } from "crypto";
import { WorkspaceService } from "./workspace.service";
import { prisma } from "../../lib/prisma";

describe("WorkspaceService", () => {
  jest.setTimeout(30000);
  let workspaceId: string;
  let otherWorkspaceId: string;
  let studentUserId: string;
  let studentMembershipId: string;
  let batchAId: string;
  let batchBId: string;

  beforeAll(async () => {
    const suffix = randomUUID().slice(0, 8);
    const ws = await prisma.workspace.create({
      data: {
        name: `Workspace Service Test Workspace ${suffix}`,
        settings: { create: { defaultAttendanceDurationMins: 15, lateThresholdMins: 10 } },
      },
    });
    workspaceId = ws.id;

    const otherWs = await prisma.workspace.create({
      data: {
        name: `Workspace Service Test — Other Workspace ${suffix}`,
        settings: { create: { defaultAttendanceDurationMins: 15, lateThresholdMins: 10 } },
      },
    });
    otherWorkspaceId = otherWs.id;

    const student = await prisma.user.create({
      data: { email: `my-batches-test-${suffix}@example.com`, name: "Mika Enrollee" },
    });
    studentUserId = student.id;

    const membership = await prisma.membership.create({
      data: { userId: studentUserId, workspaceId, role: "STUDENT", status: "ACTIVE" },
    });
    studentMembershipId = membership.id;

    const batchA = await prisma.batch.create({
      data: { workspaceId, name: "My Batches Test — Batch A", startDate: new Date() },
    });
    batchAId = batchA.id;

    const batchB = await prisma.batch.create({
      data: { workspaceId, name: "My Batches Test — Batch B", startDate: new Date() },
    });
    batchBId = batchB.id;

    // A batch the student is NOT enrolled in — confirms it's excluded.
    await prisma.batch.create({
      data: { workspaceId, name: "My Batches Test — Not Enrolled", startDate: new Date() },
    });

    await prisma.batchMembership.create({
      data: { membershipId: studentMembershipId, batchId: batchAId, isCR: true },
    });
    const revokedMembership = await prisma.batchMembership.create({
      data: { membershipId: studentMembershipId, batchId: batchBId, isCR: false },
    });
    // Revoked enrollments should not appear in "my batches".
    await prisma.batchMembership.update({
      where: { id: revokedMembership.id },
      data: { revokedAt: new Date() },
    });
  });

  afterAll(async () => {
    const batchIds = [batchAId, batchBId].filter(Boolean);
    await prisma.$transaction([
      prisma.batchMembership.deleteMany({ where: { batchId: { in: batchIds } } }),
      prisma.batch.deleteMany({ where: { workspaceId } }),
      prisma.membership.deleteMany({ where: { id: studentMembershipId } }),
      prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } }),
      prisma.user.deleteMany({ where: { id: studentUserId } }),
    ]);
  });

  describe("getMyBatchesFromDB", () => {
    it("returns only the caller's own active enrollments, with the CR flag per batch", async () => {
      const batches = await WorkspaceService.getMyBatchesFromDB(studentMembershipId);

      expect(batches.length).toBe(1);
      expect(batches[0].batchId).toBe(batchAId);
      expect(batches[0].batchName).toBe("My Batches Test — Batch A");
      expect(batches[0].isCR).toBe(true);
    });

    it("returns an empty list for a membership with no enrollments", async () => {
      const otherStudent = await prisma.user.create({
        data: { email: `no-batches-test-${randomUUID().slice(0, 8)}@example.com`, name: "No Batches" },
      });
      const otherMembership = await prisma.membership.create({
        data: { userId: otherStudent.id, workspaceId: otherWorkspaceId, role: "STUDENT", status: "ACTIVE" },
      });

      const batches = await WorkspaceService.getMyBatchesFromDB(otherMembership.id);
      expect(batches).toEqual([]);

      await prisma.membership.delete({ where: { id: otherMembership.id } });
      await prisma.user.delete({ where: { id: otherStudent.id } });
    });
  });

  describe("Workspace CRUD & Member Operations", () => {
    it("getWorkspaceFromDB retrieves workspace and settings", async () => {
      const ws = await WorkspaceService.getWorkspaceFromDB({ workspaceId });
      expect(ws.id).toBe(workspaceId);
      expect(ws.settings).toBeDefined();
    });

    it("updateWorkspaceSettingsIntoDB updates timezone and thresholds", async () => {
      const updated = await WorkspaceService.updateWorkspaceSettingsIntoDB(workspaceId, "UTC", 20, 12);
      expect(updated.timezone).toBe("UTC");
      expect(updated.settings.defaultAttendanceDurationMins).toBe(20);
      expect(updated.settings.lateThresholdMins).toBe(12);
    });

    it("inviteMemberIntoDB invites a new user or connects existing user", async () => {
      const invitedEmail = `invited-${randomUUID().slice(0, 8)}@example.com`;
      const membership = await WorkspaceService.inviteMemberIntoDB(workspaceId, {
        email: invitedEmail,
        name: "Invited User",
        role: "STUDENT",
      });

      expect(membership.workspaceId).toBe(workspaceId);
      expect(membership.role).toBe("STUDENT");

      const members = await WorkspaceService.getListMembersFromDB({ workspaceId, page: 1, limit: 10 });
      expect(members.total).toBeGreaterThanOrEqual(2);

      const deactivated = await WorkspaceService.deactivateMemberIntoDB(membership.id);
      expect(deactivated.status).toBe("INACTIVE");
    });

    it("getWorkspaceFromDB throws Error when workspace ID does not exist", async () => {
      await expect(WorkspaceService.getWorkspaceFromDB({ workspaceId: "non-existent-ws-id" })).rejects.toThrow();
    });

    it("inviteMemberIntoDB returns existing membership if user is already a member", async () => {
      const invitedEmail = `existing-member-${randomUUID().slice(0, 8)}@example.com`;
      const first = await WorkspaceService.inviteMemberIntoDB(workspaceId, {
        email: invitedEmail,
        name: "Existing Member",
        role: "STUDENT",
      });
      const second = await WorkspaceService.inviteMemberIntoDB(workspaceId, {
        email: invitedEmail,
        name: "Existing Member",
        role: "STUDENT",
      });

      expect(second.id).toBe(first.id);
    });
  });
});
