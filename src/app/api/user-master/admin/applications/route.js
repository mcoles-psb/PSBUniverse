import {
  DELETE as applicationsDelete,
  GET as applicationsGet,
  PATCH as applicationsPatch,
  POST as applicationsPost,
} from "@/modules/user-master/services/user-master-admin-applications.service";

export const GET = applicationsGet;
export const POST = applicationsPost;
export const PATCH = applicationsPatch;
export const DELETE = applicationsDelete;

