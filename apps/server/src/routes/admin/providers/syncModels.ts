import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().post("/", validateFields({ providerId: z.uuid() }), async (req, res) => {
  res.set("Cache-Control", "no-store").json(success(
    await u.providers.syncProviderModels(getAuth(res).user.id, req.body.providerId, AbortSignal.timeout(30000)),
  ));
});
