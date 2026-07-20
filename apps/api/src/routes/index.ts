import { Router } from "express";
import attendanceRouter from "../modules/attendance/attendance.routes";
import authRouter from "../modules/auth/auth.routes";
import batchRouter from "../modules/batch/batch.routes";
import sessionRouter from "../modules/session/session.routes";
import importRouter from "../modules/student-import/import.routes";
import studentRouter from "../modules/student/student.routes";
import workspaceRouter from "../modules/workspace/workspace.routes";

const apiRouter = Router();

apiRouter.use(authRouter);
apiRouter.use(importRouter);
apiRouter.use(studentRouter);
apiRouter.use(attendanceRouter);
apiRouter.use(batchRouter);
apiRouter.use(workspaceRouter);
apiRouter.use(sessionRouter);

export { apiRouter };
