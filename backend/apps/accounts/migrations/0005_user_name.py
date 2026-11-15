from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0004_rename_accounts_em_email_8f0a0d_idx_accounts_em_email_5aaba3_idx"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="name",
            field=models.CharField(blank=True, max_length=120),
        ),
    ]
