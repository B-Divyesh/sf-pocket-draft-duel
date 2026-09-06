FROM rust:1.98-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && printf 'fn main() {}\n' > src/main.rs && cargo build --release && rm -rf src
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
RUN useradd --system --uid 10001 --create-home duel && mkdir /data && chown duel:duel /data
COPY --from=build /src/target/release/pocket-draft-duel-realtime /usr/local/bin/pocket-draft-duel-realtime
USER duel
ENV DATA_DIR=/data
ENV PORT=8787
VOLUME ["/data"]
EXPOSE 8787
CMD ["pocket-draft-duel-realtime"]
