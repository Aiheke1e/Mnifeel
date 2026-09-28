import { Router } from "express";
import { z } from "zod";
import { rateLimit, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const inputSchema = z.object({ email: z.string().min(3).max(254) });

export default Router().post("/", rateLimit("mockGoogleLogin", 10, 600), validateFields(inputSchema.shape), async (req, res) => {
  const input = inputSchema.parse(req.body);
  res.json(success(await u.auth.loginWithMockGoogle(input.email, req, res)));
});
