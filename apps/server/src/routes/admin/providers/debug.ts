import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const maxReferenceBytes = 10 * 1024 * 1024;
function referenceMimeType(data: string) {
  const bytes = Buffer.from(data, "base64");
  if (bytes.length > maxReferenceBytes) return;
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
}

const imageUrlSchema = z.string().trim().min(1).max(2048).refine(
  url => /^https?:\/\//i.test(url) && URL.canParse(url),
  "图片必须为公网 HTTP(S) URL",
);

const inputSchema = z.object({
  providerId: z.uuid(),
  modelId: z.uuid(),
  prompt: z.string().trim().min(1).max(100_000),
  referenceImage: z.object({
    data: z.string().min(1).max(Math.ceil(maxReferenceBytes / 3) * 4).base64(),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  }).strict().refine(image => referenceMimeType(image.data) === image.mimeType, "参考图内容与格式不一致或超过 10 MB").optional(),
  firstFrameUrl: imageUrlSchema.optional(),
  referenceImageUrls: z.array(imageUrlSchema).max(5).optional(),
});

export default Router().post("/", validateFields(inputSchema.shape), async (req, res) => {
  const controller = new AbortController();
  res.once("close", () => { if (!res.writableEnded) controller.abort(); });
  res.set("Cache-Control", "no-store").json(success(
    await u.providers.debugProviderModel(
      getAuth(res).user.id,
      inputSchema.parse(req.body),
      AbortSignal.any([controller.signal, AbortSignal.timeout(30 * 60_000)]),
    ),
  ));
});
