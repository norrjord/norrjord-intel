import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { todoRouter } from "./todo";
import { entityRouter } from "./entity";
import { contactRouter } from "./contact";
import { pipelineRouter } from "./pipeline";
import { interactionRouter } from "./interaction";
import { draftRouter } from "./draft";
import { dashboardRouter } from "./dashboard";
import { webhookRouter } from "./webhook";
import { discoveryRouter } from "./discovery";
import { outreachRouter } from "./outreach";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  privateData: protectedProcedure.handler(({ context }) => {
    return {
      message: "This is private",
      user: context.session?.user,
    };
  }),
  todo: todoRouter,
  entity: entityRouter,
  contact: contactRouter,
  pipeline: pipelineRouter,
  interaction: interactionRouter,
  draft: draftRouter,
  dashboard: dashboardRouter,
  webhook: webhookRouter,
  discovery: discoveryRouter,
  outreach: outreachRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
