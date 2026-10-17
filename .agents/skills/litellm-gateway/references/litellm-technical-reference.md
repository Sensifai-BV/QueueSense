# LiteLLM Technical Reference for Sensifai Marketplace

> **Sensifai Deployment Note (addendum, not part of the original research):** After evaluating two prior self-hosted gateway candidates (Bifrost, and a standalone "LLM Gateway" product) and finding neither sufficient for Sensifai's needs, **both were fully decommissioned**. Sensifai has since brought up **LiteLLM** self-hosted as the standing AI gateway, at:
>
> - **Base URL:** `https://llm.sensifai.com/`
>
> Unlike the prior two gateways, LiteLLM serves both its data plane (inference) and control plane (admin) from this single host — there is no separate subdomain split. Products authenticate to the data plane with a LiteLLM **Virtual Key** (`sk-...`, `Authorization: Bearer` header) and select models by the **configured logical alias** (`model_name` in LiteLLM's `model_list`), never a raw provider model string — infra can repoint an alias to a different underlying provider/model without any product code change. The `LITELLM_MASTER_KEY` is an admin-only credential for the control-plane routes and must never be held by product runtime code. Real upstream provider credentials (Gemini/Vertex, OpenAI, Anthropic, etc.) are configured only inside LiteLLM's own encrypted credential store, never distributed to products.

## 1. Executive Summary

This investigation provides a comprehensive evaluation of LiteLLM as the centralized AI Gateway and control/data plane infrastructure for the Sensifai Marketplace1. Sensifai requires an infrastructure fabric capable of mediating access across foundational model providers—including OpenAI, Anthropic, Google Vertex AI, AWS Bedrock, Azure OpenAI, and self-hosted vLLM clusters—while isolating upstream credentials from marketplace applications, enforcing per-application rate limits and budgets, logging token consumption, and integrating with agentic architectures via the Model Context Protocol (MCP) and Agent-to-Agent (A2A) protocol1.  
LiteLLM operates as a reverse proxy built on FastAPI and Uvicorn, with critical request serialization paths undergoing migration to a Rust-accelerated core1. Its virtual key layer, Prisma-managed PostgreSQL schema, and Redis coordination engine meet Sensifai's core requirements for dynamic routing, tenant isolation, and spend metering6. However, running LiteLLM in a multi-tenant commercial marketplace requires addressing several architectural boundaries:

* Upstream provider credentials stored in PostgreSQL must be encrypted using an explicit, dedicated salt key (LITELLM_SALT_KEY) to prevent key invalidation during master key rotations9.  
* The open-source core (licensed under MIT) excludes enterprise governance capabilities such as Single Sign-On beyond five users, SCIM provisioning, and native runtime external secret manager connectors, which are restricted under commercial licensing5.  
* The administrative interface (including LiteAdmin MCP) requires full proxy_admin credentials, meaning direct exposure to autonomous agents creates privilege escalation risks that necessitate an intermediate validation layer12.

LiteLLM can serve as Sensifai's centralized AI gateway data plane and tactical proxy, provided the Sensifai Control Plane maintains exclusive ownership of identity, commercial billing reconciliation, tenant lifecycle orchestration, and policy gating7.

## 2. Research Scope

The scope of this technical reference covers the functional, operational, and administrative capabilities of LiteLLM within Sensifai's distributed architecture:

* Dual runtime execution models: the FastAPI/Python data-plane reverse proxy and the administrative management REST API1.  
* Provider credential lifecycles, at-rest cryptographic mechanisms, and load balancing across multi-region deployments8.  
* Database and state management: PostgreSQL relational schema definitions via Prisma and Redis cluster state coordination for rate limits, cooldowns, and caching6.  
* Virtual key isolation, hierarchical spend tracking, and token calculation mechanisms7.  
* Advanced gateway protocols: Server-Sent Events (SSE) streaming, the Model Context Protocol (MCP) gateway, the LiteAdmin MCP administrative server, and the Agent-to-Agent (A2A) protocol bridge3.  
* Infrastructure security: historical Common Vulnerabilities and Exposures (CVEs), supply-chain mitigation protocols, and least-privilege agent authorization architectures15.

Commercial subscription lifecycle management, payment gateway integrations (e.g., Stripe merchant processing), end-user invoice dispute resolution, and raw upstream account provisioning are outside LiteLLM's operational boundary and remain under the Sensifai Control Plane11.

## 3. Current Version Status

LiteLLM operates on a continuous release cycle. Following a supply chain compromise on March 24, 2026—in which unauthorized packages (litellm==1.82.7 and 1.82.8) were published to PyPI via compromised CI tooling—the maintainers deployed a CI/CD v2 pipeline with isolated environments and ephemeral credentials, resuming official releases at version 1.83.015. Release versioning conventions transitioned from legacy -stable and -nightly tags to standard semantic versioning, where weekly releases increment minor versions, patch versions are reserved for hotfixes, and active maintenance covers the four most recent stable minor lines20. Docker images distributed through GitHub Packages (ghcr.io/berriai/litellm) are signed via Sigstore Cosign against public key commit 0112e53046018d726492c814b3644b7d376029d01.

### Version Compatibility Matrix

| Feature / Domain | Version Track | Release Status | Verification Source | Technical Notes |
| :---- | :---- | :---- | :---- | :---- |
| Proxy Core & Router Engine | v1.103.0 | Stable | Git Tag c991f4b | FastAPI/Starlette proxy engine with dynamic provider translation. |
| Rust Core Acceleration | v1.103.0 / Dev | Stable / Beta | Repo HEAD litellm-rust | Rust core used selectively for high-throughput request serialization. |
| Virtual Key Architecture | v1.103.0 | Stable | schema.prisma | SHA-256 hashed token storage in LiteLLM_VerificationToken7. |
| LiteAdmin MCP | v1.103.0 | Stable | litellm-admin-mcp@main | Exposes 65 administrative tools via Streamable HTTP and stdio12. |
| A2A Gateway Engine | v1.103.0 | Stable | Documentation / schema.prisma | Bridges Agent Cards; supports A2A v1.0 and v0.3 protocol specs3. |
| Semantic Caching Layer | v1.101.0-rc.1+ | Stable Patch | Commit 16db51e | Resolves tenant cache isolation issue documented in CVE-2026-8903218. |
| Dynamic Database Migrations | v1.103.0 | Stable | litellm-database package24 | Handled via pre-compiled Prisma binaries to support non-root Wolfi6. |
| Pre-release Development | v1.104.0-rc.1 | RC | Git Tag a76395e | Pre-release release candidate containing downstream stability fixes21. |

## 4. Official Sources

This research is based on analysis of the following primary sources:

* BerriAI LiteLLM GitHub Repository: Source code of proxy runtime, routing logic, and database migrations (BerriAI/litellm)1.  
* Database Schema Specification: The authoritative Prisma schema file (schema.prisma) located at repository root7.  
* LiteLLM Official Engineering Documentation and API Specifications: OpenAPI v3 definitions (/openapi.json), deployment guides, and feature whitepapers (docs.litellm.ai)4.  
* LiteAdmin MCP Repository and Blog Publications: Tool execution catalog, Streamable HTTP protocol specifications, and transport architectures (litellm-admin-mcp)12.  
* Common Vulnerabilities and Exposures (CVE) Registries and GitHub Security Advisories: Disclosures cataloging CVE-2026-89032, CVE-2026-59822, CVE-2026-42203, CVE-2026-30623, CVE-2025-0628, CVE-2025-45809, and earlier foundational defects13.  
* Production Container Registry Metadata: Image manifests and Cosign signature chains from GitHub Container Registry (ghcr.io/berriai/litellm)21.

## 5. Repository / Source Code Analysis

The proxy codebase is centered in litellm/proxy/proxy_server.py, which wraps the core client library located in litellm/15. The proxy runs FastAPI on Uvicorn6. Route registration is modularized across discrete routing modules: proxy_server.py handles inference operations (chat completions, embeddings, image generation, audio transcription), while management endpoints (/key/*, /team/*, /user/*, /model/*) reside in dedicated submodules, alongside isolated route handlers for MCP and A2A gateways3.  
A functional distinction exists between library usage and gateway usage. When imported as a Python package (import litellm), calls execute in-process and rely on local memory for routing and token tracking2. When launched as an AI Gateway (litellm --config config.yaml), the runtime initializes an asynchronous database client via prisma-client-py and opens connection pools to PostgreSQL and Redis8.  
Database migration execution requires attention in containerized deployments. Historically, startup hooks executed prisma db push or prisma migrate deploy directly through prisma_migration.py6. In non-root container environments running on Wolfi Linux or OpenShift, runtime generation of Prisma binaries and writes to /usr/lib/python3.13/site-packages/prisma/ fail when containers run with readOnlyRootFilesystem: true6. In current releases (v1.81.0 through v1.103.0), pre-compiled Prisma binaries are embedded during Docker image build time in official litellm-non_root variants, though Kubernetes deployments must manage migrations using dedicated init-containers or specify LITELLM_MIGRATION_DIR pointing to a writable volume if dynamic generation is required6.

## 6. Architecture

LiteLLM operates as an inline reverse proxy positioned between client applications and upstream model providers1. It standardizes diverse upstream provider APIs into an OpenAI-compatible interface, translating incoming /v1/chat/completions, /v1/embeddings, /v1/responses, /v1/audio/*, and /v1/images/* requests into provider-native payloads for Anthropic (Messages API), AWS Bedrock (Converse API), Google Vertex AI, Azure OpenAI, and self-hosted runtimes1.  
The request routing pipeline begins at the ingress load balancer, which terminates TLS and forwards the HTTP request to a stateless LiteLLM proxy instance40. The proxy's FastAPI layer authenticates the virtual bearer key against cached records in Redis or queries PostgreSQL on cache misses7. Once authenticated, the router evaluates deployment health and capacity, selects an active provider endpoint, decrypts stored credentials, translates the request payload into the provider's native format, and dispatches the call over HTTPS1.  
The system relies on two primary external data stores in distributed production deployments:

* PostgreSQL: Houses persistent metadata, including hashed virtual keys, team hierarchies, user profiles, append-only spend ledgers, and dynamically registered model deployments6.  
* Redis: Serves as the distributed coordination engine8. It tracks sliding-window rate limits (RPM and TPM), coordinates provider health and cooldown flags across proxy instances, manages concurrency locks, and provides exact-match response caching8.

## 7. Proxy Request Lifecycle

Every inbound data-plane request follows an eight-stage lifecycle within the proxy runtime:

1. Ingestion and Transport Termination: The incoming request arrives at the FastAPI application layer over HTTP/1.1 or HTTP/2. The external load balancer terminates TLS and forwards client IP headers (X-Forwarded-For). LiteLLM captures trace metadata and validates body payload size against max_request_size_mb40.  
2. Key Extraction and Authentication: LiteLLM extracts the Bearer token from the Authorization header and computes its SHA-256 hash7. It checks Redis for cached authentication records; on a cache miss, it queries PostgreSQL's LiteLLM_VerificationToken table to retrieve key records, checking expiration status, active budget blocks, and user/team associations7.  
3. Policy and Quota Verification: The proxy verifies that the requested model string matches the key's allowed model list7. It evaluates global, team, and key-level budgets in memory against PostgreSQL spend tallies7. Redis atomic counters (INCRBY) assess whether current requests per minute (RPM) or tokens per minute (TPM) breach provisioned limits7. If breached, the proxy aborts immediately, emitting HTTP 429 Too Many Requests or 400 Budget Exceeded without invoking downstream infrastructure41.  
4. Pre-Call Guardrail Processing: Active pre-call guardrails (such as PII masking via Presidio or LLM-as-a-judge classifiers) parse the prompt payload11. If an input violation occurs, execution halts with HTTP 422 Unprocessable Entity44.  
5. Routing and Deployment Selection: LiteLLM's internal router queries the deployment pool assigned to the requested model alias8. It filters out deployments currently placed in cooldown due to transient failures8. Based on the configured strategy (e.g., simple-shuffle, least-busy, latency-based-routing), it selects an optimal active deployment and extracts its connection metadata8.  
6. Secret Decryption and Transformation: If provider credentials reside in PostgreSQL, LiteLLM decrypts them in memory using LITELLM_SALT_KEY (via symmetric AES-GCM or Fernet primitives)9. The proxy transforms the OpenAI-formatted schema into the upstream provider's native format and dispatches an asynchronous HTTP request via aiohttp or httpx1.  
7. Upstream Response and Fallback Handling: If the upstream provider returns HTTP 429, 500, 503, or times out, the router increments an internal failure counter in Redis40. If the deployment exceeds its allowed_fails threshold within a sixty-second window, it enters cooldown for cooldown_time seconds, and the router transparently retries the request against a secondary fallback deployment or model40.  
8. Post-Call Metering, Spend Logging, and Response Streaming: Once a valid response completes (or stream terminates), LiteLLM calculates prompt, completion, and reasoning token consumption39. It evaluates cost using internal model cost maps, fires configured async callbacks (such as Prometheus metric emissions or OpenTelemetry traces), updates spend counters asynchronously in PostgreSQL (LiteLLM_SpendLogs), and streams the resulting payload back to the client application7.

## 8. Provider Architecture

LiteLLM supports over 140 provider backends1. To centrally manage OpenAI, Anthropic, Google Gemini/Vertex, AWS Bedrock, Azure OpenAI, and self-hosted runtimes through a single interface, Sensifai abstracts provider parameters inside LiteLLM's model_list configuration1. Each deployment entry binds a customer-facing model_name (the logical alias) to an explicit litellm_params block8.

### Provider Mapping and Translation Matrix

| Upstream Provider | Parameter Mapping Syntax (litellm_params.model) | Required Upstream Authentication Parameters | Upstream Protocol Translation |
| :---- | :---- | :---- | :---- |
| OpenAI Direct | openai/gpt-4o, openai/o3-mini | api_key: os.environ/OPENAI_API_KEY | Native passthrough; OpenAI JSON schema1. |
| Anthropic Direct | anthropic/claude-3-5-sonnet-20241022 | api_key: os.environ/ANTHROPIC_API_KEY | Translates OpenAI messages to Anthropic Messages format1. |
| AWS Bedrock | bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0 | aws_access_key_id, aws_secret_access_key, aws_region_name | Translates payloads to Bedrock Converse or invoke-model API39. |
| Google Vertex AI | vertex_ai/gemini-1.5-pro | vertex_project, vertex_location, vertex_credentials (service account JSON)48 | Translates payloads to Google Vertex generateContent API20. |
| Azure OpenAI | azure/<deployment_name> | api_base, api_version, api_key or azure_ad_token | Maps to Azure OpenAI Service REST API spec47. |
| Self-Hosted vLLM | openai/<custom_model_id> | api_base: http://vllm-service:8000/v1, api_key: "none" | Direct OpenAI-compatible HTTP REST routing1. |

This structure ensures that client applications interact exclusively with uniform OpenAI request schemas, while LiteLLM handles provider-specific requirements such as translating system messages for Anthropic, structuring JSON schemas for Gemini, or generating AWS SigV4 signatures for Bedrock1.

## 9. Credential Management

Isolating upstream credentials from marketplace applications is a core security requirement. In LiteLLM, upstream credentials can be maintained either statically via configuration files and environment variables, or dynamically via PostgreSQL7.  
When stored dynamically in PostgreSQL (LiteLLM_ProxyModelTable), credentials must be encrypted at rest7. The proxy's cryptographic behavior is governed by LITELLM_SALT_KEY9.  
If LITELLM_SALT_KEY is defined, the proxy derives an AES-GCM or Fernet encryption cipher using this dedicated secret9. In this operational mode, LITELLM_MASTER_KEY acts strictly as an administrative bearer authentication token; rotating the master key does not affect the proxy's ability to decrypt stored provider secrets9.  
If LITELLM_SALT_KEY is omitted, LiteLLM falls back to using LITELLM_MASTER_KEY directly as the cryptographic key for encrypting provider credentials stored in PostgreSQL9. This creates operational risk: rotating the master key renders all previously stored provider credentials unreadable unless a migration sequence is executed at boot time by supplying LITELLM_MIGRATE_FROM_MASTER_KEY alongside the new master key9.  
The credential management lifecycle follows eight distinct stages:

1. Credential Ingestion: A platform administrator or automated workflow submits upstream credentials via the REST API, Admin MCP, or static configuration4.  
2. Validation: The proxy validates the credential structure and tests connectivity against the upstream provider12.  
3. Cryptographic Storage: Secrets are encrypted using LITELLM_SALT_KEY before insertion into the LiteLLM_ProxyModelTable database table7.  
4. In-Memory Decryption: Decrypted credentials are loaded into internal routing dictionaries and omitted from GET endpoint responses4.  
5. Runtime Dispatch: The routing engine selects an active deployment and injects the credential into outbound request headers8.  
6. Health and Cooldown Tracking: Upstream authentication errors (HTTP 401/403) or rate limits (HTTP 429) trigger cooldown counters in Redis41.  
7. Failover: Traffic reroutes to alternative credentials or models, while errors are logged to the Sensifai audit plane40.  
8. Revocation: Compromised credentials are updated or marked with blocked: true in the database, evicting them from in-memory pools7.

LiteLLM supports integration with external secret management services (AWS Secrets Manager, Google Secret Manager, Azure Key Vault, HashiCorp Vault), but native dynamic resolution of external secrets requires an Enterprise license5. In the open-source distribution, secret references using os.environ/ resolve to process-level environment variables injected at container startup8.

## 10. Virtual Key Architecture

LiteLLM isolates consumer applications through Virtual Keys1. Marketplace applications never receive upstream provider credentials; instead, each application receives an isolated virtual key prefixed with sk-1.  
The virtual key lifecycle operates through nine steps:

1. Marketplace Application Creation: The Sensifai Marketplace Control Plane processes application registration and generates an internal service profile.  
2. Virtual Key Generation Request: The Control Plane issues a POST /key/generate request to LiteLLM's Admin API40.  
3. Hashing and Storage: LiteLLM generates a raw token (sk-...), computes its SHA-256 hash, and stores the hash in LiteLLM_VerificationToken.token7.  
4. Mapping Persistence: LiteLLM returns the plaintext key once. The Sensifai Control Plane records the key's token ID and maps it to the application's UUID9.  
5. Runtime Injection: The application receives the virtual key via secure environment variables or a secrets manager.  
6. Gateway Ingestion: The application sends an inference request to the LiteLLM Proxy using the virtual key as a Bearer token1.  
7. Authentication: The proxy hashes the incoming token and checks Redis or PostgreSQL for matching records7.  
8. Upstream Mediation: The proxy verifies model permissions, rate limits, and budgets before injecting upstream credentials and dispatching the request7.  
9. Cost Attribution: The proxy logs token usage and costs to LiteLLM_SpendLogs and updates Redis budget counters7.

Virtual keys are stored securely using cryptographic hashing: the raw key generated during POST /key/generate is returned in the API response exactly once9. LiteLLM writes only the SHA-256 hash to the token column of the LiteLLM_VerificationToken table7. Subsequent requests presenting the key are authenticated by computing the SHA-256 hash of the bearer token and querying PostgreSQL or Redis cache entries7.  
Each virtual key row encapsulates extensive security and operational constraints7:

* models: A string array specifying exactly which model aliases the key is authorized to invoke (e.g., ["sensifai-fast", "sensifai-reasoning"])7. Requests for unlisted models return HTTP 403 Forbidden.  
* max_budget and budget_duration: Numeric spend ceiling enforced over defined temporal windows (24h, 7d, 30d)7.  
* rpm_limit and tpm_limit: Throttling thresholds governing maximum requests per minute and tokens per minute7.  
* model_rpm_limit and model_tpm_limit: JSON payloads defining fine-grained, model-specific throttling within a single key7.  
* auto_rotate and rotation_interval: Native parameters supporting key rotation lifecycles7.  
* metadata: Free-form JSON storing Sensifai-specific tenancy markers, such as sensifai_app_id, sensifai_tenant_id, and billing tier7.

## 11. Users / Teams / Organizations

LiteLLM structures multi-tenancy through a four-tier hierarchical relational model: Organizations, Teams, Users, and Virtual Keys7.  
The hierarchical entity model flows from top-level Organizations down to individual service keys:

* Organization (LiteLLM_OrganizationTable): Represents the top-level tenancy container, defining global spending caps and administrative owners7.  
* Teams (LiteLLM_TeamTable): Subordinate to Organizations. Teams define shared budgets, model allowlists, and model-specific RPM/TPM limits7. In Sensifai, each marketplace application or customer organization maps directly to a LiteLLM Team7.  
* Users (LiteLLM_UserTable): Represents individual operators or developers associated with teams via the LiteLLM_TeamMembership junction or members_with_roles JSON field7. Roles include proxy_admin (unrestricted gateway control), proxy_admin_viewer (read-only audit capabilities), internal_user (ability to consume models and generate personal keys within assigned budgets), and internal_user_viewer5.  
* Virtual Keys (LiteLLM_VerificationToken): Can be bound to an individual user_id, or directly to a team_id as a headless service account key7.

When a request executes against a team-bound virtual key, LiteLLM enforces budget and rate-limit constraints hierarchically: the key-level budget is evaluated first, followed by the team budget, and finally the organization budget7. If any tier in the hierarchy breaches its ceiling, the transaction is rejected7.

## 12. Model & Deployment Management

LiteLLM decouples consumer-facing model identifiers from underlying infrastructure deployments8. Sensifai leverages this abstraction to expose stable logical identifiers—such as sensifai-fast, sensifai-reasoning, sensifai-vision, and sensifai-embedding—while concealing upstream vendors, deployment regions, and dynamic failovers8.  
Model definitions are declared either in config.yaml or dynamically stored in the LiteLLM_ProxyModelTable via administrative REST endpoints (POST /model/new)7. Multiple physical deployments can be registered under the same logical model_name8.

```yaml
model_list:
  - model_name: sensifai-fast
    litellm_params:
      model: azure/gpt-4o-mini-eastus
      api_base: https://sensifai-eastus.openai.azure.com/
      api_key: os.environ/AZURE_EASTUS_KEY
      rpm: 10000
      tpm: 2000000
    model_info:
      order: 1

  - model_name: sensifai-fast
    litellm_params:
      model: vertex_ai/gemini-1.5-flash
      vertex_project: os.environ/VERTEX_PROJECT_ID
      vertex_location: us-central1
      rpm: 8000
      tpm: 1500000
    model_info:
      order: 2

  - model_name: sensifai-reasoning
    litellm_params:
      model: anthropic/claude-3-5-sonnet-20241022
      api_key: os.environ/ANTHROPIC_KEY
      rpm: 4000
      tpm: 400000

router_settings:
  routing_strategy: latency-based-routing
  allowed_fails: 3
  cooldown_time: 30
  num_retries: 2
  timeout: 45
```

Sensifai can modify, add, or repoint upstream providers at any time without requiring code changes or redeployments in marketplace client applications1. If Azure experiences an outage, requests for sensifai-fast automatically route to Vertex AI, maintaining identical request and response schemas8.

## 13. Routing / Failover

The routing engine distributes traffic across deployments within a model group using configurable routing strategies8:

* simple-shuffle: Low-overhead pseudo-random distribution across healthy deployments8.  
* least-busy: Inspects active in-flight requests per deployment, routing new traffic to the worker with the lowest concurrency load42.  
* latency-based-routing: Maintains a rolling average of response latencies per deployment in Redis, routing traffic to the fastest responding endpoint8.  
* cost-based-routing: Directs requests to the deployment offering the lowest computed token cost42.  
* usage-based-routing: Balances requests dynamically based on remaining RPM/TPM capacity42.

Failover and resilience are governed by three interrelated parameters: allowed_fails, cooldown_time, and fallbacks40. When a deployment encounters upstream network timeouts, HTTP 5xx server errors, or HTTP 429 rate limit errors, LiteLLM records the failure40. If the deployment logs more than allowed_fails failures within a 60-second window, LiteLLM marks the deployment as unhealthy in Redis, triggering a cooldown_time (e.g., 30 seconds) during which the router bypasses it entirely40.  
If all deployments for a specific model group fail or enter cooldown, the proxy evaluates the fallbacks configuration40. The router translates the request on the fly to a designated fallback model group (e.g., falling back from sensifai-reasoning to sensifai-fast), preventing application errors40. In addition, content_policy_fallbacks can be configured to catch upstream content moderation filter errors and retry the prompt against an alternate provider with different guardrail baselines40.

## 14. Streaming / Realtime

LiteLLM supports streaming through Server-Sent Events (SSE) compliant with the OpenAI streaming protocol format (text/event-stream)1. When a client submits a request with "stream": true, LiteLLM initiates an asynchronous chunked connection to the selected upstream provider49.  
Streaming introduces specific operational considerations:

* Reverse Proxy Buffering: Upstream reverse proxies (e.g., NGINX, Cloudflare, Traefik) must disable proxy buffering (proxy_buffering off;, X-Accel-Buffering: no). If buffering remains active, intermediate proxies hold chunks until buffer limits fill, breaking real-time responsiveness and elevating Time-to-First-Token (TTFT) metrics.  
* Streaming Token Accounting: In standard SSE streams, upstream providers historically omitted token usage from intermediate chunks. LiteLLM handles this by intercepting the final stream chunks (such as OpenAI's stream_options: {"include_usage": true}) or executing fallback token counting using local tiktoken or provider-specific tokenizers upon stream completion to log accurate token spend to PostgreSQL7.  
* Upstream Cancellation and Disconnect Handling: If a client terminates an HTTP connection mid-stream, LiteLLM's asynchronous loop detects socket closure, aborts the downstream generator, and cancels the outbound upstream HTTP request to avoid incurring unnecessary token spend.  
* WebSocket and Realtime Protocol Mediation: For OpenAI Realtime APIs (/v1/realtime), LiteLLM establishes a bidirectional WebSocket bridge. Because WebSocket connections are persistent and stateful, they cannot be load-balanced via simple HTTP request-level shuffling; they require sticky routing or round-robin connection balancing during the initial WebSocket handshake1.

## 15. Spend / Cost / Logging

LiteLLM incorporates a cost calculation engine that tracks usage across all supported models1. The engine evaluates each completed interaction using a built-in cost map cross-referencing input tokens, completion tokens, cached tokens, and reasoning tokens39.  
Token spend is persisted to the LiteLLM_SpendLogs PostgreSQL table7. Each record captures the unique request_id, the hashed virtual key api_key, the user_id, the team_id, the logical model invoked, the underlying deployment invoked, total prompt tokens, total completion tokens, latency (measured in milliseconds), and the calculated dollar cost (spend)7.  
For continuous operational telemetry, LiteLLM includes native async logging callbacks1:

* Prometheus: Exposes a /metrics scrape endpoint publishing counters for request rates, latency histograms, error counts, and token throughput grouped by model, key alias, and response status11.  
* OpenTelemetry (OTel): Emits distributed trace spans containing trace IDs, child spans for routing, TTFT markers, and span attributes recording token counts and model providers46.  
* Upstream Observability Integrations: Dispatches asynchronous events to platforms such as Langfuse, Langsmith, Arize, and Datadog via configured webhooks11.

Database write pressure from spend logging can become a scalability bottleneck at high throughput. Under heavy loads, administrators should tune maximum_spend_logs_retention_period (e.g., 30 days) and set maximum_spend_logs_retention_interval to prune expired records, or disable row-by-row synchronous persistence via disable_spend_logs: true in favor of asynchronous stream ingestion via OpenTelemetry or Kafka callbacks40.

## 16. PostgreSQL Data Model

LiteLLM's persistence model is defined via Prisma in schema.prisma7. The relational structure coordinates identities, credentials, permissions, and spend tracking7.  
The data model is structured around nine core Prisma models:

* LiteLLM_OrganizationTable: Top-level tenant container; groups teams and enforces organizational spend limits7.  
* LiteLLM_TeamTable: Represents functional tenant groups or Sensifai marketplace applications, enforcing shared budgets and model allowlists7.  
* LiteLLM_UserTable: Represents user accounts, developers, or agents, storing IdP assertions (assertion_b64)7.  
* LiteLLM_VerificationToken: Stores virtual API keys as SHA-256 hashes, along with budget and rate limits7.  
* LiteLLM_ProxyModelTable: Dynamically registers model deployments, storing encrypted provider credentials in litellm_params7.  
* LiteLLM_SpendLogs: Append-only ledger recording per-request token usage, latencies, and computed costs7.  
* LiteLLM_BudgetTable: Reusable budget templates referenced by users, teams, or organizations7.  
* LiteLLM_DailyUserSpend: Aggregated rollups for rapid daily spend reporting7.  
* LiteLLM_PolicyTable: Enforces unified guardrail, data-residency, and routing rules26.

### Primary Prisma Schema Models

| Entity / Prisma Model | Primary Key | Key Attributes | Structural Purpose & Consistency Requirements |
| :---- | :---- | :---- | :---- |
| LiteLLM_VerificationToken | token (String, SHA-256 hash)7 | key_alias, spend, max_budget, expires, models, rpm_limit, tpm_limit, team_id, user_id, auto_rotate | Stores virtual API keys. Plaintext token is never stored. Strong consistency required on budget checks7. |
| LiteLLM_TeamTable | team_id (UUID String)7 | team_alias, organization_id, admins, members_with_roles, spend, max_budget, models, model_rpm_limit, blocked | Represents functional tenant groups or Sensifai marketplace applications. Enforces shared budgets7. |
| LiteLLM_UserTable | user_id (String)7 | user_email, user_role, spend, max_budget, models, teams | Represents user accounts, developers, or agents. Stores IdP assertions (assertion_b64)7. |
| LiteLLM_OrganizationTable | organization_id (UUID String)7 | organization_name, budget_id, spend, model_spend | Top-level tenancy container. Groups teams and enforces organizational spend limits7. |
| LiteLLM_ProxyModelTable | model_id (UUID String)7 | model_name, litellm_params (JSON), model_info (JSON), blocked | Dynamically registers model deployments. Stores encrypted provider credentials in litellm_params7. |
| LiteLLM_SpendLogs | request_id (String)7 | api_key (Hashed), spend, total_tokens, model, startTime, endTime, team_id, user_id | Append-only ledger recording per-request token usage, latencies, and computed costs7. |
| LiteLLM_BudgetTable | budget_id (UUID String)7 | max_budget, budget_duration, tpm_limit, rpm_limit | Reusable budget templates referenced by users, teams, or organizations7. |
| LiteLLM_DailyUserSpend | id (UUID String)7 | user_id, date, api_key, model, spend | Aggregated rollups for rapid daily spend reporting7. |
| LiteLLM_PolicyTable | policy_id (UUID String) | policy_name, policy_definition (JSON) | Enforces unified guardrail, data-residency, and routing rules26. |

## 17. Redis Architecture

While LiteLLM can operate in single-node environments using in-memory structures and PostgreSQL, deploying a horizontally scaled cluster requires Redis8.  
Redis fulfills three roles in high-availability deployments:

1. Distributed Rate Limiting: Tracks RPM and TPM counters using atomic operations (INCRBY, EXPIRE) across sliding time windows41. Without Redis, multiple proxy instances track limits independently in local memory, allowing aggregate traffic to multiply allowed thresholds41.  
2. Deployment Cooldown Synchronization: When an upstream deployment fails, its cooldown state is published to Redis45. This ensures that when one proxy instance marks a deployment as unhealthy, all other instances immediately bypass that deployment40.  
3. Dynamic In-Memory Virtual Key Caching: Caches hashed key records, model allowlists, and active budget totals with short TTLs (typically 30–60 seconds)7. This relieves PostgreSQL from handling database reads for every incoming inference request7.

If Redis becomes unreachable, LiteLLM falls back to degraded local in-memory tracking41. In this state, rate limits are enforced per-instance rather than globally, and cooldown events fail to synchronize across nodes, which can lead to redundant retries against failing providers until local cooldowns trigger independently41.

## 18. Security

Operating an AI gateway requires strict isolation between client applications, proxy infrastructure, and administrative systems1. LiteLLM has undergone substantial security hardening following several high-severity vulnerability disclosures15.

### Security Vulnerabilities and Remediation Matrix

| CVE / Identifier | Severity | Affected Versions | Remediated Version | Impact Analysis | Mitigation and Remediation |
| :---- | :---- | :---- | :---- | :---- | :---- |
| CVE-2026-8903218 | High | < 1.101.0-rc.1 | v1.101.0-rc.1 | Tenant isolation bypass in semantic cache layer due to scope key mismatch, permitting cross-tenant cache retrieval18. | Upgrade to v1.101.0-rc.1+; disable semantic caching across shared tenants18. |
| CVE-2026-5982231 | High | < 1.84.0 | v1.84.0 | Authentication bypass on MCP Streamable HTTP endpoints where failed OAuth fallback defaulted to empty auth object31. | Upgrade to v1.84.0+; enforce strict bearer key validation31. |
| CVE-2026-4220317 | High | < 1.83.7 | v1.83.7-stable | Server-Side Template Injection (SSTI) in /prompts/test allowing arbitrary code execution in proxy process17. | Upgrade to v1.83.7+; restrict access to prompt testing endpoints17. |
| CVE-2026-3062316 | Critical | 1.18.10 / Earlier16 | Patched | Command injection in MCP server creation via unvalidated JSON command and args parameters16. | Sanitize MCP server configs; disallow arbitrary host CLI executions16. |
| Supply Chain Breach15 | Critical | 1.82.7, 1.82.8 | v1.83.0 | Compromised CI runners published unauthorized packages to PyPI via compromised Trivy workflows15. | Deploy CI/CD v2; verify container signatures via Cosign15. |
| CVE-2025-062813 | High | Specific 2025 builds13 | Patched13 | Privilege escalation enabling authenticated lower-privilege users to assume proxy_admin role13. | Update to latest stable; enforce strict role assignment checks13. |
| CVE-2025-4580930 | Moderate | v1.65.4 | Patched | SQL injection vulnerability identified in /key/block endpoint30. | Parameterize Prisma/SQL queries; sanitize incoming key inputs30. |
| CVE-2024-682529 | High | 1.40.12 | Patched29 | Remote code execution via unsanitized dynamic imports in post_call_rules29. | Hard-code permitted callbacks; disable arbitrary dynamic module imports29. |
| CVE-2024-575128 | Critical | v1.35.8 | Patched28 | Remote code execution via unsafe eval during secret parsing in add_deployment28. | Replace eval with safe JSON parsing and structured schemas28. |
| CVE-2024-960633 | High | v1.44.9 | Patched33 | API key masking vulnerability in logs revealing all but the first 5 characters33. | Mask all but prefix/suffix characters across all logging drivers33. |

To secure the gateway in production:

* Admin Route Isolation: The Admin API and Admin UI must never be exposed directly to the public internet11. Route traffic through a reverse proxy that restricts /key/*, /team/*, /user/*, /model/*, and /config/* endpoints to internal VPC CIDRs11.  
* Disabling Environment Credential Bootstrapping: After creating an initial database administrator, set disable_env_credential_login: true to invalidate hard-coded UI_USERNAME and UI_PASSWORD credentials27.  
* Inbound Request URL Validation: Set user_url_validation: true under litellm_settings to prevent Server-Side Request Forgery (SSRF) when fetching user-supplied resources (e.g., OpenAPI schemas or image URLs)40. This blocks connections to internal RFC1918 private subnets, loopbacks, and link-local metadata endpoints40.

## 19. API Inventory

LiteLLM exposes two primary API surfaces: OpenAI-compatible data-plane endpoints and administrative control-plane endpoints1.  
The gateway surface is divided across four main areas:

* Data Plane: Inference and tool routing endpoints, including /v1/chat/completions, /v1/completions, /v1/embeddings, /v1/responses, /v1/images/generations, /v1/audio/transcriptions, and /v1/models1.  
* Operational Infrastructure: System monitoring endpoints, including /health, /health/readiness, and /metrics for Prometheus scraping4.  
* Administrative Control Plane: Management endpoints for key lifecycles (/key/*), team configurations (/team/*), identity assignments (/user/*), dynamic deployments (/model/*), financial spend tracking (/spend/*), and proxy settings (/config/*)4.  
* Protocol Gateways: Endpoints for the Model Context Protocol (/mcp/*) and Agent-to-Agent protocol (/a2a/*)3.

Data-plane endpoints accept standard virtual bearer keys (Authorization: Bearer sk-...), while administrative routes require keys with proxy_admin permissions or the master key1.

## 20. Complete Admin API Reference

The administrative REST API provides programmatic control over the proxy's runtime and persistence layers4. The following operations form the core integration surface for Sensifai:

### Key Lifecycle Operations

* POST /key/generate: Generates a new virtual key40. Accepts models (array), duration (string), max_budget (float), rpm_limit (int), tpm_limit (int), team_id (string), user_id (string), metadata (JSON)7. Returns the plaintext key along with its hashed identifier9. Destructive: No. Idempotent: No.  
* POST /key/update: Updates an existing virtual key40. Accepts key (or key_alias), modified models, budgets, or metadata40. Updates PostgreSQL and invalidates Redis caches7. Destructive: No. Idempotent: Yes.  
* POST /key/delete: Permanently revokes virtual keys4. Accepts keys: [string]4. Deletes records from PostgreSQL and evicts keys from Redis caches7. Destructive: Yes. Idempotent: Yes.  
* POST /key/block / POST /key/unblock: Temporarily suspends or restores key access without deleting records7. Destructive: No. Idempotent: Yes.  
* POST /key/regenerate: Rotates an active key9. Generates a new plaintext token while preserving underlying budgets, configurations, and metadata9. Destructive: Yes (invalidates prior token). Idempotent: No.  
* GET /key/info: Retrieves metadata, spend, and rate-limit statistics for a designated key4. Read-only. Idempotent: Yes.

### Team and User Operations

* POST /team/new: Provisions a new team container7. Accepts team_alias, organization_id, max_budget, models, members_with_roles7. Returns team_id7. Destructive: No. Idempotent: No.  
* POST /team/update: Modifies team budgets, member assignments, or model access7. Destructive: No. Idempotent: Yes.  
* POST /team/delete: Deletes a team and cascades to its direct service keys7. Destructive: Yes. Idempotent: Yes.  
* POST /user/new: Creates a user record27. Accepts user_email, user_role (proxy_admin, internal_user), max_budget4. Destructive: No. Idempotent: No.  
* POST /user/update: Updates user roles, email, or budget limits4. Destructive: No. Idempotent: Yes.  
* POST /user/delete: Removes user profiles4. Destructive: Yes. Idempotent: Yes.

### Dynamic Deployment and Observability Operations

* POST /model/new: Dynamically registers a model deployment4. Accepts model_name, litellm_params (containing upstream model string, base URL, encrypted provider secret)7. Writes to LiteLLM_ProxyModelTable and updates routing dictionaries in memory7. Destructive: No. Idempotent: No.  
* POST /model/update: Modifies routing parameters, rate limits, or credentials for an existing deployment4. Destructive: No. Idempotent: Yes.  
* POST /model/delete: Removes a deployment from the active routing pool4. Destructive: Yes. Idempotent: Yes.  
* GET /spend/calculate: Queries aggregated spend across virtual keys, teams, and providers over defined date ranges4. Read-only. Idempotent: Yes.

## 21. MCP Gateway

LiteLLM includes a native Model Context Protocol (MCP) Gateway that centralizes and governs access to external tools14. The gateway standardizes tool discovery and execution across client applications, eliminating the need to configure direct MCP server connections in every client1.  
The MCP Gateway supports two primary execution patterns:

* Direct MCP Client Flow: Client environments (e.g., Cursor, Claude Desktop, custom MCP agents) connect directly to LiteLLM's /mcp endpoint over Streamable HTTP or Server-Sent Events (SSE)2. LiteLLM validates the client's virtual bearer key, filters available tools against team or key allowlists, and forwards tool calls to upstream MCP servers2.  
* LLM-Driven Tool Calling: Client applications call the standard /v1/chat/completions endpoint with an MCP server configuration attached1. The proxy resolves tool definitions from the registered MCP server, converts them into OpenAI function-calling schemas, and injects them into the model prompt1. When the model requests a tool call, LiteLLM executes the action against the MCP server, returns the tool output to the model, and delivers the final response to the client1.

The gateway supports Streamable HTTP and Server-Sent Events (SSE) transports12. While local Stdio transport is supported for CLI use cases, it should be disabled in shared network-accessible deployments to avoid the command injection risks identified in CVE-2026-3062316.  
Access control for MCP servers can be configured at both the Virtual Key and Team levels14. Administrators can restrict specific keys or teams to designated toolsets, preventing unauthorized clients from discovering or executing sensitive tools7.

## 22. LiteAdmin MCP

LiteAdmin MCP (litellm-admin-mcp) is an administrative bridge that exposes LiteLLM's management APIs as standard Model Context Protocol (MCP) tools12. This allows authorized AI agents (e.g., Claude Code, Cursor, Codex, or custom automation runtimes) to inspect and modify gateway infrastructure using natural language or tool-calling loops4.  
Connecting to LiteAdmin MCP requires a personal administrative credential with the proxy_admin role12. Read-only accounts (proxy_admin_viewer) and team administrators are denied access by design12. The server exposes 65 curated administrative operations spanning key provisioning, budget adjustments, deployment management, and log inspection12.  
The integration flow routes through three main stages: the autonomous operations agent invokes tools over MCP JSON-RPC, the LiteAdmin MCP server authenticates the request using the agent's admin key, and the server translates tool calls into HTTP requests against LiteLLM's Admin REST API, which updates PostgreSQL and Redis state12.

### LiteAdmin MCP Tool Inventory

| Canonical Tool Name | Operational Category | Read / Write | Destructive Action | Required Role | Primary Inputs | Primary Outputs | Recommended Agent Access Policy |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| list_teams | Teams | Read | No | proxy_admin | None | Array of team objects, IDs, budgets12 | Permitted Autonomously |
| get_team_info | Teams | Read | No | proxy_admin | team_id | Metadata, members, current spend | Permitted Autonomously |
| create_team | Teams | Write | No | proxy_admin | team_alias, max_budget, models | Created team object with team_id | Approval Required |
| update_team_budget | Budgets | Write | No | proxy_admin | team_id, max_budget | Updated team confirmation | Approval Required |
| delete_team | Teams | Write | Yes | proxy_admin | team_id | Deletion confirmation | Denied (Human Only) |
| create_key | Keys | Write | No | proxy_admin | team_id, models, max_budget, alias | Generated plaintext key and token ID9 | Permitted Autonomously |
| get_key_info | Keys | Read | No | proxy_admin | key or key_alias | Spend, limits, expiration, models | Permitted Autonomously |
| update_key | Keys | Write | No | proxy_admin | key, models, rpm_limit, max_budget | Updated key metadata | Approval Required |
| delete_key | Keys | Write | Yes | proxy_admin | key | Deletion confirmation | Approval Required |
| add_model_deployment | Models | Write | No | proxy_admin | model_name, provider_model_id, credential_ref | Deployment confirmation, model_id | Approval Required |
| list_models | Models | Read | No | proxy_admin | None | Active routing model groups | Permitted Autonomously |
| delete_model_deployment | Models | Write | Yes | proxy_admin | model_id | Deletion confirmation | Denied (Human Only) |
| get_spend_logs | Spend | Read | No | proxy_admin | start_date, end_date, team_id | Aggregated spend and token metrics | Permitted Autonomously |
| check_health | Health | Read | No | proxy_admin | None | Component status (DB, Redis, models) | Permitted Autonomously |

Because LiteAdmin MCP requires a full proxy_admin credential, connecting an autonomous agent directly to this interface exposes the entire gateway to privilege escalation risks12. If an agent's context is manipulated via prompt injection, it could delete production deployments or exfiltrate configuration data12. Consequently, LiteAdmin MCP should be deployed behind an intermediate control layer that enforces strict tool allowlisting and limits the agent to non-destructive operations12.

## 23. A2A / Agent Gateway

LiteLLM implements the Agent-to-Agent (A2A) protocol, functioning as an intermediary proxy for autonomous multi-agent systems1. This allows developers to discover, invoke, and monitor independent AI agents through LiteLLM while applying the same authentication, budgeting, and observability policies used for standard LLMs3.  
Upstream agents can be built using frameworks such as Pydantic AI, LangGraph, Azure AI Foundry, Vertex AI Agent Engine, or AWS Bedrock AgentCore2. LiteLLM discovers an agent's capabilities by querying standard discovery endpoints (/.well-known/agent-card.json, /.well-known/agent.json, or /agentCard/v1.0) on the upstream agent service23. The gateway ingests the resulting Agent Discovery Object (including supported skills, input modes, and streaming capabilities) and publishes a normalized, curated Agent Card at GET /a2a/{agent_id}/.well-known/agent.json23.  
The gateway supports both A2A protocol specifications: v1.0 and legacy v0.33. Administrators should explicitly set protocolVersion: "1.0" during agent registration; leaving the version unpinned can result in schema mismatches when legacy callers interact with modern A2A clients3.  
Upstream agents can be invoked through two primary patterns2:

* Native A2A Protocol: Clients connect via JSON-RPC 2.0 at POST /a2a/{agent_id} using the official A2A SDK (a2a-sdk >= 1.1.0), calling methods such as message/send, message/stream, tasks/get, and tasks/cancel1.  
* OpenAI-Compatible Route: Clients invoke the agent using standard OpenAI SDKs by targeting POST /v1/chat/completions with the a2a/ model prefix (e.g., model="a2a/support-agent")39. LiteLLM handles message translation and returns the response in standard chat completion format58.

During execution, LiteLLM automatically injects tracing and attribution headers into outbound calls to backend agents3:

* X-LiteLLM-Trace-Id: Propagates a distributed trace identifier, linking parent and child agent executions across multi-turn interactions3.  
* X-LiteLLM-Agent-Id: Identifies the originating agent, enabling precise cost and token attribution within LiteLLM_SpendLogs3.

### Gateway Taxonomy Comparison

| Dimension | LLM Gateway | MCP Gateway | Admin MCP (LiteAdmin) | A2A Agent Gateway |
| :---- | :---- | :---- | :---- | :---- |
| Primary Objective | Normalizes LLM inference across model providers1. | Centralizes tool discovery and execution14. | Enables agents to manage gateway infrastructure12. | Routes interactions between autonomous agents3. |
| Core Protocol | OpenAI HTTP REST / SSE1. | Streamable HTTP / SSE / JSON-RPC12. | MCP JSON-RPC 2.012. | A2A JSON-RPC 2.0 / OpenAI shim23. |
| Primary Clients | Applications, SDKs, frontend services1. | Agents, IDEs (Cursor), MCP tools2. | Administrative agents (Claude, Codex)12. | Multi-agent frameworks, orchestrators2. |
| Upstream Endpoints | OpenAI, Bedrock, Vertex, vLLM1. | Tool servers (DBs, APIs, Git)1. | LiteLLM Admin REST APIs12. | LangGraph, Pydantic AI, Vertex engines2. |
| Authentication | Virtual Key (sk-...)1. | Virtual Key (sk-...) / OAuth14. | Admin Key (proxy_admin role)12. | Virtual Key (sk-...)2. |

## 24. Agent Integration Patterns

Designing an architecture for an autonomous operations agent requires evaluating how the agent interfaces with LiteLLM's control and data planes. Four patterns present distinct trade-offs across security, observability, and operational risk:

* Pattern A (Agent Uses LiteLLM as an LLM Gateway): The agent calls POST /v1/chat/completions using an isolated virtual key to access underlying models1. This pattern is safe and well-observable, but provides inference capabilities only1.  
* Pattern B (Agent Controls LiteLLM Through Admin REST API): The agent interacts with an intermediate Sensifai service layer, which issues scoped administrative REST calls (/key/*, /team/*) against the proxy4. This provides full API coverage while allowing Sensifai to enforce pre-call validation and audit logging4.  
* Pattern C (Agent Controls LiteLLM Through LiteAdmin MCP): The agent connects over MCP to litellm-admin-mcp, which translates tool invocations into administrative API calls12. This simplifies tool calling in MCP-native clients, but requires broad proxy_admin credentials and expands the attack surface12.  
* Pattern D (Agent Uses Integrated Gateway Surface): The agent connects to a unified LiteLLM endpoint to invoke LLMs, discover tools via the MCP Gateway, and route tasks to peer agents over A2A1. This enables flexible orchestration, but couples runtime inference with tool and agent governance3.

### Comparative Evaluation of Integration Patterns

| Architectural Dimension | Pattern A: LLM Data Plane | Pattern B: Admin REST Client | Pattern C: LiteAdmin MCP | Pattern D: Multi-Protocol Gateway |
| :---- | :---- | :---- | :---- | :---- |
| Security & Isolation | High; standard virtual key isolation1. | High; scoped API credentials via internal service layer4. | Medium-Low; requires broad proxy_admin credential12. | Medium; multiple protocol surfaces expand boundary14. |
| Operational Blast Radius | Low; limited to key's token budget7. | Constrained; restricted by application business logic. | High; agent can modify deployments and teams12. | Moderate; depends on downstream tool permissions14. |
| API Coverage | Inference only (Chat, Embeddings)1. | Full programmatic coverage of management routes4. | Fixed to 65 exposed MCP operations12. | Mixed; covers tools, models, and agents1. |
| Implementation Complexity | Low; drop-in OpenAI client1. | Moderate; typed HTTP client in backend service4. | Low; plug-and-play MCP client connector12. | High; requires orchestrating multiple protocols3. |
| Auditability | Standard request logs and metrics11. | Comprehensive; all actions pass through service logs. | Relies on LiteAdmin MCP logging12. | Fragmented across data, tool, and agent planes3. |

For Sensifai Marketplace operations, a hybrid architecture combining Pattern B and Pattern A provides the safest foundation. The autonomous operations agent consumes foundational models through Pattern A (using a restricted virtual key with fixed budgets), while administrative actions are executed through Pattern B via an intermediate, strongly typed Sensifai Control Service that enforces policy checks and approval workflows prior to calling LiteLLM's Admin REST API1. Direct agent access via Pattern C (LiteAdmin MCP) should be restricted to development and sandbox environments due to its requirement for unsegmented proxy_admin credentials12.

## 25. Autonomous Automation Design

An autonomous operations agent can manage several operational workflows within LiteLLM, provided non-destructive administrative tasks are separated from high-risk mutations that require policy validation.  
Application onboarding follows an automated seven-step sequence:

1. Application Registration: A developer registers a new application within the Sensifai Marketplace Control Plane.  
2. Scoping and Quota Definition: The Sensifai Control Plane assigns application tiers, permitted model aliases, rate limits, and billing caps.  
3. Team Provisioning: The automation agent calls POST /team/new to create an isolated team boundary within LiteLLM4.  
4. Virtual Key Generation: The agent invokes POST /key/generate with the assigned team ID, model allowlist, rate limits, and budget7.  
5. Key Delivery: The Sensifai Control Plane stores the returned token ID, associates it with the application UUID, and securely provisions the raw key to the application environment9.  
6. Smoke Testing: The agent executes a non-destructive completion request against sensifai-fast through LiteLLM to verify routing and authentication1.  
7. Production Activation: Once verified, the application status transitions to active, and telemetry begins reporting to Sensifai dashboards11.

When an upstream provider experiences degraded service or returns repeated HTTP 5xx errors, the autonomous agent can query /health and spend analytics to diagnose the issue4. While LiteLLM's internal router automatically places failing deployments into cooldown, the agent can adjust model priorities (order), scale rate limits, or notify administrators if widespread provider outages occur41.  
Similarly, when an application approaches its spending limit, LiteLLM blocks incoming traffic with an HTTP 400 error once max_budget is reached7. The agent can monitor spend velocity via GET /spend/calculate, notify the application owner when consumption crosses warning thresholds (e.g., 80%), and apply temporary, approved budget adjustments without manual configuration restarts4.

## 26. Agent Permission Model

Granting an autonomous agent a global master key (LITELLM_MASTER_KEY) undermines security boundaries, as a compromised agent could drop database tables, rotate encryption keys, or expose stored provider secrets9. Instead, agents must operate under scoped roles that enforce least privilege.  
Because open-source LiteLLM provides coarse-grained role categories (proxy_admin, internal_user)5, Sensifai enforces granular access control through an intermediate proxy layer—the Sensifai AI Control Service. This service accepts signed agent requests (e.g., via scoped JWTs), checks them against an RBAC policy engine, and calls the LiteLLM Admin API using internal credentials only if all policy requirements and approvals are met4.

### Scoped Agent Roles and Access Policies

| Proposed Agent Role | Permitted Endpoint Patterns | Denied Endpoint Patterns | Destructive Action Capability | Human Approval Required? | Operational Scope |
| :---- | :---- | :---- | :---- | :---- | :---- |
| agent-readonly | GET /health, GET /v1/models, GET /spend/*, GET /key/info, GET /team/info | POST /*, PUT /*, DELETE /* | None | Never | Telemetry, auditing, monitoring, and health tracking. |
| agent-app-provisioner | POST /key/generate, POST /key/update, POST /key/block, POST /team/new, POST /team/update | DELETE /*, POST /config/*, POST /model/* | Reversible (can block keys)7 | No (within bounded budget thresholds) | Onboarding marketplace apps, rotating app keys, setting limits. |
| agent-provider-manager | POST /model/new, POST /model/update | DELETE /model/*, POST /key/delete, POST /key/regenerate | Reversible | Yes (production credentials and aliases) | Updating model pools, altering routing priorities. |
| agent-observability | GET /metrics, GET /spend/calculate, GET /logs | All write endpoints (POST, PUT, DELETE)4 | None | Never | Metric scraping, cost analysis, anomaly detection. |
| agent-emergency-ops | POST /key/block, POST /team/update, POST /model/update (set blocked: true)4 | POST /key/regenerate (master), DELETE /* | High (can suspend traffic) | Post-execution human notification | Incident response, mitigating compromised keys or runaway spend. |

### Operational Permission Matrix

| Agent Functional Role | Read | Create | Update | Delete | Manage Secrets | Query Spend | Update Models | Manage Keys | Manage MCP | Manage A2A | Human Approval Required |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| agent-readonly | Yes | No | No | No | No | Yes | No | No | Read-only | Read-only | Never |
| agent-app-provisioner | Yes | Yes | Yes | No | No | Yes | No | Yes | Scoped | Scoped | For budgets ![][image1] |
| agent-provider-manager | Yes | Yes | Yes | No | Ingest Only | Yes | Yes | No | No | No | Mandatory for Prod Deployments |
| agent-observability | Yes | No | No | No | No | Yes | No | No | Read-only | Read-only | Never |
| agent-emergency-ops | Yes | No | Yes | No | No | Yes | Disable Only | Block Only | Disable Only | Disable Only | Emergency Action with Post-Alert |

## 27. Sensifai Control Plane Integration

To ensure systemic stability and avoid single-point failure modes, responsibilities must be cleanly divided between the Sensifai Marketplace Control Plane and the LiteLLM Proxy.  
The system topology separates responsibilities into three tiers:

* Sensifai Marketplace Control Plane: Owns customer account records, commercial subscription plans, payment billing cycles, developer payout calculations, and master secrets stored in enterprise secret vaults11.  
* Sensifai AI Control Service (NestJS/TypeScript): Sits between the Control Plane and the gateway. It listens to marketplace events via a message broker, enforces least-privilege checks and human-in-the-loop approvals, and issues typed requests to LiteLLM's management endpoints4.  
* LiteLLM Proxy Layer: Operates strictly as the high-throughput data-plane proxy. It manages OpenAI schema normalization, credential decryption and injection, Redis sliding-window throttling, active health tracking and cooldowns, token-level spend metering, and SSE/WebSocket streaming to client applications1.

LiteLLM should function strictly as an infrastructure data plane and tactical routing proxy1. Sensifai retains absolute ownership over user accounts, commercial subscriptions, invoice generation, and agent governance, ensuring that core business operations remain independent of the underlying proxy layer11.

## 28. Event-Driven Architecture

The integration between Sensifai and LiteLLM relies on an event-driven synchronization pattern. The Sensifai Control Plane emits domain events via a message broker (e.g., Apache Kafka or RabbitMQ), which are consumed by worker services that execute corresponding actions against the LiteLLM Admin API4.

### Event Synchronization Matrix

| Domain Event | Sensifai Trigger & Action | LiteLLM API Invocation | Retry Strategy | Idempotency Key Pattern | Rollback / Compensating Transaction |
| :---- | :---- | :---- | :---- | :---- | :---- |
| AppCreated | App registered; provisions tenant resources. | POST /team/new then POST /key/generate | Exponential backoff (3 attempts; max 30s) | idem-app-create-{app_id} | POST /team/delete, POST /key/delete |
| AppSuspended | Subscription lapsed or abuse detected. | POST /key/block | Immediate retry (5 attempts; backoff) | idem-app-suspend-{app_id} | POST /key/unblock |
| AppDeleted | Application permanently decommissioned. | POST /key/delete then POST /team/delete | Linear retry (3 attempts) | idem-app-del-{app_id} | Retain soft-delete state in Sensifai DB |
| BudgetAdjusted | Tier upgraded or customer purchased credits. | POST /team/update (adjust max_budget)7 | Exponential backoff (3 attempts) | idem-budget-{team_id}-{v} | Revert budget ceiling to prior recorded value |
| ProviderDegraded | Agent/telemetry detects upstream failure spikes. | POST /model/update (set order: 99 or cooldown)8 | Immediate retry (3 attempts) | idem-prov-deg-{model_id} | POST /model/update (restore original order)41 |
| KeyRotationDue | Scheduled key rotation triggered by policy. | POST /key/regenerate | Exponential backoff (3 attempts) | idem-rotate-{key_id}-{ts} | Re-activate prior hashed key if hand-off fails |

## 29. Failure Modes

A production AI gateway must handle infrastructure degradations gracefully without corrupting state or hanging client requests.

### Component Failure and Degraded States

| Failure Scenario | Immediate System Impact | Client Experience | Token Spend Preservation | Automatic Recovery Procedure |
| :---- | :---- | :---- | :---- | :---- |
| PostgreSQL Unreachable | Gateway cannot query keys on cache miss; dynamic models fail to load7. | Cached keys continue processing inference; uncached keys receive HTTP 500. | In-flight spend logs buffer in memory/Redis; unbuffered logs drop if buffer overflows7. | Connection pool automatically reconnects on DB recovery; buffered logs flush6. |
| Redis Cluster Unreachable | Distributed sliding-window limits and shared cooldown states unavailable41. | Requests continue using fallback in-memory local tracking; aggregate limits may loosen41. | Spend metrics logged directly to PostgreSQL without Redis caching7. | Re-establishes connection; syncs cluster state on Redis recovery41. |
| Upstream Provider 429 Rate Limit | Target deployment capacity exhausted. | Latency increase while retrying; transparent if fallbacks succeed; HTTP 429 if all exhausted41. | Tokens accounted for completed attempts only7. | Deployment enters cooldown for cooldown_time; traffic routes to secondary models40. |
| Upstream Provider 5xx Outage | Downstream provider infrastructure failure. | Transparent failover to backup provider; HTTP 502/504 if all deployments fail. | No spend logged for failed 5xx attempts7. | Router shifts traffic after allowed_fails failures cross threshold40. |
| Virtual Key Expiration or Depletion | Key exceeds expires or max_budget ceiling7. | Direct HTTP 400 Bad Request or HTTP 401 Unauthorized emitted immediately7. | Exact final spend captured in LiteLLM_SpendLogs7. | Requires explicit administrative budget or duration update via API4. |
| Decryption Key Failure | Mismatched LITELLM_SALT_KEY prevents secret decryption9. | All requests routing to encrypted DB models fail with HTTP 500 Internal Error. | No spend occurs as requests fail prior to dispatch. | Restore correct salt key; re-encrypt credentials via migration utilities9. |

## 30. Deployment

For Sensifai's production infrastructure, LiteLLM should be deployed in a high-availability configuration across multiple availability zones using container orchestration (Kubernetes or Amazon ECS).  
Traffic enters through an edge CDN (Cloudflare or AWS CloudFront) providing DDoS protection, WAF filtering, and TLS termination38. Requests are forwarded to an internal ingress controller that splits paths: public inference and protocol routes (/v1/*, /mcp/*, /a2a/*) route to the LiteLLM proxy cluster, while administrative routes (/key/*, /team/*, /model/*) are restricted to internal VPC CIDRs1.  
The proxy runs as a stateless horizontal pod fleet (minimum 3 replicas) backed by managed PostgreSQL (AWS Aurora) and a Redis replication group (AWS ElastiCache)6. Outbound requests route through NAT gateways with static elastic IPs to support upstream IP allowlisting11.  
Database migrations should execute within a dedicated Kubernetes Init-Container or Helm Pre-Install/Pre-Upgrade Hook using the litellm-database package24. Running migrations inside standard application containers can cause race conditions or fail when pods run with read-only root filesystems (readOnlyRootFilesystem: true)25.

## 31. Scaling

LiteLLM achieves high throughput primarily because the core proxy data plane operates statelessly1. Incoming requests are transformed asynchronously and dispatched to upstream providers via non-blocking HTTP engines (aiohttp / httpx)1.  
Production performance considerations include:

* Process Concurrency and Memory Footprint: Each Uvicorn worker process consumes roughly 150MB–300MB of baseline RAM under steady load6. Pods should run multi-worker configurations (WEB_CONCURRENCY=4) with CPU limits sized to prevent event-loop starvation during high-throughput JSON serialization.  
* Horizontal Pod Autoscaling (HPA): Scale deployments based on average CPU utilization (target: 65%) and active HTTP connection counts. Pods scale horizontally without session affinity because request state, rate limits, and health flags reside in Redis41.  
* Database Connection Management: High pod counts can exhaust PostgreSQL connection limits through Prisma ORM6. Deploy an intermediate connection pooler (e.g., PgBouncer or AWS RDS Proxy) configured for transaction-level pooling to maintain stable database connections under peak loads.

## 32. Observability

LiteLLM exposes detailed observability hooks across metric, tracing, and logging layers1.  
The observability architecture processes telemetry along four distinct paths:

* Prometheus Exporter (/metrics): Publishes operational counters for active requests, duration histograms, HTTP response codes, and spend metrics grouped by team and model alias11.  
* OpenTelemetry (OTel): Emits distributed trace spans containing trace IDs, child spans for router execution, and metadata recording TTFT and token usage46.  
* PostgreSQL Spend Ledger (LiteLLM_SpendLogs): Records raw request events, latencies, token consumption, and dollar costs for auditing and offline analysis7.  
* Webhook Telemetry Callbacks: Pushes asynchronous request payloads to external platforms (Langfuse, Langsmith, Datadog) for evaluations and session tracking11.

Sensifai should scrape /metrics every 15 seconds to monitor real-time gateway health and route OpenTelemetry spans to an internal observability backend11. To protect sensitive data and comply with privacy standards, set store_prompts_in_spend_logs: false in config.yaml to ensure raw prompt and completion payloads are never written to unencrypted log stores40.

## 33. Licensing

LiteLLM's licensing model combines open-source and commercial source-available components5:

* Open-Source Core (MIT License): Covers the primary proxy server, standard provider routing, fallbacks, virtual keys, database integrations via Prisma, Prometheus metrics, and basic logging5.  
* Enterprise Tier (BerriAI Enterprise License): Software residing in the repository's enterprise/ directory requires a commercial license key (LITELLM_LICENSE)5. Enterprise features include Single Sign-On (SSO) for more than 5 users, SCIM provisioning, JWT-based API token verification, native external secrets manager integrations, CIDR IP allowlists, tag-based budgets, and multi-tenant audit log retention5.

For Sensifai Marketplace, building proprietary control plane logic *around* LiteLLM's open-source MIT core is legally straightforward and does not trigger copyleft requirements5. However, Sensifai cannot redistribute LiteLLM's Enterprise-tier components as a white-labeled commercial offering without an enterprise agreement with BerriAI5. By managing SSO, user authentication, and secret orchestration within the Sensifai Control Plane, the marketplace can operate on LiteLLM's MIT core without incurring commercial licensing dependencies5.

## 34. Migration Strategy

Migrating Sensifai applications to LiteLLM from direct provider integrations requires a phased approach:

1. Phase 1 — Parallel Proxy Infrastructure Setup: Deploy the high-availability LiteLLM cluster, configure PostgreSQL and Redis, and register baseline model deployments using configuration files6.  
2. Phase 2 — Logical Model Group Standardization: Define standardized aliases (sensifai-fast, sensifai-reasoning, sensifai-vision) mapping to current upstream deployments8. Validate request routing and test fallback models under simulated failure conditions45.  
3. Phase 3 — Control Plane Key Migration: Update the Sensifai Control Plane to call POST /key/generate during application provisioning, persisting the returned virtual keys to Sensifai's database and injecting them into application environments7.  
4. Phase 4 — Client Endpoint Cutover: Update application client configurations by setting OPENAI_BASE_URL to the LiteLLM proxy URL and swapping direct provider keys for virtual keys1.  
5. Phase 5 — Dynamic Routing & Telemetry Cutover: Route billing ingestion workflows to LiteLLM_SpendLogs and activate automated failover policies across all production model groups7.

## 35. Alternatives

To validate LiteLLM's fit for Sensifai, its architectural capabilities were evaluated alongside key open-source and enterprise AI gateway alternatives:

### AI Gateway Comparative Evaluation

| Evaluation Criteria | LiteLLM | Bifrost (Maxim AI) | Portkey Gateway | Kong AI Gateway |
| :---- | :---- | :---- | :---- | :---- |
| Implementation Runtime | Python (FastAPI) transitioning to Rust core1. | Go (Sub-millisecond latency focus)42. | TypeScript / Node.js42. | C / Lua (OpenResty / Kong Core)60. |
| Provider Catalog Breadth | Extensive (140+ providers supported)1. | Limited (20+ providers)42. | Broad (45+ providers, 1,600+ models)61. | Moderate (10+ primary providers via plugins)60. |
| Native MCP Gateway | Yes; Streamable HTTP, SSE, tool filtering12. | Yes; native Go MCP support42. | Yes; includes enterprise MCP governance55. | Partial; available via v3.12+ AI plugins55. |
| A2A Protocol Implementation | Yes; native Agent Card and JSON-RPC proxy3. | No native A2A protocol implementation61. | No direct A2A protocol implementation61. | No native A2A protocol implementation. |
| Admin MCP for AI Agents | Yes; LiteAdmin MCP with 65 tools12. | No dedicated Admin MCP server. | No dedicated Admin MCP server. | No dedicated Admin MCP server. |
| Virtual Key & Budgeting | Comprehensive; Org/Team/User/Key hierarchy7. | Supported; Virtual keys with budget limits42. | Enterprise platform only (Apache 2.0 core is minimal)42. | Enterprise / Konnect subscription required61. |
| Observability Exporters | Native Prometheus, OTel, Langfuse, Datadog11. | Internal metrics, basic exporters60. | Deep managed observability platform42. | Kong Vitals / Prometheus plugin suite61. |
| Licensing Model | MIT core; source-available Enterprise tier5. | Apache 2.042. | Apache 2.0 core; proprietary cloud platform42. | Apache 2.0 gateway core; Enterprise AI tier61. |

LiteLLM provides the broadest provider compatibility, the most flexible virtual key model, and the deepest native support for emerging agentic standards (MCP and A2A)1. For high-throughput proxy use cases where Go's memory efficiency is critical, Bifrost offers lower latency overhead; however, its provider catalog and agent protocol support are significantly more limited42.

## 36. Recommended Sensifai Architecture

The recommended architecture establishes a clear separation of concerns: LiteLLM functions as the high-throughput AI data plane, while the Sensifai Control Plane retains full ownership of business logic, identity, and governance.  
The system topology separates responsibilities into three tiers:

* Sensifai Marketplace Control Plane: Owns customer account records, commercial subscription plans, payment billing cycles, developer payout calculations, and master secrets stored in enterprise secret vaults11.  
* Sensifai AI Control Service (NestJS/TypeScript): Sits between the Control Plane and the gateway. It listens to marketplace events via a message broker, enforces least-privilege checks and human-in-the-loop approvals, and issues typed requests to LiteLLM's management endpoints4.  
* LiteLLM Proxy Layer: Operates strictly as the high-throughput data-plane proxy. It manages OpenAI schema normalization, credential decryption and injection, Redis sliding-window throttling, active health tracking and cooldowns, token-level spend metering, and SSE/WebSocket streaming to client applications1.

### Architectural Responsibilities

* LiteLLM Gateway Cluster: Handles schema normalization across providers, outbound credential injection, sliding-window rate limiting via Redis, fallback routing, and spend metric emission1.  
* Sensifai Control Plane & AI Control Service: Manages developer identities, billing plans, enterprise subscriptions, policy approvals, and secret management11. It translates marketplace lifecycle events into typed LiteLLM Admin API requests, ensuring virtual keys and teams mirror business relationships accurately4.

## 37. Implementation Roadmap

Deploying LiteLLM across the Sensifai Marketplace follows a four-stage engineering roadmap:

### Milestone 1 — Core Infrastructure Provisioning (Weeks 1–2)

* Deploy multi-AZ PostgreSQL (Aurora) and HA Redis (ElastiCache) clusters6.  
* Deploy the LiteLLM container cluster using litellm-non_root base images6.  
* Configure LITELLM_SALT_KEY to establish encrypted storage at rest9.  
* Define baseline model groups (sensifai-fast, sensifai-reasoning) in static configuration files8.

### Milestone 2 — Control Plane Integration (Weeks 3–4)

* Implement the Sensifai AI Control Service (NestJS/TypeScript) with an OpenAPI-generated client4.  
* Build event listeners for marketplace lifecycle events (AppCreated, AppSuspended, AppDeleted)7.  
* Implement automated virtual key generation, storing key IDs in Sensifai's database and returning keys securely to application owners7.

### Milestone 3 — Agent & Protocol Gateway Activation (Weeks 5–6)

* Enable the MCP Gateway for centralized tool execution across applications14.  
* Deploy LiteAdmin MCP in a secure VPC to test administrative automation workflows12.  
* Implement the intermediate agent permission proxy to enforce policy checks and prevent unauthorized write actions12.  
* Configure the A2A Gateway and test multi-agent interactions using standard Agent Cards3.

### Milestone 4 — Production Hardening & Cutover (Weeks 7–8)

* Run load tests against the proxy cluster (targeting 2,000+ RPS) to validate Redis connection pooling and latency profiles1.  
* Validate automatic failover behaviors under simulated provider outages (HTTP 429 and 500 error injections)45.  
* Connect Prometheus metrics and OpenTelemetry trace exporters to Sensifai's operational dashboards11.  
* Execute production cutover, routing all marketplace application traffic through the gateway1.

## 38. Open Questions / Unknowns

Several implementation details remain subject to ongoing evaluation:

* Rust Core Migration Trajectory: LiteLLM is actively transitioning critical proxy paths to a Rust-accelerated core (litellm-rust)1. While early benchmarks show reduced CPU overhead, maintainers have not finalized the deprecation timeline for the Python data plane.  
* Native Fine-Grained RBAC in Open Source: LiteLLM's open-source release provides broad administrative roles (proxy_admin, internal_user)5. If native fine-grained RBAC becomes a core open-source feature, it could reduce Sensifai's reliance on custom proxy validation services5.  
* WebSocket Realtime API Scaling Under High Concurrency: Persistent WebSocket connections for OpenAI Realtime APIs require sticky connections1. More empirical testing is needed to evaluate memory consumption and connection rebalancing when scaling across large pod fleets.

## 39. Risks

Engineering teams must account for four key operational risks:

* Fast-Moving Release Velocity: LiteLLM releases weekly minor updates20. This rapid cadence delivers Day-0 support for new model APIs quickly, but increases the risk of regressions in routing and schema generation53. Production clusters must follow a strict promotion pipeline (Staging to Canary to Production) rather than deploying tracking tags directly.  
* Elevated Privileges in LiteAdmin MCP: Connecting an autonomous agent directly to LiteAdmin MCP grants access to an unsegmented proxy_admin credential, exposing the gateway to prompt-injection exploits that could delete models or exfiltrate configuration state12. Administrative agents must always operate through an intermediate validation layer12.  
* Database Write Pressure Under Peak Loads: Logging every request synchronously to LiteLLM_SpendLogs can cause write contention on PostgreSQL during high-throughput bursts7. Production configurations should rely on Redis-buffered metrics, asynchronous logging workers, or external ingestion pipelines (e.g., Kafka) to protect database stability7.  
* Secret Exposure via Logging Configuration: Logging drivers must be configured carefully to avoid exposing sensitive tokens. While recent versions remediate key-masking issues (e.g., CVE-2024-9606), administrators must ensure verbose debugging modes remain disabled in production33.

## 40. Final Findings

### Core Question Determination

Can Sensifai realistically run LiteLLM as its centralized AI Gateway, keep all upstream provider credentials isolated from Marketplace applications, automatically provision and revoke application access, manage models and provider pools programmatically, track costs, expose MCP/A2A capabilities, and allow an autonomous agent to safely operate the gateway?

### Determination: YES WITH CONDITIONS

### Architectural Conditions for Implementation

LiteLLM fulfills the requirements for Sensifai's centralized AI Gateway, providing strong credential isolation, unified schema normalization, granular virtual keys, resilient routing, and native support for modern MCP and A2A interfaces1. However, production success requires strict adherence to four non-negotiable architectural boundaries:

1. Cryptographic Isolation: Upstream credentials must be protected at rest using an explicitly defined LITELLM_SALT_KEY9. The master key must never be used as the root encryption cipher, ensuring that master key rotations do not invalidate stored provider credentials9.  
2. Decoupled Business Plane: LiteLLM must function strictly as an infrastructure data-plane proxy1. The Sensifai Control Plane retains full ownership of user identity, commercial subscriptions, invoice generation, developer revenue share, and policy enforcement, using LiteLLM only for operational routing, metering, and execution11.  
3. Intermediate Policy Layer for Autonomous Agents: Autonomous agents must never receive direct master keys or unrestricted access to LiteAdmin MCP12. All autonomous operations must pass through an intermediate Sensifai validation layer that enforces least-privilege policies and gates destructive actions behind human approval workflows12.  
4. Dedicated Database Migration Pipelines: In containerized, non-root environments, database migrations must execute via dedicated Init-Containers using pre-compiled Prisma binaries (litellm-database), ensuring application pods run reliably with read-only root filesystems6.

## Appendix A — Complete Endpoint Table

| HTTP Method | URL Path | Functional Category | Authentication | Minimum Required Role | Side Effects & State Changes | Idempotent? | Blast Radius / Risk Level | Verified Source |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| GET | /health | Health | Optional / None | Public / None | Read memory/service status4 | Yes | Low | OpenAPI / Docs4 |
| GET | /health/readiness | Health | Optional / None | Public / None | Pings PostgreSQL & Redis6 | Yes | Low | OpenAPI / Docs |
| GET | /metrics | Observability | Optional / Bearer | Scrape / Admin | Reads Prometheus counters11 | Yes | Low | OpenAPI / Docs11 |
| POST | /v1/chat/completions | Data Plane | Bearer Virtual Key1 | internal_user | Deducts budget; appends spend logs7 | No | Low | Source Verified1 |
| POST | /v1/responses | Data Plane | Bearer Virtual Key1 | internal_user | Deducts budget; appends spend logs7 | No | Low | Source Verified1 |
| POST | /v1/embeddings | Data Plane | Bearer Virtual Key1 | internal_user | Deducts budget; appends spend logs7 | No | Low | Source Verified1 |
| GET | /v1/models | Data Plane | Bearer Virtual Key4 | internal_user | Reads allowed model list4 | Yes | Low | Source Verified4 |
| POST | /key/generate | Key Admin | Bearer Master / Admin9 | proxy_admin | Inserts LiteLLM_VerificationToken | No | Medium | Source Verified7 |
| POST | /key/update | Key Admin | Bearer Master / Admin9 | proxy_admin | Updates key limits; evicts cache7 | Yes | Medium | Source Verified7 |
| POST | /key/delete | Key Admin | Bearer Master / Admin9 | proxy_admin | Deletes record; revokes access7 | Yes | High (Destructive) | Source Verified4 |
| POST | /key/block | Key Admin | Bearer Master / Admin9 | proxy_admin | Sets blocked: true in DB/Redis7 | Yes | Medium | Source Verified7 |
| POST | /key/unblock | Key Admin | Bearer Master / Admin9 | proxy_admin | Sets blocked: false in DB/Redis7 | Yes | Low | Source Verified7 |
| POST | /key/regenerate | Key Admin | Bearer Master / Admin9 | proxy_admin | Generates new token; revokes prior9 | No | High | Source Verified9 |
| GET | /key/info | Key Admin | Bearer Master / Admin9 | proxy_admin | Reads key spend and limits4 | Yes | Low | Source Verified4 |
| POST | /team/new | Team Admin | Bearer Master / Admin9 | proxy_admin | Inserts LiteLLM_TeamTable | No | Medium | Source Verified7 |
| POST | /team/update | Team Admin | Bearer Master / Admin9 | proxy_admin | Updates team budgets and members7 | Yes | Medium | Source Verified7 |
| POST | /team/delete | Team Admin | Bearer Master / Admin9 | proxy_admin | Deletes team; cascades service keys7 | Yes | High (Destructive) | Source Verified7 |
| GET | /team/info | Team Admin | Bearer Master / Admin9 | proxy_admin | Reads team metadata and spend4 | Yes | Low | Source Verified4 |
| POST | /user/new | User Admin | Bearer Master / Admin9 | proxy_admin | Inserts LiteLLM_UserTable | No | Medium | Source Verified7 |
| POST | /user/update | User Admin | Bearer Master / Admin9 | proxy_admin | Updates user role and budget4 | Yes | Medium | Source Verified4 |
| POST | /user/delete | User Admin | Bearer Master / Admin9 | proxy_admin | Deletes user record4 | Yes | High (Destructive) | Source Verified4 |
| POST | /model/new | Deployment | Bearer Master / Admin9 | proxy_admin | Inserts LiteLLM_ProxyModelTable | No | High | Source Verified7 |
| POST | /model/update | Deployment | Bearer Master / Admin9 | proxy_admin | Modifies deployment configuration4 | Yes | High | Source Verified4 |
| POST | /model/delete | Deployment | Bearer Master / Admin9 | proxy_admin | Removes deployment from pool4 | Yes | High (Destructive) | Source Verified4 |
| GET | /spend/calculate | Spend Admin | Bearer Master / Admin9 | proxy_admin | Computes spend aggregations4 | Yes | Low | Source Verified4 |
| POST | /mcp | MCP Gateway | Bearer Virtual Key2 | internal_user | Executes upstream tool2 | No | High (Tool Specific) | Source Verified14 |
| GET | /v1/agents | Agent Gateway | Bearer Virtual Key2 | internal_user | Discovers accessible agents3 | Yes | Low | Source Verified3 |
| POST | /a2a/{agent_id} | Agent Gateway | Bearer Virtual Key2 | internal_user | Dispatches A2A JSON-RPC method23 | No | High | Source Verified23 |

## Appendix B — Complete Configuration Reference

```yaml
# Authoritative Production Configuration Reference for Sensifai Gateway
general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
  database_url: os.environ/DATABASE_URL
  disable_env_credential_login: true
  max_request_size_mb: 25
  store_prompts_in_spend_logs: false

litellm_settings:
  drop_params: true
  set_verbose: false
  user_url_validation: true
  user_url_allowed_hosts: []
  telemetry: false
  maximum_spend_logs_retention_period: 30d
  maximum_spend_logs_retention_interval: 1d

router_settings:
  routing_strategy: latency-based-routing
  redis_host: os.environ/REDIS_HOST
  redis_port: 6379
  redis_password: os.environ/REDIS_PASSWORD
  enable_pre_call_check: true
  allowed_fails: 3
  cooldown_time: 30
  num_retries: 2
  timeout: 45
  model_group_alias:
    sensifai-fast-preview: sensifai-fast

model_list:
  - model_name: sensifai-fast
    litellm_params:
      model: azure/gpt-4o-mini-prod
      api_base: os.environ/AZURE_EASTUS_API_BASE
      api_key: os.environ/AZURE_EASTUS_API_KEY
      rpm: 10000
      tpm: 2000000
    model_info:
      order: 1

  - model_name: sensifai-fast
    litellm_params:
      model: vertex_ai/gemini-1.5-flash
      vertex_project: os.environ/VERTEX_PROJECT_ID
      vertex_location: us-central1
      rpm: 8000
      tpm: 1500000
    model_info:
      order: 2

  - model_name: sensifai-reasoning
    litellm_params:
      model: anthropic/claude-3-5-sonnet-20241022
      api_key: os.environ/ANTHROPIC_API_KEY
      rpm: 4000
      tpm: 400000
    model_info:
      order: 1
```

## Appendix C — Complete Environment Variable Reference

| Variable Name | Required? | Example / Default | Description & Operational Function |
| :---- | :---- | :---- | :---- |
| LITELLM_MASTER_KEY | Required | sk-$(openssl rand -hex 32) | Root proxy bearer token. Grants access to all administrative APIs9. |
| LITELLM_SALT_KEY | Required | $(openssl rand -base64 32) | Dedicated symmetric salt key. Encrypts credentials stored in PostgreSQL9. |
| DATABASE_URL | Required | postgresql://usr:pwd@db:5432/litellm | PostgreSQL connection URI for Prisma ORM client6. |
| REDIS_HOST | Production Required | redis.internal.vpc | Redis hostname for distributed rate limiting and cooldown sync8. |
| REDIS_PORT | Optional | 6379 | Redis listening port41. |
| REDIS_PASSWORD | Optional | secret_auth_token | Redis authentication password41. |
| WEB_CONCURRENCY | Optional | 4 | Number of Uvicorn worker processes running within the container. |
| LITELLM_MIGRATION_DIR | Non-Root Required | /tmp/prisma_migrations | Writable directory path for Prisma schema output in read-only filesystems25. |
| LITELLM_LICENSE | Enterprise Only | enterprise_license_token | Validates BerriAI enterprise license to unlock restricted features5. |
| OPENAI_API_KEY | Provider Dependent | sk-proj-... | Direct API key injected for upstream OpenAI model execution2. |
| ANTHROPIC_API_KEY | Provider Dependent | sk-ant-... | Direct API key injected for upstream Anthropic model execution44. |

## Appendix D — Database Entities

Authoritative Prisma schema mapping extracted directly from schema.prisma7:

Code snippet  
datasource client {  
  provider = "postgresql"  
  url      = env("DATABASE_URL")  
}

generator client {  
  provider = "prisma-client-py"  
}

model LiteLLM_VerificationToken {  
  token                 String    @id  
  key_name              String?  
  key_alias             String?  
  spend                 Float     @default(0.0)  
  expires               DateTime?  
  models                String[]  
  aliases               Json      @default("{}")  
  config                Json      @default("{}")  
  user_id               String?  
  team_id               String?  
  max_budget            Float?  
  budget_duration       String?  
  rpm_limit             Int?  
  tpm_limit             Int?  
  model_rpm_limit       Json      @default("{}")  
  model_tpm_limit       Json      @default("{}")  
  auto_rotate           Boolean?  @default(false)  
  rotation_interval     String?  
  last_rotation_at      DateTime?  
  key_rotation_at       DateTime?  
  metadata              Json      @default("{}")  
  blocked               Boolean   @default(false)  
  created_at            DateTime  @default(now()) @map("created_at")  
  updated_at            DateTime  @default(now()) @updatedAt @map("updated_at")  
}

model LiteLLM_TeamTable {  
  team_id               String    @id @default(uuid())  
  team_alias            String?  
  organization_id       String?  
  admins                String[]  
  members               String[]  
  members_with_roles    Json      @default("{}")  
  metadata              Json      @default("{}")  
  max_budget            Float?  
  spend                 Float     @default(0.0)  
  models                String[]  
  model_rpm_limit       Json      @default("{}")  
  model_tpm_limit       Json      @default("{}")  
  blocked               Boolean   @default(false)  
  created_at            DateTime  @default(now()) @map("created_at")  
  updated_at            DateTime  @default(now()) @updatedAt @map("updated_at")  
}

model LiteLLM_UserTable {  
  user_id               String    @id  
  user_email            String?  
  user_role             String?  
  spend                 Float     @default(0.0)  
  max_budget            Float?  
  models                String[]  
  metadata              Json      @default("{}")  
  created_at            DateTime  @default(now()) @map("created_at")  
  updated_at            DateTime  @default(now()) @updatedAt @map("updated_at")  
}

model LiteLLM_OrganizationTable {  
  organization_id       String    @id @default(uuid())  
  organization_name     String?  
  spend                 Float     @default(0.0)  
  max_budget            Float?  
  metadata              Json      @default("{}")  
  created_at            DateTime  @default(now()) @map("created_at")  
  updated_at            DateTime  @default(now()) @updatedAt @map("updated_at")  
}

model LiteLLM_ProxyModelTable {  
  model_id              String    @id @default(uuid())  
  model_name            String  
  litellm_params        Json  
  model_info            Json?  
  blocked               Boolean   @default(false)  
  created_at            DateTime  @default(now()) @map("created_at")  
  updated_at            DateTime  @default(now()) @updatedAt @map("updated_at")  
}

model LiteLLM_SpendLogs {  
  request_id            String    @id  
  call_type             String  
  api_key               String    @default("")  
  spend                 Float     @default(0.0)  
  total_tokens          Int       @default(0)  
  prompt_tokens         Int       @default(0)  
  completion_tokens     Int       @default(0)  
  startTime             DateTime  @default(now())  
  endTime               DateTime  @default(now())  
  model                 String    @default("")  
  user                  String?  
  team_id               String?  
  metadata              Json      @default("{}")  
}

## Appendix E — MCP Tool Inventory

LiteLLM MCP Gateway supports tools dynamically registered from upstream MCP servers1. Standard discovery exposes endpoints across registered categories:

| Upstream Tool Category | Tool Registration Type | Discovery Mode | Authorization Enforcement | Execution Transport |
| :---- | :---- | :---- | :---- | :---- |
| File System Tools | Static / Config | Dynamic Discovery | Scoped by Virtual Key / Team14 | Streamable HTTP / stdio12 |
| Git / GitHub Integrations1 | Dynamic REST | Server Handshake | Scoped by Virtual Key / Team14 | Streamable HTTP / SSE12 |
| Relational Database Tools | Dynamic REST | Schema Inspection | Scoped by Team Allowlist14 | Streamable HTTP |
| Web Search / Extraction | Static / Config | Server Handshake | Global or Scoped Key Access14 | Streamable HTTP / SSE |
| Enterprise Custom Tools | Dynamic DB | Server Handshake | Fine-Grained Team Policy14 | Streamable HTTP |

## Appendix F — Agent Automation Tool Inventory

Operations exposed via the Sensifai AI Control Service for autonomous operational management:

| Operation Function | Backing Gateway API | Inputs | Output Summary | Destructive Flag | Execution Policy |
| :---- | :---- | :---- | :---- | :---- | :---- |
| get_gateway_health | GET /health/readiness | None | DB, Redis, latency status6 | No | Safe Autonomous |
| list_active_models | GET /v1/models | None | Active model aliases4 | No | Safe Autonomous |
| get_spend_metrics | GET /spend/calculate | start_date, team_id | Aggregated dollar & token spend4 | No | Safe Autonomous |
| provision_app_access | POST /key/generate | team_id, models, budget | Plaintext Virtual Key9 | No | Safe Autonomous |
| suspend_app_access | POST /key/block | key_alias | Suspension confirmation | Yes (Reversible) | Safe Autonomous |
| adjust_team_budget | POST /team/update | team_id, new_budget | Budget update confirmation | No | Approval Required (![][image1]) |
| add_model_deployment | POST /model/new | model_name, provider_params | Created model_id | No | Approval Required |
| deprecate_deployment | POST /model/update | model_id, blocked: true | Deactivation confirmation | Yes (Reversible) | Approval Required |
| delete_virtual_key | POST /key/delete | key_alias | Permanent deletion confirmation | Yes | Approval Required |
| purge_team_container | POST /team/delete | team_id | Cascaded deletion confirmation | Yes | Human Only (Denied) |
| rotate_master_key | POST /key/regenerate | new_master_key | New root master token9 | Yes | Human Only (Denied) |

## Appendix G — Security Advisory Registry

Authoritative security vulnerabilities and tracking identifiers:

| Advisory Identifier | Common Weakness Enumeration | Disclosed Severity | Affected Software Versions | Fixed Version Baseline |
| :---- | :---- | :---- | :---- | :---- |
| CVE-2026-8903218 | CWE-863 (Incorrect Authorization)18 | High18 | BerriAI LiteLLM < 1.101.0-rc.1 | v1.101.0-rc.1 |
| CVE-2026-5982231 | CWE-287 (Improper Authentication) | High31 | BerriAI LiteLLM < 1.84.0 | v1.84.0 |
| CVE-2026-4220317 | CWE-1336 (Template Engine Injection)17 | High17 | BerriAI LiteLLM < 1.83.7 | v1.83.7-stable |
| CVE-2026-3062316 | CWE-78 (OS Command Injection)16 | Critical16 | BerriAI LiteLLM 1.18.10 / Earlier16 | Vendor Patched |
| GHSA-gppg-gqw8-wh9g28 | CVE-2024-5751 (Unsafe eval in Deployment)28 | Critical28 | BerriAI LiteLLM v1.35.8 | v1.35.9+ |
| GHSA-53gh-p8jc-7rg829 | CVE-2024-6825 (RCE via post_call_rules)29 | High29 | BerriAI LiteLLM v1.40.12 | v1.40.13+ |
| GHSA-fjcf-3j3r-78rp13 | CVE-2025-0628 (Admin Privilege Escalation)13 | High13 | BerriAI LiteLLM (Early 2025 releases)13 | Vendor Patched13 |
| GHSA-cgmh-xxmq-hp4630 | CVE-2025-45809 (SQL Injection in /key/block)30 | Moderate30 | BerriAI LiteLLM v1.65.4 | Vendor Patched |
| GHSA-g5pg-73fc-hjwq33 | CVE-2024-9606 (API Key Leakage in Logs)33 | High33 | BerriAI LiteLLM v1.44.9 | v1.44.10+ |
| GHSA-8j42-pcfm-346763 | CVE-2024-4890 (SQL Injection via user_id)63 | Moderate63 | BerriAI LiteLLM v1.27.14 | v1.27.15+ |

## References

1. GitHub - BerriAI/litellm: The fastest, litest AI Gateway. Rust core with, [https://github.com/BerriAI/litellm](https://github.com/BerriAI/litellm)  
2. GitHub - h2oai/litellm-1: Python SDK, Proxy Server (AI Gateway) to, [https://github.com/h2oai/litellm-1](https://github.com/h2oai/litellm-1)  
3. Agent Gateway (A2A Protocol) - Overview - LiteLLM Docs, [https://docs.litellm.ai/docs/a2a](https://docs.litellm.ai/docs/a2a)  
4. LiteLLM Proxy CLI, [https://docs.litellm.ai/docs/proxy/management_cli](https://docs.litellm.ai/docs/proxy/management_cli)  
5. AI Gateway vs. LiteLLM: Broad Open-Source Proxy or Governance, [https://innfactory.ai/en/services/ai-gateway/vs/litellm/](https://innfactory.ai/en/services/ai-gateway/vs/litellm/)  
6. [Bug]: Permission denied: schema.prisma - BerriAI/litellm - GitHub, [https://github.com/BerriAI/litellm/issues/14006](https://github.com/BerriAI/litellm/issues/14006)  
7. schema.prisma - BerriAI/litellm · GitHub, [https://github.com/BerriAI/litellm/blob/main/schema.prisma](https://github.com/BerriAI/litellm/blob/main/schema.prisma)  
8. Router - Load Balancing - LiteLLM Docs, [https://docs.litellm.ai/docs/routing](https://docs.litellm.ai/docs/routing)  
9. Rotating the Master Key - LiteLLM Docs, [https://docs.litellm.ai/docs/proxy/master_key_rotations](https://docs.litellm.ai/docs/proxy/master_key_rotations)  
10. LiteLLM Self-Hosted Security & Encryption FAQ, [https://docs.litellm.ai/docs/proxy/security_encryption_faq](https://docs.litellm.ai/docs/proxy/security_encryption_faq)  
11. Enterprise - LiteLLM Docs, [https://docs.litellm.ai/docs/enterprise](https://docs.litellm.ai/docs/enterprise)  
12. LiteAdmin MCP - LiteLLM, [https://docs.litellm.ai/docs/proxy/liteadmin_mcp](https://docs.litellm.ai/docs/proxy/liteadmin_mcp)  
13. LiteLLM Has an Improper Authorization Vulnerability · CVE-2025-0628, [https://github.com/advisories/GHSA-fjcf-3j3r-78rp](https://github.com/advisories/GHSA-fjcf-3j3r-78rp)  
14. MCP Overview - LiteLLM Docs, [https://docs.litellm.ai/docs/mcp](https://docs.litellm.ai/docs/mcp)  
15. v1.83.0 - Official Release (Post Supply Chain Incident) - LiteLLM, [https://docs.litellm.ai/release_notes/v1.83.0/v1-83-0](https://docs.litellm.ai/release_notes/v1.83.0/v1-83-0)  
16. LiteLLM 1.18.10 contains a remote code execution... · CVE-2026, [https://github.com/advisories/GHSA-gw7c-8jfv-4mj2](https://github.com/advisories/GHSA-gw7c-8jfv-4mj2)  
17. LiteLLM: Server-Side Template Injection in /prompts/test endpoint, [https://github.com/advisories/GHSA-xqmj-j6mv-4862](https://github.com/advisories/GHSA-xqmj-j6mv-4862)  
18. BerriAI LiteLLM before 1.101.0-rc.1 contains a tenant... - GitHub, [https://github.com/advisories/ghsa-237m-2qxv-ww7c](https://github.com/advisories/ghsa-237m-2qxv-ww7c)  
19. [Security]: litellm PyPI package (v1.82.7 + v1.82.8 ... - GitHub, [https://github.com/BerriAI/litellm/issues/24518](https://github.com/BerriAI/litellm/issues/24518)  
20. Engineering Blog - LiteLLM Docs, [https://docs.litellm.ai/blog](https://docs.litellm.ai/blog)  
21. Releases · BerriAI/litellm - GitHub, [https://github.com/BerriAI/litellm/releases](https://github.com/BerriAI/litellm/releases)  
22. Introducing LiteAdmin MCP - LiteLLM, [https://docs.litellm.ai/blog/litellm-admin-mcp](https://docs.litellm.ai/blog/litellm-admin-mcp)  
23. A2A Agent Card - LiteLLM Docs, [https://docs.litellm.ai/docs/a2a_agent_card](https://docs.litellm.ai/docs/a2a_agent_card)  
24. litellm-database versions · berriai - GitHub, [https://github.com/orgs/BerriAI/packages/container/litellm-database/versions](https://github.com/orgs/BerriAI/packages/container/litellm-database/versions)  
25. prisma generate fails with PermissionError in non-root container, [https://github.com/BerriAI/litellm/issues/19859](https://github.com/BerriAI/litellm/issues/19859)  
26. Error: Could not find schema-engine binary in ARM64 Arch non_root, [https://github.com/BerriAI/litellm/issues/20754](https://github.com/BerriAI/litellm/issues/20754)  
27. Quick Start - LiteLLM Docs, [https://docs.litellm.ai/docs/proxy/ui](https://docs.litellm.ai/docs/proxy/ui)  
28. CVE-2024-5751 · GitHub Advisory Database, [https://github.com/advisories/GHSA-gppg-gqw8-wh9g](https://github.com/advisories/GHSA-gppg-gqw8-wh9g)  
29. LiteLLM Vulnerable to Remote Code Execution (RCE) - GitHub, [https://github.com/advisories/GHSA-53gh-p8jc-7rg8](https://github.com/advisories/GHSA-53gh-p8jc-7rg8)  
30. BerriAI litellm v1.65.4 was discovered to contain a SQL... · CVE-2025, [https://github.com/advisories/GHSA-cgmh-xxmq-hp46](https://github.com/advisories/GHSA-cgmh-xxmq-hp46)  
31. MCP Authentication Bypass via OAuth2 Passthrough Fallback · CVE, [https://github.com/advisories/GHSA-7488-6r32-c95q](https://github.com/advisories/GHSA-7488-6r32-c95q)  
32. litellm versions · berriai - GitHub, [https://github.com/orgs/berriai/packages/container/litellm/versions](https://github.com/orgs/berriai/packages/container/litellm/versions)  
33. LiteLLM Reveals Portion of API Key via a Logging File - GitHub, [https://github.com/advisories/GHSA-g5pg-73fc-hjwq](https://github.com/advisories/GHSA-g5pg-73fc-hjwq)  
34. Prisma doesn't know which engines to download for the Linux distro, [https://github.com/BerriAI/litellm/issues/11363](https://github.com/BerriAI/litellm/issues/11363)  
35. [Helm chart] Migration job pod cannot run on OpenShift and ... - GitHub, [https://github.com/BerriAI/litellm/issues/7173](https://github.com/BerriAI/litellm/issues/7173)  
36. [Bug]: OpenShift Deployment starts without Prisma #6106 - GitHub, [https://github.com/BerriAI/litellm/issues/6106](https://github.com/BerriAI/litellm/issues/6106)  
37. [Bug]: chart - Migration job fails with read-only root filesystem: "OSError, [https://github.com/BerriAI/litellm/issues/13369](https://github.com/BerriAI/litellm/issues/13369)  
38. Best LLM Gateways in 2026: Top LiteLLM Alternatives - Contabo, [https://contabo.com/blog/best-llm-gateways/](https://contabo.com/blog/best-llm-gateways/)  
39. v1.80.8-stable - Introducing A2A Agent Gateway - LiteLLM Docs, [https://docs.litellm.ai/release_notes/v1.80.8-stable/v1-80-8](https://docs.litellm.ai/release_notes/v1.80.8-stable/v1-80-8)  
40. config_settings - LiteLLM Docs, [https://docs.litellm.ai/docs/proxy/config_settings](https://docs.litellm.ai/docs/proxy/config_settings)  
41. Proxy - Load Balancing - LiteLLM, [https://docs.litellm.ai/docs/proxy/load_balancing](https://docs.litellm.ai/docs/proxy/load_balancing)  
42. Best open-source AI gateways in 2026 | Blog - Northflank, [https://northflank.com/blog/best-open-source-ai-gateways](https://northflank.com/blog/best-open-source-ai-gateways)  
43. max_request_size_mb (Enterprise) causes 401 on /v1/audio, [https://github.com/BerriAI/litellm/issues/42224](https://github.com/BerriAI/litellm/issues/42224)  
44. LLM-as-a-Judge - LiteLLM Docs, [https://docs.litellm.ai/docs/proxy/guardrails/llm_as_a_judge](https://docs.litellm.ai/docs/proxy/guardrails/llm_as_a_judge)  
45. Fallbacks (Provider Failover) - LiteLLM Docs, [https://docs.litellm.ai/docs/proxy/reliability](https://docs.litellm.ai/docs/proxy/reliability)  
46. v1.98.0 - Provisioned Throughput Billing, Shadow Evals & Routing, [https://docs.litellm.ai/release_notes/v1.98.0/v1-98-0](https://docs.litellm.ai/release_notes/v1.98.0/v1-98-0)  
47. Overview - LiteLLM Docs, [https://docs.litellm.ai/docs/proxy/configs](https://docs.litellm.ai/docs/proxy/configs)  
48. Vertex AI Agent Engine - LiteLLM, [https://docs.litellm.ai/docs/providers/vertex_ai_agent_engine](https://docs.litellm.ai/docs/providers/vertex_ai_agent_engine)  
49. Azure AI Foundry Agents - LiteLLM, [https://docs.litellm.ai/docs/providers/azure_ai_agents](https://docs.litellm.ai/docs/providers/azure_ai_agents)  
50. LiteLLM - Getting Started | liteLLM, [https://docs.litellm.ai/](https://docs.litellm.ai/)  
51. [Bug]: Session handling causing fallback to default_user_id after UI, [https://github.com/BerriAI/litellm/issues/7080](https://github.com/BerriAI/litellm/issues/7080)  
52. Model Alias - LiteLLM Docs, [https://docs.litellm.ai/docs/completion/model_alias](https://docs.litellm.ai/docs/completion/model_alias)  
53. Pricing Calculator (Cost Estimation) - LiteLLM, [https://docs.litellm.ai/docs/proxy/pricing_calculator](https://docs.litellm.ai/docs/proxy/pricing_calculator)  
54. [Feature]: Model disable/enable management API - GitHub, [https://github.com/BerriAI/litellm/issues/29742](https://github.com/BerriAI/litellm/issues/29742)  
55. Best AI Gateway for WHMCS: 6 Options Tested and Compared (2026), [https://mxwhmcsmodules.com/blog/ai-gateway-comparison-whmcs](https://mxwhmcsmodules.com/blog/ai-gateway-comparison-whmcs)  
56. [Preview] v1.80.10.rc.1 - Agent Gateway: Azure Foundry & Bedrock, [https://docs.litellm.ai/release_notes/v1.80.10-stable/v1-80-10](https://docs.litellm.ai/release_notes/v1.80.10-stable/v1-80-10)  
57. Pydantic AI Agents - LiteLLM Docs, [https://docs.litellm.ai/docs/providers/pydantic_ai_agent](https://docs.litellm.ai/docs/providers/pydantic_ai_agent)  
58. Invoking A2A Agents - LiteLLM Docs, [https://docs.litellm.ai/docs/a2a_invoking_agents](https://docs.litellm.ai/docs/a2a_invoking_agents)  
59. [Bug]: Unclear Error message with expired enterprise license #7289, [https://github.com/BerriAI/litellm/issues/7289](https://github.com/BerriAI/litellm/issues/7289)  
60. Best Open Source AI Gateway in 2026 - DEV Community, [https://dev.to/pranay_batta/best-open-source-ai-gateway-in-2026-2flb](https://dev.to/pranay_batta/best-open-source-ai-gateway-in-2026-2flb)  
61. LiteLLM Alternatives (2026): 7 Gateways Compared - Kosmoy, [https://www.kosmoy.com/resources/blog/litellm-alternatives/](https://www.kosmoy.com/resources/blog/litellm-alternatives/)  
62. Best LLM Gateways and Model Routers (2026): 7 Compared - Aissist, [https://aissist.io/insights/best-llm-gateways](https://aissist.io/insights/best-llm-gateways)  
63. SQL injection in litellm · CVE-2024-4890 · GitHub Advisory Database, [https://github.com/advisories/GHSA-8j42-pcfm-3467](https://github.com/advisories/GHSA-8j42-pcfm-3467)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADcAAAAVCAYAAADiv3Z7AAAAiUlEQVR4Xu3PIQ6DQBSE4RUkVVgOQCtoq2iw3KB3QHGDpkcgaYJAkJDqmh6AK/UeTLJTsauw+zJ/8qlR45xSSqn9PWmEU7SZqYAZvtCSmUyf+3eED61wCWc7nZ0/+YaKzHWFH92jLdkO8IAJbmQmc+cy6GmBOpzTLHf+0AANJV9HLyijTSmldrUBlYkSr+1kBe8AAAAASUVORK5CYII=>