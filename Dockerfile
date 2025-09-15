# 1. Use an official Node.js runtime as a parent image
FROM node:22-slim

# 2. Set the working directory in the container
WORKDIR /app

# 3. Copy package.json and package-lock.json to the working directory
# We copy these first to leverage Docker's layer caching.
COPY server/package*.json ./

# 4. Install production dependencies
RUN npm install --omit=dev

# 5. Copy the rest of the application code (both server and public)
COPY . .

# 6. Expose the port the app runs on (Cloud Run default is 8080)
ENV PORT=8080
EXPOSE 8080

# 7. Define the command to run the application
CMD ["node", "server/index.js"]
