from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("storefronts", "0003_product_route"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="price",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True),
        ),
    ]
