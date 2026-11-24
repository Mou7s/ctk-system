FROM oven/bun:1.4.4-debian AS builder

WORKDIR /app

# 依赖清单与 bunfig.toml（含 linker = "hoisted"，Nuxt/Vite 解析必需）
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

# 复制构建所需源码与资源
COPY nuxt.config.ts app.config.ts patch.cjs .env.production ./
COPY vite ./vite
COPY types ./types
COPY public ./public
COPY app ./app
COPY server ./server

ENV NODE_ENV=production
ENV NUXT_PUBLIC_APP_ENV=production
ENV NUXT_TELEMETRY_DISABLED=1
ENV NITRO_PRESET=bun
ENV NODE_OPTIONS="--max-old-space-size=5120 --require=/app/patch.cjs"

RUN bun run --bun nuxt build

# 补齐 Nitro server 生产依赖（含 sharp Linux x64 原生绑定，使用国内镜像源提速）
RUN if [ -f /app/.output/server/package.json ]; then \
      cd /app/.output/server && bun install --production --no-save --registry=https://registry.npmmirror.com; \
    fi


FROM oven/bun:1.4.4-debian AS runtime

WORKDIR /app

# 安装 ffprobe（音频上传校验）、mpv（本地音频播放）、pulseaudio-utils（音频会话诊断）、tzdata 与 curl（健康检查）
RUN for f in /etc/apt/sources.list /etc/apt/sources.list.d/*; do \
      if [ -f "$f" ]; then \
        sed -i 's|deb.debian.org|mirrors.ustc.edu.cn|g; s|security.debian.org|mirrors.ustc.edu.cn|g' "$f"; \
      fi; \
    done && \
    apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg mpv pulseaudio-utils tzdata ca-certificates curl && \
    ln -snf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=bun:bun /app/.output /app/.output

RUN mkdir -p /app/runtime /data/TKServerFiles /data/jukebox-media /data/jukebox-state && \
    chown -R bun:bun /app/runtime /data

USER bun

ENV NODE_ENV=production
ENV NITRO_PRESET=bun
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3100
ENV TZ=Asia/Shanghai
ENV NUXT_PROFILE_PATH=/data/TKServerFiles/uploadPath
ENV NUXT_JUKEBOX_ENGINE_MODE=embedded
ENV NUXT_JUKEBOX_MEDIA_BACKUP_PATH=/data/jukebox-media
ENV NUXT_JUKEBOX_STATE_PATH=/data/jukebox-state/schedule_state.json
ENV NUXT_JUKEBOX_FFPROBE_PATH=ffprobe
ENV NUXT_JUKEBOX_MPV_PATH=mpv
ENV NUXT_JUKEBOX_MPV_IPC_PATH=/tmp/mpv-ipc

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3100/app-version >/dev/null || exit 1

CMD ["bun", "run", "/app/.output/server/index.mjs"]
