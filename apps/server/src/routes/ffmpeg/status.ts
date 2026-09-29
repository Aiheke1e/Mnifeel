import { Router } from "express";
import { requireAdmin } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().get("/", requireAdmin, async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  res.set("Cache-Control", "no-store").json(success(await u.ffmpeg.getStatus()));
});
