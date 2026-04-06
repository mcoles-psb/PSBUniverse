import { NextResponse } from "next/server";
import {
  updateUserAccount,
  USER_MASTER_COLUMNS,
  USER_MASTER_TABLES,
} from "@/modules/user-master/access/user-master.access";
import { hashPassword } from "@/core/security/password.security";
import { assertUserReferencesValid } from "@/modules/user-master/validators/user-master.validator";
import {
  getAuthenticatedContext,
  sanitizeUserRecord,
  toErrorResponse,
} from "@/modules/user-master/services/user-master-route-auth.service";

const ALLOWED_PROFILE_FIELDS = [
  "username",
  "email",
  "first_name",
  "last_name",
  "phone",
  "address",
  "comp_id",
  "dept_id",
  "status_id",
  "is_active",
];

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

async function loadProfileRelations(supabaseClient, userRecord) {
  const [companyRes, departmentRes, statusRes] = await Promise.all([
    hasValue(userRecord?.comp_id)
      ? supabaseClient
          .from(USER_MASTER_TABLES.companies)
          .select("*")
          .eq("comp_id", userRecord.comp_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    hasValue(userRecord?.dept_id)
      ? supabaseClient
          .from(USER_MASTER_TABLES.departments)
          .select("*")
          .eq("dept_id", userRecord.dept_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    hasValue(userRecord?.status_id)
      ? supabaseClient
          .from(USER_MASTER_TABLES.statuses)
          .select("*")
          .eq("status_id", userRecord.status_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (companyRes.error) throw companyRes.error;
  if (departmentRes.error) throw departmentRes.error;
  if (statusRes.error) throw statusRes.error;

  return {
    company: companyRes.data || null,
    department: departmentRes.data || null,
    status: statusRes.data || null,
  };
}

export async function GET() {
  try {
    const auth = await getAuthenticatedContext();
    if (auth.error) return auth.error;

    const relations = await loadProfileRelations(auth.supabaseClient, auth.userRecord);

    return NextResponse.json({
      user: sanitizeUserRecord(auth.userRecord),
      relations,
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to load user profile", 500);
  }
}

export async function PATCH(request) {
  try {
    const auth = await getAuthenticatedContext();
    if (auth.error) return auth.error;

    const body = await request.json();
    const updates = {};

    ALLOWED_PROFILE_FIELDS.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(body || {}, field)) {
        updates[field] = body[field];
      }
    });

    if (hasValue(body?.password)) {
      updates.password_hash = await hashPassword(body.password);
    }

    if (Object.keys(updates).length === 0) {
      return toErrorResponse("No valid profile fields were provided", 400);
    }

    await assertUserReferencesValid(auth.supabaseClient, {
      comp_id: updates.comp_id,
      dept_id: updates.dept_id,
      status_id: updates.status_id,
      existingCompanyId: auth.userRecord.comp_id,
    });

    const updatedUser = await updateUserAccount({
      userId: auth.userRecord[USER_MASTER_COLUMNS.userId],
      updates,
      actorUserId: auth.userRecord[USER_MASTER_COLUMNS.userId],
      supabaseClient: auth.supabaseClient,
    });

    const relations = await loadProfileRelations(auth.supabaseClient, updatedUser);

    return NextResponse.json({
      message: "Profile updated",
      user: sanitizeUserRecord(updatedUser),
      relations,
    });
  } catch (error) {
    return toErrorResponse(error?.message || "Unable to update profile", 500);
  }
}


