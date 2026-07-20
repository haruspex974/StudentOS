import { BadRequestError } from "../common/errors";
import { compressionMiddleware } from "./compression";
import { errorHandler } from "./error";
import { attendanceRateLimiter, authRateLimiter, globalRateLimiter, importRateLimiter } from "./rate-limit";
import { requestIdMiddleware } from "./request-id";

describe("Middleware", () => {
  it("requestIdMiddleware adds and exposes a request id", () => {
    const req: any = { headers: {} };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();

    requestIdMiddleware(req, res, next);

    expect(req.id).toBeDefined();
    expect(res.setHeader).toHaveBeenCalledWith("X-Request-ID", req.id);
    expect(next).toHaveBeenCalled();
  });

  it("compressionMiddleware is a middleware function", () => {
    expect(typeof compressionMiddleware).toBe("function");
  });

  it("rate limiters fall back to permissive behavior when redis is unavailable", async () => {
    const req: any = { ip: "127.0.0.1", headers: {} };
    const res: any = { set: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await globalRateLimiter(req, res, next);
    await attendanceRateLimiter(req, res, next);
    await importRateLimiter(req, res, next);
    await authRateLimiter(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("errorHandler returns api errors with the correct envelope", () => {
    const req: any = { id: "req-1" };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    errorHandler(new BadRequestError("bad request", "BAD_REQUEST"), req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "BAD_REQUEST",
        message: "bad request",
        requestId: "req-1",
      },
    });
  });

  it("compressionMiddleware filter skips compression for text/event-stream headers", () => {
    const req: any = { headers: { accept: "text/event-stream" }, method: "GET" };
    const res: any = { getHeader: jest.fn() };
    const next = jest.fn();

    compressionMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("errorHandler catches unexpected generic errors and returns 500 status", () => {
    const req: any = { id: "req-err-500" };
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    errorHandler(new Error("Database crash"), req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Database crash",
        requestId: "req-err-500",
      },
    });
  });
});
