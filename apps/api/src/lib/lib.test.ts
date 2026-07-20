import { logger } from "./logger";
import { redis } from "./redis";

jest.mock("../config/env", () => ({
  env: {
    UPSTASH_REDIS_REST_URL: "https://example.com",
    UPSTASH_REDIS_REST_TOKEN: "token",
  },
}));

describe("Library helpers", () => {
  it("logger exists and can be used for child logging", () => {
    const child = logger.child({ module: "test" });
    expect(child).toBeDefined();
  });

  it("redis export is initialized when env values are present", () => {
    expect(redis).toBeDefined();
  });
});
