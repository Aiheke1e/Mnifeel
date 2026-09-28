import { Router } from "express";
import { getAuth } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().get("/", async (_req, res) => {
  const auth = getAuth(res);
  res.json(success(await u.auth.listSessions(auth.user.id, auth.sessionId)));
});
