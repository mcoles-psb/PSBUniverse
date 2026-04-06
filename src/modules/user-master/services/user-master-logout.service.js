import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/modules/user-master/session/user-master.session";

export async function POST() {
  const response = NextResponse.json({ message: "Logout successful" });
  clearSessionCookie(response);
  return response;
}


