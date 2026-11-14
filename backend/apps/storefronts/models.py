from django.conf import settings
from django.db import models


STOREFRONT_TITLES = ("витрина", "лавка", "магазин", "прилавок", "бутик")


class Storefront(models.Model):
    owner = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="storefront")
    name = models.CharField(max_length=200)
    title = models.CharField(max_length=32, default="лавка")
    address = models.CharField(max_length=300, blank=True)
    pickup = models.BooleanField(default=False)
    services = models.JSONField(default=list, blank=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    area = models.JSONField(default=list, blank=True)

    def __str__(self) -> str:
        return self.name


class Product(models.Model):
    storefront = models.ForeignKey(Storefront, on_delete=models.CASCADE, related_name="products")
    description = models.TextField(blank=True)
    unit = models.CharField(max_length=32)
    minimum = models.DecimalField(max_digits=12, decimal_places=3)
    maximum = models.DecimalField(max_digits=12, decimal_places=3, null=True, blank=True)
    topup_hours = models.PositiveIntegerField()
    price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    route = models.JSONField(default=list, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(minimum__gt=0), name="product_minimum_positive"),
            models.CheckConstraint(
                condition=models.Q(maximum__isnull=True) | models.Q(maximum__gte=models.F("minimum")),
                name="product_maximum_gte_minimum",
            ),
            models.CheckConstraint(condition=models.Q(topup_hours__gt=0), name="product_topup_hours_positive"),
        ]


class StorefrontService(models.Model):
    storefront = models.ForeignKey(Storefront, on_delete=models.CASCADE, related_name="offers")
    name = models.CharField(max_length=120)
    text = models.TextField(blank=True)
    image = models.FileField(upload_to="storefronts/%Y/%m/", blank=True)


class StorefrontGallery(models.Model):
    storefront = models.ForeignKey(Storefront, on_delete=models.CASCADE, related_name="gallery")
    image = models.FileField(upload_to="storefronts/%Y/%m/")
    caption = models.CharField(max_length=160, blank=True)


class ProductPhoto(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="photos")
    image = models.FileField(upload_to="products/%Y/%m/")
    created_at = models.DateTimeField(auto_now_add=True)
