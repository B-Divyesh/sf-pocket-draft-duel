FROM rust:1-slim AS build
ARG BUILD_SHA=dev
ENV BUILD_SHA=${BUILD_SHA}
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && printf 'fn main() {}\n' > src/main.rs && cargo build --release && rm -rf src
COPY src ./src
RUN cargo build --release

FROM debian:stable-slim
ARG BUILD_SHA=dev
RUN mkdir /data
COPY --from=build /src/target/release/pocket-draft-duel-realtime /usr/local/bin/pocket-draft-duel-realtime
ENV DATA_DIR=/data
ENV PORT=8080
ENV BUILD_SHA=${BUILD_SHA}
VOLUME ["/data"]
EXPOSE 8080
CMD ["pocket-draft-duel-realtime"]
