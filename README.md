<div align="center">

# 🛰️ Dify Helm Watchdog

### Never get surprised by a Dify Helm chart upgrade again.

**Daily snapshots of every [Dify Helm chart](https://langgenius.github.io/dify-helm) — `values.yaml`, container images, and cross-arch image validation.** Browse it in a cyber-dark UI, pull it from a REST API, or wire it straight into your AI agent over MCP.

<br/>

[![Live](https://img.shields.io/badge/live-helm--watchdog.dify.ai-2563eb?style=for-the-badge&labelColor=0b0b12&logo=vercel&logoColor=white)](https://helm-watchdog.dify.ai)
[![Latest chart](https://img.shields.io/badge/dynamic/json?style=for-the-badge&labelColor=0b0b12&color=2563eb&label=chart&query=%24.version&url=https%3A%2F%2Fhelm-watchdog.dify.ai%2Fapi%2Fv1%2Fversions%2Flatest)](https://helm-watchdog.dify.ai)
[![Dify app](https://img.shields.io/badge/dynamic/json?style=for-the-badge&labelColor=0b0b12&color=0ea5a4&label=dify%20app&query=%24.appVersion&url=https%3A%2F%2Fhelm-watchdog.dify.ai%2Fapi%2Fv1%2Fversions%2Flatest)](https://helm-watchdog.dify.ai)
[![License](https://img.shields.io/github/license/sorphwer/dify-helm-watchdog?style=for-the-badge&labelColor=0b0b12&color=8b94b8)](LICENSE)
[![Stars](https://img.shields.io/github/stars/sorphwer/dify-helm-watchdog?style=for-the-badge&labelColor=0b0b12&color=f5b400)](https://github.com/sorphwer/dify-helm-watchdog/stargazers)

[🌐 **Live Demo**](https://helm-watchdog.dify.ai) · [📖 **API Docs**](dify-helm-watchdog/docs/API.md) · [🔌 **Swagger**](https://helm-watchdog.dify.ai/swagger) · [🤖 **MCP**](#-mcp-model-context-protocol) · [📊 **Dashboard**](https://helm-watchdog.dify.ai/dashboard)

<br/>

<a href="https://helm-watchdog.dify.ai"><img src="dify-helm-watchdog/public/images/screenshot-home.png" alt="Dify Helm Watchdog — version rail and values.yaml viewer" width="880"></a>

</div>

---

## ✨ Why

Upgrading a self-hosted Dify deployment means diffing `values.yaml`, hunting down the exact set of container images a chart version ships, and praying every one of them actually exists for your architecture. **Dify Helm Watchdog does that for you, every day, and keeps the history.**

|  |  |
|---|---|
| 📦 **Version tracking** | Daily snapshots of **every** published chart version — currently 69+ and counting |
| 📄 **`values.yaml` archive** | Pull the exact `values.yaml` for any version that ever shipped |
| 🐳 **Image inventory** | Full container-image list per version, as JSON or YAML |
| ✅ **Cross-arch validation** | Verifies every image exists across `linux/amd64` **and** `linux/arm64` |
| 🔀 **Version diffing** | Side-by-side diff between any two chart versions, right in the UI |
| 🤖 **MCP server** | Native Model Context Protocol — give your AI agent live chart knowledge |
| 🔌 **REST API** | [Google-AIP](https://google.aip.dev)-styled, OpenAPI-documented, CDN-cached |
| 🧙 **Values wizard** | Merge your overrides into a new chart version with image tags auto-enforced |



---

## 🏗️ Architecture

A daily cron snapshots the chart, validates its images, and persists everything to object storage. The UI, REST API, and MCP server all read from that single cache.

```mermaid
flowchart LR
  cron["⏰ Dify Cron<br/>daily 02:00 UTC"] --> sync["POST /api/v1/cron<br/>syncHelmData()"]
  sync --> idx[["📦 Dify Helm<br/>index.yaml"]]
  sync --> ex["Extract values.yaml<br/>+ docker-images.yaml"]
  ex --> val["✅ Validate images<br/>Docker Hub · GHCR"]
  val --> r2[("☁️ Cloudflare R2<br/>cache.json · values · images · validation")]
  r2 --> ui["🖥️ Next.js UI"]
  r2 --> api["📡 REST API<br/>/api/v1"]
  r2 --> mcp["🤖 MCP server"]
```

---

## 📡 REST API

Base URL: **`https://helm-watchdog.dify.ai`** · base path: `/api/v1` · spec: [`/openapi.json`](https://helm-watchdog.dify.ai/openapi.json) · explorer: [`/swagger`](https://helm-watchdog.dify.ai/swagger)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/versions` | List all chart versions · `?includeValidation=true` for stats |
| `GET` | `/api/v1/versions/latest` | Latest version · `?versionOnly=true` → plain text |
| `GET` | `/api/v1/versions/{version}` | Version metadata (appVersion, digest, skippable…) |
| `GET` | `/api/v1/versions/{version}/images` | Image list · `?format=yaml` · `?includeValidation=true` |
| `GET` | `/api/v1/versions/{version}/values` | Download `values.yaml` |
| `GET` | `/api/v1/versions/{version}/validation` | Cross-arch image validation report |
| `POST` | `/api/v1/cron` | Trigger a sync (Bearer-auth when `CRON_API_KEY` is set) |
| `POST` `GET` | `/api/v1/mcp` · `/api/v1/sse` | MCP transports (see below) |

```bash
# What's the newest chart?
curl https://helm-watchdog.dify.ai/api/v1/versions/latest?versionOnly=true
# → 3.10.0

# Grab a version's values.yaml
curl https://helm-watchdog.dify.ai/api/v1/versions/3.10.0/values -o values-3.10.0.yaml

# List its images as YAML
curl 'https://helm-watchdog.dify.ai/api/v1/versions/3.10.0/images?format=yaml'
```

Full reference → [`docs/API.md`](dify-helm-watchdog/docs/API.md).

---

## 🤖 MCP (Model Context Protocol)

Expose live Dify chart knowledge to any MCP-capable agent (Claude, Cursor, etc.).

```jsonc
{
  "mcpServers": {
    "dify-helm-watchdog": {
      "url": "https://helm-watchdog.dify.ai/api/v1/mcp"
    }
  }
}
```

**Tools:** `list_versions` · `get_latest_version` · `get_version_details` · `list_images` · `validate_images`
**Resources:** `helm://versions` · `helm://versions/{version}/values` · `.../images` · `.../validation`
**Prompts:** `update_enterprise_to_version` · `analyze_missing_images`
**Transports:** Streamable HTTP (`POST /api/v1/mcp`) · SSE (`GET /api/v1/sse`)

---

## ✅ Image Validation

Every image referenced by a chart version is resolved against its registry (Docker Hub, GHCR) and checked per-platform. Results aggregate to `ALL_FOUND` / `PARTIAL` / `MISSING` / `ERROR` so you know before you `helm upgrade`.

<div align="center">
<img src="dify-helm-watchdog/public/images/screenshot-validation.png" alt="Image availability across ORIGINAL, AMD64 and ARM64" width="880">
</div>

---

## 🛠️ Tech Stack

![Next.js](https://img.shields.io/badge/Next.js_15-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React_19-149ECA?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_v4-38BDF8?style=flat-square&logo=tailwindcss&logoColor=white)
![MCP](https://img.shields.io/badge/MCP_server-7C3AED?style=flat-square)
![Cloudflare](https://img.shields.io/badge/Cloudflare_R2-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)
![Jest](https://img.shields.io/badge/Jest-C21325?style=flat-square&logo=jest&logoColor=white)

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 + shadcn/ui · ECharts · Cloudflare R2 · `@modelcontextprotocol/sdk` · Jest · deployed on Vercel.

---

## 🤝 Contributing

Issues and PRs welcome. Before opening a PR: `yarn lint`, `yarn test`, and `yarn build` should all pass. New API endpoints follow the [Google AIP](https://google.aip.dev) conventions and need a matching test under `src/test/`.



---

## 📄 License

[Apache 2.0](LICENSE) © [sorphwer](https://github.com/sorphwer)

<div align="center"><sub>Built for the Dify self-hosting community. Not an official Dify / LangGenius project.</sub></div>
