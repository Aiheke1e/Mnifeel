import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { error } from "./responseFormat";
import { resolveSession, type AuthContext } from "@/utils/auth/session";
import { consumeRateLimit } from "@/utils/auth";

import { zhCN } from "zod/locales";

z.config(zhCN());

export function validateFields(
  shape: Record<string, z.ZodType>,
  source: "body" | "query" | "params" = "body", // 默认校验 body
) {
  const schema = z.object(shape);

  return (req: Request, res: Response, next: NextFunction) => {
    const data = req[source];
    const parseResult = schema.safeParse(data);
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((issue) => `字段 ${issue.path.join(".")} ${issue.message}`);
      console.error(errors);
      return res.status(400).json(error("参数错误", errors));
    }
    next();
  };
}

export async function resolveAuth(req: Request, res: Response, next: NextFunction) {
  try {
    res.locals.auth = await resolveSession(req);
    next();
  } catch (reason) {
    next(reason);
  }
}

export function getAuth(res: Response): AuthContext {
  const auth = res.locals.auth as AuthContext | null | undefined;
  if (!auth) throw Object.assign(new Error("请先登录"), { status: 401 });
  return auth;
}

export function requireAuth(_req: Request, res: Response, next: NextFunction) {
  if (!res.locals.auth) return res.status(401).json(error("请先登录", null, 401));
  next();
}

export function requireAdmin(_req: Request, res: Response, next: NextFunction) {
  const auth = res.locals.auth as AuthContext | null | undefined;
  if (!auth) return res.status(401).json(error("请先登录", null, 401));
  if (auth.user.role !== "admin") return res.status(403).json(error("没有管理员权限", null, 403));
  next();
}

export function rateLimit(name: string, limit: number, windowSeconds: number) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const identity = typeof req.body?.phone === "string" ? req.body.phone : typeof req.body?.email === "string" ? req.body.email : "";
      await consumeRateLimit(name, `${req.ip}:${identity}`, limit, windowSeconds);
      next();
    } catch (reason) {
      next(reason);
    }
  };
}
