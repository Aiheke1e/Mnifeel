import { Router } from "express";
import { z } from "zod";
import { rateLimit, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const inputSchema = z.object({
  countryCode: z.string().min(2).max(8),
  phone: z.string().min(5).max(32),
  code: z.string().min(1).max(32),
});

export default Router().post("/", rateLimit("phoneLogin", 10, 600), validateFields(inputSchema.shape), async (req, res) => {
  const input = inputSchema.parse(req.body);
  const phone = u.auth.normalizePhone(input.countryCode, input.phone);
  res.json(success(await u.auth.loginWithPhone(phone, input.code, req, res)));
});
