import {
  DELETE as rolesDelete,
  GET as rolesGet,
  PATCH as rolesPatch,
  POST as rolesPost,
} from "@/modules/user-master/services/user-master-admin-roles.service";

export const GET = rolesGet;
export const POST = rolesPost;
export const PATCH = rolesPatch;
export const DELETE = rolesDelete;

