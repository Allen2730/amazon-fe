"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ADMIN_NAV, redirectForAdminSession, refreshAdminSession, uploadAdminFormData } from "../lib";
import { AppShell } from "../../components/app-shell";
import {
  apiRequest,
  asArray,
  EMPTY_ADMIN_SESSION,
  formatApiError,
  itemLabel,
  loadSession,
  SessionState,
} from "../../lib/api";

export default function AdminDocumentsPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionState>(EMPTY_ADMIN_SESSION);
  const [knowledgeBases, setKnowledgeBases] = useState<Record<string, unknown>[]>([]);
  const [documents, setDocuments] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState("");
  const [title, setTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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
        await reloadData(updatedSession);
      } catch (error) {
        setLoading(false);
        setErrorMessage(formatApiError(error, "加载文档管理数据失败"));
      }
    }

    void hydrate();
  }, [router]);

  async function reloadData(currentSession: SessionState) {
    setLoading(true);
    try {
      const [kbResponse, documentResponse] = await Promise.all([
        apiRequest({
          baseUrl: currentSession.baseUrl,
          path: "/admin/knowledge-bases",
          method: "GET",
          token: currentSession.accessToken,
        }),
        apiRequest({
          baseUrl: currentSession.baseUrl,
          path: "/admin/documents",
          method: "GET",
          token: currentSession.accessToken,
        }),
      ]);

      const kbItems = asArray((kbResponse.data as Record<string, unknown> | undefined)?.items);
      const docItems = asArray((documentResponse.data as Record<string, unknown> | undefined)?.items);
      setKnowledgeBases(kbItems);
      setDocuments(docItems);
      if (!selectedKnowledgeBaseId && kbItems[0]?.id) {
        setSelectedKnowledgeBaseId(String(kbItems[0].id));
      }
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(formatApiError(error, "加载文档管理数据失败"));
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedKnowledgeBaseId || !selectedFile) {
      setErrorMessage("请选择知识库并上传文件。");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const formData = new FormData();
      formData.set("knowledge_base_id", selectedKnowledgeBaseId);
      formData.set("title", title || selectedFile.name);
      formData.set("file", selectedFile);

      const data = await uploadAdminFormData(session, "/admin/documents", formData);
      setSuccessMessage(`文档已上传：${itemLabel(data as Record<string, unknown>, "title", "id") || selectedFile.name}`);
      setTitle("");
      setSelectedFile(null);
      await reloadData(session);
    } catch (error) {
      setErrorMessage(formatApiError(error, "上传文档失败"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(documentId: string) {
    setErrorMessage("");
    setSuccessMessage("");
    try {
      await apiRequest({
        baseUrl: session.baseUrl,
        path: `/admin/documents/${documentId}`,
        method: "DELETE",
        token: session.accessToken,
      });
      setSuccessMessage(`文档已删除：${documentId}`);
      await reloadData(session);
    } catch (error) {
      setErrorMessage(formatApiError(error, "删除文档失败"));
    }
  }

  async function handleRetry(documentId: string) {
    setErrorMessage("");
    setSuccessMessage("");
    try {
      await apiRequest({
        baseUrl: session.baseUrl,
        path: `/admin/documents/${documentId}/retry-kb`,
        method: "POST",
        token: session.accessToken,
      });
      setSuccessMessage(`已触发文档重试：${documentId}`);
      await reloadData(session);
    } catch (error) {
      setErrorMessage(formatApiError(error, "重试 KB 上传失败"));
    }
  }

  const knowledgeBaseOptions = useMemo(
    () =>
      knowledgeBases.map((item) => ({
        id: String(item.id ?? ""),
        label: itemLabel(item, "name", "id") || "未命名知识库",
      })),
    [knowledgeBases],
  );

  if (!session.accessToken) {
    return null;
  }

  return (
    <AppShell
      session={session}
      title="文档管理"
      subtitle="上传、查看和维护知识库文档。这个页面已经接通真实的 multipart 上传接口。"
      navItems={ADMIN_NAV}
      logoutTo="/admin/login"
    >
      <section className="content-grid">
        <article className="info-card">
          <h3>上传文档</h3>
          <form className="form-stack" onSubmit={handleUpload}>
            <label>
              知识库
              <select
                value={selectedKnowledgeBaseId}
                onChange={(event) => setSelectedKnowledgeBaseId(event.target.value)}
              >
                <option value="">请选择知识库</option>
                {knowledgeBaseOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              文档标题
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="可留空，默认使用文件名" />
            </label>
            <label>
              文件
              <input
                type="file"
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              />
            </label>
            {errorMessage ? <div className="feedback feedback-error">{errorMessage}</div> : null}
            {successMessage ? <div className="feedback feedback-success">{successMessage}</div> : null}
            <button type="submit" disabled={submitting}>
              {submitting ? "上传中..." : "上传文档"}
            </button>
          </form>
        </article>

        <article className="info-card">
          <h3>联调说明</h3>
          <ul className="plain-list">
            <li>当前页面调用 `/admin/documents` 的 GET、POST、DELETE 和 retry 接口。</li>
            <li>上传使用真实 `multipart/form-data`，和后台当前实现一致。</li>
            <li>如果文档 KB 同步失败，可直接点击“重试 KB”。</li>
          </ul>
        </article>
      </section>

      <section className="admin-grid-list">
        {loading ? <p className="muted-copy">正在加载文档...</p> : null}
        {documents.map((document) => {
          const documentId = itemLabel(document, "id");
          return (
            <article key={documentId || JSON.stringify(document)} className="info-card">
              <div className="card-row">
                <div>
                  <span className="card-tag">{itemLabel(document, "kb_status", "parse_status") || "pending"}</span>
                  <h3>{itemLabel(document, "title", "id") || "未命名文档"}</h3>
                </div>
                <div className="status-chip">{itemLabel(document, "mime_type", "source_type") || "file"}</div>
              </div>
              <p>知识库 ID: {itemLabel(document, "knowledge_base_id") || "-"}</p>
              <div className="admin-action-row">
                <button type="button" className="ghost-button" onClick={() => void handleRetry(documentId)}>
                  重试 KB
                </button>
                <button type="button" className="ghost-button" onClick={() => void handleDelete(documentId)}>
                  删除文档
                </button>
              </div>
              <pre className="mini-box">{JSON.stringify(document, null, 2)}</pre>
            </article>
          );
        })}
      </section>
    </AppShell>
  );
}
