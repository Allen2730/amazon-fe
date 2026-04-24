"use client";

import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { apiRequest, buildUrl, SessionState } from "../lib/api";

export const ADMIN_NAV = [
  { href: "/admin", label: "概览" },
  { href: "/admin/knowledge-bases", label: "知识库" },
  { href: "/admin/documents", label: "文档" },
  { href: "/admin/plans", label: "套餐" },
  { href: "/admin/audit-logs", label: "审计" },
  { href: "/admin/ai-logs", label: "AI 日志" },
  { href: "/admin/change-password", label: "修改密码" },
];

export async function refreshAdminSession(session: SessionState): Promise<SessionState> {
  const meResponse = await apiRequest({
    baseUrl: session.baseUrl,
    path: "/auth/me",
    method: "GET",
    token: session.accessToken,
  });
  const meData = meResponse.data || {};
  return {
    ...session,
    user: (meData.user as Record<string, unknown>) || session.user,
    organization: (meData.organization as Record<string, unknown>) || session.organization,
    member: (meData.member as Record<string, unknown>) || session.member,
  };
}

export function redirectForAdminSession(router: AppRouterInstance, session: SessionState): boolean {
  if (!session.accessToken) {
    router.replace("/admin/login");
    return true;
  }
  if (session.mustChangePassword) {
    router.replace("/admin/change-password");
    return true;
  }
  return false;
}

export async function uploadAdminFormData<T = Record<string, unknown>>(
  session: SessionState,
  path: string,
  formData: FormData,
): Promise<T> {
  const response = await fetch(buildUrl(session.baseUrl, path), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: formData,
  });

  const payload = (await response.json()) as {
    code?: number;
    message?: string;
    request_id?: string;
    trace_id?: string;
    error?: Record<string, unknown>;
    data?: T;
  };

  if (!response.ok) {
    const message = payload.message || `Request failed with status ${response.status}`;
    const details = [
      `message: ${message}`,
      `status: ${response.status}`,
      typeof payload.code === "number" ? `code: ${payload.code}` : "",
      payload.request_id ? `request_id: ${payload.request_id}` : "",
      payload.trace_id ? `trace_id: ${payload.trace_id}` : "",
      payload.error ? `error: ${JSON.stringify(payload.error, null, 2)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    throw new Error(details);
  }

  return (payload.data || {}) as T;
}
