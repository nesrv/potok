from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("delivery", "0002_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="district",
            name="polygon",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
