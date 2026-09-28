import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().get("/", validateFields({ projectId: z.uuid() }, "query"), async (req, res) => {
  const project = await u.projects.getProjectSummary(getAuth(res).user.id, req.query.projectId as string);
  res.set("Cache-Control", "no-store").json(success(project));
});
