import {
  DELETE as mappingsDelete,
  GET as mappingsGet,
  PATCH as mappingsPatch,
  POST as mappingsPost,
} from "@/modules/user-master/services/user-master-admin-access-mappings.service";

export const GET = mappingsGet;
export const POST = mappingsPost;
export const PATCH = mappingsPatch;
export const DELETE = mappingsDelete;

