FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY data ./data
RUN mkdir -p uploads && chown node:node uploads
USER node
EXPOSE 3000
CMD ["node", "src/index.js"]
