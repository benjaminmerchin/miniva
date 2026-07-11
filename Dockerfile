FROM python:3.11-slim AS python-base

ARG HERMES_AGENT_REF=111544d544d6cf6efed9875e116f2daeb76a1211

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    ffmpeg \
    gcc \
    g++ \
    git \
    make \
    openssh-client \
    procps \
    python3-dev \
    ripgrep \
    && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --no-cache-dir --upgrade pip setuptools wheel \
    && python -m pip install --no-cache-dir \
      "hermes-agent @ git+https://github.com/NousResearch/hermes-agent.git@${HERMES_AGENT_REF}"

WORKDIR /app

FROM python-base AS app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1
ENV HERMES_WORKDIR=/app

CMD ["uvicorn", "voice_api:app", "--host", "0.0.0.0", "--port", "8080"]

FROM python-base AS gateway

ARG HERMES_AGENT_REF=111544d544d6cf6efed9875e116f2daeb76a1211

RUN python -m pip install --no-cache-dir \
      "hermes-agent[messaging] @ git+https://github.com/NousResearch/hermes-agent.git@${HERMES_AGENT_REF}"

COPY docker/gateway-entrypoint.sh /usr/local/bin/hermes-gateway-entrypoint
RUN chmod 0755 /usr/local/bin/hermes-gateway-entrypoint

ENV PYTHONUNBUFFERED=1

CMD ["hermes-gateway-entrypoint"]

FROM node:22-alpine AS frontend-build

WORKDIR /frontend

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY components.json index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY public ./public
COPY src ./src
COPY convex ./convex

ARG VITE_CONVEX_URL
ARG VITE_CONVEX_SITE_URL
ARG VITE_SITE_URL
ARG VITE_DODO_PRODUCT_ID
ARG VITE_DODO_MODE
ENV VITE_CONVEX_URL=${VITE_CONVEX_URL}
ENV VITE_CONVEX_SITE_URL=${VITE_CONVEX_SITE_URL}
ENV VITE_SITE_URL=${VITE_SITE_URL}
ENV VITE_DODO_PRODUCT_ID=${VITE_DODO_PRODUCT_ID}
ENV VITE_DODO_MODE=${VITE_DODO_MODE}

RUN pnpm build

FROM nginx:1.27-alpine AS frontend

COPY docker/frontend-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /frontend/dist /usr/share/nginx/html
