from django.conf import settings
from django.db import models


class Storefront(models.Model):
    owner = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="storefront")
    name = models.CharField(max_length=200)

    def __str__(self) -> str:
        return self.name


class Product(models.Model):
    storefront = models.ForeignKey(Storefront, on_delete=models.CASCADE, related_name="products")
    description = models.TextField(blank=True)
    unit = models.CharField(max_length=32)
    minimum = models.DecimalField(max_digits=12, decimal_places=3)
    topup_hours = models.PositiveIntegerField()

    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(minimum__gt=0), name="product_minimum_positive"),
            models.CheckConstraint(condition=models.Q(topup_hours__gt=0), name="product_topup_hours_positive"),
        ]


class ProductPhoto(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="photos")
    image = models.FileField(upload_to="products/%Y/%m/")
    created_at = models.DateTimeField(auto_now_add=True)
