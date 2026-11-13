from django.contrib import admin

from apps.orders.models import GroupOrder, OrderLine

admin.site.register(GroupOrder)
admin.site.register(OrderLine)
