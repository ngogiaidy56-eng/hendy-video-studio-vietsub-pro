# syntax=docker/dockerfile:1
FROM gradle:9.7-jdk21 AS build
WORKDIR /workspace
COPY . .
RUN gradle :server:installDist --no-daemon

FROM eclipse-temurin:21-jre
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /workspace/server/build/install/server /app
EXPOSE 8080
ENV PORT=8080
ENTRYPOINT ["/app/bin/server"]
