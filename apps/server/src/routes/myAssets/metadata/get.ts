import { Router } from "express";
import u from "@/utils";
import { getAuth } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().get("/", async (_req, res) => {
  res.set("Cache-Control", "no-store").json(success(await u.assets.readAssetMetadata(getAuth(res).user.id)));
});
