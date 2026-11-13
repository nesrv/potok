from datetime import datetime, timedelta, timezone

import jwt
from django.conf import settings
from ninja.security import HttpBearer

from apps.accounts.models import User


def issue_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.pk),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=settings.JWT_HOURS)).timestamp()),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


class JWTAuth(HttpBearer):
    def authenticate(self, request, token: str):
        try:
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
            user = User.objects.get(pk=int(payload["sub"]), is_active=True)
        except (jwt.PyJWTError, User.DoesNotExist, KeyError, TypeError, ValueError):
            return None
        request.user = user
        return user
