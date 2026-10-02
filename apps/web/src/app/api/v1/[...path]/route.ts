import { dispatch } from "@/server/api/routes";
import { api } from "@/server/context";

// Every REST route of apps/web/openapi/drift-api.yaml goes through one table (src/server/api/routes.ts).
export const dynamic = "force-dynamic";

const handle = (request: Request) => dispatch(api, request);

export { handle as DELETE, handle as GET, handle as PATCH, handle as POST, handle as PUT };
