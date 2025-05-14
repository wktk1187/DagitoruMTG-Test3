# ---- Build Stage ----
FROM node:20-slim AS builder

WORKDIR /usr/src/app

# Install ffmpeg (can be in builder if needed for build scripts, or in final stage)
# RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
#     && apt-get clean \
#     && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# Install ALL dependencies (including devDependencies) for build, using npm install
RUN npm install --legacy-peer-deps

COPY . .

# Compile TypeScript
RUN npm run build

# ---- Production Stage ----
FROM node:20-slim AS production

WORKDIR /usr/src/app

# Install ffmpeg (needed at runtime)
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# Install ONLY production dependencies
# For production, it's generally better to use npm ci after copying the lock file from builder if possible
# or ensure package-lock.json is up-to-date and use npm ci --omit=dev
RUN npm install --omit=dev --legacy-peer-deps

# Copy compiled JavaScript from builder stage
COPY --from=builder /usr/src/app/dist ./dist

# If you have other assets like a public folder, copy them too
# COPY --from=builder /usr/src/app/public ./public

EXPOSE 8080

CMD [ "npm", "start" ] 