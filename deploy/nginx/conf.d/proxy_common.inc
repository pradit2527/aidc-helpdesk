proxy_http_version 1.1;
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
# nginx สร้าง request_id ให้ถ้า client ไม่ส่งมา — ตรงกับ request_id ใน log ของแอป
proxy_set_header X-Request-Id      $request_id;
proxy_set_header Connection        "";
