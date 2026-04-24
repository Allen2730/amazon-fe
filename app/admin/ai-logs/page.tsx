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

export default function AdminAILogsPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionState>(EMPTY_ADMIN_SESSION);
  const [answers, setAnswers] = useState<Record<string, unknown>[]>([]);
  const [retrievals, setRetrievals] = useState<Record<string, unknown>[]>([]);
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
        const [answersResponse, retrievalResponse] = await Promise.all([
          apiRequest({
            baseUrl: updatedSession.baseUrl,
            path: "/admin/ai-answers",
            method: "GET",
            token: updatedSession.accessToken,
          }),
          apiRequest({
            baseUrl: updatedSession.baseUrl,
            path: "/admin/retrieval-logs",
            method: "GET",
            token: updatedSession.accessToken,
          }),
        ]);
        setAnswers(asArray((answersResponse.data as Record<string, unknown> | undefined)?.items));
        setRetrievals(asArray((retrievalResponse.data as Record<string, unknown> | undefined)?.items));
      } catch (error) {
        setErrorMessage(formatApiError(error, "加载 AI 日志失败"));
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
      title="AI 日志"
      subtitle="集中查看 AI 回答记录与检索日志，方便排查问答质量、性能和引用情况。"
      navItems={ADMIN_NAV}
      logoutTo="/admin/login"
    >
      <section className="content-grid">
        <article className="info-card">
          <h3>回答记录</h3>
          {loading ? <p className="muted-copy">正在加载 AI 回答...</p> : null}
          {errorMessage ? <div className="feedback feedback-error">{errorMessage}</div> : null}
          {!loading && !errorMessage ? <p className="muted-copy">当前加载了 {answers.length} 条 AI 回答记录。</p> : null}
          <div className="admin-grid-list compact-grid">
            {answers.map((item, index) => (
              <article key={`${itemLabel(item, "id", "conversation_id")}-${index}`} className="info-card log-card">
                <div className="card-row">
                  <div>
                    <span className="card-tag">{itemLabel(item, "answer_status") || "status"}</span>
                    <h3>{itemLabel(item, "model_name", "id") || "AI 回答"}</h3>
                  </div>
                  <div className="status-chip">{itemLabel(item, "created_at") || "-"}</div>
                </div>
                <p>
                  conversation_id: {itemLabel(item, "conversation_id") || "-"} · total_tokens: {String(item.total_tokens ?? "-")}
                </p>
                <pre className="mini-box">{JSON.stringify(item, null, 2)}</pre>
              </article>
            ))}
          </div>
        </article>

        <article className="info-card">
          <h3>检索日志</h3>
          {!loading && !errorMessage ? <p className="muted-copy">当前加载了 {retrievals.length} 条检索记录。</p> : null}
          <div className="admin-grid-list compact-grid">
            {retrievals.map((item, index) => (
              <article key={`${itemLabel(item, "id", "conversation_id")}-${index}`} className="info-card log-card">
                <div className="card-row">
                  <div>
                    <span className="card-tag">{itemLabel(item, "retrieval_type", "title") || "retrieve"}</span>
                    <h3>{itemLabel(item, "title", "document_id") || "检索记录"}</h3>
                  </div>
                  <div className="status-chip">{itemLabel(item, "created_at") || "-"}</div>
                </div>
                <p>
                  conversation_id: {itemLabel(item, "conversation_id") || "-"} · score: {String(item.score ?? item.rank_no ?? "-")}
                </p>
                <pre className="mini-box">{JSON.stringify(item, null, 2)}</pre>
              </article>
            ))}
          </div>
        </article>
      </section>
    </AppShell>
  );
}
