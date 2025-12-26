# 1. Use the lightweight Nginx image
FROM nginx:alpine

# 2. Copy your static files to Nginx's folder
# This 'COPY' command is what breaks the cache. 
# It forces Docker to look at the ACTUAL files in your repo right now.
COPY . /usr/share/nginx/html

# 3. Custom Nginx config (Optional, but good for clean URLs)
# If you created the nginx.conf earlier, uncomment this:
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# 4. Expose the internal port (Railway maps this automatically)
EXPOSE 80

# 5. Start Nginx
CMD ["nginx", "-g", "daemon off;"]