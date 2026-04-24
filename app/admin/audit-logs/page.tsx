"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ADMIN_NAV, redirectForAdminSession, refreshAdminSession } from "../lib";
import { AppShell } from "../../components/app-shell";
import {
  apiRequest,
  asArray,
  EMPTY_ADMIN_SESSION,
  formatApiError,
  itemLabel,
  loadSession,
  saveSession,
  SessionState,
} from "../../lib/api";

export default function AdminAuditLogsPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionState>(EMPTY_ADMIN_SESSION);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const nextSession = loadSession("admin");
    setSession(nextSession);
    if (redirectForAdminSession(router, nextSession)) {
      return;
    }

    async function hydrate() {
      try {
        const updatedSession = await refreshAdminSession(nextSession);
        setSession(updatedSession);
        saveSession(updatedSession);
        const response = await apiRequest({
          baseUrl: updatedSession.baseUrl,
          path: "/admin/audit-logs",
          method: "GET",
          token: updatedSession.accessToken,
        });
        setItems(asArray((response.data as Record<string, unknown> | undefined)?.items));
      } catch (error) {
        setErrorMessage(formatApiError(error, "加载审计日志失败"));
      } finally {
        setLoading(false);
      }
    }

    void hydrate();
  }, [router]);

  if (!session.accessToken) {
    return null;
  }

  return (
    <AppShell
      session={session}
      title="审计日志"
      subtitle="用于查看管理员操作、支付回调和权限拦截等关键事件，帮助快速追踪后台行为。"
      navItems={ADMIN_NAV}
      logoutTo="/admin/login"
    >
      <section className="content-grid">
        <article className="info-card">
          <h3>日志说明</h3>
          <ul className="plain-list">
            <li>数据来自 `/admin/audit-logs`。</li>
            <li>适合排查谁在什么时候执行了什么管理操作。</li>
            <li>详情字段里会展示审计附加信息，便于快速定位上下文。</li>
          </ul>
        </article>

        <article className="info-card">
          <h3>当前状态</h3>
          {loading ? <p className="muted-copy">正在加载审计日志...</p> : null}
          {errorMessage ? <div className="feedback feedback-error">{errorMessage}</div> : null}
          {!loading && !errorMessage ? <p className="muted-copy">共加载 {items.length} 条审计记录。</p> : null}
        </article>
      </section>

      <section className="admin-grid-list">
        {items.map((item, index) => (
          <article key={`${itemLabel(item, "id", "request_id")}-${index}`} className="info-card">
            <div className="card-row">
              <div>
                <span className="card-tag">{itemLabel(item, "action") || "audit"}</span>
                <h3>{itemLabel(item, "target_type", "action") || "审计事件"}</h3>
              </div>
              <div className="status-chip">{itemLabel(item, "created_at") || "unknown time"}</div>
            </div>
            <p>
              target_id: {itemLabel(item, "target_id") || "-"} · request_id: {itemLabel(item, "request_id") || "-"}
            </p>
            <pre className="mini-box">{JSON.stringify(item, null, 2)}</pre>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
