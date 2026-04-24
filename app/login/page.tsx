"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  apiRequest,
  DEFAULT_BASE_URL,
  EMPTY_SESSION,
  extractAuthState,
  formatApiError,
  loadSession,
  saveSession,
  SessionState,
} from "../lib/api";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [email, setEmail] = useState("demo@example.com");
  const [password, setPassword] = useState("Passw0rd!");
  const [nickname, setNickname] = useState("Demo User");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const session = loadSession("user");
    setBaseUrl(session.baseUrl || DEFAULT_BASE_URL);

    if (session.accessToken) {
      router.replace("/");
    }
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage("");

    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const payload =
        mode === "login"
          ? { email, password }
          : {
              email,
              password,
              nickname,
            };

      const authResponse = await apiRequest({
        baseUrl,
        path,
        method: "POST",
        body: payload,
      });
      const authState = extractAuthState(authResponse);
      const token = authState.accessToken || "";

      let nextSession: SessionState = {
        ...EMPTY_SESSION,
        scope: "user",
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
          // Keep the auth response data when /auth/me is temporarily unavailable.
        }
      }

      saveSession(nextSession);
      router.push("/");
    } catch (error) {
      setErrorMessage(formatApiError(error, "请求失败"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-hero">
        <span className="brand-mark">Amazon Expert</span>
        <h1>卖家专家工作台</h1>
        <p>
          使用后端提供的注册和登录 API 建立真实登录流程。登录完成后，会进入首页，并带着 token 去访问订阅套餐与对话页面。
        </p>
        <div className="feature-list">
          <div className="feature-card">注册与登录共用同一套页面，便于联调两条认证链路。</div>
          <div className="feature-card">默认后端地址来自 `.env`，也支持你临时切换环境。</div>
          <div className="feature-card">登录态会保存在浏览器本地，页面刷新后仍可继续使用。</div>
        </div>
      </section>

      <section className="login-panel">
        <div className="admin-panel-head">
          <div>
            <h2>卖家前台</h2>
            <p>注册和登录共用这一页，适合联调普通用户工作台。</p>
          </div>
          <Link href="/admin/login" className="ghost-link">
            管理员入口
          </Link>
        </div>

        <div className="tab-row">
          <button
            type="button"
            className={mode === "login" ? "tab-button tab-button-active" : "tab-button"}
            onClick={() => setMode("login")}
          >
            登录
          </button>
          <button
            type="button"
            className={mode === "register" ? "tab-button tab-button-active" : "tab-button"}
            onClick={() => setMode("register")}
          >
            注册
          </button>
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
            邮箱
            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
          </label>
          <label>
            密码
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
            />
          </label>
          {mode === "register" ? (
            <label>
              昵称
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="请输入昵称"
              />
            </label>
          ) : null}

          {errorMessage ? <div className="feedback feedback-error">{errorMessage}</div> : null}

          <button type="submit" disabled={busy}>
            {busy ? "提交中..." : mode === "login" ? "立即登录" : "注册并进入首页"}
          </button>
        </form>
      </section>
    </main>
  );
}
