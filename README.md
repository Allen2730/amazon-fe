# Amazon Expert FE

基于 `amazon-expert-server/docs/api.md` 生成的简易业务前端。

## 启动

```bash
cd amazon-expert-fe
cp .env.example .env.local
npm install
npm run dev
```

默认会从 `.env.local` 中读取 `NEXT_PUBLIC_API_BASE_URL` 作为后端地址，页面里会自动拼接 `/api/v1`。

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
```

登录页中的“后端地址”输入框仍然可以临时覆盖这个值，方便你切换不同环境联调。

## 页面结构

- `/login`
  使用 `/auth/register` 和 `/auth/login`，登录成功后会自动请求 `/auth/me` 回填用户与组织信息。
- `/`
  作为首页，展示当前登录用户、组织和基础联调状态。
- `/pricing`
  请求 `/billing/plans` 和 `/billing/subscription`，展示套餐与当前订阅摘要。
- `/chat`
  请求 `/conversations`、`/conversations/:id/messages` 和 `/chat/completions`，提供最小可用的对话界面。
