import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().post("/", validateFields({ projectId: z.uuid() }), async (req, res) => {
  await u.projects.archiveProject(getAuth(res).user.id, req.body.projectId);
  res.json(success());
});
