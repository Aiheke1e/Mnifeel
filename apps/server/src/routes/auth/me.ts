import { Router } from "express";
import { getAuth } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().get("/", (_req, res) => {
  res.json(success({
    user: getAuth(res).user,
    mockGoogleEnabled: u.auth.mockGoogleEnabled(),
  }));
});
