from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("orders", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="LineMessage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("text", models.CharField(max_length=500)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("author", models.ForeignKey(on_delete=models.deletion.PROTECT, related_name="line_messages", to=settings.AUTH_USER_MODEL)),
                ("line", models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="messages", to="orders.orderline")),
            ],
        ),
    ]
