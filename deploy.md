# Запуск

Публичный хост: `https://programism.ru/`.

Локально API и Postgres работают в WSL2 (Ubuntu). Docker не используется. Код и команды ниже выполняются в терминале Ubuntu, не в PowerShell. Python 3.15, PostgreSQL 18.7 или новее, пакеты из `backend/requirements.txt` (Django 6.1.3+, Django Ninja 1.8).

## WSL

Дистрибутив уже установлен и используется другим проектом. Его не переустанавливают и не сбрасывают. Команды `wsl --install`, `wsl --unregister` и `wsl --set-default` не запускать: первая как раз и дала `ERROR_ALREADY_EXISTS`.

Войти в уже существующий Linux:

```powershell
wsl
```

Проверка: `uname -a` показывает Linux, `ls ~` показывает домашние каталоги других проектов. Их не удалять и не переносить.

Репозиторий «Потока» — отдельная папка, например `~/POTOK`. Каталог на диске `C:` виден как `/mnt/c/W27/POTOK`. Если копируете его в Linux, только в новый каталог:

```bash
mkdir -p ~/POTOK
cp -a /mnt/c/W27/POTOK/. ~/POTOK/
cd ~/POTOK
```

`mkdir` не затирает чужие папки. Если `~/POTOK` уже есть и это не этот проект, возьмите другое имя.

Cursor для этого репозитория открывайте как `\\wsl$\Ubuntu\home\<имя>\POTOK`. Окно другого проекта не закрывать и его каталог не выбирать заново.

Python 3.15 и Postgres 18 ставятся рядом с тем, что уже есть, через deadsnakes и PGDG. Кластер Postgres другого проекта не пересоздают, `pg_dropcluster` и `apt remove postgresql` не вызывают.

Пароль `sudo` — пароль пользователя Linux, заданный при первой настройке этого Ubuntu для другого проекта. Пароль Windows и пароль базы `potok` сюда не подходят. Дистрибутив из-за забытого пароля не переустанавливают. Новый пароль этому пользователю задают из PowerShell, не стирая WSL:

```powershell
wsl -u root
passwd user
```

`passwd` спросит новый пароль дважды. После `exit` команда `sudo` в Ubuntu снова работает. Файлы и базы другого проекта при этом остаются.

Сначала проверить, слушает ли база уже:

```bash
pg_isready
```

Если ответ `accepting connections`, команду `sudo service postgresql start` не выполняют. Она нужна только когда `pg_isready` пишет, что соединений нет, и только после перезагрузки Windows. Сейчас на этой машине уже отвечает PostgreSQL 16 на `127.0.0.1:5432`. Для «Потока» его не останавливают. Отдельная версия 18.7, когда появится, должна слушать другой порт, а не подменять этот кластер.

## База

Создаётся только база `potok`. Чужие базы и роли не удаляют и не меняют.

Один раз:

```bash
sudo -u postgres psql -c "CREATE USER potok WITH PASSWORD 'potok';"
sudo -u postgres psql -c "CREATE DATABASE potok OWNER potok;"
```

Повторный запуск этих команд выдаст ошибку «уже существует» — это нормально. `dropdb`, `DROP DATABASE` и `DROP USER` для других имён не выполнять.

## API

Оба процесса сразу. Из PowerShell, не переустанавливая WSL:

```powershell
wsl -e bash -lc "cd ~/POTOK && bash scripts/dev.sh"
```

Из уже открытого Ubuntu то же самое: `cd ~/POTOK && bash scripts/dev.sh`.

Миграции отдельно, из PowerShell:

```powershell
wsl -e bash -lc "cd ~/POTOK && bash scripts/migrate.sh"
```

Скрипт применяет их только к базе из `backend/.env`. Другие базы не меняет.

Скрипт поднимает API и страницу. Занятый порт не освобождает: API уходит на 8001, страница на 5174. Ctrl+C останавливает только эти два процесса.

Каждый рабочий сеанс вручную:

```bash
cd ~/POTOK/backend
python3.15 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
set -a && . ./.env && set +a
python3 manage.py migrate
python3 manage.py runserver 0.0.0.0:8000
```

Виртуальное окружение и `pip install` повторять не нужно, если `.venv` уже есть. Достаточно `. .venv/bin/activate`, подключить `.env` и запустить `runserver`. Окно не закрывать: пока оно открыто, API слушает порт 8000. Если этот порт уже занят другим проектом, останавливать его не нужно: запустите `runserver 0.0.0.0:8001` и откройте документацию на порту 8001.

Схема: `http://127.0.0.1:8000/api/docs` — открывается и из браузера Windows.

Телефон в той же сети ходит на `http://<IP компьютера>:8000`. IP смотрят в PowerShell командой `ipconfig`, это адрес адаптера Wi-Fi, не адрес `eth0` внутри WSL. Фото Django отдаёт из `backend/media`.

Остановить сервер: Ctrl+C в том же окне Ubuntu.

Перед выкладкой кода скачать данные прода на локальную машину. С сервера берётся только база `potok` и каталог `backend/media`. Другие базы Postgres и локальный `.env` не меняются.

```powershell
powershell -File scripts/pull-prod-data.ps1
```

Дамп попадает в `backend/prod.dump`, фото — в `backend/media`. Локальная база `potok` на WSL заменяется этим дампом.

На сервере тот же каталог, переменные `DATABASE_URL`, `DJANGO_SECRET_KEY`, `JWT_SECRET`, `MEDIA_ROOT`. Процесс: `gunicorn config.wsgi:application -w 1 --max-requests 400 --max-requests-jitter 40 -b 127.0.0.1:8011`. Один воркер, чтобы не занимать лишнюю память на общем VPS. Снаружи nginx на `potok.h1n.ru`: API проксируется на gunicorn, `/media/` читается с диска.


