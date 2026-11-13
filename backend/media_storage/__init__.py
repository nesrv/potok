import os

from django.core.files.storage import default_storage

from apps.orders.errors import OrderError
from apps.storefronts.models import ProductPhoto

ALLOWED = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_BYTES = 10 * 1024 * 1024


def save_product_photo(product, upload) -> ProductPhoto:
    content_type = getattr(upload, "content_type", "") or ""
    ext = ALLOWED.get(content_type)
    if ext is None:
        raise OrderError(400, "нужен файл jpeg, png или webp")
    if upload.size > MAX_BYTES:
        raise OrderError(400, "файл больше 10 МБ")
    name = default_storage.save(f"products/{product.pk}/{os.urandom(8).hex()}{ext}", upload)
    return ProductPhoto.objects.create(product=product, image=name)
