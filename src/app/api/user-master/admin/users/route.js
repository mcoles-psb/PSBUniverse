import {
  DELETE as usersDelete,
  GET as usersGet,
  PATCH as usersPatch,
  POST as usersPost,
} from "@/modules/user-master/services/user-master-admin-users.service";

export const GET = usersGet;
export const POST = usersPost;
export const PATCH = usersPatch;
export const DELETE = usersDelete;

