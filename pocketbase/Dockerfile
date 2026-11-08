FROM alpine:latest AS base

ARG PB_VERSION=0.38.2
# Set automatically by BuildKit, e.g. amd64 or arm64
ARG TARGETARCH

RUN apk add --no-cache \
  unzip \
  ca-certificates

# download and unzip PocketBase
ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb/

# Test image with a known superuser, only built when selected with
# `--target test`
FROM base AS test
ARG PORT="8090"
ENV PORT=${PORT}
# start pocketbase
CMD /pb/pocketbase migrate up; \
  /pb/pocketbase superuser upsert test@example.com 1234567890; \
  /pb/pocketbase serve --http=0.0.0.0:${PORT}

# Production image. Keep this stage last: it's built when no target is given
# (e.g. by hosting platforms that build the Dockerfile as is).
FROM base AS prod
ARG PORT="8090"
ENV PORT=${PORT}
# copy migrations
COPY ./pocketbase/pb_migrations /pb/pb_migrations
# copy hooks
COPY ./pocketbase/pb_hooks /pb/pb_hooks
# start pocketbase
CMD /pb/pocketbase serve --http=0.0.0.0:${PORT}
