import { Router } from "express";
import { z } from "zod";
import { rateLimit, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const inputSchema = z.object({
  countryCode: z.string().min(2).max(8),
  phone: z.string().min(5).max(32),
  code: z.string().min(1).max(32),
  password: z.string().min(8).max(128),
});

export default Router().put("/", rateLimit("passwordReset", 5, 600), validateFields(inputSchema.shape), async (req, res) => {
  const input = inputSchema.parse(req.body);
  const phone = u.auth.normalizePhone(input.countryCode, input.phone);
  await u.auth.resetPassword(phone, input.code, input.password);
  res.json(success());
});
