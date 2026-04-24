"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ADMIN_NAV, redirectForAdminSession, refreshAdminSession } from "./lib";
import { AppShell } from "../components/app-shell";
import {
  apiRequest,
  asArray,
  EMPTY_ADMIN_SESSION,
  formatApiError,
  itemLabel,
  loadSession,
  saveSession,
  SessionState,
} from "../lib/api";

type OverviewState = {
  overview: Record<string, unknown> | null;
  loading: boolean;
  errorMessage: string;
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionState>(EMPTY_ADMIN_SESSION);
  const [state, setState] = useState<OverviewState>({
    overview: null,
    loading: true,
    errorMessage: "",
  });

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

        const overviewResponse = await apiRequest<Record<string, unknown>>({
          baseUrl: updatedSession.baseUrl,
          path: "/admin/overview",
          method: "GET",
          token: updatedSession.accessToken,
        });

        setState({
          overview: (overviewResponse.data || null) as Record<string, unknown> | null,
          loading: false,
          errorMessage: "",
        });
      } catch (error) {
        setState({
          overview: null,
          loading: false,
          errorMessage: formatApiError(error, "加载管理员概览失败"),
        });
      }
    }

    void hydrate();
  }, [router]);

  const statsEntries = useMemo(() => {
    const stats = (state.overview?.stats as Record<string, unknown> | undefined) || {};
    return Object.entries(stats);
  }, [state.overview]);

  const performanceEntries = useMemo(() => {
    const performance = (state.overview?.performance as Record<string, unknown> | undefined) || {};
    return Object.entries(performance);
  }, [state.overview]);

  const alerts = asArray((state.overview?.observability as Record<string, unknown> | undefined)?.alerts);
  const config = ((state.overview?.observability as Record<string, unknown> | undefined)?.config ||
    null) as Record<string, unknown> | null;

  if (!session.accessToken) {
    return null;
  }

  return (
    <AppShell
      session={session}
      title="管理员概览"
      subtitle="这里使用管理员登录态请求 `/admin/overview`，集中展示系统概览、性能指标、告警和脱敏配置。"
      navItems={ADMIN_NAV}
      logoutTo="/admin/login"
    >
      <section className="content-grid">
        <article className="hero-card admin-hero-card">
          <span className="card-tag">Admin</span>
          <h2>{itemLabel(session.user, "nickname", "email") || "管理员"}</h2>
          <p>
            当前组织是 <strong>{itemLabel(session.organization, "name") || "默认组织"}</strong>
            {itemLabel(session.member, "role") ? `，角色为 ${itemLabel(session.member, "role")}` : ""}。
            这个页面适合作为后台总览入口，后面可以继续扩展知识库、文档、套餐和审计等管理模块。
          </p>
        </article>

        <article className="info-card">
          <h3>后台访问状态</h3>
          <ul className="plain-list">
            <li>后端地址：{session.baseUrl}</li>
            <li>管理员登录态：{session.accessToken ? "已建立" : "未建立"}</li>
            <li>首次改密状态：{session.mustChangePassword ? "待修改" : "已完成"}</li>
          </ul>
          {state.loading ? <p className="muted-copy">正在加载管理员概览...</p> : null}
          {state.errorMessage ? <div className="feedback feedback-error">{state.errorMessage}</div> : null}
        </article>
      </section>

      <section className="dashboard-grid admin-stats-grid">
        <article className="info-card">
          <h3>系统统计</h3>
          {statsEntries.length > 0 ? (
            <div className="key-metrics">
              {statsEntries.map(([key, value]) => (
                <div key={key} className="metric-tile">
                  <span>{key}</span>
                  <strong>{String(value)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted-copy">当前没有可展示的统计信息。</p>
          )}
        </article>

        <article className="info-card">
          <h3>告警配置</h3>
          {alerts.length > 0 ? (
            <div className="alert-list">
              {alerts.map((alert, index) => (
                <div key={`${itemLabel(alert, "name")}-${index}`} className="alert-card">
                  <strong>{itemLabel(alert, "name") || `alert-${index + 1}`}</strong>
                  <p>{itemLabel(alert, "threshold") || "暂无阈值说明"}</p>
                  <span>{itemLabel(alert, "status") || "unknown"}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted-copy">当前没有可展示的告警配置。</p>
          )}
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="info-card">
          <h3>性能与缓存</h3>
          <div className="admin-detail-list">
            {performanceEntries.length > 0 ? (
              performanceEntries.map(([key, value]) => (
                <div key={key} className="admin-detail-item">
                  <strong>{key}</strong>
                  <pre className="mini-box">{JSON.stringify(value, null, 2)}</pre>
                </div>
              ))
            ) : (
              <p className="muted-copy">当前没有可展示的性能数据。</p>
            )}
          </div>
        </article>

        <article className="info-card">
          <h3>脱敏配置快照</h3>
          <pre className="data-box">{JSON.stringify(config ?? {}, null, 2)}</pre>
        </article>
      </section>
    </AppShell>
  );
}
