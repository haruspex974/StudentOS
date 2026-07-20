import { z } from "zod";
import { ApiResponse } from "./api-response";
import { asyncHandler } from "./async-handler";
import { BadRequestError } from "./errors";
import { Validator, validateRequest } from "./validation";

describe("Common utilities", () => {
  it("ApiResponse.success adds meta only when provided", () => {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    ApiResponse.success(res, { ok: true }, 201, { page: 1 });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ data: { ok: true }, meta: { page: 1 } });
  });

  it("ApiResponse.created and accepted delegate to success", () => {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    ApiResponse.created(res, { created: true });
    ApiResponse.accepted(res, { accepted: true });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it("asyncHandler forwards errors to next", () => {
    const next = jest.fn();
    const handler = asyncHandler(async () => {
      throw new Error("boom");
    });

    handler({} as any, {} as any, next);

    setImmediate(() => {
      expect(next).toHaveBeenCalled();
    });
  });

  it("Validator.assertRequired throws for empty values", () => {
    expect(() => Validator.assertRequired(undefined, "required")).toThrow(BadRequestError);
    expect(() => Validator.assertRequired("", "required")).toThrow(BadRequestError);
    expect(() => Validator.assertRequired("value", "required")).not.toThrow();
  });

  it("Validator.assertPattern validates regex usage", () => {
    expect(() => Validator.assertPattern("abc", /abc/, "invalid")).not.toThrow();
    expect(() => Validator.assertPattern("abc", /def/, "invalid")).toThrow(BadRequestError);
  });

  it("validateRequest passes parsed data to next and throws on invalid input", () => {
    const schema = z.object({
      body: z.object({ name: z.string() }),
      query: z.object({}).strict(),
      params: z.object({}).strict(),
    });

    const next = jest.fn();
    const req: any = { body: { name: "Ada" }, query: {}, params: {} };
    const res: any = {};

    validateRequest(schema)(req, res, next);
    expect(next).toHaveBeenCalled();

    expect(() => validateRequest(schema)({ body: {}, query: {}, params: {} } as any, res, next)).toThrow(
      BadRequestError,
    );
  });

  it("instantiates custom ApiError subclasses with correct default status codes and error codes", () => {
    const { UnauthorizedError, ForbiddenError, NotFoundError, InternalServerError } = require("./errors");

    const unauth = new UnauthorizedError();
    expect(unauth.statusCode).toBe(401);
    expect(unauth.code).toBe("UNAUTHENTICATED");

    const forbidden = new ForbiddenError();
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.code).toBe("FORBIDDEN");

    const notFound = new NotFoundError("not found");
    expect(notFound.statusCode).toBe(404);
    expect(notFound.code).toBe("NOT_FOUND");

    const internalErr = new InternalServerError();
    expect(internalErr.statusCode).toBe(500);
    expect(internalErr.code).toBe("INTERNAL_SERVER_ERROR");
  });
});
