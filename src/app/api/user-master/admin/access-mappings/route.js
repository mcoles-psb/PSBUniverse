import {
  DELETE as mappingsDelete,
  GET as mappingsGet,
  POST as mappingsPost,
} from "@/modules/user-master/services/user-master-admin-access-mappings.service";

export const GET = mappingsGet;
export const POST = mappingsPost;
export const DELETE = mappingsDelete;

