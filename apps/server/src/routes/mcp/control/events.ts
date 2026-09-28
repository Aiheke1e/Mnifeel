import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { getAuth, validateFields } from "@/lib/middleware";

export default Router().get("/", validateFields({ connectionId: z.uuid() }, "query"), (req, res) => {
  u.mcpControl.assertControlRequest(req);
  u.mcpControl.connectControl(req.query.connectionId as string, getAuth(res).user.id, res);
});
