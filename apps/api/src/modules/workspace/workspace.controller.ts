import { IMemberResult } from "@studentos/shared-types";
import { Response } from "express";
import { ApiResponse } from "../../common/api-response";
import { asyncHandler } from "../../common/async-handler";
import { buildPaginationMeta, parsePagination } from "../../utils/pagination";
import { WorkspaceService } from "./workspace.service";

export class WorkspaceController {
  static getWorkspace = asyncHandler(
    async (req: any, res: Response): Promise<void> => {
      const workspaceId = req.membership.workspaceId;
      const workspace = await WorkspaceService.getWorkspaceFromDB({ workspaceId });
      ApiResponse.success(res, workspace, 200);
    },
  );

  static updateWorkspaceSettings = asyncHandler(
    async (req: any, res: Response): Promise<void> => {
      const { timezone, defaultAttendanceDurationMins, lateThresholdMins } =
        req.body;

      const workspaceId = req.membership.workspaceId;

      const workspace = await WorkspaceService.updateWorkspaceSettingsIntoDB(
        workspaceId,
        timezone,
        defaultAttendanceDurationMins,
        lateThresholdMins,
      );

      ApiResponse.success(res, workspace, 200);
    },
  );

  static inviteMember = asyncHandler(
    async (req: any, res: Response): Promise<void> => {
      const { email, name, role } = req.body;
      const workspaceId = req.membership.workspaceId;
      const membership = await WorkspaceService.inviteMemberIntoDB(workspaceId, {
        email,
        name,
        role,
      });

      ApiResponse.created(res, {
        id: membership.id,
        role: membership.role,
        user: membership.user,
      });
    },
  );

  static getListMembers = asyncHandler(
    async (req: any, res: Response): Promise<void> => {
      const workspaceId = req.membership.workspaceId;
      const { page, limit } = parsePagination(req.query);
      const { total, memberships } = await WorkspaceService.getListMembersFromDB({
        workspaceId,
        page,
        limit,
      });

      ApiResponse.success(
        res,
        memberships.map((membership: IMemberResult) => ({
          id: membership.id,
          role: membership.role,
          status: membership.status,
          user: membership.user,
        })),
        200,
        buildPaginationMeta(page, limit, total),
      );
    },
  );

  static getMyBatches = asyncHandler(
    async (req: any, res: Response): Promise<void> => {
      const membershipId = req.membership.id;
      const batches = await WorkspaceService.getMyBatchesFromDB(membershipId);
      ApiResponse.success(res, batches, 200);
    },
  );

  static deactivateMember = asyncHandler(
    async (req: any, res: Response): Promise<void> => {
      const membershipId = req.params.membershipId;

      await WorkspaceService.deactivateMemberIntoDB(membershipId as string);

      ApiResponse.success(res, null, 200);
    },
  );
}
