"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
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

export default function AdminKnowledgeBasesPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionState>(EMPTY_ADMIN_SESSION);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [name, setName] = useState("运营知识库");
  const [description, setDescription] = useState("用于沉淀运营 SOP、选品经验和广告策略。");
  const [scope, setScope] = useState("private");

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
        await reloadKnowledgeBases(updatedSession);
      } catch (error) {
        setLoading(false);
        setErrorMessage(formatApiError(error, "加载知识库失败"));
      }
    }

    void hydrate();
  }, [router]);

  async function reloadKnowledgeBases(currentSession: SessionState) {
    setLoading(true);
    try {
      const response = await apiRequest({
        baseUrl: currentSession.baseUrl,
        path: "/admin/knowledge-bases",
        method: "GET",
        token: currentSession.accessToken,
      });
      setItems(asArray((response.data as Record<string, unknown> | undefined)?.items));
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(formatApiError(error, "加载知识库失败"));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await apiRequest<Record<string, unknown>>({
        baseUrl: session.baseUrl,
        path: "/admin/knowledge-bases",
        method: "POST",
        token: session.accessToken,
        body: { name, description, scope },
      });
      setSuccessMessage(`知识库已创建：${itemLabel((response.data || {}) as Record<string, unknown>, "name", "id") || name}`);
      setName("");
      setDescription("");
      await reloadKnowledgeBases(session);
    } catch (error) {
      setErrorMessage(formatApiError(error, "创建知识库失败"));
    } finally {
      setSubmitting(false);
    }
  }

  if (!session.accessToken) {
    return null;
  }

  return (
    <AppShell
      session={session}
      title="知识库管理"
      subtitle="查看管理员可见的知识库列表，并直接创建新的知识库。"
      navItems={ADMIN_NAV}
      logoutTo="/admin/login"
    >
      <section className="content-grid">
        <article className="info-card">
          <h3>创建知识库</h3>
          <form className="form-stack" onSubmit={handleSubmit}>
            <label>
              名称
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="请输入知识库名称" />
            </label>
            <label>
              描述
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="请输入知识库描述"
              />
            </label>
            <label>
              范围
              <select value={scope} onChange={(event) => setScope(event.target.value)}>
                <option value="private">private</option>
                <option value="public">public</option>
              </select>
            </label>
            {errorMessage ? <div className="feedback feedback-error">{errorMessage}</div> : null}
            {successMessage ? <div className="feedback feedback-success">{successMessage}</div> : null}
            <button type="submit" disabled={submitting}>
              {submitting ? "创建中..." : "新建知识库"}
            </button>
          </form>
        </article>

        <article className="info-card">
          <h3>管理提示</h3>
          <ul className="plain-list">
            <li>创建后即可在“文档”页面选择该知识库上传文件。</li>
            <li>当前页面直接调用 `/admin/knowledge-bases` 的 GET 和 POST 接口。</li>
            <li>适合作为管理员后台中的知识资产入口页。</li>
          </ul>
        </article>
      </section>

      <section className="admin-grid-list">
        {loading ? <p className="muted-copy">正在加载知识库...</p> : null}
        {items.map((item) => (
          <article key={String(item.id ?? item.name)} className="info-card">
            <div className="card-row">
              <div>
                <span className="card-tag">{itemLabel(item, "scope") || "scope"}</span>
                <h3>{itemLabel(item, "name", "id") || "未命名知识库"}</h3>
              </div>
              <div className="status-chip">{itemLabel(item, "status") || "active"}</div>
            </div>
            <p>{itemLabel(item, "description") || "暂无描述。"}</p>
            <pre className="mini-box">{JSON.stringify(item, null, 2)}</pre>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
