FROM rust:1.86-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && rustup target add wasm32-unknown-unknown \
    && useradd --uid 1000 --create-home --shell /bin/sh runner

ENV GIT_CONFIG_COUNT=1 \
    GIT_CONFIG_KEY_0=safe.directory \
    GIT_CONFIG_VALUE_0=* \
    GIT_TERMINAL_PROMPT=0

USER 1000
WORKDIR /work
