from django.conf import settings
from django.db import models

from apps.delivery.models import District
from apps.storefronts.models import Product


class GroupOrder(models.Model):
    COLLECTING = "collecting"
    TOPUP = "topup"
    CLOSED = "closed"
    STATUS = [
        (COLLECTING, "сбор"),
        (TOPUP, "дозаказ"),
        (CLOSED, "закрыт"),
    ]

    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="orders")
    status = models.CharField(max_length=16, choices=STATUS, default=COLLECTING)
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    minimum_reached_at = models.DateTimeField(null=True, blank=True)
    topup_ends_at = models.DateTimeField(null=True, blank=True)
    minimum_snapshot = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    unit_snapshot = models.CharField(max_length=32, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["product"],
                condition=models.Q(status__in=["collecting", "topup"]),
                name="one_open_order_per_product",
            ),
            models.CheckConstraint(condition=models.Q(quantity__gte=0), name="order_quantity_non_negative"),
        ]


class OrderLine(models.Model):
    order = models.ForeignKey(GroupOrder, on_delete=models.CASCADE, related_name="lines")
    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="order_lines")
    quantity = models.DecimalField(max_digits=12, decimal_places=3)
    district = models.ForeignKey(District, on_delete=models.PROTECT, related_name="lines")
    address = models.CharField(max_length=500)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(quantity__gt=0), name="line_quantity_positive"),
        ]
