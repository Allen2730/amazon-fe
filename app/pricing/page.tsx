"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { apiRequest, asArray, EMPTY_SESSION, formatApiError, itemLabel, loadSession, SessionState } from "../lib/api";

type PricingState = {
  plans: Record<string, unknown>[];
  subscription: Record<string, unknown> | null;
};

const PLAN_ORDER = ["starter_free", "starter_monthly", "growth_monthly", "enterprise_yearly"];

function planRank(planCode: string): number {
  const index = PLAN_ORDER.indexOf(planCode);
  return index === -1 ? PLAN_ORDER.length : index;
}

function formatPrice(amount: unknown, currency: string, billingCycle: string): string {
  const numericAmount = typeof amount === "number" ? amount : Number(amount ?? 0);
  if (!Number.isFinite(numericAmount) || numericAmount === 0) {
    return "Free";
  }

  return `${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: numericAmount % 1 === 0 ? 0 : 2,
  }).format(numericAmount)} / ${billingCycle === "yearly" ? "year" : "month"}`;
}

export default function PricingPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionState>(EMPTY_SESSION);
  const [state, setState] = useState<PricingState>({ plans: [], subscription: null });
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [orderingPlanCode, setOrderingPlanCode] = useState("");

  useEffect(() => {
    const nextSession = loadSession("user");
    setSession(nextSession);

    if (!nextSession.accessToken) {
      router.replace("/login");
      return;
    }

    async function hydrate() {
      setLoading(true);
      try {
        const [plansResponse, subscriptionResponse] = await Promise.all([
          apiRequest({
            baseUrl: nextSession.baseUrl,
            path: "/billing/plans",
            method: "GET",
            token: nextSession.accessToken,
          }),
          apiRequest({
            baseUrl: nextSession.baseUrl,
            path: "/billing/subscription",
            method: "GET",
            token: nextSession.accessToken,
          }),
        ]);

        const planItems = asArray((plansResponse.data as Record<string, unknown> | undefined)?.items);
        const subscription = ((subscriptionResponse.data as Record<string, unknown>) || null) as Record<string, unknown> | null;

        setState({
          plans: planItems,
          subscription,
        });
      } catch (error) {
        setErrorMessage(formatApiError(error, "加载订阅套餐失败"));
      } finally {
        setLoading(false);
      }
    }

    void hydrate();
  }, [router]);

  async function reloadPricing(currentSession: SessionState) {
    setLoading(true);
    try {
      const [plansResponse, subscriptionResponse] = await Promise.all([
        apiRequest({
          baseUrl: currentSession.baseUrl,
          path: "/billing/plans",
          method: "GET",
          token: currentSession.accessToken,
        }),
        apiRequest({
          baseUrl: currentSession.baseUrl,
          path: "/billing/subscription",
          method: "GET",
          token: currentSession.accessToken,
        }),
      ]);

      const planItems = asArray((plansResponse.data as Record<string, unknown> | undefined)?.items);
      const subscription = ((subscriptionResponse.data as Record<string, unknown>) || null) as Record<string, unknown> | null;
      setState({ plans: planItems, subscription });
    } catch (error) {
      setErrorMessage(formatApiError(error, "刷新订阅信息失败"));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateOrder(plan: Record<string, unknown>) {
    const planCode = itemLabel(plan, "plan_code", "code");
    if (!planCode) {
      return;
    }

    setOrderingPlanCode(planCode);
    setErrorMessage("");
    setActionMessage("");

    try {
      const response = await apiRequest<Record<string, unknown>>({
        baseUrl: session.baseUrl,
        path: "/billing/orders",
        method: "POST",
        token: session.accessToken,
        body: {
          plan_code: planCode,
          provider: "test_auto_pay",
          auto_renew: true,
          success_url: `${window.location.origin}/pricing`,
          cancel_url: `${window.location.origin}/pricing`,
        },
      });
      const data = (response.data || {}) as Record<string, unknown>;
      const orderNo = itemLabel(data, "order_no");
      const status = itemLabel(data, "status");
      const planName = itemLabel(data, "plan_name") || itemLabel(plan, "name", "plan_name", "plan_code");
      setActionMessage(`已提交 ${planName} 订单${orderNo ? `，order_no: ${orderNo}` : ""}${status ? `，状态: ${status}` : ""}`);
      await reloadPricing(session);
    } catch (error) {
      setErrorMessage(formatApiError(error, "创建升级订单失败"));
    } finally {
      setOrderingPlanCode("");
    }
  }

  if (!session.accessToken) {
    return null;
  }

  const currentPlanCode = itemLabel(state.subscription, "plan_code");
  const currentPlanRank = planRank(currentPlanCode);
  const sortedPlans = [...state.plans].sort((left, right) => {
    const leftCode = itemLabel(left, "plan_code", "code");
    const rightCode = itemLabel(right, "plan_code", "code");
    return planRank(leftCode) - planRank(rightCode);
  });

  return (
    <AppShell
      session={session}
      title="订阅套餐"
      subtitle="这里直接请求 `/billing/plans` 和 `/billing/subscription`，适合作为套餐展示与订阅状态页的基础。"
    >
      <section className="content-grid">
        <article className="info-card">
          <h3>当前订阅</h3>
          {loading ? <p className="muted-copy">正在加载订阅状态...</p> : null}
          {errorMessage ? <div className="feedback feedback-error">{errorMessage}</div> : null}
          {state.subscription ? (
            <div className="key-metrics">
              <div className="metric-tile">
                <span>套餐</span>
                <strong>{itemLabel(state.subscription, "plan_name", "plan_code") || "-"}</strong>
              </div>
              <div className="metric-tile">
                <span>状态</span>
                <strong>{itemLabel(state.subscription, "status") || "-"}</strong>
              </div>
              <div className="metric-tile">
                <span>支付渠道</span>
                <strong>{itemLabel(state.subscription, "provider") || "-"}</strong>
              </div>
            </div>
          ) : (
            <p className="muted-copy">当前还没有可展示的订阅摘要。</p>
          )}
          {actionMessage ? <div className="feedback feedback-success">{actionMessage}</div> : null}
        </article>

        <article className="info-card">
          <h3>订阅详情原始数据</h3>
          <pre className="data-box">{JSON.stringify(state.subscription ?? {}, null, 2)}</pre>
        </article>
      </section>

      <section className="pricing-grid">
        {sortedPlans.map((plan, index) => {
          const planCode = itemLabel(plan, "plan_code", "code");
          const billingCycle = itemLabel(plan, "billing_cycle") || "monthly";
          const currency = itemLabel(plan, "currency") || "USD";
          const isCurrent = currentPlanCode !== "" && currentPlanCode === planCode;
          const isUpgrade = planRank(planCode) > currentPlanRank;
          const isDowngrade = currentPlanCode !== "" && planRank(planCode) < currentPlanRank;
          const isBusy = orderingPlanCode === planCode;

          return (
            <article
              key={String(plan.id ?? plan.plan_code ?? index)}
              className={isCurrent ? "price-card price-card-current" : "price-card"}
            >
              <span className={isUpgrade ? "card-tag card-tag-upgrade" : "card-tag"}>
                {isCurrent ? "Current" : isUpgrade ? "Upgrade" : "Plan"}
              </span>
              <h3>{itemLabel(plan, "name", "plan_name", "plan_code") || `套餐 ${index + 1}`}</h3>
              <div className="price-hero">
                <strong>{formatPrice(plan.price_amount ?? plan.price ?? plan.amount, currency, billingCycle)}</strong>
                <span>{itemLabel(plan, "model_tier") || "base"} tier</span>
              </div>
              <p>{itemLabel(plan, "description", "summary") || "适合当前联调用途的套餐展示卡片，支持直接下单升级。"}</p>
              <dl className="meta-list">
                <div>
                  <dt>Plan Code</dt>
                  <dd>{planCode || "-"}</dd>
                </div>
                <div>
                  <dt>问答额度</dt>
                  <dd>{String(plan.monthly_question_limit ?? "-")} / month</dd>
                </div>
                <div>
                  <dt>Token 配额</dt>
                  <dd>{String(plan.monthly_token_limit ?? "-")}</dd>
                </div>
                <div>
                  <dt>成员数</dt>
                  <dd>{String(plan.max_team_members ?? "-")}</dd>
                </div>
                <div>
                  <dt>并发数</dt>
                  <dd>{String(plan.max_concurrency ?? "-")}</dd>
                </div>
              </dl>
              <div className="plan-actions">
                {isCurrent ? (
                  <button type="button" className="ghost-button" disabled>
                    当前套餐
                  </button>
                ) : (
                  <button type="button" onClick={() => void handleCreateOrder(plan)} disabled={isBusy || loading}>
                    {isBusy ? "处理中..." : isUpgrade ? "升级到高级套餐" : isDowngrade ? "切换到该套餐" : "立即订阅"}
                  </button>
                )}
                <span className="plan-hint">
                  {isCurrent
                    ? "你当前正在使用这个套餐。"
                    : isUpgrade
                      ? "点击后会调用 billing/orders 创建升级订单。"
                      : "可用于测试切换套餐流程。"}
                </span>
              </div>
              <pre className="mini-box">{JSON.stringify(plan, null, 2)}</pre>
            </article>
          );
        })}
      </section>
    </AppShell>
  );
}
