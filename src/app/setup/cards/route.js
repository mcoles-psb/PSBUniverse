import {
  DELETE as setupCardsDelete,
  GET as setupCardsGet,
  PATCH as setupCardsPatch,
  POST as setupCardsPost,
} from "@/modules/user-master/services/user-master-setup-cards.service";

export const GET = setupCardsGet;
export const POST = setupCardsPost;
export const PATCH = setupCardsPatch;
export const DELETE = setupCardsDelete;
