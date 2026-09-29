import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const metadataFields = {
  path: z.string().min(1).max(4096),
  metadata: z.object({
    characterName: z.string().max(80),
    version: z.string().max(40),
    status: z.enum(["selected", "alternative", "unset"]),
    appearance: z.string().max(1000),
    episodes: z.string().max(200),
  }),
};

export default Router().put("/", validateFields(metadataFields), async (req, res) => {
  const userId = getAuth(res).user.id;
  const metadata = await u.assets.readAssetMetadata(userId);
  metadata[req.body.path] = req.body.metadata;
  await u.assets.writeAssetMetadata(userId, metadata);
  res.json(success());
});
