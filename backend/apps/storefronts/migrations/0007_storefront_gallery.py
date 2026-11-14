from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("storefronts", "0006_storefront_place"),
    ]

    operations = [
        migrations.CreateModel(
            name="StorefrontService",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("text", models.TextField(blank=True)),
                ("image", models.FileField(blank=True, upload_to="storefronts/%Y/%m/")),
                (
                    "storefront",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="offers", to="storefronts.storefront"),
                ),
            ],
        ),
        migrations.CreateModel(
            name="StorefrontGallery",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("image", models.FileField(upload_to="storefronts/%Y/%m/")),
                ("caption", models.CharField(blank=True, max_length=160)),
                (
                    "storefront",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="gallery", to="storefronts.storefront"),
                ),
            ],
        ),
    ]
