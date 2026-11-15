import os
from pathlib import Path

from config.db import config_from_url

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_env(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


_load_env(BASE_DIR.parent / ".env")
_load_env(Path("/mnt/c/W27/POTOK/.env"))

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-secret-change-before-any-deploy")
JWT_SECRET = os.environ.get("JWT_SECRET", SECRET_KEY)
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"
ALLOWED_HOSTS = [host for host in os.environ.get("ALLOWED_HOSTS", "*").split(",") if host]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "apps.accounts",
    "apps.storefronts",
    "apps.delivery",
    "apps.orders",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).replace("\r", "").strip()


DATABASES = {
    "default": config_from_url(
        _env("DATABASE_URL", "postgres://potok:potok@localhost:5432/potok")
    )
}

AUTH_USER_MODEL = "accounts.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
]

LANGUAGE_CODE = "ru-ru"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
_media_root = _env("MEDIA_ROOT")
MEDIA_ROOT = Path(_media_root) if _media_root else BASE_DIR / "media"
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
CSRF_TRUSTED_ORIGINS = [
    origin
    for origin in _env(
        "CSRF_TRUSTED_ORIGINS",
        "https://programism.ru,https://www.programism.ru",
    ).split(",")
    if origin
]

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = [
    origin
    for origin in os.environ.get(
        "CORS_ALLOWED_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173",
    ).split(",")
    if origin
]
CORS_ALLOW_HEADERS = ["authorization", "content-type"]
JWT_HOURS = 24 * 14

EMAIL_HOST = os.environ.get("EMAIL_HOST", "")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "True") == "True"
EMAIL_USE_SSL = os.environ.get("EMAIL_USE_SSL", "False") == "True"
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", EMAIL_HOST_USER)
EMAIL_BACKEND = (
    "django.core.mail.backends.smtp.EmailBackend"
    if EMAIL_HOST
    else "django.core.mail.backends.console.EmailBackend"
)
VK_CLIENT_ID = os.environ.get("VK_CLIENT_ID") or os.environ.get("VK_APP_ID", "")
VK_CLIENT_SECRET = os.environ.get("VK_CLIENT_SECRET") or os.environ.get("VK_APP_SECRET", "")
VK_REDIRECT_URI = os.environ.get("VK_REDIRECT_URI", "https://programism.ru/auth/vk/callback/")
YANDEX_MAPS_API_KEY = os.environ.get("YANDEX_MAPS_API_KEY", "")
YANDEX_MAPS_API_SECRET = os.environ.get("YANDEX_MAPS_API_SECRET", "")
YANDEX_GEOCODER_API_KEY = os.environ.get("YANDEX_GEOCODER_API_KEY", "")
YANDEX_GEOCODER_API_SECRET = os.environ.get("YANDEX_GEOCODER_API_SECRET", "")
