"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { AppShell } from "../components/app-shell";
import {
  ApiError,
  apiRequest,
  asArray,
  buildUrl,
  EMPTY_SESSION,
  formatApiError,
  itemLabel,
  loadSession,
  SessionState,
} from "../lib/api";

type ConversationRecord = Record<string, unknown>;
type MessageRecord = Record<string, unknown>;
type StreamMeta = {
  answerId?: string;
  finishReason?: string;
  citations: Array<Record<string, unknown>>;
};

function appendStreamChunk(current: string, chunk: string): string {
  if (!current) {
    return chunk;
  }
  if (!chunk) {
    return current;
  }
  if (/\s$/.test(current) || /^\s/.test(chunk) || /^[,.;!?)]/.test(chunk)) {
    return current + chunk;
  }
  return `${current} ${chunk}`;
}

function parseSSEBlock(block: string): { event: string; data: string } | null {
  const lines = block.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    if (!line || line.startsWith(":")) {
      continue;
    }
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return {
    event,
    data: dataLines.join("\n"),
  };
}

export default function ChatPage() {
  const router = useRouter();
  const streamAbortRef = useRef<AbortController | null>(null);
  const printerTimerRef = useRef<number | null>(null);
  const pendingPrintRef = useRef("");
  const [session, setSession] = useState<SessionState>(EMPTY_SESSION);
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [newConversationTitle, setNewConversationTitle] = useState("新品调研");
  const [prompt, setPrompt] = useState("帮我分析这个产品在 Amazon 上的核心卖点。");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [streamingQuestion, setStreamingQuestion] = useState("");
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [streamMeta, setStreamMeta] = useState<StreamMeta>({ citations: [] });

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
      if (printerTimerRef.current !== null) {
        window.clearInterval(printerTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!sending) {
      if (printerTimerRef.current !== null) {
        window.clearInterval(printerTimerRef.current);
        printerTimerRef.current = null;
      }
      return;
    }

    if (printerTimerRef.current !== null) {
      return;
    }

    printerTimerRef.current = window.setInterval(() => {
      if (!pendingPrintRef.current) {
        return;
      }

      const nextChunk = pendingPrintRef.current.slice(0, 2);
      pendingPrintRef.current = pendingPrintRef.current.slice(2);
      setStreamingAnswer((current) => current + nextChunk);
    }, 30);

    return () => {
      if (printerTimerRef.current !== null) {
        window.clearInterval(printerTimerRef.current);
        printerTimerRef.current = null;
      }
    };
  }, [sending]);

  useEffect(() => {
    const nextSession = loadSession("user");
    setSession(nextSession);

    if (!nextSession.accessToken) {
      router.replace("/login");
      return;
    }

    void refreshConversations(nextSession);
  }, [router]);

  async function refreshConversations(currentSession: SessionState) {
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await apiRequest({
        baseUrl: currentSession.baseUrl,
        path: "/conversations",
        method: "GET",
        token: currentSession.accessToken,
      });

      const items = asArray((response.data as Record<string, unknown> | undefined)?.items);
      setConversations(items);

      const nextConversationId =
        selectedConversationId || String(items[0]?.id ?? items[0]?.conversation_id ?? "");
      setSelectedConversationId(nextConversationId);

      if (nextConversationId) {
        await refreshMessages(currentSession, nextConversationId);
      } else {
        setMessages([]);
      }
    } catch (error) {
      setErrorMessage(formatApiError(error, "加载会话失败"));
    } finally {
      setLoading(false);
    }
  }

  async function refreshMessages(currentSession: SessionState, conversationId: string) {
    const response = await apiRequest({
      baseUrl: currentSession.baseUrl,
      path: `/conversations/${conversationId}/messages`,
      method: "GET",
      token: currentSession.accessToken,
    });
    setMessages(asArray((response.data as Record<string, unknown> | undefined)?.items));
  }

  async function handleCreateConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setErrorMessage("");

    try {
      const response = await apiRequest({
        baseUrl: session.baseUrl,
        path: "/conversations",
        method: "POST",
        token: session.accessToken,
        body: {
          title: newConversationTitle,
        },
      });
      const data = (response.data || {}) as Record<string, unknown>;
      const conversationId = String(data.id ?? data.conversation_id ?? "");
      await refreshConversations(session);
      if (conversationId) {
        setSelectedConversationId(conversationId);
        await refreshMessages(session, conversationId);
      }
      setNewConversationTitle("");
    } catch (error) {
      setErrorMessage(formatApiError(error, "创建会话失败"));
    } finally {
      setSending(false);
    }
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConversationId || !prompt.trim()) {
      return;
    }

    const nextPrompt = prompt.trim();
    setSending(true);
    setErrorMessage("");
    setStreamingQuestion(nextPrompt);
    setStreamingAnswer("");
    setStreamMeta({ citations: [] });
    pendingPrintRef.current = "";
    setPrompt("");

    try {
      const controller = new AbortController();
      streamAbortRef.current = controller;

      const response = await fetch(buildUrl(session.baseUrl, "/chat/completions/stream"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          conversation_id: selectedConversationId,
          message: nextPrompt,
          knowledge_base_scope: "",
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const payload = (await response.json()) as {
            message?: string;
            code?: number;
            request_id?: string;
            trace_id?: string;
            error?: Record<string, unknown>;
          };
          throw new ApiError(payload.message || `Request failed with status ${response.status}`, {
            status: response.status,
            code: payload.code,
            requestId: payload.request_id,
            traceId: payload.trace_id,
            details: payload.error,
          });
        }
        throw new Error(await response.text());
      }

      if (!response.body) {
        throw new Error("流式响应为空");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamFailed = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const parsed = parseSSEBlock(part);
          if (!parsed) {
            continue;
          }

          let payload: Record<string, unknown> = {};
          try {
            payload = JSON.parse(parsed.data) as Record<string, unknown>;
          } catch {
            continue;
          }

          switch (parsed.event) {
            case "delta": {
              const content = typeof payload.content === "string" ? payload.content : "";
              if (content) {
                pendingPrintRef.current += content;
              }
              break;
            }
            case "citation":
            case "references":
              setStreamMeta((current) => ({
                ...current,
                citations: [...current.citations, payload],
              }));
              break;
            case "done":
              setStreamMeta((current) => ({
                ...current,
                answerId: typeof payload.answer_id === "string" ? payload.answer_id : current.answerId,
                finishReason:
                  typeof payload.finish_reason === "string" ? payload.finish_reason : current.finishReason,
              }));
              break;
            case "error":
              streamFailed = true;
              throw new Error(typeof payload.message === "string" ? payload.message : "流式对话失败");
            default:
              break;
          }
        }
      }

      if (!streamFailed) {
        if (pendingPrintRef.current) {
          setStreamingAnswer((current) => current + pendingPrintRef.current);
          pendingPrintRef.current = "";
        }
        setStreamingQuestion("");
        setStreamingAnswer("");
        setStreamMeta({ citations: [] });
      }
      await refreshMessages(session, selectedConversationId);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        if (pendingPrintRef.current) {
          setStreamingAnswer((current) => current + pendingPrintRef.current);
          pendingPrintRef.current = "";
        }
        setActionAfterAbort();
        await refreshMessages(session, selectedConversationId);
        return;
      }
      setPrompt(nextPrompt);
      setErrorMessage(formatApiError(error, "发送消息失败"));
    } finally {
      streamAbortRef.current = null;
      setSending(false);
    }
  }

  function setActionAfterAbort() {
    setStreamingQuestion("");
    setStreamMeta((current) => ({
      ...current,
      finishReason: current.finishReason || "stopped",
    }));
  }

  function handleStopStreaming() {
    streamAbortRef.current?.abort();
  }

  if (!session.accessToken) {
    return null;
  }

  return (
    <AppShell
      session={session}
      title="对话"
      subtitle="基于 `/conversations`、`/conversations/:id/messages` 和 `/chat/completions/stream` 做的最小聊天工作台。"
    >
      <section className="chat-layout">
        <aside className="sidebar-card">
          <div className="section-head">
            <h2>会话列表</h2>
            <button type="button" className="ghost-button" onClick={() => void refreshConversations(session)}>
              刷新
            </button>
          </div>

          <form className="form-stack compact-form" onSubmit={handleCreateConversation}>
            <input
              value={newConversationTitle}
              onChange={(event) => setNewConversationTitle(event.target.value)}
              placeholder="新会话标题"
            />
            <button type="submit" disabled={sending}>
              新建会话
            </button>
          </form>

          <div className="conversation-list">
            {loading ? <p className="muted-copy">正在加载会话...</p> : null}
            {conversations.map((conversation, index) => {
              const conversationId = String(conversation.id ?? conversation.conversation_id ?? "");
              const active = selectedConversationId === conversationId;

              return (
                <button
                  key={conversationId || String(index)}
                  type="button"
                  className={active ? "conversation-item conversation-item-active" : "conversation-item"}
                  onClick={() => {
                    setSelectedConversationId(conversationId);
                    void refreshMessages(session, conversationId);
                  }}
                >
                  <strong>{itemLabel(conversation, "title", "name") || `会话 ${index + 1}`}</strong>
                  <span>{itemLabel(conversation, "status") || "active"}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="chat-card">
          <div className="section-head">
            <div>
              <h2>消息区</h2>
              <p className="muted-copy">
                当前会话 ID: <code>{selectedConversationId || "请先创建或选择会话"}</code>
              </p>
            </div>
          </div>

          {errorMessage ? <div className="feedback feedback-error">{errorMessage}</div> : null}

          <div className="message-list">
            {messages.length === 0 && !streamingQuestion && !streamingAnswer ? (
              <div className="empty-state">当前还没有消息，先创建会话并发送一条问题试试。</div>
            ) : (
              <>
                {messages.map((message, index) => {
                  const role = itemLabel(message, "role", "sender_type") || "message";
                  const content =
                    itemLabel(message, "content", "text") ||
                    (typeof message.answer === "string" ? message.answer : JSON.stringify(message, null, 2));

                  return (
                    <article key={String(message.id ?? index)} className="message-card">
                      <div className="message-meta">
                        <strong>{role}</strong>
                        <span>{itemLabel(message, "created_at") || ""}</span>
                      </div>
                      <p>{content}</p>
                    </article>
                  );
                })}

                {streamingQuestion ? (
                  <article className="message-card message-card-user">
                    <div className="message-meta">
                      <strong>user</strong>
                      <span>正在发送</span>
                    </div>
                    <p>{streamingQuestion}</p>
                  </article>
                ) : null}

                {sending || streamingAnswer ? (
                  <article className="message-card message-card-streaming">
                    <div className="message-meta">
                      <strong>assistant</strong>
                      <span>{sending ? "流式生成中..." : streamMeta.finishReason || ""}</span>
                    </div>
                    <p>{streamingAnswer || "正在生成答案..."}</p>
                    {streamMeta.citations.length > 0 ? (
                      <div className="stream-citations">
                        {streamMeta.citations.map((citation, index) => (
                          <div key={`${itemLabel(citation, "document_id", "title")}-${index}`} className="citation-chip">
                            {itemLabel(citation, "title", "document_id") || `参考 ${index + 1}`}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ) : null}
              </>
            )}
          </div>

          <form className="composer" onSubmit={handleSendMessage}>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="输入你想咨询的问题"
              spellCheck={false}
            />
            <div className="composer-actions">
              <button type="submit" disabled={sending || !selectedConversationId}>
                {sending ? "发送中..." : "发送消息"}
              </button>
              {sending ? (
                <button type="button" className="ghost-button" onClick={handleStopStreaming}>
                  停止生成
                </button>
              ) : null}
            </div>
          </form>
        </section>
      </section>
    </AppShell>
  );
}
