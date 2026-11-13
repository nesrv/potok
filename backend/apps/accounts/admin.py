from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from apps.accounts.models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ("login",)
    list_display = ("login", "email", "phone", "is_staff")
    fieldsets = (
        (None, {"fields": ("login", "email", "phone", "password")}),
        ("Права", {"fields": ("is_active", "is_staff", "is_superuser")}),
    )
    add_fieldsets = ((None, {"fields": ("login", "password1", "password2")}),)
