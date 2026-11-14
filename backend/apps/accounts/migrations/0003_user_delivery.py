from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_emailcode"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="delivery_address",
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AddField(
            model_name="user",
            name="delivery_lat",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="delivery_lon",
            field=models.FloatField(blank=True, null=True),
        ),
    ]
