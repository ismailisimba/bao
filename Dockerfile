# 1. Use official Node.js LTS slim image
FROM node:22-slim

# 2. HuggingFace Spaces requires non-root user with UID 1000
RUN useradd -m -u 1000 appuser

# 3. Set working directory
WORKDIR /app

# 4. Copy server deps first (cache layer)
COPY server/package*.json ./

# 5. Install production dependencies
RUN npm install --omit=dev

# 6. Copy all application files
COPY . .

# 7. HuggingFace Spaces listens on 7860
ENV PORT=7860
EXPOSE 7860

# 8. Switch to non-root user (required by HuggingFace)
USER 1000

# 9. Start the server
CMD ["node", "server/index.js"]
