import {
  DELETE as departmentsDelete,
  GET as departmentsGet,
  PATCH as departmentsPatch,
  POST as departmentsPost,
} from "@/modules/user-master/services/user-master-admin-departments.service";

export const GET = departmentsGet;
export const POST = departmentsPost;
export const PATCH = departmentsPatch;
export const DELETE = departmentsDelete;
