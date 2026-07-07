Lumo Task — Local / LAN Web Server (Windows)
============================================

WHAT THIS IS
  A self-contained copy of Lumo Task that runs on THIS computer and is used
  through your web browser. Nothing to install — no Node, no setup. Your data
  stays in this folder (data\lumo.db).

HOW TO START
  1. Double-click  start.bat
  2. A console window opens and your browser goes to  http://localhost:47291
     (the first start takes a few seconds while it sets itself up).
  3. Create an account on the sign-in screen and you're in.

  To stop: close the console window (or press Ctrl+C in it).

USE IT FROM OTHER DEVICES ON YOUR Wi-Fi (optional)
  By default the server is reachable on your local network. When it starts, the
  console prints a line like:
        On your LAN : http://192.168.1.23:47291
  Open that address on your phone/other laptop (same Wi-Fi) to use the same
  server and the same data.

  Want it on THIS computer ONLY? Set an environment variable before starting:
        set LUMO_HOST=127.0.0.1
  (or change the port with  set LUMO_PORT=8080 ).

  Windows may ask to allow "node.exe" through the firewall the first time —
  allow it on Private networks so other devices can connect.

YOUR DATA
  data\lumo.db        your tasks/projects/etc. (SQLite — back this up to keep it)
  data\secrets.json   per-install security keys, generated on first run

  This folder is portable: copy the whole folder to another PC and it keeps
  your data.

------------------------------------------------------------------------------

Lumo Task — 本地 / 局域网 Web 服务器（Windows）
================================================

这是什么
  一份可独立运行的 Lumo Task：在这台电脑上运行，用浏览器访问。无需安装，
  不用装 Node、不用配置。数据都在本文件夹里（data\lumo.db）。

如何启动
  1. 双击  start.bat
  2. 会弹出一个控制台窗口，浏览器自动打开  http://localhost:47291
     （首次启动需要几秒钟做初始化）。
  3. 在登录页注册一个账号即可使用。

  停止：关闭那个控制台窗口（或在里面按 Ctrl+C）。

让同一 Wi-Fi 下的其他设备访问（可选）
  默认服务器在局域网内可访问。启动时控制台会打印类似：
        On your LAN : http://192.168.1.23:47291
  在手机/另一台电脑（同一 Wi-Fi）打开这个地址，就能连到同一个服务器、
  共用同一份数据。

  只想本机用？启动前设置环境变量：
        set LUMO_HOST=127.0.0.1
  （改端口用  set LUMO_PORT=8080 ）

  首次运行 Windows 可能提示是否允许 node.exe 通过防火墙——在「专用网络」上
  允许，其他设备才能连接。

你的数据
  data\lumo.db        你的任务/项目等（SQLite，想保留就备份它）
  data\secrets.json   本安装的安全密钥，首次运行自动生成

  本文件夹可整体拷贝到别的电脑，数据随之带走。
