from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("storefronts", "0007_storefront_gallery"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="maximum",
            field=models.DecimalField(blank=True, decimal_places=3, max_digits=12, null=True),
        ),
        migrations.AddConstraint(
            model_name="product",
            constraint=models.CheckConstraint(
                condition=models.Q(maximum__isnull=True) | models.Q(maximum__gte=models.F("minimum")),
                name="product_maximum_gte_minimum",
            ),
        ),
    ]
