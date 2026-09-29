import { Router } from "express";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().get("/", async (_req, res) => {
  res.set("Cache-Control", "no-store").json(success(await u.projects.listLegacyProjects()));
});
