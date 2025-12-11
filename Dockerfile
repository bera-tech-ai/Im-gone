# Use Node.js LTS version
FROM node:18-alpine

# Install git and other system dependencies
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++ \
    ffmpeg \
    bash

# Create and set working directory
WORKDIR /app

# Copy package.json
COPY package*.json ./

# Install dependencies (git is now available)
RUN npm install --only=production --no-audit --no-fund

# Copy all files
COPY . .

# Create necessary directories
RUN mkdir -p gift/session

# Set environment variables
ENV NODE_ENV=production
ENV PORT=10000

# Expose port
EXPOSE 10000

# Start the bot directly with node
CMD ["node", "index.js"]
