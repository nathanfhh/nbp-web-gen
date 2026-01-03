# NBP Web Gen - AI Image Generator
#
# Build command (amd64):
#   docker build --platform linux/amd64 -t nbp-web-gen:latest .
#
# Run command:
#   docker run -d -p 8080:80 nbp-web-gen:latest

FROM node:22-alpine AS builder
ENV PROJECT_NAME=nbp-web-gen
WORKDIR /root/$PROJECT_NAME
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
ENV PROJECT_NAME=nbp-web-gen
COPY --from=builder /root/$PROJECT_NAME/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
