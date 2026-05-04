FROM nginx:1.27-alpine
COPY templates/default.conf.template /etc/nginx/templates/default.conf.template
