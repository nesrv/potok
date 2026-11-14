from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("storefronts", "0005_storefront_title"),
    ]

    operations = [
        migrations.AddField(
            model_name="storefront",
            name="address",
            field=models.CharField(blank=True, max_length=300),
        ),
        migrations.AddField(
            model_name="storefront",
            name="pickup",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="storefront",
            name="services",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="storefront",
            name="latitude",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="storefront",
            name="longitude",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="storefront",
            name="area",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
