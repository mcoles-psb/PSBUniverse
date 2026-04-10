import {
	DELETE as gutterProjectsDelete,
	GET as gutterProjectsGet,
	PATCH as gutterProjectsPatch,
	POST as gutterProjectsPost,
} from "@/modules/gutter/services/gutter-project-save.service";

export const GET = gutterProjectsGet;
export const PATCH = gutterProjectsPatch;
export const DELETE = gutterProjectsDelete;
export const POST = gutterProjectsPost;
