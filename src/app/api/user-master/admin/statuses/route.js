import {
  DELETE as statusesDelete,
  GET as statusesGet,
  PATCH as statusesPatch,
  POST as statusesPost,
} from "@/modules/user-master/services/user-master-admin-statuses.service";

export const GET = statusesGet;
export const POST = statusesPost;
export const PATCH = statusesPatch;
export const DELETE = statusesDelete;
