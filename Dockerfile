# Use Node.js LTS version (zlib is built-in in newer Node)
FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++ \
    ffmpeg \
    bash \
    && rm -rf /var/cache/apk/*

# Create and set working directory
WORKDIR /app

# Copy package.json
COPY package*.json ./

# Remove problematic zlib dependency or use native zlib
RUN npm uninstall zlib || true

# Install dependencies skipping optional packages
RUN npm install --only=production --no-optional --no-audit --no-fund

# Copy all files
COPY . .

# Create necessary directories
RUN mkdir -p gift/session

# Set environment variables
ENV NODE_ENV=production
ENV PORT=10000

# Expose port
EXPOSE 10000

# Start the bot
CMD ["node", "index.js"]
