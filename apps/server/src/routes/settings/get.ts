import u from "@/utils";
import { Router } from "express";
import { success } from "@/lib/responseFormat";

const router = Router();

export default router.get("/", (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const { customProviders: _customProviders, mediaProviderConfigs: _mediaProviderConfigs, ...settings } = u.conf.get("settings", {});
  res.set("Cache-Control", "no-store");
  res.json(success(settings));
});
