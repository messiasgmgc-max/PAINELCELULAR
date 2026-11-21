FROM evoapicloud/evo-ai-frontend-community:latest

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY phonecenter-theme.css /etc/phonecenter-branding/phonecenter-theme.css
COPY phonecenter-brand.js /etc/phonecenter-branding/phonecenter-brand.js
COPY phonecenter-logo.png /etc/phonecenter-branding/phonecenter-logo.png
COPY phonecenter-logo-full.png /etc/phonecenter-branding/phonecenter-logo-full.png
COPY phonecenter-favicon.png /etc/phonecenter-branding/phonecenter-favicon.png

EXPOSE 80
