FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
COPY apps ./apps
COPY services ./services
COPY packages ./packages
COPY workers ./workers
COPY functions ./functions
COPY database ./database
COPY scripts ./scripts
COPY .npmrc ./
COPY tsconfig.json ./
RUN npm install
RUN npm run build

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
RUN mkdir -p /app/storage/uploads /app/storage/outputs && chown -R node:node /app
USER node
EXPOSE 8787
CMD ["npm", "run", "start:api"]
