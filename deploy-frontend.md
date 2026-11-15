# Запуск фронтенда

Клиент — сайт в браузере: `web/`, Vite, React, TypeScript. Страница открывается и на телефоне, и на компьютере. Команды ниже выполняются в Ubuntu внутри WSL, не в PowerShell: в PowerShell нет `npm`, а `npm install` на диске `C:` (`/mnt/c/...`) ломает esbuild.

Публичный хост: `https://programism.ru/`. Локально страница — `http://127.0.0.1:5173/`, API — `http://127.0.0.1:8000`.

## Где лежит код

Рабочая копия — `~/POTOK`, не папка на `C:`. Если её ещё нет:

```bash
mkdir -p ~/POTOK
cp -a /mnt/c/W27/POTOK/. ~/POTOK/
```

Дальше править и запускать из `~/POTOK/web`. Если файл изменён в `c:\W27\POTOK`, его нужно снова скопировать в `~/POTOK`, иначе Vite его не увидит:

```bash
cp -a /mnt/c/W27/POTOK/web/. ~/POTOK/web/
```

Чужой WSL и чужие проекты не трогать. `wsl --install`, `wsl --unregister` и `wsl --set-default` не запускать.

Войти в Linux из PowerShell:

```powershell
wsl
```

## Один раз

В Ubuntu уже стоит Node.js 18 из apt. Этого хватает: React Router зафиксирован на 6.30, седьмая версия просит Node 20.

```bash
cd ~/POTOK/web
npm install
```

Повторно `npm install` нужен только после изменения `package.json`.

## Каждый запуск

Оба процесса одной командой в Ubuntu: `bash ~/POTOK/scripts/dev.sh`. Она описана в `deploy.md`.

Вручную: сначала API из `deploy.md` (`runserver` на порту 8000). Затем в отдельном окне Ubuntu:

```bash
cd ~/POTOK/web
npm run dev -- --host 127.0.0.1 --port 5173
```

Окно не закрывать. В браузере Windows открыть `http://127.0.0.1:5173/`.

Адрес API по умолчанию — `http://127.0.0.1:8000`. Другой порт задают перед запуском:

```bash
export VITE_API_URL=http://127.0.0.1:8001
npm run dev -- --host 127.0.0.1 --port 5173
```

Остановить страницу: Ctrl+C в том же окне. Процесс другого проекта на 5173 не убивать: возьмите свободный порт, например 5174, и откройте его в браузере.

Телефон в той же сети открывает `http://<IP компьютера>:5173`. IP смотрят в PowerShell командой `ipconfig` (адрес Wi-Fi), не адрес `eth0` внутри WSL. Для этого Vite запускают с `--host 0.0.0.0`, а в API должен быть разрешён этот origin.
