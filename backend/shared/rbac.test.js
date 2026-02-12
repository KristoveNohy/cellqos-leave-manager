import assert from "node:assert/strict";
import test from "node:test";
import { requireAdmin, requireManager } from "./rbac";
import { HttpError } from "./http-error";
test("requireManager allows manager roles", () => {
    assert.doesNotThrow(() => requireManager("MANAGER"));
    assert.doesNotThrow(() => requireManager("ADMIN"));
});
test("requireManager rejects non-manager roles", () => {
    assert.throws(() => requireManager("EMPLOYEE"), (err) => {
        return err instanceof HttpError && err.status === 403;
    });
});
test("requireAdmin allows only admins", () => {
    assert.doesNotThrow(() => requireAdmin("ADMIN"));
    assert.throws(() => requireAdmin("MANAGER"), (err) => {
        return err instanceof HttpError && err.status === 403;
    });
});
//# sourceMappingURL=rbac.test.js.map