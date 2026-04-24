"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
  apiRequest,
  EMPTY_ADMIN_SESSION,
  formatApiError,
  itemLabel,
  loadSession,
  saveSession,
  SessionState,
} from "../../lib/api";

export default function AdminChangePasswordPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionState>(EMPTY_ADMIN_SESSION);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const nextSession = loadSession("admin");
    setSession(nextSession);

    if (!nextSession.accessToken) {
      router.replace("/admin/login");
      return;
    }
    if (!nextSession.mustChangePassword) {
      router.replace("/admin");
    }
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentPassword || !newPassword) {
      setErrorMessage("请先填写当前密码和新密码。");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage("两次输入的新密码不一致。");
      return;
    }

    setBusy(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await apiRequest<Record<string, unknown>>({
        baseUrl: session.baseUrl,
        path: "/auth/change-password",
        method: "POST",
        token: session.accessToken,
        body: {
          current_password: currentPassword,
          new_password: newPassword,
        },
      });

      const data = (response.data || {}) as Record<string, unknown>;
      const nextSession: SessionState = {
        ...session,
        mustChangePassword: false,
        user: (data.user as Record<string, unknown>) || session.user,
        organization: (data.organization as Record<string, unknown>) || session.organization,
        member: (data.member as Record<string, unknown>) || session.member,
      };
      setSession(nextSession);
      saveSession(nextSession);
      setSuccessMessage("密码修改成功，正在进入管理员首页。");
      window.setTimeout(() => {
        router.push("/admin");
      }, 700);
    } catch (error) {
      setErrorMessage(formatApiError(error, "修改管理员密码失败"));
    } finally {
      setBusy(false);
    }
  }

  if (!session.accessToken) {
    return null;
  }

  return (
    <main className="login-shell admin-change-shell">
      <section className="login-hero admin-hero">
        <span className="brand-mark">First Sign-in</span>
        <h1>首次登录需要修改密码</h1>
        <p>
          当前管理员账号 <strong>{itemLabel(session.user, "email", "nickname") || "管理员"}</strong>{" "}
          正在使用一次性密码。完成改密后，才能访问后台概览和其他管理功能。
        </p>
      </section>

      <section className="login-panel">
        <div className="admin-panel-head">
          <div>
            <h2>修改管理员密码</h2>
            <p>建议设置一组新的高强度密码，至少 8 位，并避免复用之前的默认密码。</p>
          </div>
        </div>

        <form className="form-stack" onSubmit={handleSubmit}>
          <label>
            当前一次性密码
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="请输入当前密码"
            />
          </label>
          <label>
            新密码
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="请输入新密码"
            />
          </label>
          <label>
            确认新密码
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="请再次输入新密码"
            />
          </label>

          {errorMessage ? <div className="feedback feedback-error">{errorMessage}</div> : null}
          {successMessage ? <div className="feedback feedback-success">{successMessage}</div> : null}

          <button type="submit" disabled={busy}>
            {busy ? "保存中..." : "确认修改并进入后台"}
          </button>
        </form>
      </section>
    </main>
  );
}
