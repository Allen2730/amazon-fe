"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "./components/app-shell";
import { apiRequest, DEFAULT_BASE_URL, EMPTY_SESSION, formatApiError, itemLabel, loadSession, saveSession, SessionState } from "./lib/api";

export default function HomePage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionState>(EMPTY_SESSION);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const nextSession = loadSession("user");
    setSession(nextSession);

    if (!nextSession.accessToken) {
      router.replace("/login");
      return;
    }

    async function hydrate() {
      try {
        const response = await apiRequest({
          baseUrl: nextSession.baseUrl || DEFAULT_BASE_URL,
          path: "/auth/me",
          method: "GET",
          token: nextSession.accessToken,
        });
        const data = response.data || {};
        const updatedSession = {
          ...nextSession,
          user: (data.user as Record<string, unknown>) || nextSession.user,
          organization: (data.organization as Record<string, unknown>) || nextSession.organization,
          member: (data.member as Record<string, unknown>) || nextSession.member,
        };
        setSession(updatedSession);
        saveSession(updatedSession);
      } catch (error) {
        setErrorMessage(formatApiError(error, "加载首页信息失败"));
      } finally {
        setLoading(false);
      }
    }

    void hydrate();
  }, [router]);

  if (!session.accessToken) {
    return null;
  }

  const userName = itemLabel(session.user, "nickname", "name", "email");
  const orgName = itemLabel(session.organization, "name");
  const roleName = itemLabel(session.member, "role");

  return (
    <AppShell
      session={session}
      title="首页"
      subtitle="登录后默认进入这里，查看当前账号信息并快速进入套餐和对话页面。"
    >
      <section className="content-grid">
        <article className="hero-card">
          <span className="card-tag">Welcome</span>
          <h2>{userName || "欢迎回来"}</h2>
          <p>
            当前组织是 <strong>{orgName || "未命名组织"}</strong>
            {roleName ? `，角色为 ${roleName}` : ""}。这里可以作为后续工作台的首页基础版本。
          </p>
          <div className="shortcut-row">
            <Link href="/pricing" className="solid-link">
              查看订阅套餐
            </Link>
            <Link href="/chat" className="ghost-link">
              进入对话
            </Link>
            <Link href="/admin/login" className="ghost-link">
              管理员页面
            </Link>
          </div>
        </article>

        <article className="info-card">
          <h3>当前联调状态</h3>
          <ul className="plain-list">
            <li>后端地址：{session.baseUrl}</li>
            <li>Access Token：{session.accessToken ? "已获取" : "未获取"}</li>
            <li>Refresh Token：{session.refreshToken ? "已获取" : "未获取"}</li>
            <li>用户信息：{session.user ? "已加载" : "未加载"}</li>
          </ul>
          {loading ? <p className="muted-copy">正在刷新用户信息...</p> : null}
          {errorMessage ? <div className="feedback feedback-error">{errorMessage}</div> : null}
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="info-card">
          <h3>账号信息</h3>
          <pre className="data-box">{JSON.stringify(session.user ?? {}, null, 2)}</pre>
        </article>
        <article className="info-card">
          <h3>组织信息</h3>
          <pre className="data-box">{JSON.stringify(session.organization ?? {}, null, 2)}</pre>
        </article>
      </section>
    </AppShell>
  );
}
