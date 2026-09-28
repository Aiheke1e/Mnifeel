import { Router } from "express";
import { z } from "zod";
import { validateFields, rateLimit } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const inputSchema = z.object({
  countryCode: z.string().min(2).max(8),
  phone: z.string().min(5).max(32),
  purpose: z.enum(["login", "resetPassword"]),
});

export default Router().post("/", rateLimit("requestCode", 5, 600), validateFields(inputSchema.shape), async (req, res) => {
  const input = inputSchema.parse(req.body);
  const phone = u.auth.normalizePhone(input.countryCode, input.phone);
  await u.auth.issueVerificationCode(phone, input.purpose);
  res.json(success(null, "验证码已生成"));
});
