"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  apiRequest,
  DEFAULT_BASE_URL,
  EMPTY_ADMIN_SESSION,
  extractAuthState,
  formatApiError,
  loadSession,
  saveSession,
  SessionState,
} from "../../lib/api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const session = loadSession("admin");
    setBaseUrl(session.baseUrl || DEFAULT_BASE_URL);

    if (session.accessToken) {
      router.replace(session.mustChangePassword ? "/admin/change-password" : "/admin");
    }
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage("");

    try {
      const authResponse = await apiRequest({
        baseUrl,
        path: "/admin/auth/login",
        method: "POST",
        body: { email, password },
      });
      const authState = extractAuthState(authResponse);
      const token = authState.accessToken || "";

      let nextSession: SessionState = {
        ...EMPTY_ADMIN_SESSION,
        scope: "admin",
        baseUrl,
        accessToken: authState.accessToken || "",
        refreshToken: authState.refreshToken || "",
        mustChangePassword: authState.mustChangePassword || false,
        user: authState.user || null,
        organization: authState.organization || null,
        member: authState.member || null,
      };

      if (token) {
        try {
          const meResponse = await apiRequest({
            baseUrl,
            path: "/auth/me",
            method: "GET",
            token,
          });
          const meData = meResponse.data || {};
          nextSession = {
            ...nextSession,
            user: (meData.user as Record<string, unknown>) || nextSession.user,
            organization: (meData.organization as Record<string, unknown>) || nextSession.organization,
            member: (meData.member as Record<string, unknown>) || nextSession.member,
          };
        } catch {
          // Keep login response data when /auth/me is temporarily unavailable.
        }
      }

      saveSession(nextSession);
      router.push(nextSession.mustChangePassword ? "/admin/change-password" : "/admin");
    } catch (error) {
      setErrorMessage(formatApiError(error, "管理员登录失败"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell admin-login-shell">
      <section className="login-hero admin-hero">
        <span className="brand-mark">Admin Console</span>
        <h1>管理员工作台</h1>
        <p>
          使用管理员邮箱和密码登录后台。若当前账号是服务首次初始化生成的一次性密码，登录后会被强制跳转到修改密码页面。
        </p>
        <div className="feature-list">
          <div className="feature-card">登录接口使用 `/admin/auth/login`，只允许 owner 或 admin 身份进入。</div>
          <div className="feature-card">管理员 session 单独保存在本地，不会和卖家前台登录态互相覆盖。</div>
          <div className="feature-card">首次登录带一次性密码时，前端会自动进入强制改密流程。</div>
        </div>
      </section>

      <section className="login-panel">
        <div className="admin-panel-head">
          <div>
            <h2>后台登录</h2>
            <p>默认后端地址来自 `.env`，你也可以临时切换到别的环境。</p>
          </div>
          <Link href="/login" className="ghost-link">
            前台登录
          </Link>
        </div>

        <form className="form-stack" onSubmit={handleSubmit}>
          <label>
            后端地址
            <input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="http://localhost:8080"
            />
          </label>
          <label>
            管理员邮箱
            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" />
          </label>
          <label>
            管理员密码
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入管理员密码"
            />
          </label>

          {errorMessage ? <div className="feedback feedback-error">{errorMessage}</div> : null}

          <button type="submit" disabled={busy}>
            {busy ? "登录中..." : "进入管理员页面"}
          </button>
        </form>
      </section>
    </main>
  );
}
