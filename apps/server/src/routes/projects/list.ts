import { Router } from "express";
import { getAuth } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().get("/", async (_req, res) => {
  res.set("Cache-Control", "no-store").json(success(await u.projects.listProjects(getAuth(res).user.id)));
});
