# HTTPS and WebSocket entrypoint for the Cabzone API

The backend currently answers at `http://200.234.38.54:4090/api/health`. Port 443 on that Ubuntu host runs nginx, but no verified Cabzone HTTPS API hostname has been found. The Vercel admin site's `/api` rewrite answers REST requests, while `/ws` returns 404. Both mobile apps use `/ws` for live ride events, so their production `EXPO_PUBLIC_API_URL` needs a certificate-valid HTTPS origin with WebSocket upgrades.

The commands below assume Cabzone controls `api.cabzone.in`. If it does not, substitute a hostname that Cabzone owns throughout. Run them on the Ubuntu host as an administrator; inspect existing nginx configuration before adding a server block.

1. In DNS, add an **A** record: `api.cabzone.in` → `200.234.38.54`. Wait until the record resolves to that address.
2. Inspect nginx and the backend listeners:

   ```sh
   sudo nginx -T | grep -E 'server_name|proxy_pass' | head -80
   sudo ss -lntp | grep -E ':(80|443|4090)'
   ```

3. Add a dedicated nginx HTTP virtual host at `/etc/nginx/sites-available/cabzone-api` (do not replace another site's configuration):

   ```nginx
   server {
       listen 80;
       server_name api.cabzone.in;

       location /ws {
           proxy_pass http://127.0.0.1:4090;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_read_timeout 3600s;
           proxy_send_timeout 3600s;
       }

       location / {
           proxy_pass http://127.0.0.1:4090;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }
   }
   ```

4. Enable the new site if it is not already enabled, check nginx syntax, and reload:

   ```sh
   sudo ln -s /etc/nginx/sites-available/cabzone-api /etc/nginx/sites-enabled/cabzone-api
   sudo nginx -t
   sudo systemctl reload nginx
   ```

5. Have the host administrator install Certbot if absent, then run `sudo certbot --nginx -d api.cabzone.in`. Confirm the generated HTTPS server block preserves the `/ws` upgrade directives. Do not paste private keys into chat.
6. Verify `https://api.cabzone.in/api/health` returns 200 with a trusted certificate. Test a WebSocket connection to `wss://api.cabzone.in/ws` with an authenticated app session; a 404 means the proxy is still wrong. Test a complete two-device ride, including offer delivery after app background/foreground transitions.
7. Once verified, set `API_UPSTREAM_ORIGIN=https://api.cabzone.in` in the Vercel project, and set `EXPO_PUBLIC_API_URL=https://api.cabzone.in` in **both Expo production environments**. Rebuild both production AABs. Keep port 4090 reachable by Vercel until its upstream setting is changed and checked; afterwards, restrict direct public access to port 4090 if operations permit.

Do not switch mobile production environments to the Vercel admin hostname as a shortcut: `/api/health` works there, but `/ws` does not.
