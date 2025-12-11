FROM node:18-alpine

# Install ONLY git first
RUN apk add --no-cache git

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install with legacy-peer-deps flag to avoid conflicts
RUN npm install --only=production --legacy-peer-deps

COPY . .

RUN mkdir -p gift/session

ENV PORT=10000

CMD ["node", "index.js"]
