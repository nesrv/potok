from django.db import models

from apps.storefronts.models import Product, Storefront


class District(models.Model):
    storefront = models.ForeignKey(Storefront, on_delete=models.CASCADE, related_name="districts")
    name = models.CharField(max_length=200)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["storefront", "name"], name="district_name_per_storefront"),
        ]

    def __str__(self) -> str:
        return self.name


class ProductDistrict(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="product_districts")
    district = models.ForeignKey(District, on_delete=models.PROTECT, related_name="product_districts")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["product", "district"], name="product_district_once"),
        ]


class DistrictNotice(models.Model):
    district = models.ForeignKey(District, on_delete=models.CASCADE, related_name="notices")
    order = models.ForeignKey("orders.GroupOrder", on_delete=models.CASCADE, related_name="notices")
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
