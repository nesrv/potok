from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("storefronts", "0004_product_price"),
    ]

    operations = [
        migrations.AddField(
            model_name="storefront",
            name="title",
            field=models.CharField(default="лавка", max_length=32),
        ),
    ]
