import { Router } from "express";
import { z } from "zod";
import { imageGenerationSchema, videoGenerationSchema } from "@minifeel/tool-media-generation/runtime";
import { getAuth, validateFields } from "@/lib/middleware";
import { success, error } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().post("/", validateFields({
  projectId: z.uuid(), mediaType: z.enum(["image", "video"]),
}), async (req, res) => {
  const { projectId, mediaType, ...request } = req.body;
  const parsed = (mediaType === "image" ? imageGenerationSchema : videoGenerationSchema).safeParse(request);
  if (!parsed.success) {
    res.status(400).json(error("参数错误", parsed.error.issues, 400));
    return;
  }
  await u.providers.getRunnableModel(parsed.data.modelId, mediaType);
  const cwd = await u.projects.resolveProjectWorkspace(getAuth(res).user.id, projectId);
  const controller = new AbortController();
  const close = () => controller.abort();
  res.once("close", close);
  req.once("aborted", close);
  req.socket.once("close", close);
  try {
    const files = await u.mediaGeneration.generateMedia(cwd, mediaType, parsed.data, controller.signal);
    if (!res.destroyed) res.json(success(files));
  } finally {
    res.off("close", close);
    req.off("aborted", close);
    req.socket.off("close", close);
  }
});
