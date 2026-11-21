import { dispatch } from "@/server/api/routes";
import { api } from "@/server/context";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => dispatch(api, request);
