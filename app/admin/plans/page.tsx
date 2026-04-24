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
  SessionState,
} from "../../lib/api";

const DEFAULT_PLAN = {
  code: "custom_monthly",
  name: "Custom Monthly",
  billing_cycle: "monthly",
  price_amount: "99",
  currency: "USD",
  monthly_question_limit: "300",
  monthly_token_limit: "800000",
  max_concurrency: "3",
  max_team_members: "5",
  model_tier: "pro",
  status: "active",
};

export default function AdminPlansPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionState>(EMPTY_ADMIN_SESSION);
  const [plans, setPlans] = useState<Record<string, unknown>[]>([]);
  const [editingPlanCode, setEditingPlanCode] = useState("");
  const [form, setForm] = useState(DEFAULT_PLAN);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

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
        await reloadPlans(updatedSession);
      } catch (error) {
        setLoading(false);
        setErrorMessage(formatApiError(error, "加载套餐失败"));
      }
    }

    void hydrate();
  }, [router]);

  async function reloadPlans(currentSession: SessionState) {
    setLoading(true);
    try {
      const response = await apiRequest({
        baseUrl: currentSession.baseUrl,
        path: "/admin/subscription-plans",
        method: "GET",
        token: currentSession.accessToken,
      });
      setPlans(asArray((response.data as Record<string, unknown> | undefined)?.items));
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(formatApiError(error, "加载套餐失败"));
    } finally {
      setLoading(false);
    }
  }

  function updateField(key: keyof typeof DEFAULT_PLAN, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    const body = {
      code: form.code,
      name: form.name,
      billing_cycle: form.billing_cycle,
      price_amount: Number(form.price_amount),
      currency: form.currency,
      monthly_question_limit: Number(form.monthly_question_limit),
      monthly_token_limit: Number(form.monthly_token_limit),
      max_concurrency: Number(form.max_concurrency),
      max_team_members: Number(form.max_team_members),
      model_tier: form.model_tier,
      status: form.status,
    };

    try {
      if (editingPlanCode) {
        await apiRequest({
          baseUrl: session.baseUrl,
          path: `/admin/subscription-plans/${editingPlanCode}`,
          method: "PATCH",
          token: session.accessToken,
          body,
        });
        setSuccessMessage(`套餐已更新：${editingPlanCode}`);
      } else {
        await apiRequest({
          baseUrl: session.baseUrl,
          path: "/admin/subscription-plans",
          method: "POST",
          token: session.accessToken,
          body,
        });
        setSuccessMessage(`套餐已创建：${form.code}`);
      }
      setForm(DEFAULT_PLAN);
      setEditingPlanCode("");
      await reloadPlans(session);
    } catch (error) {
      setErrorMessage(formatApiError(error, editingPlanCode ? "更新套餐失败" : "创建套餐失败"));
    } finally {
      setSubmitting(false);
    }
  }

  function handleEdit(plan: Record<string, unknown>) {
    setEditingPlanCode(itemLabel(plan, "code", "plan_code"));
    setForm({
      code: itemLabel(plan, "code", "plan_code"),
      name: itemLabel(plan, "name"),
      billing_cycle: itemLabel(plan, "billing_cycle") || "monthly",
      price_amount: String(plan.price_amount ?? 0),
      currency: itemLabel(plan, "currency") || "USD",
      monthly_question_limit: String(plan.monthly_question_limit ?? 0),
      monthly_token_limit: String(plan.monthly_token_limit ?? 0),
      max_concurrency: String(plan.max_concurrency ?? 1),
      max_team_members: String(plan.max_team_members ?? 1),
      model_tier: itemLabel(plan, "model_tier") || "base",
      status: itemLabel(plan, "status") || "active",
    });
    setSuccessMessage("");
    setErrorMessage("");
  }

  if (!session.accessToken) {
    return null;
  }

  return (
    <AppShell
      session={session}
      title="套餐管理"
      subtitle="管理员可以查看全部套餐，并直接创建或更新订阅套餐。"
      navItems={ADMIN_NAV}
      logoutTo="/admin/login"
    >
      <section className="content-grid">
        <article className="info-card">
          <h3>{editingPlanCode ? `编辑套餐 ${editingPlanCode}` : "创建套餐"}</h3>
          <form className="form-stack" onSubmit={handleSubmit}>
            <label>
              套餐编码
              <input value={form.code} onChange={(event) => updateField("code", event.target.value)} disabled={Boolean(editingPlanCode)} />
            </label>
            <label>
              套餐名称
              <input value={form.name} onChange={(event) => updateField("name", event.target.value)} />
            </label>
            <div className="two-column-form">
              <label>
                周期
                <select value={form.billing_cycle} onChange={(event) => updateField("billing_cycle", event.target.value)}>
                  <option value="monthly">monthly</option>
                  <option value="yearly">yearly</option>
                </select>
              </label>
              <label>
                状态
                <select value={form.status} onChange={(event) => updateField("status", event.target.value)}>
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
              </label>
            </div>
            <div className="two-column-form">
              <label>
                价格
                <input value={form.price_amount} onChange={(event) => updateField("price_amount", event.target.value)} />
              </label>
              <label>
                货币
                <input value={form.currency} onChange={(event) => updateField("currency", event.target.value)} />
              </label>
            </div>
            <div className="two-column-form">
              <label>
                问答额度
                <input value={form.monthly_question_limit} onChange={(event) => updateField("monthly_question_limit", event.target.value)} />
              </label>
              <label>
                Token 配额
                <input value={form.monthly_token_limit} onChange={(event) => updateField("monthly_token_limit", event.target.value)} />
              </label>
            </div>
            <div className="two-column-form">
              <label>
                最大并发
                <input value={form.max_concurrency} onChange={(event) => updateField("max_concurrency", event.target.value)} />
              </label>
              <label>
                最大成员数
                <input value={form.max_team_members} onChange={(event) => updateField("max_team_members", event.target.value)} />
              </label>
            </div>
            <label>
              模型层级
              <input value={form.model_tier} onChange={(event) => updateField("model_tier", event.target.value)} />
            </label>
            {errorMessage ? <div className="feedback feedback-error">{errorMessage}</div> : null}
            {successMessage ? <div className="feedback feedback-success">{successMessage}</div> : null}
            <div className="admin-action-row">
              <button type="submit" disabled={submitting}>
                {submitting ? "提交中..." : editingPlanCode ? "保存修改" : "创建套餐"}
              </button>
              {editingPlanCode ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setEditingPlanCode("");
                    setForm(DEFAULT_PLAN);
                  }}
                >
                  取消编辑
                </button>
              ) : null}
            </div>
          </form>
        </article>

        <article className="info-card">
          <h3>联调说明</h3>
          <ul className="plain-list">
            <li>列表使用 `/admin/subscription-plans`。</li>
            <li>创建走 `POST /admin/subscription-plans`。</li>
            <li>编辑走 `PATCH /admin/subscription-plans/:planCode`。</li>
          </ul>
        </article>
      </section>

      <section className="admin-grid-list">
        {loading ? <p className="muted-copy">正在加载套餐...</p> : null}
        {plans.map((plan) => {
          const planCode = itemLabel(plan, "code", "plan_code");
          return (
            <article key={planCode || JSON.stringify(plan)} className="price-card">
              <div className="card-row">
                <div>
                  <span className="card-tag">{itemLabel(plan, "billing_cycle") || "monthly"}</span>
                  <h3>{itemLabel(plan, "name", "code") || "未命名套餐"}</h3>
                </div>
                <div className="status-chip">{itemLabel(plan, "status") || "active"}</div>
              </div>
              <p>Plan Code: {planCode || "-"}</p>
              <div className="admin-action-row">
                <button type="button" className="ghost-button" onClick={() => handleEdit(plan)}>
                  编辑套餐
                </button>
              </div>
              <pre className="mini-box">{JSON.stringify(plan, null, 2)}</pre>
            </article>
          );
        })}
      </section>
    </AppShell>
  );
}
