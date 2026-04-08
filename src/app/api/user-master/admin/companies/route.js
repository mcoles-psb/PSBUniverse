import {
  DELETE as companiesDelete,
  GET as companiesGet,
  PATCH as companiesPatch,
  POST as companiesPost,
} from "@/modules/user-master/services/user-master-admin-companies.service";

export const GET = companiesGet;
export const POST = companiesPost;
export const PATCH = companiesPatch;
export const DELETE = companiesDelete;
