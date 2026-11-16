import { createClient } from "lakebed/client";
import type app from "../../server/index";

export const client = createClient<typeof app>();
export type PollData = NonNullable<Awaited<ReturnType<typeof app.queries.poll>>>;
