import hashlib
import json
import secrets
from datetime import timedelta
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.mail import send_mail
from django.utils import timezone

from apps.accounts.models import EmailCode, User
from apps.orders.errors import OrderError


def send_email_code(email: str) -> str | None:
    email = email.strip().lower()
    if "@" not in email or len(email) > 254:
        raise OrderError(400, "укажите почту")
    latest = EmailCode.objects.filter(email=email).order_by("-created_at").first()
    if latest and latest.created_at > timezone.now() - timedelta(seconds=60):
        raise OrderError(429, "код уже отправлен, подождите минуту")
    code = _login_code()
    EmailCode.objects.filter(email=email).delete()
    EmailCode.objects.create(email=email, code_hash=make_password(code))
    try:
        send_mail(
            "Код для входа в Поток",
            f"Код для входа: {code}\nТри цифры, две из них одинаковые. Действует 10 минут.",
            settings.DEFAULT_FROM_EMAIL,
            [email],
            fail_silently=False,
        )
    except Exception as exc:
        if not settings.DEBUG:
            EmailCode.objects.filter(email=email).delete()
            raise OrderError(502, "не удалось отправить письмо") from exc
    return code if settings.DEBUG else None


def _login_code() -> str:
    repeated = str(secrets.randbelow(10))
    other = str(secrets.randbelow(9))
    if other >= repeated:
        other = str(int(other) + 1)
    digits = [repeated, repeated, repeated]
    digits[secrets.randbelow(3)] = other
    return "".join(digits)


def verify_email_code(email: str, code: str) -> User:
    email = email.strip().lower()
    row = EmailCode.objects.filter(email=email).order_by("-created_at").first()
    if row is None or row.created_at < timezone.now() - timedelta(minutes=10):
        raise OrderError(400, "код устарел, запросите новый")
    row.attempts += 1
    row.save(update_fields=["attempts"])
    if row.attempts > 5 or not check_password(code.strip(), row.code_hash):
        raise OrderError(400, "неверный код")
    row.delete()
    user = User.objects.filter(login=email).first()
    if user is None:
        user = User(login=email, email=email)
        user.set_unusable_password()
        user.save()
    elif not user.email:
        user.email = email
        user.save(update_fields=["email"])
    return user


def vk_start() -> dict:
    if not settings.VK_CLIENT_ID:
        raise OrderError(503, "VK не настроен: добавьте VK_CLIENT_ID в .env")
    verifier = secrets.token_urlsafe(48)
    challenge = hashlib.sha256(verifier.encode()).digest()
    challenge = _b64(challenge)
    state = secrets.token_urlsafe(24)
    query = urlencode(
        {
            "response_type": "code",
            "client_id": settings.VK_CLIENT_ID,
            "redirect_uri": settings.VK_REDIRECT_URI,
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "scope": "vkid.personal_info email",
        }
    )
    return {
        "url": f"https://id.vk.ru/authorize?{query}",
        "state": state,
        "verifier": verifier,
    }


def vk_finish(code: str, device_id: str, verifier: str, state: str) -> User:
    if not settings.VK_CLIENT_ID:
        raise OrderError(503, "VK не настроен: добавьте VK_CLIENT_ID в .env")
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "code_verifier": verifier,
        "client_id": settings.VK_CLIENT_ID,
        "device_id": device_id,
        "redirect_uri": settings.VK_REDIRECT_URI,
        "state": state,
    }
    if settings.VK_CLIENT_SECRET:
        data["client_secret"] = settings.VK_CLIENT_SECRET
    try:
        payload = _post_form("https://id.vk.ru/oauth2/auth", data)
    except Exception as exc:
        raise OrderError(502, "VK не ответил") from exc
    token = payload.get("access_token")
    user_id = payload.get("user_id")
    if not token or not user_id:
        raise OrderError(400, "VK не подтвердил вход")
    info = _post_form(
        "https://id.vk.ru/oauth2/user_info",
        {"access_token": token, "client_id": settings.VK_CLIENT_ID},
    )
    profile = info.get("user") or {}
    email = (payload.get("email") or profile.get("email") or "").strip().lower()
    first = (profile.get("first_name") or "").strip()
    last = (profile.get("last_name") or "").strip()
    full_name = " ".join(part for part in (first, last) if part)
    login = email or f"vk{user_id}"
    user = User.objects.filter(login=login).first()
    if user is None:
        user = User(login=login, email=email, name=full_name)
        user.set_unusable_password()
        user.save()
    elif full_name and user.name != full_name:
        user.name = full_name
        if email and not user.email:
            user.email = email
        user.save(update_fields=["name", "email"])
    return user


def _post_form(url: str, data: dict) -> dict:
    body = urlencode(data).encode()
    request = Request(url, data=body, method="POST")
    with urlopen(request, timeout=15) as response:
        return json.loads(response.read().decode())


def _b64(raw: bytes) -> str:
    import base64

    return base64.urlsafe_b64encode(raw).decode().rstrip("=")
