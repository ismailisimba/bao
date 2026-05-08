# 1. Use official Node.js LTS slim image
FROM node:22-slim

# 2. Set working directory
WORKDIR /app

# 3. Copy server deps first (cache layer)
COPY server/package*.json ./

# 4. Install production dependencies
RUN npm install --omit=dev

# 5. Copy all application files and fix ownership
COPY --chown=node:node . .

# 6. HuggingFace Spaces listens on 7860
ENV PORT=7860
EXPOSE 7860

# 7. Switch to the built-in 'node' user (UID 1000) — required by HuggingFace
USER node

# 8. Start the server
CMD ["node", "server/index.js"]
