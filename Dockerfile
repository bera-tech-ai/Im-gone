FROM node:18-alpine

# Install pm2 globally
RUN npm install -g pm2

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    ffmpeg \
    bash

WORKDIR /app

COPY package*.json ./

# Install dependencies
RUN npm install --only=production --no-audit --no-fund

COPY . .

RUN mkdir -p gift/session

ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000

# Start with pm2
CMD ["pm2-runtime", "start", "index.js", "--name", "giftedmd"]
