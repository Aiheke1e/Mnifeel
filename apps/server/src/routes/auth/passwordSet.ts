import { Router } from "express";
import { z } from "zod";
import { getAuth, validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const inputSchema = z.object({ password: z.string().min(8).max(128) });

export default Router().put("/", validateFields(inputSchema.shape), async (req, res) => {
  const input = inputSchema.parse(req.body);
  await u.auth.setPassword(getAuth(res).user.id, input.password);
  res.json(success());
});
